declare const chrome: any

namespace $.$$ {

	/**
	 * Плеер. Работает с треками по ключу, метаданные и блобы читает из домена
	 * ($bog_music_account_baza). Два режима вывода звука:
	 * - PWA/сайт: собственный <audio>;
	 * - extension: offscreen-документ (см. ext/offscreen.js) — играет при
	 *   закрытом табе. Команды — sendMessage, блоб — BroadcastChannel
	 *   (sendMessage сериализует через JSON и теряет Blob).
	 */
	export class $bog_music_player extends $.$bog_music_player {

		account() {
			return $bog_music_account_baza.home()
		}

		current_track() {
			const key = this.current_key()
			return key ? this.account().track(key) : null
		}

		current_audio(): $bog_music_api_audio | null {
			if (this._ext) return { id: 0, owner_id: 0, artist: this._ext.artist, title: this._ext.title, duration: 0, url: this._ext.url }
			return this.current_track()?.audio() ?? null
		}

		// Внешний источник (стрим tube-превью), играющий без записи в baza.
		// Пока задан — плеер работает по url, а не по ключу из baza.
		private _ext: { url: string, title: string, artist: string } | null = null

		/** Прослушать по прямому URL, не сохраняя трек (tube-превью). */
		play_external(url: string, title: string, artist: string) {
			if (this.is_extension()) {
				// В extension нет прямого <audio>; превью работает только в PWA/сайте.
				return
			}
			$bog_music_log.act(`внешний стрим: ${artist} — ${title}`)
			this._ext = { url, title, artist }
			this.current_key('')
			this.current_time(0)
			this.duration(0)
			this._trim_end_skip = ''
			this._trim_start_done = ''
			this.apply_media_metadata(this.current_audio()!)
			this.gain_chain_unlock()
			const el = this.audio_el()
			if (this._last_blob_url) {
				URL.revokeObjectURL(this._last_blob_url)
				this._last_blob_url = ''
			}
			this._dispatch_token++
			this.set_track_src(el, url)
			el.play().catch(() => {})
		}

		// ---------- окружение ----------

		private is_extension() {
			return typeof chrome !== 'undefined' && !!chrome?.runtime?.id
		}

		private _channel?: BroadcastChannel

		private channel() {
			if (!this._channel) this._channel = new BroadcastChannel('bog_music_player')
			return this._channel
		}

		private send(type: string, payload?: Record<string, unknown>) {
			if (!this.is_extension()) return
			chrome.runtime.sendMessage({ target: 'offscreen', type, ...payload }).catch(() => {})
		}

		// ---------- iOS фоновое воспроизведение (один элемент, swap src) ----------
		// iOS PWA: два <audio> дерутся за единственную аудио-сессию, и play с
		// локскрина попадает в silence-элемент вместо трека. Решение — ОДИН
		// элемент, который никогда не останавливается: на «паузе» его src
		// подменяется на беззвучный цикл (сессия и страница живы), по play —
		// возвращается src трека и перематывается на сохранённую позицию.

		// Тишина для keep-alive. 3 сек 8kHz — короткий обрывок (пара сэмплов)
		// iOS Safari не считает валидным медиа и не держит на нём сессию
		// («нет аудио»). Генерим полноценный WAV как Blob URL один раз.
		private static _silence_url = ''
		private static silence_url() {
			if (this._silence_url) return this._silence_url
			const rate = 8000, n = rate * 3
			const buf = new Uint8Array(44 + n)
			const dv = new DataView(buf.buffer)
			const w = (o: number, s: string) => { for (let i = 0; i < s.length; i++) buf[o + i] = s.charCodeAt(i) }
			w(0, 'RIFF'); dv.setUint32(4, 36 + n, true); w(8, 'WAVE'); w(12, 'fmt ')
			dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true)
			dv.setUint32(24, rate, true); dv.setUint32(28, rate, true); dv.setUint16(32, 1, true); dv.setUint16(34, 8, true)
			w(36, 'data'); dv.setUint32(40, n, true)
			buf.fill(128, 44) // 8-bit unsigned: 128 = тишина
			this._silence_url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
			return this._silence_url
		}

		/** src текущего трека (blob url) — чтобы вернуть его после silence-паузы. */
		private _track_src = ''
		/** Позиция трека на момент паузы (для seek при возобновлении). */
		private _paused_pos = 0
		/** Сейчас в элементе крутится беззвучный keep-alive-цикл (не трек). */
		private _silent = false
		/**
		 * Ждём, пока трек после resume домотается до сохранённой позиции.
		 * Пока >0 — timeupdate не пишет current_time (иначе полоска мигнёт в 0:
		 * смена src сбрасывает el.currentTime до отработки seek).
		 */
		private _await_seek = 0
		/**
		 * Идёт смена трека: элемент перезагружает ресурс и ещё не заиграл.
		 * Транзиентные 'pause' в этом окне — не системная пауза, и уводить по ним
		 * элемент в keep-alive-тишину нельзя: он застревает на беззвучном цикле,
		 * трек «играет» без звука, а toggle не помогает (ios_pause на _silent
		 * молча выходит). Сбрасывается по 'playing'/'timeupdate' или по таймауту.
		 */
		private _switching = false
		private _switch_gen = 0

		private is_ios() {
			return /iPad|iPhone|iPod/.test(navigator.userAgent)
				|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		}

		/**
		 * Ставит src трека, запоминая его для последующего swap.
		 *
		 * Обрез НЕ уходит медиа-фрагментом (blob:...#t=): пробовали — обрезанные
		 * треки переставали играть и проскакивались. Фрагмент на blob-url
		 * ломает загрузку ресурса. Позицию ставит только seek в
		 * attach_seek_listener, а от «пауза перехода → keep-alive-тишина»
		 * защищает флаг _switching ниже.
		 */
		private set_track_src(el: HTMLAudioElement, url: string) {
			this._silent = false
			this._track_src = url
			// WebAudio отдаёт тишину, если источник с чужого домена и не прислал
			// CORS-заголовки. Для не-blob адресов (превью с tube-сервера) просим
			// CORS явно, иначе после подключения гейн-цепочки звук пропадёт.
			// Проверять _gain_ready мало: Safari подключает цепочку отложенно, и
			// источник, взятый до подключения, замолчал бы задним числом.
			if (!this._gain_dead && this.normalize()) {
				el.crossOrigin = url.startsWith('blob:') ? null : 'anonymous'
			}
			el.loop = false
			el.src = url
			const gen = ++this._switch_gen
			this._switching = true
			setTimeout(() => { if (this._switch_gen === gen) this._switching = false }, 3000)
		}

		/**
		 * «Пауза» на iOS: не останавливаем элемент (иначе iOS заморозит страницу
		 * и локскрин умрёт), а крутим в нём беззвучный цикл. Сессия остаётся у
		 * этого же элемента — play с локскрина гарантированно попадёт в него.
		 */
		private ios_pause(el: HTMLAudioElement) {
			// Уже на тишине: повторная «пауза» затёрла бы _paused_pos позицией
			// silence-цикла (0..3с) и resume отмотал бы трек в начало.
			if (this._silent) return
			this._paused_pos = el.currentTime || this._paused_pos
			this._silent = true
			this.current_time(this._paused_pos) // заморозить полоску на позиции
			el.loop = true
			el.src = $bog_music_player.silence_url()
			el.play().catch(() => {})
			this.playing(false)
			if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
		}

		/**
		 * Возобновление на iOS: возвращаем src трека в тот же элемент и
		 * перематываем на сохранённую позицию. Синхронно в юзер-жесте (toggle /
		 * mediaSession play), поэтому iOS разрешает воспроизведение.
		 */
		private ios_resume(el: HTMLAudioElement) {
			if (this._track_src) {
				this._await_seek = this._paused_pos
				this.current_time(this._paused_pos) // держим полоску до досинка seek
				this.set_track_src(el, this._track_src)
				this.attach_seek_listener(el, this._paused_pos)
				el.play().catch(() => {})
				this.playing(true)
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
				return
			}
			// src трека потерян — пересобираем из blob по текущему ключу.
			const key = this.current_key()
			if (!key) return
			const pos = this._paused_pos
			;($mol_wire_async(this) as any).blob_of(key).then((blob: Blob | null) => {
				if (!blob) return
				// URL держим в _last_blob_url: раньше он создавался «мимо» поля, и
				// каждый resume после потери src оставлял в браузере ещё одну
				// неотзываемую ссылку на целый трек.
				if (this._last_blob_url) URL.revokeObjectURL(this._last_blob_url)
				const url = URL.createObjectURL(blob)
				this._last_blob_url = url
				this.set_track_src(el, url)
				this.attach_seek_listener(el, pos)
				el.play().catch(() => {})
			}).catch(() => {})
		}

