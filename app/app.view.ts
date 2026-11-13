namespace $.$$ {
	const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test( location.hostname )

	if( local ) $giper_baza_yard.masters = (): string[] => $giper_baza_yard.masters_override() ?? [ 'http://localhost:9090/' ]

	export class $bog_music_app extends $.$bog_music_app {

		title() {
			return 'Bog Music'
		}

		account() {
			return $bog_music_account_baza.home()
		}

		share() {
			return $bog_music_share.instance()
		}

		@$mol_mem
		page(next?: string) {
			if (next !== undefined) {
				if (next === 'share') {
					$bog_music_log.act('финализация шара по клику на табе')
					this.share().submit()
					return $mol_state_arg.value('page') ?? 'my'
				}
				$bog_music_log.act(`вкладка: ${next}`)
				$mol_state_arg.value('page', next)
				$mol_state_local.value('page', next)
				return next
			}
			const page =
				$mol_state_arg.value('page')
				?? $mol_state_local.value('page')
				?? 'my'
			if (page.startsWith('list:')) {
				const exists = this.account().playlists().some(pl => pl.id === page)
			
				if (!exists) {
					$mol_state_local.value('page', 'my')
					return 'my'
				}
			}
			return page 
		}

		list_id() {
			const page = this.page()
			return page.startsWith('list:') ? page : ''
		}

		private _lists_migrated = false

		lists_migrate() {
			if (this._lists_migrated) return
			this._lists_migrated = true
			$mol_wire_async(this.account()).migrate_lists()
		}

		archive_mode() {
			return this.page() === 'archive'
		}

		@$mol_mem
		visible_keys(): readonly string[] {
			const p = this.page()
			if (p === 'share') return this.share().selection()
			if (p === 'archive') return this.account().keys_in('archive')
			if (p.startsWith('list:')) return this.account().list_keys(p)
			if (p.startsWith('shared:')) return this.account().keys_in(p)
			return this.account().keys_in('')
		}

		my_title() {
			const my = this.account().keys_in('').length
			return my ? `Моя музыка ${my}` : 'Моя музыка'
		}

		archive_title() {
			const arch = this.account().keys_in('archive').length
			return arch ? `Архив ${arch}` : 'Архив'
		}

		@$mol_mem
		list_dict() {
			const opts: Record<string, string> = {}
			if (this.share().mode()) {
				const n = this.share().selection().length
				opts['share'] = n ? `Расшаренный ${n}` : 'Расшаренный'
			}
			for (const pl of this.account().playlists()) {
				const n = this.account().list_keys(pl.id).length
				opts[pl.id] = n ? `${pl.title} ${n}` : pl.title
			}
			for (const pl of this.account().shared_playlists()) {
				opts[pl.id] = `${pl.sender} ${pl.count}`
			}
			return opts
		}

		@$mol_mem
		current_key(next?: string): string {
			return next ?? ''
		}

		@$mol_action
		play_key(key?: string | null) {
			if (!key) return
			$bog_music_log.act(`воспроизведение ${key}`)
			this.tube_current(-1)
			const keys = this.visible_keys()
			const idx = keys.indexOf(key)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(key)

			const item = this.recsys_item(key)
			if (item) {
				$bog_recsys.namespace('music')
				$bog_recsys.feedback(item, 'play')
			}
		}

		@$mol_mem
		wave_mode(next?: boolean) {
			if (next !== undefined) $bog_music_log.act(`моя волна: ${next ? 'включена' : 'выключена'}`)
			return $mol_state_local.value('music_wave_mode', next) ?? false
		}

		recsys_item(key: string) {
			const meta = this.account().info(key)
			if (!meta) return null
			const tags: string[] = []
			if (meta.artist) tags.push('artist:' + meta.artist.toLowerCase().trim())
			return { id: key, tags }
		}

		player_pick_next(current?: string | null): string | null {
			if (!this.wave_mode()) return null
			const pool = this.visible_keys()
			if (!pool.length) return null
			$bog_recsys.namespace('music')
			const items = pool.map(k => this.recsys_item(k)).filter(Boolean) as { id: string, tags: string[] }[]
			const seed = current ? this.recsys_item(current) : null
			const picked = $bog_recsys.recommend(items, {
				seed,
				exclude: current ? [current] : [],
				limit: 1,
			})[0]
			return picked?.id ?? null
		}

		@$mol_action
		reorder_to(args?: { from: number, to: number } | null) {
			if (!args) return
			const { from, to } = args
			const keys = this.visible_keys()
			if (from === to) return
			if (from < 0 || to < 0 || from >= keys.length || to >= keys.length) return
			const moving = keys[from]
			$bog_music_log.act(`перестановка ${moving}: ${from} → ${to}`)
			const list = this.list_id()
			if (list) return this.account().list_move(list, moving, keys[to])
			const step = from < to ? 1 : -1
			for (let i = from; i !== to; i += step) {
				this.account().swap_order(moving, keys[i + step])
			}
		}

		@$mol_action
		archive_key(key?: string | null) {
			if (!key) return
			$bog_music_log.act(`в архив ${key}`)
			this.account().move_to_playlist(key, 'archive')
		}

		@$mol_action
		restore_key(key?: string | null) {
			if (!key) return
			$bog_music_log.act(`из архива ${key}`)
			this.account().move_to_playlist(key, '')
		}

		@$mol_action
		demote_key(key?: string | null) {
			if (!key) return
			const keys = this.visible_keys()
			const from = keys.indexOf(key)
			if (from < 0 || from === keys.length - 1) return
			$bog_music_log.act(`вниз списка ${key}`)

			const current = this.current_key()
			const at = current ? keys.indexOf(current) : -1
			const follow = at < 0 ? '' : keys.slice(at + 1).find(k => k !== key) ?? ''

			const list = this.list_id()
			if (list) this.account().list_move(list, key, keys[keys.length - 1])
			else this.account().move_to_bottom(key)
			if (at < 0) return

			const fresh = this.visible_keys()
			const follow_at = follow ? fresh.indexOf(follow) : -1
			this.Player().queue_index(
				follow_at >= 0
					? ( follow_at - 1 + fresh.length ) % fresh.length
					: Math.max( 0, fresh.indexOf( current ) )
			)
		}

		@$mol_action
		delete_key(key?: string | null) {
			if (!key) return
			$bog_music_log.act(`удаление ${key}`)
			void this.account().delete_track(key)
		}

		@$mol_mem
		upload_files(next?: File[]) {
			if (next?.length) {
				$bog_music_log.act(`загрузка с устройства: ${next.length} файл(ов)`)
				const files = [...next].sort((a, b) => a.name.localeCompare(b.name, 'ru', { numeric: true }))
				void ( async () => {
					for( const [ index, file ] of files.entries() ) {
						await this.account().save_local_track( file, index + 1 ).catch( ( error: any ) => {
							$bog_music_log.err( `файл не загружен: ${ file.name }: ${ error?.message ?? error }` )
						} )
					}
				} )()
			}
			return next ?? []
		}

		@$mol_mem
		download_playlist_status(next?: string): string {
			return next ?? ''
		}

		@$mol_action
		download_playlist() {
			$bog_music_log.act('скачивание плейлиста zip')
			void this.download_zip_async()
		}

		async download_zip_async() {
			const keys = await $mol_wire_async(this).visible_keys()
			if (!keys.length) {
				this.download_playlist_status('Плейлист пуст')
				return
			}
			const files: { name: string, data: Uint8Array }[] = []
			let skipped = 0
			for (const key of keys) {
				this.download_playlist_status(`Архивирую ${files.length}/${keys.length}…`)
				const file = await $bog_music_disk.file(key)
				const meta = await $mol_wire_async(this.account()).info(key)
				if (!file || !meta) { skipped++; continue }
				const data = new Uint8Array(await file.arrayBuffer())
				files.push({
					name: $bog_music_zip.entry_name(files.length + 1, meta.artist, meta.title, $bog_music_disk.mime(data.subarray(0, 12))),
					data,
				})
			}
			if (!files.length) {
				this.download_playlist_status('На этом устройстве нет файлов этого списка')
				return
			}
			this.download_playlist_status('Собираю zip…')
			const blob = new Blob([$bog_music_zip.build(files) as BlobPart], { type: 'application/zip' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `music-playlist-${new Date().toISOString().slice(0, 10)}.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
			const skipped_note = skipped ? `, пропущено ${skipped}` : ''
			$bog_music_log.act(`zip собран: ${files.length} файлов${skipped_note}`)
			this.download_playlist_status(`Готово: ${files.length} ${$bog_music_share.plural_tracks(files.length)}${skipped_note}`)
		}

		beam() {
			return $bog_music_beam.instance()
		}

		beam_groups() {
			return this.beam().remote_groups(this.visible_keys())
		}

		beam_text() {
			const summary = this.beam().summary()
			if (summary) return summary
			const groups = [...this.beam_groups()]
			if (!groups.length) return ''
			return groups
				.map(([from, keys]) => `${keys.length} ${$bog_music_share.plural_tracks(keys.length)} только на «${this.account().device_name(from)}»`)
				.join(', ')
		}

		beam_button() {
			return this.beam_groups().size ? 'Перенести сюда' : ''
		}

		@$mol_action
		beam_pull() {
			this.beam().pull_all(this.visible_keys())
		}

		Beam_bar() {
			if (!this.beam_text()) return null as any
			return super.Beam_bar()
		}

		Beam_pull() {
			if (!this.beam_button() || this.beam().summary()) return null as any
			return super.Beam_pull()
		}

		version_label() {
			return $bog_music_version
		}

		lights() {
			const theme = this.Theme()
			if( theme.mode() === 'system' ) return 'system'
			return theme.is_light_now() ? 'light' : 'dark'
		}

		@$mol_mem
		font_size( next?: string ) {
			return this.$.$mol_state_local.value( 'bog_music_font_size', next ) ?? 'normal'
		}

		@$mol_mem
		dev( next?: boolean ) {
			return this.$.$mol_state_local.value( 'bog_music_dev', next ) ?? false
		}

		@$mol_mem
		section(next?: string): string {
			if (next !== undefined) $bog_music_log.act(`раздел: ${next}`)
			return next ?? 'music'
		}

		player_full() {
			return this.section() === 'player'
		}

		private _section_back = 'music'

		@$mol_action
		player_open( event?: Event ) {
			if( this.player_full() ) return
			this._section_back = this.section()
			this.section( 'player' )
		}

		@$mol_action
		player_collapse( event?: Event ) {
			this.section( this._section_back )
		}

		body() {
			switch (this.section()) {
				case 'logs': if (this.dev()) return [this.Logs()]; break
				case 'account': return [this.Account(), this.Feedback()]
				case 'player': return [this.Player()]
				case 'search': return [this.Tube_bar(), this.Tube_list()]
			}
			return [
				this.Share_toast(),
				this.Beam_bar(),
				this.Tabs(),
				this.Tracks(),
			]
		}

		foot() {
			return [
				... this.player_full() ? [] : [ this.Player() ],
				this.Nav(),
			]
		}

		@$mol_mem
		tube_query(next?: string): string {
			if (next !== undefined) return next
			return this.tube_committed()
		}

		@$mol_mem
		tube_committed(next?: string): string {
			return $mol_state_arg.value('q', next) ?? ''
		}

		@$mol_action
		tube_find() {
			const query = this.tube_query()
			$bog_music_log.act(`поиск на YouTube: ${query}`)
			this.tube_committed(query)
		}

		@$mol_action
		tube_submit( event?: Event ) {
			event?.preventDefault()
			this.tube_find()
			;( this.Tube_query().dom_node() as HTMLInputElement ).blur()
		}

		private _tube_found ={ query: '', items: [] as $bog_music_tube_item[] }

		@$mol_mem
		tube_items(): $bog_music_tube_item[] {
			const query = this.tube_committed().trim()
			if (!query) return []
			if (this._tube_found.query === query) return this._tube_found.items
			const items = $bog_music_tube.search(query)
			this._tube_found = { query, items }
			return items
		}

		@$mol_mem
		tube_rows() {
			return this.tube_items().map((_, i) => this.Tube_row(i))
		}

		tube_item(index: number): $bog_music_tube_item | null {
			return this.tube_items()[index] ?? null
		}

		tube_title(index: number) {
			return this.tube_item(index)?.title ?? ''
		}

		tube_meta(index: number) {
			const item = this.tube_item(index)
			if (!item) return ''
			const dur = item.duration
			const time = dur ? `${Math.floor(dur / 60)}:${String(Math.floor(dur % 60)).padStart(2, '0')}` : ''
			return [item.channel, time].filter(Boolean).join(' · ')
		}

		tube_cover(index: number) {
			const item = this.tube_item(index)
			return item ? $bog_music_tube.cover_url(item.id) : ''
		}

		private _tube_at = -1

		tube_current(next?: number): number {
			if (next !== undefined) this._tube_at = next
			return this._tube_at
		}

		@$mol_action
		tube_step(step: number): boolean {
			const at = this.tube_current()
			if (at < 0) return false
			const to = at + step
			if (to < 0 || to >= this.tube_items().length) return false
			this.tube_play(to)
			return true
		}

		@$mol_action
		tube_play(index: number) {
			const item = this.tube_item(index)
			if (!item) return
			$bog_music_log.act(`стрим с YouTube: ${item.title}`)
			this.tube_current(index)
			;(this.Player() as any).play_external(
				$bog_music_tube.audio_url(item.id),
				item.title,
				item.channel,
				$bog_music_tube.cover_url(item.id),
			)
		}

		tube_status_text(index: number): string {
			const item = this.tube_item(index)
			return item ? this.tube_status(item.id) : ''
		}

		@$mol_mem_key
		tube_status(id: string, next?: string): string {
			return next ?? ''
		}

		tube_busy(index: number): boolean {
			return this.tube_status_text(index).startsWith('Качаю')
		}

		@$mol_action
		tube_get(index: number) {
			const item = this.tube_item(index)
			if (!item) return
			$bog_music_log.act(`скачивание с YouTube: ${item.title ?? index}`)
			;($mol_wire_async(this) as any).tube_download(item)
		}

		async tube_download(item: $bog_music_tube_item) {
			if (this.tube_status(item.id)) return
			this.tube_status(item.id, 'Качаю…')
			try {
				const bytes = await $bog_music_tube.audio_bytes(item.id)
				await this.account().import_audio(
					$bog_music_account_baza.key_make('yt:' + item.id),
					{
						artist: item.channel,
						title: item.title,
						duration: item.duration,
						cover: $bog_music_tube.cover_url(item.id),
					},
					bytes,
				)
				$bog_music_log.act(`скачано с YouTube: ${item.title} (${bytes.length} байт)`)
				this.tube_status(item.id, '✓ в Моей музыке')
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[tube] download failed:', e?.message ?? e)
				$bog_music_log.err(`скачивание с YouTube не удалось: ${item.title}: ${e?.message ?? e}`)
				this.tube_status(item.id, 'Ошибка')
				setTimeout(() => this.tube_status(item.id, ''), 4000)
			}
		}

		@$mol_mem
		tg_state(next?: { linked: boolean, name: string, pending: number, done: number, error: string }) {
			return next ?? { linked: false, name: '', pending: 0, done: 0, error: '' }
		}

		tg_hint() {
			return this.tg_state().linked
				? 'Пересылай боту треки из любого чата — они приедут в Мою музыку сами.'
				: 'Подключи бота и пересылай ему музыку из любого чата. Файлы больше 20 МБ Телеграм ботам не отдаёт.'
		}

		tg_button() {
			return this.tg_state().linked ? 'Открыть бота' : 'Подключить Телеграм'
		}

		tg_status() {
			const state = this.tg_state()
			if (state.error) return state.error
			if (!$bog_music_tg.code()) return ''
			const parts = [ state.linked
				? (state.name ? `Подключено: ${state.name}` : 'Подключено')
				: 'Ждём /start в боте'
			]
			if (state.pending) parts.push(`в очереди ${state.pending}`)
			if (state.done) parts.push(`забрано ${state.done}`)
			return parts.join(' · ')
		}

		@$mol_action
		tg_link() {
			const code = $bog_music_tg.code_ensure()
			$bog_music_log.act('открытие телеграм-бота для связки')
			window.open($bog_music_tg.link_url(code), '_blank')
			$mol_wire_async(this).tg_drain()
		}

		tg_meta(row: $bog_music_tg_row): $bog_music_track_baza_info {
			let artist = row.performer
			let title = row.title
			if (!title) {
				const parsed = $bog_music_account_baza.parse_filename(row.file_name || 'Трек')
				title = parsed.title
				if (!artist) artist = parsed.artist
			}
			return { artist, title, duration: row.duration, cover: '' }
		}

		private _tg_busy = false

		async tg_drain() {
			const code = $bog_music_tg.code()
			if (!code || this._tg_busy) return
			this._tg_busy = true
			try {
				const status = await $bog_music_tg.status(code)
				this.tg_state({
					...this.tg_state(),
					linked: status.linked,
					name: status.name,
					pending: status.pending,
					error: '',
				})
				if (!status.linked || !status.pending) return
				$bog_music_log.act(`Телеграм: в очереди ${status.pending}, забираю`)

				for (const row of await $bog_music_tg.inbox(code)) {
					try {
						const bytes = await $bog_music_tg.file(code, row.id)
						await this.account().import_audio(
							$bog_music_account_baza.key_make('tg:' + (row.uid || row.id)),
							this.tg_meta(row),
							bytes,
						)
						await $bog_music_tg.ack(code, row.id)
					} catch (e: any) {
						if (e instanceof Promise) throw e
						console.warn('[tg] import failed:', row.id, e?.message ?? e)
						$bog_music_log.err(`импорт из Телеграма не удался: ${row.id}: ${e?.message ?? e}`)
						continue
					}
					const state = this.tg_state()
					this.tg_state({ ...state, done: state.done + 1, pending: Math.max(0, state.pending - 1) })
				}
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[tg] drain failed:', e?.message ?? e)
				$bog_music_log.err(`Телеграм-бот недоступен: ${e?.message ?? e}`)
				this.tg_state({ ...this.tg_state(), error: 'Телеграм-бот недоступен' })
			} finally {
				this._tg_busy = false
			}
		}

		private _tg_timer: any = 0

		@$mol_mem
		private tg_poller() {
			if (this._tg_timer) {
				clearInterval(this._tg_timer)
				this._tg_timer = 0
			}
			if (!$bog_music_tg.code()) return null
			this._tg_timer = setInterval(() => { $mol_wire_async(this).tg_drain() }, 30000)
			return null
		}

		fm_user() {
			return $bog_music_scrobble.user()
		}

		fm_hint() {
			return 'Прослушанное уходит в твою статистику на last.fm. Скробблится всё, что играет в плеере.'
		}

		fm_button() {
			return this.fm_user() ? 'Отключить' : 'Подключить last.fm'
		}

		@$mol_mem
		fm_error(next?: string) {
			return next ?? ''
		}

		fm_status() {
			if (this.fm_error()) return this.fm_error()
			const user = this.fm_user()
			return user ? `Подключено: ${user}` : ''
		}

		@$mol_action
		fm_link() {
			if (this.fm_user()) {
				$bog_music_log.act('отключение last.fm')
				$mol_wire_async($bog_music_scrobble).logout()
				return
			}
			$bog_music_log.act('подключение last.fm')
			window.open($bog_music_scrobble.login_url($bog_music_scrobble.code_ensure()), '_blank')
		}

		async fm_refresh() {
			if (!$bog_music_scrobble.code()) return
			try {
				await $bog_music_scrobble.status()
				this.fm_error('')
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[fm] status failed:', e?.message ?? e)
				$bog_music_log.err(`сервер скробблинга недоступен: ${e?.message ?? e}`)
				this.fm_error('Сервер скробблинга недоступен')
			}
		}

		nickname_label() {
			return this.account().nickname()
		}

		share_toast_text(): string {
			return this.share().status() || this.share().import_status() || ''
		}

		Share_toast() {
			if (!this.share_toast_text()) return null as any
			return super.Share_toast()
		}

		async import_share(token: string) {
			const playlist = await this.share().import(token)
			if (playlist) this.page(playlist)
		}

		auto() {
			this.beam().watch()
			this.share().watch()
			this.tg_poller()
			$mol_wire_async(this).tg_drain()
			$mol_wire_async(this).fm_refresh()
			this.lists_migrate()
			const token = $bog_music_boot.share_token
			if (token) {
				$bog_music_boot.share_token = ''
				void this.import_share(token)
			}
			return super.auto()
		}

	}

}
