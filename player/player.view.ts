namespace $.$$ {

	export class $bog_music_player extends $.$bog_music_player {

		account() {
			return $bog_music_account_baza.home()
		}

		current_track() {
			const key = this.current_key()
			return key ? this.account().track(key) : null
		}

		current_audio(): $bog_music_track_baza_info | null {
			const ext = this.ext()
			if (ext) return { artist: ext.artist, title: ext.title, duration: 0, cover: ext.cover }
			return this.current_track()?.info() ?? null
		}

		private _ext: { url: string, title: string, artist: string, cover: string } | null = null
		private _ext_seq = 0

		@$mol_mem
		ext_rev(next?: number) {
			return next ?? 0
		}

		ext(next?: { url: string, title: string, artist: string, cover: string } | null) {
			if (next !== undefined) {
				this._ext = next
				this.ext_rev(++this._ext_seq)
			}
			this.ext_rev()
			return this._ext
		}

		play_external(url: string, title: string, artist: string, cover = '') {
			$bog_music_log.act(`внешний стрим: ${artist} — ${title}`)
			this.ext({ url, title, artist, cover })
			this.current_key('')
			this.current_time(0)
			this.duration(0)
			this._trim_end_skip = ''
			this._trim_start_done = ''
			this.apply_media_metadata(this.current_audio()!)
			this.gain_chain_unlock()
			const el = this.audio_el()
			this.url_drop()
			this._dispatch_token++
			this.set_track_src(el, url)
			el.play().catch(() => {})
		}

		private url_drop() {
			if (!this._last_blob_url) return
			URL.revokeObjectURL(this._last_blob_url)
			this._last_blob_url = ''
		}

		private url_take(file: Blob) {
			this.url_drop()
			return this._last_blob_url = URL.createObjectURL(file)
		}

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
			buf.fill(128, 44)
			this._silence_url = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }))
			return this._silence_url
		}

		private _track_src = ''
		private _paused_pos = 0
		private _silent = false
		private _await_seek = 0
		private _switching = false
		private _switch_gen = 0

		private is_ios() {
			return /iPad|iPhone|iPod/.test(navigator.userAgent)
				|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
		}

		private set_track_src(el: HTMLAudioElement, url: string) {
			if (!this._silent && this._track_src === url) {
				try {
					if (el.src && new URL(el.src).href === new URL(url).href) return
				} catch {
					if (el.src === url) return
				}
			}

			this._silent = false
			this._track_src = url
			if (!this._gain_dead && this.normalize()) {
				const same = url.startsWith('blob:')
					|| (typeof location !== 'undefined' && url.startsWith(location.origin))
				const next = same ? null : 'anonymous'
				if (el.crossOrigin !== next) el.crossOrigin = next
			}
			el.loop = false
			el.src = url
			const gen = ++this._switch_gen
			this._switching = true
			setTimeout(() => { if (this._switch_gen === gen) this._switching = false }, 3000)
		}

		private ios_pause(el: HTMLAudioElement) {
			if (this._silent) return
			this._paused_pos = el.currentTime || this._paused_pos
			this._silent = true
			this.current_time(this._paused_pos)
			el.loop = true
			el.src = $bog_music_player.silence_url()
			el.play().catch(() => {})
			this.playing(false)
			if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
		}

		private ios_resume(el: HTMLAudioElement) {
			if (this._track_src) {
				this._await_seek = this._paused_pos
				this.current_time(this._paused_pos)
				this.set_track_src(el, this._track_src)
				this.attach_seek_listener(el, this._paused_pos)
				el.play().catch(() => {})
				this.playing(true)
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
				return
			}
			const key = this.current_key()
			if (!key) return
			const pos = this._paused_pos
			$bog_music_disk.file(key).then(file => {
				if (!file) return
				this.set_track_src(el, this.url_take(file))
				this.attach_seek_listener(el, pos)
				el.play().catch(() => {})
			}).catch(() => {})
		}

		private _gain_ctx?: AudioContext
		private _gain_node?: GainNode
		private _gain_ready = false
		private _gain_dead = false
		private _gain_wake_set = false

		private gain_chain_unlock() {
			if (this._gain_dead) return
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
				ctx.resume().then(() => this.gain_wire()).catch(() => {})
			} catch (e: any) {
				this._gain_dead = true
				console.warn('[player] gain chain failed:', e?.message ?? e)
			}
		}

		private gain_wire() {
			if (this._gain_ready || this._gain_dead) return
			const ctx = this._gain_ctx
			if (!ctx || ctx.state !== 'running') return
			try {
				const src = ctx.createMediaElementSource(this.audio_el())
				const gain = ctx.createGain()
				const limiter = ctx.createDynamicsCompressor()
				limiter.threshold.value = -1
				limiter.knee.value = 0
				limiter.ratio.value = 20
				limiter.attack.value = 0.003
				limiter.release.value = 0.25
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
				this.audio_el().volume = 1
				this.gain_push()
				this.eq_push()
				this.setup_gain_wake()
			} catch (e: any) {
				this._gain_dead = true
				console.warn('[player] gain wire failed:', e?.message ?? e)
			}
		}

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

		@$mol_mem
		normalize(next?: boolean) {
			if (next !== undefined) $bog_music_log.act(`выравнивание громкости: ${next ? 'включено' : 'выключено'}`)
			const v = $mol_state_local.value('bog_music_gain_norm', next) as boolean | null
			return v ?? true
		}

		track_gain(): number {
			if (!this.normalize()) return 1
			return $bog_music_gain.factor(this.current_track()?.lufs() ?? null)
		}

		private _audio_el?: HTMLAudioElement
		private _last_blob_url = ''

		audio_el() {
			if (this._audio_el) return this._audio_el
			const el = new Audio()
			el.volume = this.volume()
			el.addEventListener('ended', () => { if (!this._silent) this.on_ended() })
			el.addEventListener('play', () => {
				if (this._silent) return
				try { this.playing(true) } catch {}
				if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'playing'
				this.gain_resume()
			})
			el.addEventListener('pause', () => {
				if (this._silent) {
					el.play().catch(() => {})
					return
				}
				if (this._switching && !el.ended && el.readyState < el.HAVE_FUTURE_DATA) {
					el.play().catch(() => {})
					return
				}
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
			el.addEventListener('playing', () => { this._switching = false })
			el.addEventListener('timeupdate', () => {
				if (this._gain_ctx && this._gain_ctx.state !== 'running') this.gain_resume()
				if (this._silent) return
				this._switching = false
				if (this._await_seek > 0) {
					if (el.currentTime >= this._await_seek - 1.5) this._await_seek = 0
					else return
				}
				if (this._seek_drag) return
				this.current_time(el.currentTime)
				this.scrobble_watch(el.currentTime)
			})
			el.addEventListener('loadedmetadata', () => {
				if (this._silent) return
				if (el.duration > 0 && isFinite(el.duration)) this.duration(el.duration)
			})
			el.addEventListener('error', () => {
				console.error('[player] audio error:', el.error?.code, el.error?.message)
			})
			this._audio_el = el
			return el
		}

		private _fm: { artist: string, title: string, duration: number, started: number, done: boolean } | null = null

		private scrobble_watch(time: number) {
			if (!$bog_music_scrobble.enabled()) return
			let audio: $bog_music_track_baza_info | null = null
			try {
				audio = this.current_audio()
			} catch {
				return
			}
			const artist = audio?.artist ?? ''
			const title = audio?.title ?? ''
			if (!title) {
				this._fm = null
				return
			}
			const current = this._fm
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
			if (current.duration < 30) return
			if (time < Math.min(current.duration / 2, 240)) return
			current.done = true
			$bog_music_scrobble.scrobble(current.artist, current.title, current.duration, current.started)
		}

		private on_ended() {
			try {
				this.next(false)
			} catch (e: any) {
				if (e instanceof Promise) {
					;($mol_wire_async(this) as any).next_auto()
				} else {
					console.warn('[player] ended handler error:', e)
				}
			}
		}

		private _session_restored = false

		session_read() {
			const session = this.account().last_session()
			if (!session) return null
			const audio = this.account().info(session.key)
			if (!audio) return null
			return { ...session, audio }
		}

		private async try_restore_session() {
			if (this._session_restored) return
			this._session_restored = true
			const session = await $mol_wire_async(this).session_read().catch(() => null)
			if (!session) return
			this.current_key(session.key)
			this.current_time(session.position)
			if (session.audio.duration) this.duration(session.audio.duration)
			this.apply_media_metadata(session.audio)
			if ('mediaSession' in navigator) navigator.mediaSession.playbackState = 'paused'
			this.restore_local(session).catch(() => {})
		}

		private async restore_local(session: { key: string, position: number }) {
			const el = this.audio_el()
			if (!await $bog_music_disk.probe(session.key)) return
			if ($bog_music_stream.supported() && ( $bog_music_stream.active() || await $bog_music_stream.when_ready() )) {
				this.url_drop()
				this.set_track_src(el, $bog_music_stream.url(session.key))
			} else {
				const file = await $bog_music_disk.file(session.key)
				if (!file) return
				this.set_track_src(el, this.url_take(file))
			}
			this.attach_seek_listener(el, session.position)
		}

		private setup_media_session() {
			if (!('mediaSession' in navigator)) return
			const ms = navigator.mediaSession
			ms.setActionHandler('previoustrack', () => { try { this.prev() } catch {} })
			ms.setActionHandler('nexttrack', () => { try { this.next() } catch {} })
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

		private resume_robust() {
			const el = this.audio_el()
			this.gain_chain_unlock()
			if (this.is_ios()) {
				this.ios_resume(el)
				return
			}
			el.play().catch(() => {})
		}

		private apply_media_metadata(audio: $bog_music_track_baza_info) {
			if (!('mediaSession' in navigator)) return
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

		@$mol_mem
		private apply_position_state() {
			if (!('mediaSession' in navigator)) return 0
			const ms = navigator.mediaSession as any
			if (typeof ms.setPositionState !== 'function') return 0
			const duration = this.duration()
			const position = this.current_time()
			if (!(duration > 0) || !isFinite(duration)) {
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

		private _gain_last = { volume: 0.7, factor: 1 }

		@$mol_mem
		private apply_volume() {
			const volume = this.volume()
			const factor = this.track_gain()
			this._gain_last = { volume, factor }
			this.gain_push()
			return volume * factor
		}

		private gain_push() {
			const { volume, factor } = this._gain_last
			const node = this._gain_node
			const ctx = this._gain_ctx
			if (node && ctx) {
				try {
					node.gain.setTargetAtTime(volume * factor, ctx.currentTime, 0.02)
				} catch {
					node.gain.value = volume * factor
				}
				return
			}
			if (this._audio_el) this._audio_el.volume = Math.max(0, Math.min(1, volume * factor))
		}

		title() {
			return this.current_audio()?.title ?? ''
		}

		artist() {
			return this.current_audio()?.artist ?? ''
		}

		cover() {
			const ext = this.ext()
			if (ext) return ext.cover
			return this.current_track()?.cover() ?? ''
		}

		Cover() {
			return this.cover() ? super.Cover() : null as any
		}

		Cover_placeholder() {
			return this.cover() ? null as any : super.Cover_placeholder()
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

		volume_toggle() {
			const pop = this.Volume()
			const showed = pop.showed()
			$bog_music_log.act(`панель громкости: ${showed ? 'закрыта' : 'открыта'}`)
			pop.showed(!showed)
			if (!showed) this.setup_pop_dismiss(pop)
			return null
		}

		private setup_pop_dismiss(pop: $.$mol_pop) {
			$bog_music_pop_dismiss(pop)
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
			$bog_music_log.act(`громкость: ${Math.round(this.volume() * 100)}%`)
			try { this.Volume().showed(false) } catch {}
			return null
		}

		volume_fill_height() {
			return `${Math.round(this.volume() * 100)}%`
		}

		private _eq_nodes: BiquadFilterNode[] = []
		private _eq_last: number[] = $bog_music_eq.flat()
		private _eq_on = false

		eq_on(next?: boolean): boolean {
			if (next === undefined) {
				const on = this.account().eq_on()
				this._eq_on = on
				return on
			}
			this._eq_on = next
			this.account().save_eq_on(next)
			if (next) this.gain_chain_unlock()
			return next
		}

		@$mol_mem
		private eq_draft(next?: number[] | null) {
			return next ?? null
		}

		eq_gains(): number[] {
			return this.eq_draft() ?? this.account().eq_gains()
		}

		eq_pop_toggle() {
			const pop = this.Eq()
			const showed = pop.showed()
			$bog_music_log.act(`эквалайзер: ${showed ? 'закрыт' : 'открыт'}`)
			pop.showed(!showed)
			if (!showed) this.setup_pop_dismiss(pop)
			return null
		}

		@$mol_action
		private eq_apply( gains: number[] ) {
			this.account().save_eq_gains( gains )
			this.eq_draft( null )
			if( !this.eq_on() && $bog_music_eq.preset_of( gains ) !== 'default' ) this.eq_on( true )
		}

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
			return null
		}

		@$mol_mem
		private apply_eq() {
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
				try {
					node.gain.setTargetAtTime(db, ctx.currentTime, 0.02)
				} catch {
					node.gain.value = db
				}
			})
		}

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

		private _queue_at = 0

		private _queue_at_forced = false

		queue_index(next?: number): number {
			if (next !== undefined) {
				this._queue_at_forced = true
				return this._queue_at = next
			}
			if (this._queue_at_forced) return this._queue_at
			const at = this.queue_keys().indexOf(this.current_key())
			return at >= 0 ? at : this._queue_at
		}

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

		play_track(key?: string | null) {
			if (!key) return
			const audio = this.audio_of(key)
			if (!audio) {
				$bog_music_log.err(`трек не найден в фонотеке: ${key}`)
				return
			}
			$bog_music_log.act(`старт трека ${audio.artist} — ${audio.title} (${key})`)

			this.ext(null)
			this.file_cache_keep(key)

			this.current_time(0)
			this.duration(0)
			this._await_seek = 0
			this.current_key(key)
			this._queue_at_forced = false
			this._trim_end_skip = ''
			const trim = this.trim_start_of(key)
			const start_at = trim ?? 0
			this._trim_start_done = trim === null ? '' : key
			this._paused_pos = start_at
			try { this.account().save_last_session(key, start_at) } catch {}

			this.apply_media_metadata(audio)
			this.gain_chain_unlock()
			this.prefetch_next(key)

			const el = this.audio_el()
			if (this.try_play_local_sync(key, el, start_at)) return
			this.play_source_local(key, el, start_at)
		}

		private _file_cache = new Map<string, File>()

		private static FILE_CACHE_MAX = 2

		private file_cache_keep(...keep: (string | null | undefined)[]) {
			const alive = new Set(keep.filter(Boolean) as string[])
			for (const key of [...this._file_cache.keys()]) {
				if (!alive.has(key)) this._file_cache.delete(key)
			}
			while (this._file_cache.size > $bog_music_player.FILE_CACHE_MAX) {
				const oldest = this._file_cache.keys().next().value
				if (oldest === undefined) break
				this._file_cache.delete(oldest)
			}
		}

		private prefetch_next(key: string) {
			void this.cache_next(key).catch(() => {})
		}

		async cache_next(key: string) {
			const next_key = await $mol_wire_async(this).next_warm(key)
			if (!next_key) return
			if (!await this.file_ensure(next_key)) return
			if ($bog_music_stream.supported()) return $bog_music_stream.warm(next_key)
			const file = await $bog_music_disk.file(next_key)
			if (!file) return
			this._file_cache.set(next_key, file)
			this.file_cache_keep(this.current_key(), next_key)
		}

		next_warm(key: string) {
			const next_key = this.predict_next_key(key)
			if (next_key) this.track_warm(next_key)
			return next_key
		}

		private track_warm(key: string) {
			const track = this.account().track(key)
			if (!track) return
			track.info()
			track.trim_start()
			track.trim_end(0)
		}

		private audio_of(key: string): $bog_music_track_baza_info | null {
			try {
				return this.account().info(key)
			} catch (e: any) {
				if (!(e instanceof Promise)) throw e
				;($mol_wire_async(this) as any).play_track_warm(key)
				return null
			}
		}

		play_track_warm(key: string) {
			this.track_warm(key)
			this.play_track(key)
		}

		private trim_start_of(key: string): number | null {
			try {
				return this.account().track(key)?.trim_start() ?? 0
			} catch (e: any) {
				if (!(e instanceof Promise)) console.warn('[player] trim_start read failed:', e?.message ?? e)
				return null
			}
		}

		next_auto() {
			const key = this.predict_next_key(this.current_key())
			if (key) this.track_warm(key)
			this.next(false)
		}

		private _planned_wave: { from: string, key: string } | null = null

		private predict_next_key(key: string): string | null {
			if (this.repeat_mode() === 'one') return key
			const queue = this.queue_keys()
			if (this.repeat_mode() === 'shuffle' && queue.length) {
				this.ensure_shuffle_bag(queue)
				return this._shuffle_bag[this._shuffle_bag_idx] ?? null
			}
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

		async file_ensure(key: string): Promise<boolean> {
			return $bog_music_disk.probe(key)
		}

		private try_play_local_sync(key: string, el: HTMLAudioElement, start_at: number): boolean {
			try {
				if (!$bog_music_disk.has(key)) return false
			} catch {
				return false
			}
			if ($bog_music_stream.active()) {
				this.url_drop()
				this._dispatch_token++
				this.set_track_src(el, $bog_music_stream.url(key))
				this.attach_seek_listener(el, start_at)
				el.play().catch(() => {})
				return true
			}
			const file = this._file_cache.get(key)
			if (!file) return false
			this._dispatch_token++
			this.set_track_src(el, this.url_take(file))
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
			if (this._silent) {
				this._paused_pos = time
			} else if (this._audio_el) {
				try { this._audio_el.currentTime = time } catch {}
			}
		}

		private _seek_drag = false

		private seek_time_of(event: PointerEvent) {
			const rect = (this.Progress().dom_node() as HTMLElement).getBoundingClientRect()
			const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
			return pct * this.duration()
		}

		seek_pointer_down(event?: Event) {
			if (!event || !this.duration()) return null
			const e = event as PointerEvent
			e.preventDefault()
			try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
			this._seek_drag = true
			this.current_time(this.seek_time_of(e))
			return null
		}

		seek_pointer_move(event?: Event) {
			if (!event || !this._seek_drag) return null
			this.current_time(this.seek_time_of(event as PointerEvent))
			return null
		}

		seek_pointer_up(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
			if (!this._seek_drag) return null
			this._seek_drag = false
			const time = this.seek_time_of(e)
			this._await_seek = 0
			this.current_time(time)
			this.seek_to(time)
			$bog_music_log.act(`перемотка: ${this.format_time(time)}`)
			return null
		}

		private _dispatch_token = 0

		private is_current(key: string): boolean {
			return this.current_key() === key
		}

		@$mol_mem
		missing(next?: string) {
			return next ?? ''
		}

		private async play_source_local(key: string, el: HTMLAudioElement, start_at: number) {
			const token = ++this._dispatch_token
			this.missing('')
			try {
				this.url_drop()

				const ready = await this.file_ensure(key)
				if (token !== this._dispatch_token || !this.is_current(key)) return

				if (!ready) {
					const holders = this.account().holders_other(key)
					const name = holders.length ? this.account().device_name(holders[0]) : ''
					this.missing(name ? `Файл на «${name}» — перенеси его сюда` : 'Файла нет ни на одном устройстве')
					$bog_music_log.err(`нет файла на устройстве: ${key}`)
					this.playing(false)
					return
				}

				if ($bog_music_stream.supported()) {
					const ok = $bog_music_stream.active() || await $bog_music_stream.when_ready()
					if (token !== this._dispatch_token || !this.is_current(key)) return
					if (ok) {
						this.set_track_src(el, $bog_music_stream.url(key))
						this.attach_seek_listener(el, start_at)
						await this.safe_play(el)
						return
					}
				}

				const file = await $bog_music_disk.file(key)
				if (token !== this._dispatch_token || !this.is_current(key)) return
				if (!file) return
				this.set_track_src(el, this.url_take(file))
				this.attach_seek_listener(el, start_at)
				await this.safe_play(el)
				return
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

		toggle() {
			const was_playing = this.playing() && !this._silent
			$bog_music_log.act(`${was_playing ? 'пауза' : 'продолжить'}: ${this.current_key() || 'без трека'}`)
			this.gain_chain_unlock()
			const el = this.audio_el()
			if (this.is_ios()) {
				if (was_playing) this.ios_pause(el)
				else this.ios_resume(el)
			} else {
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

		close() {
			$bog_music_log.act('закрытие плеера')
			this._dispatch_token++
			this.ext(null)
			this._planned_wave = null
			this._file_cache.clear()
			this._silent = false
			this._track_src = ''
			this._paused_pos = 0
			this._await_seek = 0
			this._switching = false
			this._switch_gen++
			this._trim_end_skip = ''
			this._trim_start_done = ''
			this.playing(false)
			if (this._audio_el) {
				const el = this._audio_el
				el.pause()
				el.removeAttribute('src')
				try { el.load() } catch {}
			}
			this.url_drop()
			if ('mediaSession' in navigator) {
				navigator.mediaSession.metadata = null
				navigator.mediaSession.playbackState = 'none'
			}
			this.current_time(0)
			this.duration(0)
			this.queue_index(0)
			this._session_restored = true
			try { this.account().save_last_session('', 0) } catch {}
			this.current_key('')
		}

		prev() {
			if (this.ext()) {
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

		private ext_step(step: number): boolean {
			try {
				return !!($bog_music_app.Root(0) as any).tube_step(step)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[player] ext_step failed:', e?.message)
				return false
			}
		}

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

			if (this.ext()) {
				if (!manual && mode === 'one') {
					const ext = this.ext()!
					this.play_external(ext.url, ext.title, ext.artist)
					return
				}
				this.ext_step(1)
				return
			}

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
					this._shuffle_bag_sig = ''
				}
				const idx = queue.indexOf(key)
				if (idx >= 0) {
					this.queue_index(idx)
					this.play_track(key)
					return
				}
			}

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
			if (queue.length > 1 && queue[next_idx] === this.current_key()) {
				next_idx = next_idx + 1 < queue.length ? next_idx + 1 : 0
			}
			this.queue_index(next_idx)
			this.play_track(queue[next_idx])
		}

		sub() {
			if (!this.current_key() && !this.ext()) return this.full() ? [ this.Empty() ] : []
			return super.sub()
		}

		Missing() {
			return this.missing() ? super.Missing() : null as any
		}

		Missing_pull() {
			return this.account().holders_other(this.current_key()).length ? super.Missing_pull() : null as any
		}

		@$mol_action
		missing_pull() {
			const key = this.current_key()
			const beam = $bog_music_beam.instance()
			const from = beam.pick_holder(key)
			if (!from) return
			this.missing('Переношу…')
			void beam.pull(from, [key]).then(
				() => this.is_current(key) && this.play_track(key),
				(error: any) => this.missing(error?.message ?? 'Не получилось перенести'),
			)
		}

		toggle_icons() {
			return [ this.playing() ? this.Pause_icon() : this.Play_icon() ]
		}

		toggle_hint() {
			return this.playing() ? 'Пауза' : 'Играть'
		}

		Collapse() {
			if (!this.full()) return null as any
			return super.Collapse()
		}

		progress_parts() {
			const parts = [ this.Progress_line(), this.Progress_bar(), this.Progress_knob() ]
			if (!this.trim_editing()) return parts
			return [ ... parts, this.Trim_start_handle(), this.Trim_end_handle() ]
		}

		trim_editing() {
			return this.full() && this.trim_mode() && !!this.current_track()
		}

		Trim_toggle() {
			if (!this.full() || !this.current_key()) return null as any
			return super.Trim_toggle()
		}

		trim_hint() {
			const track = this.current_track()
			const dur = this.duration()
			if (!track || !dur) return ''
			const start = track.trim_start()
			const end = track.trim_end(dur)
			if (start <= 0 && end >= dur) return this.trim_editing() ? 'тяни ручки обреза' : ''
			return `обрез ${this.format_time(start)} – ${this.format_time(end)}`
		}

		private _trim_end_skip = ''
		private _trim_start_done = ''
		private _trim_drag: 'start' | 'end' | null = null

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
			queueMicrotask(() => {
				try {
					;($mol_wire_async(this) as any).next_auto()
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
			this.setup_pagehide_save()
			if (!this.current_key()) {
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
