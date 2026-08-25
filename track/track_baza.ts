namespace $ {

	/**
	 * Трек пользователя в home land. Ключ в словаре Tracks — `${owner_id}_${id}`
	 * (для локальных файлов owner_id = 0, id = хеш имени).
	 */
	export class $bog_music_track_baza extends $giper_baza_dict.with({
		Vk_id: $giper_baza_atom.of( $mol_schema_string ),
		Title: $giper_baza_atom.of( $mol_schema_string ),
		Artist: $giper_baza_atom.of( $mol_schema_string ),
		Duration: $giper_baza_atom.of( $mol_schema_float ),
		Url: $giper_baza_atom.of( $mol_schema_string ),
		Added: $giper_baza_atom.of( $mol_schema_float ),
		Order: $giper_baza_atom.of( $mol_schema_float ),
		// Id плейлиста: '' = основной, 'archive' = архив, 'shared:<имя>' —
		// импортированный шар. Расширяется без миграции схемы.
		Playlist: $giper_baza_atom.of( $mol_schema_string ),
		// Blob лежит в отдельном land — синкается независимо от home land
		// и не блокирует лёгкие метаданные большими паками.
		File: $bog_music_link_synced(() => $giper_baza_file),
		// Персональный обрез песни (секунды). Trim_end = null — «без обреза».
		Trim_start: $giper_baza_atom.of( $mol_schema_float ),
		Trim_end: $giper_baza_atom.of( $mol_schema_float ),
		// Старая громкость в dB RMS. Мимо восприятия, поэтому не используется —
		// поле оставлено, чтобы не спотыкаться о данные ранних версий.
		Loudness: $giper_baza_atom.of( $mol_schema_float ),
		// Интегральная громкость записи (LUFS по EBU R128), меряется один раз
		// при первом проигрывании — для выравнивания треков между собой
		// ($bog_music_gain).
		Lufs: $giper_baza_atom.of( $mol_schema_float ),
	}) {

		/** Метаданные в форме VK-audio. null если Vk_id не парсится. */
		audio(): $bog_music_api_audio | null {
			const vk_id = String(this.Vk_id()?.val() ?? '')
			const parts = vk_id.split('_')
			const owner_id = Number(parts[0])
			const id = Number(parts[1])
			if (!Number.isFinite(owner_id) || !Number.isFinite(id)) return null
			return {
				id,
				owner_id,
				artist: this.Artist()?.val() ?? '',
				title: this.Title()?.val() ?? '',
				duration: this.Duration()?.val() ?? 0,
				url: this.Url()?.val() ?? '',
			}
		}

		playlist(): string {
			return this.Playlist()?.val() ?? ''
		}

		added(): number {
			return Number(this.Added()?.val() ?? 0)
		}

		/** Позиция в плейлисте. Fallback — время добавления. */
		order(): number {
			const raw = this.Order()?.val()
			return raw == null ? this.added() : Number(raw)
		}

		order_set(next: number) {
			this.Order('auto')!.val(next)
		}

		/**
		 * Unit'ы чанков файла — БЕЗ чтения их содержимого.
		 *
		 * У sand-юнита две половины: 52-байтовый заголовок и `ball` с полезной
		 * нагрузкой. В IndexedDB это разные сторы, и `units_load()` тянет только
		 * заголовки; за нагрузкой ходит отдельный ленивый `ball_load`. Поэтому
		 * структуру файла (сколько чанков, какого размера) видно, не подняв в
		 * память ни байта звука: трек на 10 МБ — это 320 заголовков, ~17 КБ.
		 *
		 * Публичный `file.chunks()` для такого вопроса не годится: он идёт через
		 * `pawn.units_of()`, а тот сразу зовёт `land.sands_open()` и материализует
		 * ВСЮ нагрузку. Берём тот же `land.sand_ordered()`, но без `sands_open`.
		 */
		static chunk_units(file: $giper_baza_file): readonly $giper_baza_unit_sand[] {
			const list = file.Chunks()
			if (!list) return []
			return list.land()
				.sand_ordered({ head: list.head(), peer: $giper_baza_link.hole })
				.filter(unit => !unit.dead() && unit.self().str !== '')
		}

		/**
		 * Blob поверх чанков, БЕЗ сплошной копии.
		 *
		 * `file.buffer()` склеивал бы все чанки в один Uint8Array (копия №1), а
		 * `buf.buffer.slice()` делал из него ещё одну (копия №2) — и только потом
		 * содержимое уезжало в Blob (копия №3). Blob принимает список кусков как
		 * есть, поэтому копия остаётся одна, и та за пределами JS-кучи.
		 */
		private blob_of(file: $giper_baza_file): Blob | null {
			const chunks = file.chunks()
			if (!chunks.length) return null
			// baza отдаёт 'application/octet-stream', когда Type не проставлен;
			// у нас такой файл — всегда звук из ранних версий.
			const type = file.type()
			const blob = new $mol_blob(chunks, {
				type: type === 'application/octet-stream' ? 'audio/mpeg' : type,
			})
			$bog_music_mem.blob_made(blob.size)
			return blob
		}

		/** Blob из baza. null если не закеширован. */
		blob(): Blob | null {
			const file = this.File()?.remote()
			if (!file) return null
			// Сперва дешёвая проверка по заголовкам: у пустого файла содержимое
			// не читаем вовсе.
			if (!$bog_music_track_baza.chunk_units(file).length) return null
			return this.blob_of(file)
		}

		/**
		 * Blob, ДОЖИДАЯСЬ докачки blob-land с мастера. Для проигрывания.
		 *
		 * Обычный `blob()` через atom_link_synced.remote() глотает Promise
		 * (чтобы не блокировать рендер списка), поэтому сразу после клика buffer
		 * ещё пуст → «no source». Здесь зовём `land().sync()` НАПРЯМУЮ и
		 * пробрасываем его Promise: под `$mol_wire_async` фибра ретраится, пока
		 * land не досинкается, и возвращает готовый blob — без второго клика.
		 */
		blob_wait(): Blob | null {
			let file = this.File()?.remote()
			if (!file) {
				// Трек прилетел с другого устройства, а ссылка File ещё не доехала
				// в home land — ждём его досинка (suspend) и перечитываем. Без
				// этого возвращали null сразу, фибра не ретраилась и трек не играл
				// до повторного клика.
				this.land().sync()
				file = this.File()?.remote()
				if (!file) return null
			}
			file.land().sync() // проброс Promise → suspend пока не досинкается
			if (!$bog_music_track_baza.chunk_units(file).length) return null
			return this.blob_of(file)
		}

		/**
		 * Blob полностью на устройстве — ЛЁГКАЯ проверка (без материализации
		 * Blob, в отличие от blob()): зовётся из keys_in на каждый трек.
		 * Само чтение File→remote через link_synced запускает sync blob-land,
		 * так что недосинканный трек начнёт качаться и по готовности реактивно
		 * появится в списке.
		 */
		has_blob(): boolean {
			try {
				const file = this.File()?.remote()
				if (!file) return false
				return $bog_music_track_baza.chunk_units(file).length > 0
			} catch (e: any) {
				return false // Promise (ещё синкается) или битый pawn — пока нет
			}
		}

		/**
		 * Есть ли blob локально — БЕЗ запуска sync (в отличие от has_blob).
		 * Использует `remote_local`, поэтому проверка на каждый трек в списке НЕ
		 * поднимает загрузку всех blob-лендов. Реактивна: когда префетч догонит
		 * этот трек и blob доедет, флипнется в true и строка перестанет тускнеть.
		 *
		 * Отвечает на булев вопрос по заголовкам чанков. Раньше здесь звался
		 * `file.buffer()` — то есть на КАЖДЫЙ трек списка в память поднималась
		 * вся песня целиком, и фонотека оседала в куче просто от рендера.
		 */
		blob_local(): boolean {
			const link: any = this.File()
			if (!link) return false
			const file = link.remote_local ? link.remote_local() : link.remote()
			if (!file) return false
			return $bog_music_track_baza.chunk_units(file).length > 0
		}

		/**
		 * Сколько чанков у трека и сколько из них подняты в память (для панели
		 * диагностики). Ничего не подгружает — смотрит только заголовки.
		 */
		chunks_stat() {
			const link: any = this.File()
			const file = link && (link.remote_local ? link.remote_local() : link.remote())
			if (!file) return $bog_music_mem.units_stat([])
			return $bog_music_mem.units_stat($bog_music_track_baza.chunk_units(file))
		}

		/**
		 * Дожидается докачки blob-land с мастера (suspend под $mol_wire_sync) и
		 * возвращает, доехал ли blob. Как blob_wait, но без материализации Blob —
		 * для фонового префетча «по одной песне»: драйвер зовёт это на один трек,
		 * фибра висит пока не досинкается, потом берётся за следующий.
		 */
		blob_ensure(): boolean {
			let file = this.File()?.remote()
			if (!file) {
				this.land().sync()
				file = this.File()?.remote()
				if (!file) return false
			}
			file.land().sync() // проброс Promise → suspend пока не досинкается
			return $bog_music_track_baza.chunk_units(file).length > 0
		}

		/**
		 * Файл уже в базе. Проверка по заголовкам чанков: раньше здесь звался
		 * `blob()`, и вопрос «а не скачано ли уже?» перед каждой докачкой с VK
		 * поднимал в память весь трек.
		 */
		cached(): boolean {
			try {
				const file = this.File()?.remote()
				if (!file) return false
				return $bog_music_track_baza.chunk_units(file).length > 0
			} catch (e: any) {
				// Promise пробрасываем: зовут из фибры докачки, и «ещё грузится»
				// нельзя выдавать за «не скачано» — иначе трек качается заново.
				if (e instanceof Promise) throw e
				return false // битый pawn/CBOR — считаем что кеша нет
			}
		}

		/** Интегральная громкость (LUFS). null — ещё не измерена. */
		lufs(next?: number): number | null {
			if (next !== undefined) this.Lufs('auto')!.val(next)
			const v = this.Lufs()?.val()
			return v == null ? null : Number(v)
		}

		/** Обрез начала (сек). 0 = без обреза. */
		trim_start(next?: number): number {
			if (next !== undefined) this.Trim_start('auto')!.val(Math.max(0, next))
			const v = Number(this.Trim_start()?.val() ?? 0)
			return Number.isFinite(v) && v > 0 ? v : 0
		}

		/** Обрез конца (сек). null/0 → fallback (обычно полная длительность). */
		trim_end(fallback: number, next?: number): number {
			if (next !== undefined) this.Trim_end('auto')!.val(Math.max(0, next))
			const raw = this.Trim_end()?.val()
			if (raw == null) return fallback
			const v = Number(raw)
			return Number.isFinite(v) && v > 0 ? v : fallback
		}

	}

	/** Словарь cache_key → трек. Вынесен отдельно, чтобы не циклить TS-инференс. */
	export class $bog_music_tracks_dict extends $giper_baza_dict_to($bog_music_track_baza) {}

}
