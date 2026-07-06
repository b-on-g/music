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
			this._ext = { url, title, artist }
			this.current_key('')
			this.current_time(0)
			this.duration(0)
			this._trim_end_skip = ''
			this.apply_media_metadata(this.current_audio()!)
			this.keepalive_unlock()
			this.gain_chain_unlock()
			const el = this.audio_el()
			if (this._last_blob_url) {
				URL.revokeObjectURL(this._last_blob_url)
				this._last_blob_url = ''
			}
			this._dispatch_token++
			el.src = url
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

		// ---------- iOS keep-alive ----------
		// iOS замораживает PWA через ~30-60с после паузы в фоне: JS мёртв,
		// кнопки локскрина двигают Now Playing, но звука нет. Пока крутится
		// беззвучный loop, WebKit держит audio session и страницу живыми,
		// и play с локскрина реально отрабатывает.

		private _keepalive?: HTMLAudioElement
		private _keepalive_stop_timer: any

		// 4 сэмпла тишины 8kHz — минимальный валидный wav.
		private static SILENCE = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQQAAACAgICA'
		private static KEEPALIVE_MAX_MS = 3 * 24 * 60 * 60 * 1000 // 3 дня

		private is_ios() {
			return /iPad|iPhone|iPod/.test(navigator.userAgent)
				|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		}

		/** Создать и «разлочить» тихий элемент — только в контексте юзер-жеста. */
		private keepalive_unlock() {
			if (!this.is_ios() || this._keepalive) return
			const el = new Audio($bog_music_player.SILENCE)
			el.loop = true
			el.play().then(() => el.pause()).catch(() => { this._keepalive = undefined })
			this._keepalive = el
		}

		private keepalive_start() {
			const el = this._keepalive
			if (!el) return
			el.play().catch(() => {})
			clearTimeout(this._keepalive_stop_timer)
			this._keepalive_stop_timer = setTimeout(
				() => this.keepalive_pause(),
				$bog_music_player.KEEPALIVE_MAX_MS,
			)
		}

		private keepalive_pause() {
			clearTimeout(this._keepalive_stop_timer)
			this._keepalive?.pause()
		}

		// ---------- выравнивание громкости ----------
		// На iOS volume у <audio> игнорируется — гейним через WebAudio.
		// На остальных платформах гейн умножается на volume напрямую.

		private _gain_ctx?: AudioContext
		private _gain_node?: GainNode

		/** Собрать цепочку el → gain → limiter. Только iOS и только в жесте. */
		private gain_chain_unlock() {
			if (!this.is_ios()) return
			if (this._gain_ctx) {
				this.gain_resume()
				return
			}
			try {
				const AC = (window as any).AudioContext || (window as any).webkitAudioContext
				const ctx: AudioContext = new AC()
				const src = ctx.createMediaElementSource(this.audio_el())
				const gain = ctx.createGain()
				const limiter = ctx.createDynamicsCompressor() // страховка от клиппинга при усилении
				src.connect(gain)
				gain.connect(limiter)
				limiter.connect(ctx.destination)
				this._gain_ctx = ctx
				this._gain_node = gain
			} catch (e: any) {
				console.warn('[player] gain chain failed:', e?.message)
			}
		}

		/** После разморозки/interruption iOS контекст надо будить, иначе тишина. */
		private gain_resume() {
			const ctx = this._gain_ctx
			if (ctx && ctx.state !== 'running') ctx.resume().catch(() => {})
		}

		/** Множитель выравнивания текущего трека. 1 пока громкость не измерена. */
		track_gain(): number {
			return $bog_music_gain.factor(this.current_track()?.loudness() ?? null)
		}

		loudness_known(key: string): boolean {
			return this.account().track(key)?.loudness() != null
		}

		/** Ленивое измерение громкости трека — один раз, фоном. */
		private async analyze_loudness(key: string) {
			try {
				if (await ($mol_wire_async(this) as any).loudness_known(key)) return
				const blob = await ($mol_wire_async(this) as any).blob_of(key) as Blob | null
				if (!blob) return
				const db = await $bog_music_gain.measure_db(await blob.arrayBuffer())
				await ($mol_wire_async(this.account()) as any).save_loudness(key, db)
			} catch (e: any) {
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
			el.addEventListener('ended', () => this.on_ended())
			el.addEventListener('play', () => {
				try { this.playing(true) } catch {}
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
				this.keepalive_pause()
				this.gain_resume()
			})
			el.addEventListener('pause', () => {
				try { this.playing(false) } catch {}
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
				if (this.is_ios()) this.keepalive_start()
			})
			el.addEventListener('timeupdate', () => {
				this.current_time(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				this.duration(el.duration)
			})
			el.addEventListener('error', () => {
				console.error('[player] audio error:', el.error?.code, el.error?.message)
			})
			this._audio_el = el
			return el
		}

		private on_ended() {
			try {
				const finished = this.current_audio()
				this.next(false)
				// Дослушанный трек докачиваем в кеш, если ещё не там.
				if (finished && navigator.onLine) {
					this.account().save_hls(finished).catch(() => {})
				}
			} catch (e) {
				console.warn('[player] ended handler error:', e)
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
				el.src = url
			} else if (session.audio.url) {
				el.src = session.audio.url
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
				ms.setActionHandler('pause', () => { el.pause() })
			}
		}

		/**
		 * Возобновление с локскрина/Control Center. Если страница успела
		 * замёрзнуть и source умер (играет «молча»), пересобираем src из blob
		 * и продолжаем с той же позиции.
		 */
		private resume_robust() {
			const el = this.audio_el()
			this.keepalive_pause()
			this.gain_resume()
			el.play().catch(() => {})
			setTimeout(() => {
				if (!el.error && el.readyState >= 2 && !el.paused) return
				const key = this.current_key()
				if (!key) return
				const pos = this.current_time()
				;($mol_wire_async(this) as any).blob_of(key).then((blob: Blob | null) => {
					if (!blob) return
					if (this._last_blob_url) URL.revokeObjectURL(this._last_blob_url)
					const url = URL.createObjectURL(blob)
					this._last_blob_url = url
					el.src = url
					this.attach_seek_listener(el, pos)
					el.play().catch(() => {})
				}).catch(() => {})
			}, 500)
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

		@$mol_mem
		private apply_volume() {
			const v = this.volume()
			// Реактивно: когда фоновый анализ допишет Loudness, гейн подтянется.
			const gain = this.track_gain()
			if (this.is_extension()) {
				this.send('volume', { value: Math.max(0, Math.min(1, v * gain)) })
			} else if (this._gain_node) {
				if (this._audio_el) this._audio_el.volume = v
				this._gain_node.gain.value = gain
			} else if (this._audio_el) {
				this._audio_el.volume = Math.max(0, Math.min(1, v * gain))
			}
			return v * gain
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
			try { this.Volume().hovered(false) } catch {}
			return null
		}

		volume_fill_height() {
			return `${Math.round(this.volume() * 100)}%`
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
			this.repeat_mode(order[(idx + 1) % order.length])
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
			const audio = this.account().track(key)?.audio()
			if (!audio) return

			this._ext = null // возвращаемся к baza-треку, гасим tube-превью

			// Сброс времени ДО смены трека: иначе apply_trim в auto() прочитает
			// stale-значения предыдущего трека и может мгновенно дёрнуть next().
			this.current_time(0)
			this.duration(0)
			this.current_key(key)
			this._trim_end_skip = ''
			const start_at = this.account().track(key)?.trim_start() ?? 0
			try { this.account().save_last_session(key, start_at) } catch {}

			this.apply_media_metadata(audio)

			// Фоновое одноразовое измерение громкости для выравнивания.
			;($mol_wire_async(this) as any).analyze_loudness(key)

			if (this.is_extension()) {
				this.dispatch_play_offscreen(key, audio, start_at)
				return
			}

			// Обычно play_track — следствие клика: единственный шанс разлочить
			// беззвучный keep-alive элемент и WebAudio-цепочку для iOS.
			this.keepalive_unlock()
			this.gain_chain_unlock()

			const el = this.audio_el()
			// iOS PWA: при заблокированном экране любой await перед el.play()
			// рвёт audio-session continuation от ended-обработчика. Пробуем
			// СИНХРОННО взять blob и запустить в том же tick.
			if (this.try_play_local_sync(key, el, start_at)) return
			if (audio.url) {
				this.attach_seek_listener(el, start_at)
				el.src = audio.url
				el.play().catch(() => {})
			}
			this.play_source_local(key, audio, el, start_at)
		}

		/** Sync-чтение блоба — зовётся и напрямую (best-effort), и через фибру. */
		blob_of(key: string): Blob | null {
			return this.account().track(key)?.blob() ?? null
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
			this.attach_seek_listener(el, start_at)
			el.src = url
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

		/** Дожидается блоба: из baza, при неудаче докачивает с VK. */
		private async blob_ready(key: string, audio: $bog_music_api_audio): Promise<Blob | null> {
			let blob = await ($mol_wire_async(this) as any).blob_of(key).catch(() => null) as Blob | null
			if (!blob && audio.url) {
				await this.account().save_hls(audio).catch(() => {})
				blob = await ($mol_wire_async(this) as any).blob_of(key).catch(() => null) as Blob | null
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
					this.attach_seek_listener(el, start_at)
					el.src = url
					await this.safe_play(el)
					return
				}

				if (audio.url) {
					this.attach_seek_listener(el, start_at)
					el.src = audio.url
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
			const was_playing = this.playing()
			if (this.is_extension()) {
				if (was_playing) this.send('pause')
				else this.send('resume')
			} else {
				this.keepalive_unlock()
				this.gain_chain_unlock()
				const el = this.audio_el()
				if (was_playing) el.pause()
				else el.play()
			}
			if (was_playing) {
				const key = this.current_key()
				if (key) {
					try { this.account().save_last_session(key, this.current_time()) } catch {}
				}
			}
		}

		prev() {
			const queue = this.queue_keys()
			const idx = this.queue_index()
			if (idx > 0) {
				this.queue_index(idx - 1)
				this.play_track(queue[idx - 1])
			}
		}

		next(manual: boolean = true) {
			const mode = this.repeat_mode()
			const queue = this.queue_keys()

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

			// «Моя волна» — рекомендалка (binding в app).
			try {
				const picked = this.pick_next(this.current_key()) as string | null
				if (picked) {
					const idx = queue.indexOf(picked)
					if (idx >= 0) this.queue_index(idx)
					this.play_track(picked)
					return
				}
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[player] pick_next failed:', e?.message)
			}

			if (!queue.length) return
			const next_idx = this.queue_index() + 1 < queue.length ? this.queue_index() + 1 : 0
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
		private _trim_drag: 'start' | 'end' | null = null

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
					this.next(false)
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
			try { this.apply_trim() } catch (e: any) {
				if (e instanceof Promise) throw e
			}
		}

	}
}