		// ---------- выравнивание громкости ----------
		// Весь звук идёт через WebAudio: el → gain → limiter → выход.
		// Пользовательская громкость и выравнивающий множитель лежат вместе в
		// GainNode, потому что el.volume не годится ни для того, ни для другого:
		// на iOS система его игнорирует, а на остальных платформах он зажат
		// единицей — тихую запись им не поднять, только приглушить громкую.

		private _gain_ctx?: AudioContext
		private _gain_node?: GainNode
		/** Элемент заведён в граф. Обратной дороги нет: выход теперь только там. */
		private _gain_ready = false
		/** WebAudio недоступен или упал — работаем напрямую элементом. */
		private _gain_dead = false
		private _gain_wake_set = false

		/**
		 * Создать и разбудить контекст. Зовётся из юзер-жеста: без жеста он
		 * остаётся спящим, а заводить элемент в спящий граф нельзя — весь звук
		 * ушёл бы в тишину.
		 */
		private gain_chain_unlock() {
			if (this._gain_dead) return
			// Эквалайзер живёт в том же графе, что и выравнивание: включён любой
			// из двух — цепочка нужна.
			//
			// Смотрим на _eq_on, а не на eq_on(): тот читает baza и может
			// подвиснуть на несинхронизированном ленде. Сюда заходят из клика,
			// а клик — единственный момент, когда WebAudio разрешено будить;
			// подвиснуть здесь значит доехать до resume уже вне жеста, и на iOS
			// это тишина до конца сессии.
			if (!this.normalize() && !this._eq_on) return
			if (this._gain_ready) { this.gain_resume(); return }
			try {
				if (!this._gain_ctx) {
					const AC = (window as any).AudioContext || (window as any).webkitAudioContext
					if (!AC) { this._gain_dead = true; return }
					this._gain_ctx = new AC() as AudioContext
				}
				const ctx = this._gain_ctx
				if (ctx.state === 'running') {
					this.gain_wire()
					return
				}
				// Safari отдаёт контекст спящим даже внутри жеста — подключаемся,
				// когда он проснётся.
				ctx.resume().then(() => this.gain_wire()).catch(() => {})
			} catch (e: any) {
				this._gain_dead = true
				console.warn('[player] gain chain failed:', e?.message ?? e)
			}
		}

		/** Завести элемент в граф: el → gain → limiter → выход. */
		private gain_wire() {
			if (this._gain_ready || this._gain_dead) return
			const ctx = this._gain_ctx
			if (!ctx || ctx.state !== 'running') return
			try {
				const src = ctx.createMediaElementSource(this.audio_el())
				const gain = ctx.createGain()
				// Страховка от клиппинга: у поднятой тихой записи пики вылезают
				// за 0 dBFS, лимитер срезает их без хруста.
				const limiter = ctx.createDynamicsCompressor()
				limiter.threshold.value = -1
				limiter.knee.value = 0
				limiter.ratio.value = 20
				limiter.attack.value = 0.003
				limiter.release.value = 0.25
				// Полосы эквалайзера — ДО гейна, чтобы лимитер остался последним:
				// поднятый на +12 dB бас вылезает за 0 dBFS ровно так же, как
				// поднятая тихая запись, и срезает их один и тот же лимитер.
				// Узлы стоят в графе всегда; выключенный эквалайзер — это все
				// полосы в нуле, а не выдернутые узлы: createMediaElementSource
				// необратим, разбирать цепочку обратно всё равно нечем.
				const eq = $bog_music_eq.bands.map(band => {
					const node = ctx.createBiquadFilter()
					node.type = band.type
					node.frequency.value = band.freq
					node.Q.value = $bog_music_eq.q
					node.gain.value = 0
					return node
				})
				let tail: AudioNode = src
				for (const node of eq) {
					tail.connect(node)
					tail = node
				}
				tail.connect(gain)
				gain.connect(limiter)
				limiter.connect(ctx.destination)
				this._eq_nodes = eq
				this._gain_node = gain
				this._gain_ready = true
				this.audio_el().volume = 1 // дальше громкостью рулит только гейн
				this.gain_push()
				this.eq_push()
				this.setup_gain_wake()
			} catch (e: any) {
				this._gain_dead = true
				console.warn('[player] gain wire failed:', e?.message ?? e)
			}
		}

		/**
		 * Заснувший контекст = тишина при живом <audio>: iOS усыпляет его в фоне
		 * и после каждого прерывания (звонок, наушники). Будим отовсюду, откуда
		 * можно узнать, что мы снова на переднем плане.
		 */
		private setup_gain_wake() {
			if (this._gain_wake_set) return
			this._gain_wake_set = true
			const wake = () => this.gain_resume()
			this._gain_ctx?.addEventListener('statechange', wake)
			document.addEventListener('visibilitychange', wake)
			window.addEventListener('pageshow', wake)
			window.addEventListener('focus', wake)
		}

		private gain_resume() {
			const ctx = this._gain_ctx
			if (!ctx) return
			if (ctx.state !== 'running') ctx.resume().catch(() => {})
			if (!this._gain_ready) this.gain_wire()
		}

		/**
		 * Выравнивать ли громкость треков. Выключенное — ещё и аварийный тумблер:
		 * после перезагрузки страницы звук пойдёт мимо WebAudio совсем.
		 */
		@$mol_mem
		normalize(next?: boolean) {
			if (next !== undefined) $bog_music_log.act(`выравнивание громкости: ${next ? 'включено' : 'выключено'}`)
			const v = $mol_state_local.value('bog_music_gain_norm', next) as boolean | null
			return v ?? true
		}

		/** Множитель выравнивания текущего трека. 1 пока громкость не измерена. */
		track_gain(): number {
			if (!this.normalize()) return 1
			return $bog_music_gain.factor(this.current_track()?.lufs() ?? null)
		}

		gain_known(key: string): boolean {
			return this.account().track(key)?.lufs() != null
		}

		/** Уже брались за этот трек в этой сессии — второй раз не декодируем. */
		private _gain_seen = new Set<string>()
		/** Замеры идут по одному: декодированный трек занимает десятки мегабайт. */
		private _gain_queue: Promise<unknown> = Promise.resolve()

		/** Поставить трек в очередь на одноразовый замер громкости. */
		private analyze_gain(key: string) {
			if (!key || this._gain_seen.has(key)) return
			this._gain_seen.add(key)
			this._gain_queue = this._gain_queue.then(() => this.measure_gain(key)).catch(() => {})
		}

		private async measure_gain(key: string) {
			try {
				if (await ($mol_wire_async(this) as any).gain_known(key)) return
				const blob = await ($mol_wire_async(this) as any).blob_of(key) as Blob | null
				if (!blob) {
					this._gain_seen.delete(key) // ещё не докачался — вернёмся позже
					return
				}
				const lufs = await $bog_music_gain.measure_lufs(await blob.arrayBuffer())
				if (lufs == null) return
				await ($mol_wire_async(this.account()) as any).save_lufs(key, lufs)
			} catch (e: any) {
				this._gain_seen.delete(key)
				console.warn('[player] loudness analyze failed:', e?.message ?? e)
			}
		}

		// ---------- <audio> для PWA-режима ----------

		private _audio_el?: HTMLAudioElement
		private _last_blob_url = ''

