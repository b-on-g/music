# Bog Music

Музыкальный плеер с офлайн-кешем и синхронизацией между устройствами через
[Giper Baza](https://github.com/giper-dev/baza). Работает в двух режимах:

- **Chrome/Firefox extension** — перехватывает VK-токен на vk.com, качает треки
  (HLS → AAC/M4A), играет фоном через offscreen-документ даже с закрытым табом.
- **PWA / сайт** — https://b-on-g.github.io/music/ — тот же аккаунт и треки,
  засинканные через Giper Baza. VK API здесь ходит через прокси-воркер.

## Что умеет

- Сохранение треков с vk.com одной кнопкой (инжектится в аудио-строки VK).
- Загрузка локальных аудиофайлов с устройства.
- Плейлисты: основной, архив, импортированные шары (`shared:<имя>`).
- Ручная сортировка drag'n'drop, перенос в архив, удаление.
- Плеер: повтор одного/всех, shuffle без повторов, «Моя волна» (рекомендации
  $bog_recsys), громкость, восстановление последней сессии.
- Персональный обрез трека (trim start/end) — ручки на прогресс-баре.
- Шаринг треков ссылкой: контент шифруется AES, ключ только в URL-fragment.
- Перенос аккаунта на другое устройство ссылкой `#account=<key>`.
- Выгрузка плейлиста: extension качает всё в baza, PWA собирает zip.

## Архитектура

Данные живут в **home land** пользователя Giper Baza и синкаются сами: код
описывает модель и зовёт её методы, примитивов синхронизации в view-слое нет.

### Модель данных (домен)

| Модуль | Класс | Что это |
|---|---|---|
| `account/` | `$bog_music_account_baza` | Схема home land (Nickname, Last_track_key, Last_position, Tracks) + вся CRUD-логика: списки, сохранение, плейлисты, blob'ы, докачка HLS |
| `track/` | `$bog_music_track_baza` | Схема трека + методы (audio(), blob(), trim, order). Ключ в словаре — `${owner_id}_${id}` |
| `share/` | `$bog_music_share_baza` | Схема эфемерного share-land (шифрованные Meta/File) |

Blob каждого трека лежит в **отдельном land** со ссылкой из трека
(`$bog_music_atom_link_synced` — обёртка, которая запускает sync target-land
при чтении ссылки). Так метаданные синкаются мгновенно и не ждут мегабайтные
паки, а блобы доезжают лениво — когда трек отрендерен или запущен.

Правила работы с Giper Baza в этом коде:

- Схема — `$giper_baza_dict.with({...})`, CRUD — instance-методы модели
  (`@$mol_action` на мутациях). Никаких static-action на entity.
- Никаких `@$mol_mem` на методах, возвращающих pawn'ы.
- Запись blob / создание land (PoW!) — только внутри `$mol_wire_async`-фибры,
  иначе PoW пересчитывается на каждом ретрае.
- После `File.ensure()` обязателен `File.remote(store)` — без этого ссылка не
  попадает в push-pack.

### Слои

```
view (app, tracks, track, player, account)   — тонкие, по ключам треков
        │
домен ($bog_music_account_baza, $bog_music_share)
        │
Giper Baza (home land + blob lands + share lands)

утилиты: api/ (VK API), hls/ (скачивание+демукс), zip/, pending/ (IDB-очередь), boot/ (фиксы окружения)
```

- `app/` — `$bog_music_app`: страницы/табы, очередь видимых ключей, докачка
  плейлиста, дренаж pending-очереди, импорт шара из URL.
- `tracks/`, `track/` — список и строка трека. Строка получает только `key`
  и читает метаданные из домена.
- `player/` — плеер. PWA: собственный `<audio>`; extension: offscreen-документ
  (команды через `chrome.runtime.sendMessage`, блоб через `BroadcastChannel
  'bog_music_player'` — sendMessage сериализует в JSON и теряет Blob).
- `api/` — VK API клиент: в extension напрямую (host_permissions снимают CORS),
  иначе через прокси-воркер `bog-vk-audio.cmyser-fast-i.workers.dev`.
- `hls/` — чистые функции: скачивание HLS-сегментов, AES-CBC расшифровка,
  демукс MPEG-TS, упаковка ADTS → M4A.
- `boot/` — однократные фиксы окружения до старта baza: чистка yard masters в
  extension-контексте (chrome-extension:// origin ломает WebSocket), мост
  vk_token из chrome.storage, импорт `#account=`, парсинг `#share=`.
- `ext/` — не-$mol файлы расширения (MV3): `content.js` (кнопка на vk.com,
  снифф токена через `inject.js`), `background.js` (SW: качает HLS, кладёт в
  IDB `bog_music_pending`), `offscreen.js` (фоновый плеер).

### Поток «сохранить трек с vk.com»

```
vk.com → content.js (кнопка ⬇, port bog_music_download)
       → background.js (HLS fetch + decrypt + demux) → IDB bog_music_pending
       → сообщение pending_added → app.drain_pending()
       → домен.import_audio(): метаданные в home land + blob в отдельный land
       → Giper Baza синкает на все устройства
```

### Поток «поделиться треками»

Sender: выбор треков (long-press → multi-select) → AES-ключ на один шар →
шифруются имя отправителя, verifier, метаданные и байты каждого трека →
всё в новый land с публичным чтением (`land_grab([[null, rank_read]])`),
блобы — в отдельные land'ы → ссылка `#share=<land>.<key>` в буфер обмена.
Ключ в fragment — на сервер не уходит.

Receiver: по `#share=` тянет land, проверяет ключ по verifier, расшифровывает
и складывает треки в плейлист `shared:<имя отправителя>`.

Verifier-константа `bog-vk-share-v1` — менять нельзя, сломаются старые ссылки.

## Инфраструктура

- **Baza master**: `https://baza.87.120.36.150.ip.giper.dev/` (Meridian-deploy,
  см. memory giper_baza_deploy_behind_meridian). Прописан и в manifest
  host_permissions, и как fallback в `boot/`.
- **Deploy**: GitHub Actions (`.github/workflows/deploy.yml`) — gh-pages
  (PWA) + zip расширения в releases.
- **Билд**: из корня MAM — `npx mam bog/music/app`, артефакты в `bog/music/app/-/`.
- **Dev**: `http://localhost:9080/bog/music/app/-/test.html`.

## Известные ограничения

- Обложки VK не сохраняются в baza — в списке и плеере всегда placeholder.
- HLS-ссылки VK живут ~60 минут — протухшие обновляются через audio.getById.
- Физического удаления в Giper Baza нет (append-only): «удаление» трека — это
  `cut` из словаря, юниты остаются в land.
- Импорт шара поллит master (файл-land может доехать позже ссылки на него) —
  до 90 с на заголовок и до 60 с на трек.