		audio_el() {
			if (this._audio_el) return this._audio_el
			const el = new Audio()
			el.volume = this.volume()
			el.addEventListener('ended', () => { if (!this._silent) this.on_ended() })
			el.addEventListener('play', () => {
				if (this._silent) return // это беззвучный keep-alive-цикл, не трек
				try { this.playing(true) } catch {}
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
				this.gain_resume()
			})
			el.addEventListener('pause', () => {
				if (this._silent) {
					// Системная пауза (выдернули наушники) остановила и беззвучный
					// keep-alive → страница замёрзнет и iOS прибьёт PWA. Будим тишину.
					el.play().catch(() => {})
					return
				}
				// Пауза посреди смены трека при неготовом ресурсе — не решение
				// пользователя и не системное прерывание, а последствие
				// перезагрузки src и seek'а на обрез: буфер просел, элемент встал.
				// Возвращаем его в игру. Пауза с уже загруженным треком
				// (readyState 4) сюда не попадает и обрабатывается как обычно.
				if (this._switching && !el.ended && el.readyState < el.HAVE_FUTURE_DATA) {
					el.play().catch(() => {})
					return
				}
				// iOS: системная пауза (наушники, interruption) мимо mediaSession
				// бьёт прямо в элемент. Просто принять её = потерять audio-сессию →
				// iOS закроет приложение. Переводим в наш swap-на-тишину: позиция
				// сохранена, сессия жива, UI показывает паузу.
				// НО не во время смены трека: там 'pause' прилетает от самой
				// перезагрузки ресурса, и swap на тишину намертво глушил автопереход.
				if (this.is_ios() && this.playing() && !el.ended && !this._switching) {
					this.ios_pause(el)
					const key = this.current_key()
					if (key) {
						try { this.account().save_last_session(key, this.current_time()) } catch {}
					}
					return
				}
				try { this.playing(false) } catch {}
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
			})
			// Реально заигралo — окно смены трека закрыто.
			el.addEventListener('playing', () => { this._switching = false })
			el.addEventListener('timeupdate', () => {
				// Дешёвая проверка живости графа: контекст мог заснуть в фоне,
				// и тогда элемент играет, а из динамика тишина.
				if (this._gain_ctx && this._gain_ctx.state !== 'running') this.gain_resume()
				if (this._silent) return
				this._switching = false
				// После resume игнорим нулевой скачок, пока трек не домотается
				// до сохранённой позиции (иначе полоска мигнёт в 0).
				if (this._await_seek > 0) {
					if (el.currentTime >= this._await_seek - 1.5) this._await_seek = 0
					else return
				}
				this.current_time(el.currentTime)
				this.scrobble_watch(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				if (this._silent) return
				// Не писать NaN/0 (промельк при смене src на resume) — иначе
				// trim-ручки считаются как trim/NaN и уезжают.
				if (el.duration > 0 && isFinite(el.duration)) this.duration(el.duration)
			})
			el.addEventListener('error', () => {
				console.error('[player] audio error:', el.error?.code, el.error?.message)
			})
			this._audio_el = el
			return el
		}

		// ---------- скробблинг в last.fm ----------

		private _fm: { artist: string, title: string, duration: number, started: number, done: boolean } | null = null

		/**
		 * Часы скробблинга. Зовутся из тика воспроизведения (timeupdate в PWA,
		 * state-сообщение из offscreen в расширении) — специально не из
		 * play_track: там синхронный iOS-путь, и лишний код в нём рвёт звук в
		 * фоне. Смену трека ловим по метаданным, а не по событию.
		 */
		private scrobble_watch(time: number) {
			if (!$bog_music_scrobble.enabled()) return
			let audio: $bog_music_api_audio | null = null
			try {
				audio = this.current_audio()
			} catch {
				return // метаданные ещё синкаются — тик пропускаем
			}
			const artist = audio?.artist ?? ''
			const title = audio?.title ?? ''
			if (!title) {
				this._fm = null
				return
			}
			const current = this._fm
			// Новый трек, либо тот же самый запустили заново с начала.
			if (!current || current.artist !== artist || current.title !== title || (current.done && time < 3)) {
				let duration = 0
				try { duration = this.duration() || audio?.duration || 0 } catch {}
				this._fm = { artist, title, duration, started: Math.floor(Date.now() / 1000), done: false }
				$bog_music_scrobble.now_playing(artist, title, duration)
				return
			}
			if (current.done) return
			if (!current.duration) {
				try { current.duration = this.duration() || 0 } catch {}
			}
			// Правило last.fm: трек длиннее 30 с, прослушано больше половины
			// или больше 4 минут.
			if (current.duration < 30) return
			if (time < Math.min(current.duration / 2, 240)) return
			current.done = true
			$bog_music_scrobble.scrobble(current.artist, current.title, current.duration, current.started)
		}

		private on_ended() {
			let finished: $bog_music_api_audio | null = null
			try { finished = this.current_audio() } catch {}
			try {
				// Синхронно и вне фибры: на iOS звук в фоне даётся только если
				// el.play() ушёл в continuation этого же 'ended'-обработчика.
				this.next(false)
			} catch (e: any) {
				if (e instanceof Promise) {
					// Что-то в цепочке ещё не прогрето (холодный baza-атом, крипта):
					// вне фибры Promise = молчаливая остановка. Ретраим в фибре.
					;($mol_wire_async(this) as any).next_auto()
				} else {
					console.warn('[player] ended handler error:', e)
				}
			}
			// Дослушанный трек докачиваем в кеш, если ещё не там.
			if (finished && navigator.onLine) {
				try { this.account().save_hls(finished).catch(() => {}) } catch {}
			}
		}

		// ---------- связь с offscreen (extension) ----------

		private _msg_listener_set = false

		@$mol_mem
		private offscreen_link() {
			if (!this.is_extension()) return null
			if (this._msg_listener_set) return null
			this._msg_listener_set = true

			chrome.runtime.onMessage.addListener((msg: any) => {
				if (msg?.target !== 'popup') return
				if (msg.type === 'state') {
					if (typeof msg.playing === 'boolean') {
						this.playing(msg.playing)
						if ('mediaSession' in navigator) {
							navigator.mediaSession.playbackState = msg.playing ? 'playing' : 'paused'
						}
					}
					if (typeof msg.current_time === 'number') this.current_time(msg.current_time)
					if (typeof msg.duration === 'number' && isFinite(msg.duration)) this.duration(msg.duration)
					if (msg.current_audio) {
						this.current_key($bog_music_account_baza.key_of(msg.current_audio))
					}
					// Ключ уже обновлён — метаданные для скроббла свежие.
					if (typeof msg.current_time === 'number') this.scrobble_watch(msg.current_time)
				}
				if (msg.type === 'ended') this.on_ended()
				if (msg.type === 'error') {
					console.error('[player] offscreen error:', msg.code, msg.message)
				}
			})

			chrome.runtime.sendMessage({ target: 'background', type: 'ensure_offscreen' })
				.then(() => chrome.runtime.sendMessage({ target: 'offscreen', type: 'get_state' }))
				.then((s: any) => {
					if (s?.current_audio) {
						if (typeof s.playing === 'boolean') this.playing(s.playing)
						if (typeof s.current_time === 'number') this.current_time(s.current_time)
						if (typeof s.duration === 'number' && isFinite(s.duration)) this.duration(s.duration)
						this.current_key($bog_music_account_baza.key_of(s.current_audio))
						return
					}
					this.try_restore_session()
				})
				.catch(() => {})

			return null
		}

		// ---------- восстановление последней сессии ----------

		private _session_restored = false

		/** Sync-чтение сессии из домена — зовётся через фибру. */
		session_read() {
			const session = this.account().last_session()
			if (!session) return null
			const audio = this.account().track(session.key)?.audio()
			if (!audio) return null
			return { ...session, audio }
		}

		private async try_restore_session() {
			if (this._session_restored) return
			this._session_restored = true
			const session = await ($mol_wire_async(this) as any).session_read()
				.catch(() => null) as { key: string, position: number, audio: $bog_music_api_audio } | null
			if (!session) return
			this.current_key(session.key)
			this.current_time(session.position)
			if (session.audio.duration) this.duration(session.audio.duration)

			// До этой правки метаданные и обработчики ставились ТОЛЬКО из
			// play_track. После восстановления сессии (открыл приложение, но ещё
			// не нажал play) системный плеер оставался пустым: в шторке нечего
			// показывать и нечем управлять.
			this.apply_media_metadata(session.audio)
			if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'

			if (this.is_extension()) {
				this.restore_offscreen(session).catch(() => {})
			} else {
				this.restore_local(session).catch(() => {})
			}
		}

		private async restore_offscreen(session: { key: string, position: number, audio: $bog_music_api_audio }) {
			await chrome.runtime.sendMessage({ target: 'background', type: 'ensure_offscreen' })
			const blob = await this.blob_ready(session.key, session.audio)
			if (!blob) return
			this.channel().postMessage({
				target: 'offscreen',
				type: 'play_track',
				audio: session.audio,
				blob,
				start_at: session.position,
				autoplay: false,
			})
		}

		private async restore_local(session: { key: string, position: number, audio: $bog_music_api_audio }) {
			const el = this.audio_el()
			const blob = await ($mol_wire_async(this) as any).blob_of(session.key).catch(() => null) as Blob | null
			if (blob) {
				if (this._last_blob_url) URL.revokeObjectURL(this._last_blob_url)
				const url = URL.createObjectURL(blob)
				this._last_blob_url = url
				this.set_track_src(el, url)
			} else if (session.audio.url) {
				this.set_track_src(el, session.audio.url)
			} else {
				return
			}
			this.attach_seek_listener(el, session.position)
		}

		// ---------- media session ----------

		private setup_media_session() {
			if (!('mediaSession' in navigator)) return
			const ms = navigator.mediaSession
			ms.setActionHandler('previoustrack', () => { try { this.prev() } catch {} })
			ms.setActionHandler('nexttrack', () => { try { this.next() } catch {} })
			if (this.is_extension()) {
				ms.setActionHandler('seekto', details => {
					if (details.seekTime != null) this.send('seek', { time: details.seekTime })
				})
				ms.setActionHandler('play', () => { this.send('resume') })
				ms.setActionHandler('pause', () => { this.send('pause') })
			} else {
				const el = this.audio_el()
				ms.setActionHandler('seekto', details => {
					if (details.seekTime != null) el.currentTime = details.seekTime
				})
				ms.setActionHandler('play', () => { this.resume_robust() })
				ms.setActionHandler('pause', () => {
					if (this.is_ios()) this.ios_pause(el)
					else el.pause()
				})
			}
		}

		/** Возобновление с локскрина/Control Center. */
		private resume_robust() {
			const el = this.audio_el()
			this.gain_chain_unlock()
			if (this.is_ios()) {
				this.ios_resume(el)
				return
			}
			el.play().catch(() => {})
		}

		private apply_media_metadata(audio: $bog_music_api_audio) {
			if (!('mediaSession' in navigator)) return
			// iOS PWA: без artwork iOS считает это не «настоящим медиа» и душит
			// фоновый звук — подсовываем favicon в нескольких размерах.
			const fav = 'bog/music/app/favicon.svg'
			navigator.mediaSession.metadata = new MediaMetadata({
				title: audio.title,
				artist: audio.artist,
				album: 'Bog Music',
				artwork: [
					{ src: fav, sizes: '96x96', type: 'image/svg+xml' },
					{ src: fav, sizes: '192x192', type: 'image/svg+xml' },
					{ src: fav, sizes: '512x512', type: 'image/svg+xml' },
				],
			})
			this.setup_media_session()
		}

		/**
		 * Позиция для системного плеера — локскрин и Пункт управления (шторка
		 * справа сверху). Без setPositionState шторка не знает ни длительности,
		 * ни позиции: прогресс стоит на нуле, а скраб-бар не двигается, хотя
		 * обработчик seekto давно есть. Локскрин это переживал, шторка — нет.
		 *
		 * Значения обязаны быть валидными: NaN-длительность или позиция за её
		 * пределами роняют setPositionState с TypeError.
		 */
		@$mol_mem
		private apply_position_state() {
			if (!('mediaSession' in navigator)) return 0
			const ms = navigator.mediaSession as any
			if (typeof ms.setPositionState !== 'function') return 0
			const duration = this.duration()
			const position = this.current_time()
			if (!(duration > 0) || !isFinite(duration)) {
				// Метаданных ещё нет — сбрасываем, иначе шторка держит прошлый трек.
				try { ms.setPositionState() } catch {}
				return 0
			}
			const at = Math.max(0, Math.min(isFinite(position) ? position : 0, duration))
			try {
				ms.setPositionState({ duration, position: at, playbackRate: 1 })
			} catch (e: any) {
				console.warn('[player] position state failed:', e?.message)
			}
			return at
		}

		// ---------- базовое состояние ----------

		@$mol_mem
		playing(next?: boolean) {
			return next ?? false
		}

		@$mol_mem
		current_time(next?: number) {
			return next ?? 0
		}

		@$mol_mem
		duration(next?: number) {
			return next ?? 0
		}

		@$mol_mem
		volume(next?: number) {
			const v = $mol_state_local.value('bog_music_volume', next) ?? 0.7
			return Math.max(0, Math.min(1, v as number))
		}

		/** Последняя посчитанная пара — дожать её после сборки цепочки. */
		private _gain_last = { volume: 0.7, factor: 1 }

		@$mol_mem
		private apply_volume() {
			const volume = this.volume()
			// Реактивно: когда фоновый замер допишет громкость, гейн подтянется.
			const factor = this.track_gain()
			this._gain_last = { volume, factor }
			this.gain_push()
			return volume * factor
		}

		/** Разложить громкость по выходу: offscreen, WebAudio или сам элемент. */
		private gain_push() {
			const { volume, factor } = this._gain_last
			if (this.is_extension()) {
				this.send('volume', { value: volume, gain: factor })
				return
			}
			const node = this._gain_node
			const ctx = this._gain_ctx
			if (node && ctx) {
				// Плавно: мгновенный скачок гейна на стыке треков щёлкает.
				try {
					node.gain.setTargetAtTime(volume * factor, ctx.currentTime, 0.02)
				} catch {
					node.gain.value = volume * factor
				}
				return
			}
			// Цепочки нет (жеста ещё не было, WebAudio недоступен, выравнивание
			// выключено) — элементом можно только приглушить.
			if (this._audio_el) this._audio_el.volume = Math.max(0, Math.min(1, volume * factor))
		}

		title() {
			return this.current_audio()?.title ?? ''
		}

		artist() {
			return this.current_audio()?.artist ?? ''
		}

		time_current_text() {
			return this.format_time(this.current_time())
		}

		time_total_text() {
			return this.format_time(this.duration())
		}

		format_time(seconds: number) {
			const min = Math.floor(seconds / 60)
			const sec = Math.floor(seconds % 60)
			return `${min}:${sec.toString().padStart(2, '0')}`
		}

		progress_width() {
			const dur = this.duration()
			if (!dur) return '0%'
			return `${(this.current_time() / dur) * 100}%`
		}

		// ---------- громкость (drag по вертикальному слайдеру) ----------

		/**
		 * Тап по иконке открывает и закрывает панель. Раньше панель была
		 * $mol_pop_over, а он показан, пока «в фокусе ИЛИ под курсором»: на
		 * телефоне фокус остаётся на кнопке, и повторный тап ничего не закрывал.
		 */
		volume_toggle() {
			const pop = this.Volume()
			const showed = pop.showed()
			$bog_music_log.act(`панель громкости: ${showed ? 'закрыта' : 'открыта'}`)
			pop.showed(!showed)
			if (!showed) this.setup_pop_dismiss(pop)
			return null
		}

		private _dismiss_pops = new Set<$.$mol_pop>()

		/**
		 * Тап мимо панели закрывает её. Сам $mol_pop закрывается, только когда
		 * фокус уезжает на другой фокусируемый элемент, а тап по пустому месту
		 * фокус никуда не переносит — панель висела бы на экране.
		 */
		private setup_pop_dismiss(pop: $.$mol_pop) {
			if (this._dismiss_pops.has(pop)) return
			this._dismiss_pops.add(pop)
			window.addEventListener('pointerdown', event => {
				if (!pop.showed()) return
				const target = event.target as Node | null
				if (!target) return
				if (pop.dom_node().contains(target)) return
				if (pop.Bubble().dom_node().contains(target)) return
				pop.showed(false)
			}, true)
		}

		private _vol_dragging = false

		private volume_set_from_event(event: PointerEvent) {
			const target = event.currentTarget as HTMLElement
			const rect = target.getBoundingClientRect()
			const y = event.clientY - rect.top
			this.volume(Math.max(0, Math.min(1, 1 - y / rect.height)))
		}

		volume_pointer_down(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
			this._vol_dragging = true
			this.volume_set_from_event(e)
			e.preventDefault()
			return null
		}

		volume_pointer_move(event?: Event) {
			if (!event || !this._vol_dragging) return null
			this.volume_set_from_event(event as PointerEvent)
			return null
		}

		volume_pointer_up(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
			this._vol_dragging = false
			// Пишем в журнал на отпускании, а не на каждом шаге: за одно
			// перетаскивание сеттер зовётся десятки раз и вытеснил бы журнал.
			$bog_music_log.act(`громкость: ${Math.round(this.volume() * 100)}%`)
			// Ползунок отпущен — панель своё отработала, убираем её с экрана.
			try { this.Volume().showed(false) } catch {}
			return null
		}

		volume_fill_height() {
			return `${Math.round(this.volume() * 100)}%`
		}

		// ---------- эквалайзер ----------
		// Полосы стоят в общем тракте, между источником и гейном (см. gain_wire).
		// Настройки лежат в аккаунте, а не в localStorage: кривую выставляют один
		// раз и ждут её же на другом устройстве.
		//
		// Ни eq_on, ни eq_gains не мемоизируем. Запись в @$mol_mem замораживает
		// его зависимости — настройка, приехавшая синком с телефона, до открытого
		// ноутбука бы уже не дошла. Реактивность даёт сам baza-атом: его читает
		// тот атом, который вызвал эти методы.

		private _eq_nodes: BiquadFilterNode[] = []
		private _eq_last: number[] = $bog_music_eq.flat()
		/** Последнее известное «включён» — снимок для путей, где нельзя виснуть. */
		private _eq_on = false

		eq_on(next?: boolean): boolean {
			if (next === undefined) {
				const on = this.account().eq_on()
				this._eq_on = on
				return on
			}
			this._eq_on = next
			this.account().save_eq_on(next)
			// Клик по тумблеру — юзер-жест, единственный момент, когда WebAudio
			// разрешено будить. Поднимаем цепочку прямо здесь: при выключенной
			// автогромкости её до сих пор могло не быть вовсе.
			if (next) this.gain_chain_unlock()
			return next
		}

		/**
		 * Полосы, пока ползунок в руке. В baza пишем один раз на перетаскивание,
		 * а не на каждый pointermove: иначе каждое движение пальца улетало бы в
		 * ленд отдельной правкой.
		 */
		@$mol_mem
		private eq_draft(next?: number[] | null) {
			return next ?? null
		}

		/** Черновик перетаскивания либо сохранённое в аккаунте. */
		eq_gains(): number[] {
			return this.eq_draft() ?? this.account().eq_gains()
		}

		/** Панель эквалайзера — только для своего <audio>; в offscreen её нет. */
		Eq() {
			if (this.is_extension()) return null as any
			return super.Eq()
		}

		eq_pop_toggle() {
			const pop = this.Eq()
			const showed = pop.showed()
			$bog_music_log.act(`эквалайзер: ${showed ? 'закрыт' : 'открыт'}`)
			pop.showed(!showed)
			if (!showed) this.setup_pop_dismiss(pop)
			return null
		}

		/** Выставить полосы: в аккаунт, черновик прочь. */
		@$mol_action
		private eq_apply( gains: number[] ) {
			this.account().save_eq_gains( gains )
			this.eq_draft( null )
			// Тронули кривую при выключенном эквалайзере — включаем: иначе точка
			// ездит, а звук не меняется, и это читается как поломка.
			if( !this.eq_on() && $bog_music_eq.preset_of( gains ) !== 'default' ) this.eq_on( true )
		}

		// ---------- пресеты ----------
		// Список как в Я.Музыке: «Своя настройка» сверху, дальше пресеты по
		// порядку. «Своя настройка» висит всегда и лишь показывает, что кривая
		// ничьей заготовке не соответствует; нажатие на неё ничего не даёт —
		// сделать из неё кривую неоткуда.

		eq_preset_rows() {
			return [ '', ... $bog_music_eq.presets.map( preset => preset.id ) ]
				.map( id => this.Eq_preset_row( id ) )
		}

		eq_preset_title( id: string ) {
			if( !id ) return $bog_music_eq.custom_title
			return $bog_music_eq.presets.find( preset => preset.id === id )?.title ?? id
		}

		eq_preset_checked( id: string, next?: boolean ): boolean {
			if( next === undefined ) return $bog_music_eq.preset_of( this.eq_gains() ) === id
			const gains = $bog_music_eq.preset( id )
			if( !gains ) return this.eq_preset_checked( id )
			this.eq_apply( gains )
			return true
		}

		// ---------- перетаскивание точек ----------

		/** Полоса — по колонке графика, в которую попал палец. */
		private eq_band_at( event: PointerEvent ) {
			const rect = ( event.currentTarget as HTMLElement ).getBoundingClientRect()
			const part = rect.width ? ( event.clientX - rect.left ) / rect.width : 0
			return $bog_music_eq_curve.band_at( part * $bog_music_eq_curve.width )
		}

		private eq_db_at( event: PointerEvent ) {
			const rect = ( event.currentTarget as HTMLElement ).getBoundingClientRect()
			const part = rect.height ? ( event.clientY - rect.top ) / rect.height : 0.5
			return $bog_music_eq_curve.db_at( part )
		}

		private _eq_dragging = -1

		private eq_drag_to( event: PointerEvent ) {
			if( this._eq_dragging < 0 ) return
			const gains = this.eq_gains().slice()
			gains[ this._eq_dragging ] = this.eq_db_at( event )
			this.eq_draft( gains )
		}

		eq_pointer_down( event?: Event ) {
			if( !event ) return null
			const e = event as PointerEvent
			try { ( e.currentTarget as HTMLElement ).setPointerCapture( e.pointerId ) } catch {}
			// Полосу выбираем один раз, на нажатии: иначе палец, уехавший вверх по
			// диагонали, посреди жеста перескакивал бы на соседнюю точку.
			this._eq_dragging = this.eq_band_at( e )
			this.eq_drag_to( e )
			e.preventDefault()
			return null
		}

		eq_pointer_move( event?: Event ) {
			if( !event || this._eq_dragging < 0 ) return null
			this.eq_drag_to( event as PointerEvent )
			return null
		}

		eq_pointer_up( event?: Event ) {
			if( !event ) return null
			const e = event as PointerEvent
			try { ( e.currentTarget as HTMLElement ).releasePointerCapture( e.pointerId ) } catch {}
			if( this._eq_dragging < 0 ) return null
			this._eq_dragging = -1
			const gains = this.eq_draft()
			if( gains ) this.eq_apply( gains )
			// Панель не закрываем, в отличие от громкости: точек шесть, их
			// таскают подряд.
			return null
		}

		/** Разложить полосы по узлам. Реактивно: сработает и на синк с другого устройства. */
		@$mol_mem
		private apply_eq() {
			// Заодно обновляет _eq_on — снимок для gain_chain_unlock.
			this._eq_last = this.eq_on() ? $bog_music_eq.clamp(this.eq_gains()) : $bog_music_eq.flat()
			this.eq_push()
			return this._eq_last
		}

		private eq_push() {
			const ctx = this._gain_ctx
			if (!ctx || !this._eq_nodes.length) return
			this._eq_last.forEach((db, index) => {
				const node = this._eq_nodes[index]
				if (!node) return
				// Плавно: мгновенный скачок фильтра щёлкает так же, как скачок гейна.
				try {
					node.gain.setTargetAtTime(db, ctx.currentTime, 0.02)
				} catch {
					node.gain.value = db
				}
			})
		}

		// ---------- режим повтора ----------

		@$mol_mem
		repeat_mode(next?: 'all' | 'one' | 'shuffle') {
			const v = $mol_state_local.value('bog_music_repeat_mode', next) as string | null
			if (v === 'one' || v === 'shuffle') return v
			return 'all' as const
		}

		repeat_cycle() {
			const order: ('all' | 'one' | 'shuffle')[] = ['all', 'one', 'shuffle']
			const idx = order.indexOf(this.repeat_mode() as any)
			const mode = order[(idx + 1) % order.length]
			$bog_music_log.act(`режим повтора: ${mode}`)
			this.repeat_mode(mode)
		}

		repeat_hint() {
			const m = this.repeat_mode()
			if (m === 'one') return 'Повтор одного трека'
			if (m === 'shuffle') return 'Случайный порядок'
			return 'Повтор плейлиста'
		}

		Repeat_all_icon() {
			if (this.repeat_mode() !== 'all') return null as any
			return super.Repeat_all_icon()
		}

		Repeat_one_icon() {
			if (this.repeat_mode() !== 'one') return null as any
			return super.Repeat_one_icon()
		}

		Shuffle_icon() {
			if (this.repeat_mode() !== 'shuffle') return null as any
			return super.Shuffle_icon()
		}

		// ---------- позиция в очереди ----------

		/**
		 * Индекс текущего трека в очереди. Обычное поле, а не @$mol_mem (как
		 * tube_current в app): индекс не участвует в рендере, подписчиков у
		 * ячейки нет — $mol её сметает, и записанное значение молча
		 * откатывается к дефолту. Именно так плеер залипал: индекс всё время
		 * был 0, и автопереход бесконечно играл queue[1].
		 */
		private _queue_at = 0

		/**
		 * Индекс назначен снаружи (demote_key целится в конкретного соседа, а
		 * не в позицию играющего). Действует до старта следующего трека.
		 */
		private _queue_at_forced = false

		/**
		 * Позиция текущего трека в очереди. Источник правды — сам трек:
		 * список переупорядочивают, фильтруют и дозагружают из базы, а после
		 * восстановления сессии индекс вообще никто не ставит. Сохранённое
		 * число берём, только когда играет что-то не из этого списка.
		 */
		queue_index(next?: number): number {
			if (next !== undefined) {
				this._queue_at_forced = true
				return this._queue_at = next
			}
			if (this._queue_at_forced) return this._queue_at
			const at = this.queue_keys().indexOf(this.current_key())
			return at >= 0 ? at : this._queue_at
		}

		// ---------- shuffle-bag ----------
		// Одна перетасовка всего плейлиста, играем без повторов до конца, затем
		// тасуем заново. Состояние обхода — не reactive: его никто не рендерит.

		private _shuffle_bag: string[] = []
		private _shuffle_bag_idx = 0
		private _shuffle_bag_sig = ''
		private _shuffle_last_key = ''

		private ensure_shuffle_bag(queue: readonly string[]) {
			const sig = queue.join(',')
			if (sig === this._shuffle_bag_sig && this._shuffle_bag_idx < this._shuffle_bag.length) return
			const keys = [...queue]
			for (let i = keys.length - 1; i > 0; i--) {
				const j = Math.floor(Math.random() * (i + 1))
				;[keys[i], keys[j]] = [keys[j], keys[i]]
			}
			if (keys.length > 1 && this._shuffle_last_key && keys[0] === this._shuffle_last_key) {
				;[keys[0], keys[1]] = [keys[1], keys[0]]
			}
			this._shuffle_bag = keys
			this._shuffle_bag_idx = 0
			this._shuffle_bag_sig = sig
		}

		// ---------- запуск трека ----------

		play_track(key?: string | null) {
			if (!key) return
			const audio = this.audio_of(key)
			if (!audio) {
				$bog_music_log.err(`трек не найден в фонотеке: ${key}`)
				return
			}
			$bog_music_log.act(`старт трека ${audio.artist} — ${audio.title} (${key})`)

			this._ext = null // возвращаемся к baza-треку, гасим tube-превью

			$bog_music_mem.play_started()
			// Предыдущий трек больше не нужен: отпускаем и его Blob, и object URL.
			// Держать их дальше нечем оправдать — назад мотают через play_track,
			// который соберёт Blob заново из чанков.
			this.blob_cache_keep(key)

			// Сброс времени ДО смены трека: иначе apply_trim в auto() прочитает
			// stale-значения предыдущего трека и может мгновенно дёрнуть next().
			this.current_time(0)
			this.duration(0)
			this._await_seek = 0 // новый трек — не ждём resume-seek
			this.current_key(key)
			this._queue_at_forced = false // дальше позиция считается по треку
			this._trim_end_skip = ''
			// Обрез начала может быть ещё не прогрет: play_track зовётся из
			// 'ended'/микротаска — ВНЕ фибры, а холодный baza-атом там суспендится.
			// Раньше Promise улетал наружу и рвал play_track уже после смены
			// current_key: трек выбран, src не выставлен, звука нет — «стоп» при
			// автопереходе на обрезанную песню. Теперь стартуем с нуля, а seek
			// догоняет реактивно в apply_trim_start (там фибра auto() ретраит).
			const trim = this.trim_start_of(key)
			const start_at = trim ?? 0
			this._trim_start_done = trim === null ? '' : key
			// Если фоновый переход всё же сорвётся в keep-alive-тишину, resume
			// должен вернуться к НАЧАЛУ нового трека (с учётом обреза), а не к
			// позиции предыдущего: в ios_pause el.currentTime тут ещё 0.
			this._paused_pos = start_at
			try { this.account().save_last_session(key, start_at) } catch {}

			this.apply_media_metadata(audio)

			// Фоновое одноразовое измерение громкости для выравнивания.
			this.analyze_gain(key)

			if (this.is_extension()) {
				this.dispatch_play_offscreen(key, audio, start_at)
				return
			}

			// Клик — единственный шанс разлочить WebAudio-цепочку для iOS.
			this.gain_chain_unlock()

			// Предзагружаем blob следующего трека, чтобы к его 'ended'-переходу
			// он был готов и play прошёл СИНХРОННО в continuation — иначе в фоне
			// на iOS автопереход играет без звука (async-путь глушится).
			this.prefetch_next(key)

			const el = this.audio_el()
			// iOS PWA: при заблокированном экране любой await перед el.play()
			// рвёт audio-session continuation от ended-обработчика. Пробуем
			// СИНХРОННО взять blob и запустить в том же tick.
			if (this.try_play_local_sync(key, el, start_at)) return
			if (audio.url) {
				this.set_track_src(el, audio.url)
				this.attach_seek_listener(el, start_at)
				el.play().catch(() => {})
			}
			this.play_source_local(key, audio, el, start_at)
		}

		// Готовые Blob'ы в RAM. Критично для авто-next: на iOS звук в фоне даётся
		// только если el.play() вызван СИНХРОННО в обработчике 'ended'
		// (continuation). Для этого blob следующего трека должен быть доступен
		// без suspend — держим его здесь, прогретым заранее.
		private _blob_cache = new Map<string, Blob>()

		/**
		 * Потолок кеша: текущий трек и один прогретый следующий. Больше держать
		 * незачем, а меньше нельзя — на одном месте останется тот самый
		 * синхронный переход, ради которого кеш и заведён.
		 */
		private static BLOB_CACHE_MAX = 2

		/**
		 * Оставить в кеше только перечисленные ключи и подрезать остаток до
		 * потолка. Зовётся на каждой смене трека: без этого кеш рос ровно на
		 * длину прослушанного за сессию.
		 */
		private blob_cache_keep(...keep: (string | null | undefined)[]) {
			const alive = new Set(keep.filter(Boolean) as string[])
			for (const key of [...this._blob_cache.keys()]) {
				if (!alive.has(key)) this._blob_cache.delete(key)
			}
			// Map сохраняет порядок вставки — лишним оказывается самый старый.
			while (this._blob_cache.size > $bog_music_player.BLOB_CACHE_MAX) {
				const oldest = this._blob_cache.keys().next().value
				if (oldest === undefined) break
				this._blob_cache.delete(oldest)
			}
		}

		/** Прогреть blob СЛЕДУЮЩЕГО трека в RAM-кеш (fire-and-forget). */
		private prefetch_next(key: string) {
			try { ($mol_wire_async(this) as any).cache_next(key) } catch {}
		}

		/**
		 * Sync-метод (через фибру): вычислить РЕАЛЬНЫЙ следующий трек с учётом
		 * режима (repeat/shuffle/«Моя волна») и прогреть его blob. Раньше грелся
		 * queue[idx+1], а next() при волне/shuffle выбирал другой трек → на
		 * 'ended' cache miss → async-путь → в фоне на iOS тишина.
		 */
		cache_next(key: string): boolean {
			const next_key = this.predict_next_key(key)
			if (!next_key) return false
			this.track_warm(next_key)
			const ready = this._blob_cache.has(next_key) || this.cache_blob(next_key)
			// Мерим громкость заранее: иначе первые секунды следующего трека
			// играют невыровненными.
			if (ready) this.analyze_gain(next_key)
			return ready
		}

		/**
		 * Прогрев холодных baza-атомов трека. Обрез и метаданные для НЕтекущего
		 * трека не читает никто, поэтому их первое чтение подвисает (land.sync →
		 * loading/крипта). play_track читает их вне фибры — прогреваем заранее,
		 * из фибры, чтобы автопереход не спотыкался.
		 */
		private track_warm(key: string) {
			const track = this.account().track(key)
			if (!track) return
			track.audio()
			track.trim_start()
			track.trim_end(0)
		}

		/**
		 * Метаданные трека без риска оборвать play_track: если атом ещё холодный
		 * (вне фибры = Promise наружу), догреваем в фибре и повторяем ЭТОТ же
		 * трек — иначе автопереход молча терял бы песню.
		 */
		private audio_of(key: string): $bog_music_api_audio | null {
			try {
				return this.account().track(key)?.audio() ?? null
			} catch (e: any) {
				if (!(e instanceof Promise)) throw e
				;($mol_wire_async(this) as any).play_track_warm(key)
				return null
			}
		}

		/** Прогреть трек в фибре (ретраит подвисания) и запустить его же. */
		play_track_warm(key: string) {
			this.track_warm(key)
			this.play_track(key)
		}

		/** Обрез начала трека. null — атом ещё холодный (подвис вне фибры). */
		private trim_start_of(key: string): number | null {
			try {
				return this.account().track(key)?.trim_start() ?? 0
			} catch (e: any) {
				if (!(e instanceof Promise)) console.warn('[player] trim_start read failed:', e?.message ?? e)
				return null
			}
		}

		/**
		 * Автопереход (ended / trim_end) в фибре — фолбэк, когда синхронный путь
		 * подвис. Подвисающие чтения ПЕРВЫМИ: ретрай фибры не должен повторно
		 * прокручивать shuffle-мешок. predict_next_key только подглядывает.
		 */
		next_auto() {
			const key = this.predict_next_key(this.current_key())
			if (key) this.track_warm(key)
			this.next(false)
		}

		/**
		 * Выбор «Моей волны», сделанный ЗАРАНЕЕ (при старте текущего трека).
		 * Волна рандомная, поэтому предсказать её на 'ended' нельзя — вместо
		 * этого выбираем следующий трек сразу, греем его blob, а next() потом
		 * использует именно этот выбор.
		 */
		private _planned_wave: { from: string, key: string } | null = null

		/** Зеркало логики next() без побочных эффектов (кроме плана волны). */
		private predict_next_key(key: string): string | null {
			if (this.repeat_mode() === 'one') return key
			const queue = this.queue_keys()
			if (this.repeat_mode() === 'shuffle' && queue.length) {
				// Peek следующего из shuffle-bag: детерминирован, next() возьмёт его же.
				this.ensure_shuffle_bag(queue)
				return this._shuffle_bag[this._shuffle_bag_idx] ?? null
			}
			// Фибра ретраится при suspend — рандомный выбор волны делаем один раз
			// и переиспользуем на ретраях, иначе план скакал бы на каждом заходе.
			if (this._planned_wave?.from === key) return this._planned_wave.key
			const picked = this.wave_pick(key)
			if (picked && picked !== key) {
				this._planned_wave = { from: key, key: picked }
				return picked
			}
			if (!queue.length) return null
			const idx = queue.indexOf(key)
			return queue[idx >= 0 && idx + 1 < queue.length ? idx + 1 : 0] ?? null
		}

		/** Sync-метод (через фибру): дождаться blob и положить в RAM-кеш. */
		cache_blob(key: string): boolean {
			const blob = this.account().track(key)?.blob_wait()
			if (!blob) return false
			this._blob_cache.set(key, blob)
			// Держим компактно: только текущий + этот (следующий).
			this.blob_cache_keep(this.current_key(), key)
			return true
		}

		/** Sync-чтение блоба: сперва RAM-кеш (без suspend), потом baza. */
		blob_of(key: string): Blob | null {
			const cached = this._blob_cache.get(key)
			if (cached) return cached
			return this.account().track(key)?.blob() ?? null
		}

		/** Блоб, ДОЖИДАЯСЬ докачки land (suspend). Для проигрывания через фибру. */
		blob_of_wait(key: string): Blob | null {
			return this.account().track(key)?.blob_wait() ?? null
		}

		private try_play_local_sync(key: string, el: HTMLAudioElement, start_at: number): boolean {
			let blob: Blob | null = null
			try {
				blob = this.blob_of(key)
			} catch {
				return false // Promise = blob ещё грузится, пойдём async-путём
			}
			if (!blob) return false
			if (this._last_blob_url) URL.revokeObjectURL(this._last_blob_url)
			const url = URL.createObjectURL(blob)
			this._last_blob_url = url
			this._dispatch_token++
			this.set_track_src(el, url)
			this.attach_seek_listener(el, start_at)
			el.play().catch(() => {})
			return true
		}

		private attach_seek_listener(el: HTMLAudioElement, start_at: number) {
			if (start_at <= 0) return
			const seek = () => {
				try { el.currentTime = start_at } catch {}
				el.removeEventListener('loadedmetadata', seek)
			}
			el.addEventListener('loadedmetadata', seek)
		}

		private seek_to(time: number) {
			if (this.is_extension()) {
				this.send('seek', { time })
			} else if (this._audio_el) {
				try { this._audio_el.currentTime = time } catch {}
			}
		}

		// Гонки fast-click'ов: пока blob трека A грузится, пользователь кликает B.
		// Токен инвалидирует устаревшие dispatch'и.
		private _dispatch_token = 0

		private is_current(key: string): boolean {
			return this.current_key() === key
		}

		/**
		 * Дожидается блоба: сначала ждём докачку blob-land с мастера
		 * (blob_of_wait suspend'ится, фибра ретраит пока не досинкается),
		 * при неудаче докачиваем с VK.
		 */
		private async blob_ready(key: string, audio: $bog_music_api_audio): Promise<Blob | null> {
			let blob = await ($mol_wire_async(this) as any).blob_of_wait(key).catch(() => null) as Blob | null
			if (!blob && audio.url) {
				await this.account().save_hls(audio).catch(() => {})
				blob = await ($mol_wire_async(this) as any).blob_of_wait(key).catch(() => null) as Blob | null
			}
			return blob
		}

		private async dispatch_play_offscreen(key: string, audio: $bog_music_api_audio, start_at: number) {
			const token = ++this._dispatch_token
			try {
				await chrome.runtime.sendMessage({ target: 'background', type: 'ensure_offscreen' })
				if (token !== this._dispatch_token || !this.is_current(key)) return

				const blob = await this.blob_ready(key, audio)
				if (token !== this._dispatch_token || !this.is_current(key)) return

				if (!blob) {
					console.warn('[player] no source:', audio.artist, '—', audio.title)
					return
				}
				this.channel().postMessage({
					target: 'offscreen',
					type: 'play_track',
					audio,
					blob,
					start_at,
				})
			} catch (e: any) {
				console.error('[player] play failed:', e)
				this.playing(false)
			}
		}

		private async play_source_local(key: string, audio: $bog_music_api_audio, el: HTMLAudioElement, start_at: number) {
			const token = ++this._dispatch_token
			try {
				if (this._last_blob_url) {
					URL.revokeObjectURL(this._last_blob_url)
					this._last_blob_url = ''
				}

				const blob = await this.blob_ready(key, audio)
				if (token !== this._dispatch_token || !this.is_current(key)) return

				if (blob) {
					const url = URL.createObjectURL(blob)
					this._last_blob_url = url
					this.set_track_src(el, url)
					this.attach_seek_listener(el, start_at)
					await this.safe_play(el)
					return
				}

				if (audio.url) {
					this.set_track_src(el, audio.url)
					this.attach_seek_listener(el, start_at)
					await this.safe_play(el)
					return
				}

				console.warn('[player] no source:', audio.artist, '—', audio.title)
			} catch (e: any) {
				console.error('[player] play failed:', e)
			}
			this.playing(false)
		}

		private async safe_play(el: HTMLAudioElement) {
			try {
				await el.play()
			} catch (e: any) {
				if (e?.name === 'NotAllowedError') {
					el.muted = true
					try { await el.play() } catch {}
					el.muted = false
				} else {
					throw e
				}
			}
		}

		// ---------- управление ----------

		toggle() {
			// Крутится keep-alive-тишина = звука нет, чем бы ни было playing():
			// жмём resume, иначе ios_pause молча выйдет по _silent и кнопка
			// перестанет что-либо делать.
			const was_playing = this.playing() && !this._silent
			$bog_music_log.act(`${was_playing ? 'пауза' : 'продолжить'}: ${this.current_key() || 'без трека'}`)
			if (this.is_extension()) {
				if (was_playing) this.send('pause')
				else this.send('resume')
			} else {
				this.gain_chain_unlock()
				const el = this.audio_el()
				if (this.is_ios()) {
					if (was_playing) this.ios_pause(el)
					else this.ios_resume(el)
				} else {
					if (was_playing) el.pause()
					else el.play()
				}
			}
			if (was_playing) {
				const key = this.current_key()
				if (key) {
					try { this.account().save_last_session(key, this.current_time()) } catch {}
				}
			}
		}

		/**
		 * Полный сброс плеера (крестик): стоп звука, очистка всего внутреннего
		 * состояния (swap-паузы, RAM-кеша, плана волны) и сохранённой сессии —
		 * чтобы после перезагрузки плеер не воскрес сам.
		 */
		close() {
			$bog_music_log.act('закрытие плеера')
			this._dispatch_token++ // инвалидировать pending dispatch'и
			this._ext = null
			this._planned_wave = null
			this._blob_cache.clear()
			this._silent = false
			this._track_src = ''
			this._paused_pos = 0
			this._await_seek = 0
			this._switching = false
			this._switch_gen++
			this._trim_end_skip = ''
			this._trim_start_done = ''
			// ДО el.pause(): его синхронный 'pause'-event при playing()=true был бы
			// принят за системную паузу и воскресил бы keep-alive-тишину.
			this.playing(false)
			if (this.is_extension()) {
				this.send('pause')
			} else if (this._audio_el) {
				const el = this._audio_el
				el.pause()
				el.removeAttribute('src')
				try { el.load() } catch {}
			}
			if (this._last_blob_url) {
				URL.revokeObjectURL(this._last_blob_url)
				this._last_blob_url = ''
			}
			if ('mediaSession' in navigator) {
				navigator.mediaSession.metadata = null
				navigator.mediaSession.playbackState = 'none'
			}
			this.current_time(0)
			this.duration(0)
			this.queue_index(0)
			this._session_restored = true // не воскрешать сессию в этой вкладке
			try { this.account().save_last_session('', 0) } catch {}
			this.current_key('')
		}

		prev() {
			// Тот же случай, что и в next(): играет выдача — шагаем по ней.
			if (this._ext) {
				$bog_music_log.act('предыдущий результат выдачи')
				this.ext_step(-1)
				return
			}
			const queue = this.queue_keys()
			const idx = this.queue_index()
			if (idx > 0) {
				$bog_music_log.act(`предыдущий трек: ${queue[idx - 1]}`)
				this.queue_index(idx - 1)
				this.play_track(queue[idx - 1])
			} else {
				$bog_music_log.act('предыдущий трек: уже первый, шага нет')
			}
		}

		/**
		 * Сосед по выдаче YouTube. Плеер про tube ничего не знает — он лишь
		 * сообщает app, что играет внешний стрим, и просит шагнуть.
		 * false — выдача кончилась.
		 */
		private ext_step(step: number): boolean {
			try {
				return !!($bog_music_app.Root(0) as any).tube_step(step)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[player] ext_step failed:', e?.message)
				return false
			}
		}

		/** Рекомендация «Моей волны» из app (null если режим выключен). */
		private wave_pick(key: string): string | null {
			try {
				return ($bog_music_app.Root(0) as any).player_pick_next(key) ?? null
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return null
			}
		}

		next(manual: boolean = true) {
			const mode = this.repeat_mode()
			const queue = this.queue_keys()
			$bog_music_log.act(`следующий трек (${manual ? 'кнопка' : 'авто'}, режим ${mode})`)

			// Играет стрим из выдачи YouTube. Шагаем по выдаче, а не по фонотеке:
			// у внешнего трека current_key пустой, и общий путь ниже взял бы
			// queue[0] — по концу трека молча стартовал личный плейлист с начала.
			if (this._ext) {
				if (!manual && mode === 'one') {
					const ext = this._ext
					this.play_external(ext.url, ext.title, ext.artist)
					return
				}
				this.ext_step(1) // выдача кончилась — просто встаём, трек уже доиграл
				return
			}

			// Авто-advance при mode='one': перезапуск того же трека через
			// play_track — он подхватит trim_start (native loop крутит от 0).
			// Ручной клик по Next всё равно ведёт к следующему.
			if (!manual && mode === 'one') {
				const cur = this.current_key()
				if (cur) {
					this.play_track(cur)
					return
				}
			}

			if (mode === 'shuffle' && queue.length) {
				this.ensure_shuffle_bag(queue)
				const key = this._shuffle_bag[this._shuffle_bag_idx++]
				if (this._shuffle_bag_idx >= this._shuffle_bag.length) {
					this._shuffle_last_key = key
					this._shuffle_bag_sig = '' // следующий next() перетасует
				}
				const idx = queue.indexOf(key)
				if (idx >= 0) {
					this.queue_index(idx)
					this.play_track(key)
					return
				}
			}

			// «Моя волна» — рекомендалка. Зовём app напрямую: event-binding
			// `pick_next?` возвращал бы свой аргумент (echo), а не рекомендацию,
			// из-за чего next() играл текущий трек заново вместо следующего.
			// Сперва — выбор, сделанный заранее в cache_next: его blob уже прогрет
			// в RAM → play пройдёт синхронно в ended-continuation (звук в фоне).
			try {
				const cur = this.current_key()
				let picked: string | null = null
				if (this._planned_wave?.from === cur) {
					picked = this._planned_wave.key
					this._planned_wave = null
				} else {
					picked = this.wave_pick(cur)
				}
				if (picked && picked !== this.current_key()) {
					const idx = queue.indexOf(picked)
					if (idx >= 0) this.queue_index(idx)
					this.play_track(picked)
					return
				}
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[player] wave_pick failed:', e?.message)
			}

			if (!queue.length) return
			let next_idx = this.queue_index() + 1 < queue.length ? this.queue_index() + 1 : 0
			// Страховка от залипания: в списке есть куда шагнуть, а шагаем на
			// себя же (дубль в очереди, протухший индекс) — берём следующего.
			if (queue.length > 1 && queue[next_idx] === this.current_key()) {
				next_idx = next_idx + 1 < queue.length ? next_idx + 1 : 0
			}
			this.queue_index(next_idx)
			this.play_track(queue[next_idx])
		}

		sub() {
			if (!this.current_key() && !this._ext) return []
			return super.sub()
		}

		Play() {
			if (this.playing()) return null as any
			return super.Play()
		}

		Pause() {
			if (!this.playing()) return null as any
			return super.Pause()
		}

		// ---------- обрез трека (trim handles на прогресс-баре) ----------

		private _trim_end_skip = ''
		private _trim_start_done = ''
		private _trim_drag: 'start' | 'end' | null = null

		/**
		 * Догоняющий seek на trim_start: применяется, только если play_track не
		 * смог прочитать обрез (холодный атом). Здесь мы уже в фибре auto(), она
		 * ретраится — значение доедет. Один раз на трек и не во время драга,
		 * иначе спам инвалидаций рождает гонку seek'ов с pending play_track.
		 */
		private apply_trim_start() {
			const key = this.current_key()
			if (!key) return
			if (this._trim_start_done === key) return
			if (this._trim_drag) return
			const track = this.current_track()
			if (!track) return
			const dur = this.duration()
			if (!dur) return
			const ts = track.trim_start()
			this._trim_start_done = key
			if (ts <= 0 || ts >= dur) return
			if (this.current_time() >= ts - 0.5) return
			queueMicrotask(() => {
				try { this.seek_to(ts) } catch (e: any) {
					if (e instanceof Promise) return
					console.warn('[player] trim_start seek failed:', e?.message)
				}
			})
		}

		/**
		 * Реактивный apply ТОЛЬКО end-trim'а: current_time >= trim_end → next().
		 * Через microtask, чтобы не писать в cell внутри auto-фибры.
		 * Seek на trim_start делается один раз в trim_pointer_up: если делать
		 * реактивно, drag-спам инвалидаций рождает гонку seek-сообщений с
		 * pending play_track → DEMUXER_ERROR в offscreen.
		 */
		private apply_trim() {
			const track = this.current_track()
			if (!track) return
			const dur = this.duration()
			if (!dur) return
			const te = track.trim_end(dur)
			if (te >= dur) return
			if (this.current_time() < te) return

			const key = this.current_key()
			if (this._trim_end_skip === key) return
			this._trim_end_skip = key
			const audio = track.audio()
			queueMicrotask(() => {
				try {
					// В фибре: цепочка next() читает baza (очередь, обрез следующего)
					// и может подвиснуть — вне фибры это была бы тихая остановка.
					;($mol_wire_async(this) as any).next_auto()
					if (audio && navigator.onLine) this.account().save_hls(audio).catch(() => {})
				} catch (e: any) {
					if (e instanceof Promise) return
					console.warn('[player] trim_end next failed:', e?.message)
				}
			})
		}

		private trim_apply(event: PointerEvent) {
			const track = this.current_track()
			if (!track) return
			const dur = this.duration()
			if (!dur) return
			const progress = this.Progress().dom_node() as HTMLElement
			const rect = progress.getBoundingClientRect()
			const x = event.clientX - rect.left
			const pct = Math.max(0, Math.min(1, x / rect.width))
			let seconds = pct * dur
			if (this._trim_drag === 'start') {
				const end = track.trim_end(dur)
				seconds = Math.min(seconds, Math.max(0, end - 1))
				track.trim_start(seconds)
			} else if (this._trim_drag === 'end') {
				const start = track.trim_start()
				seconds = Math.max(seconds, Math.min(dur, start + 1))
				track.trim_end(dur, seconds)
			}
		}

		trim_start_pointer_down(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			e.stopPropagation()
			e.preventDefault()
			try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
			this._trim_drag = 'start'
			this.trim_apply(e)
			return null
		}

		trim_start_pointer_move(event?: Event) {
			if (!event || this._trim_drag !== 'start') return null
			this.trim_apply(event as PointerEvent)
			return null
		}

		trim_end_pointer_down(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			e.stopPropagation()
			e.preventDefault()
			try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
			this._trim_drag = 'end'
			this.trim_apply(e)
			return null
		}

		trim_end_pointer_move(event?: Event) {
			if (!event || this._trim_drag !== 'end') return null
			this.trim_apply(event as PointerEvent)
			return null
		}

		trim_pointer_up(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
			const drag = this._trim_drag
			this._trim_drag = null
			if (drag === 'start') {
				const ts = this.current_track()?.trim_start() ?? 0
				if (ts > 0 && this.current_time() < ts - 0.5) this.seek_to(ts)
			}
			return null
		}

		trim_start_left() {
			const track = this.current_track()
			const dur = this.duration()
			if (!track || !dur) return '0%'
			return `${(track.trim_start() / dur) * 100}%`
		}

		trim_end_left() {
			const track = this.current_track()
			const dur = this.duration()
			if (!track || !dur) return '100%'
			return `${(track.trim_end(dur) / dur) * 100}%`
		}

		// ---------- lifecycle ----------

		private _pagehide_listener_set = false

		private setup_pagehide_save() {
			if (this._pagehide_listener_set) return
			this._pagehide_listener_set = true
			window.addEventListener('pagehide', () => {
				const key = this.current_key()
				if (!key) return
				try { this.account().save_last_session(key, this.current_time()) } catch {}
			})
		}

		auto() {
			this.offscreen_link()
			this.setup_pagehide_save()
			if (!this.is_extension() && !this.current_key()) {
				this.try_restore_session()
			}
			this.apply_volume()
			this.apply_eq()
			this.apply_position_state()
			try { this.apply_trim_start() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
			try { this.apply_trim() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
		}

	}
}
