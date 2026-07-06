namespace $.$$ {

	// Фиксы окружения (yard masters, vk_token bridge, #account/#share из URL) —
	// до первого обращения к baza.
	$bog_music_boot.init()

	export class $bog_music_app extends $.$bog_music_app {

		title() {
			return 'Bog Music'
		}

		/** Доменная модель: home land пользователя. */
		account() {
			return $bog_music_account_baza.home()
		}

		share() {
			return $bog_music_share.instance()
		}

		// =====================================================================
		// Страницы
		// =====================================================================

		@$mol_mem
		page(next?: string) {
			if (next !== undefined) {
				// Клик на табе «Расшаренный» в режиме шаринга финализирует шар,
				// не переключая страницу.
				if (next === 'share') {
					this.share().submit()
					return $mol_state_arg.value('page') ?? 'my'
				}
				$mol_state_arg.value('page', next)
				return next
			}
			return $mol_state_arg.value('page') ?? 'my'
		}

		archive_mode() {
			return this.page() === 'archive'
		}

		@$mol_mem
		visible_keys(): readonly string[] {
			const p = this.page()
			if (p === 'share') return this.share().selection()
			if (p === 'archive') return this.account().keys_in('archive')
			if (p.startsWith('shared:')) return this.account().keys_in(p)
			return this.account().keys_in('')
		}

		tab_options() {
			const my = this.account().keys_in('').length
			const arch = this.account().keys_in('archive').length
			const opts: Record<string, string> = {
				my: my ? `Моя музыка ${my}` : 'Моя музыка',
				archive: arch ? `Архив ${arch}` : 'Архив',
			}
			if (this.share().mode()) {
				const n = this.share().selection().length
				opts['share'] = n ? `Расшаренный ${n}` : 'Расшаренный'
			}
			for (const pl of this.account().shared_playlists()) {
				opts[pl.id] = `${pl.sender} ${pl.count}`
			}
			return opts as { my: string, archive: string }
		}

		// =====================================================================
		// Воспроизведение
		// =====================================================================

		@$mol_mem
		current_key(next?: string): string {
			return next ?? ''
		}

		@$mol_action
		play_key(key?: string | null) {
			if (!key) return
			const keys = this.visible_keys()
			const idx = keys.indexOf(key)
			this.Player().queue_index(idx >= 0 ? idx : 0)
			this.Player().play_track(key)

			const item = this.recsys_item(key)
			if (item) {
				$bog_recsys.namespace('vk') // исторический id, на нём накоплена статистика
				try { $bog_recsys.feedback(item, 'play') } catch {}
			}
		}

		@$mol_mem
		wave_mode(next?: boolean) {
			return $mol_state_local.value('music_wave_mode', next) ?? false
		}

		recsys_item(key: string) {
			const audio = this.account().track(key)?.audio()
			if (!audio) return null
			const tags: string[] = []
			if (audio.artist) tags.push('artist:' + audio.artist.toLowerCase().trim())
			return { id: key, tags }
		}

		/** «Моя волна»: следующий трек от рекомендалки. null = обычный порядок. */
		player_pick_next(current?: string | null): string | null {
			if (!this.wave_mode()) return null
			const pool = this.visible_keys()
			if (!pool.length) return null
			$bog_recsys.namespace('vk')
			const items = pool.map(k => this.recsys_item(k)).filter(Boolean) as { id: string, tags: string[] }[]
			const seed = current ? this.recsys_item(current) : null
			const picked = $bog_recsys.recommend(items, {
				seed,
				exclude: current ? [current] : [],
				limit: 1,
			})[0]
			return picked?.id ?? null
		}

		// =====================================================================
		// Редактирование списка
		// =====================================================================

		@$mol_action
		reorder_to(args?: { from: number, to: number } | null) {
			if (!args) return
			const { from, to } = args
			const keys = this.visible_keys()
			if (from === to) return
			if (from < 0 || to < 0 || from >= keys.length || to >= keys.length) return
			const moving = keys[from]
			const step = from < to ? 1 : -1
			for (let i = from; i !== to; i += step) {
				this.account().swap_order(moving, keys[i + step])
			}
		}

		@$mol_action
		archive_key(key?: string | null) {
			if (key) this.account().move_to_playlist(key, 'archive')
		}

		@$mol_action
		restore_key(key?: string | null) {
			if (key) this.account().move_to_playlist(key, '')
		}

		@$mol_action
		delete_key(key?: string | null) {
			if (key) this.account().delete_track(key)
		}

		// =====================================================================
		// Загрузка файлов с устройства
		// =====================================================================

		@$mol_mem
		upload_files(next?: File[]) {
			if (next?.length) {
				for (const file of next) {
					const buffer = new Uint8Array(($mol_wire_sync(file) as any).arrayBuffer())
					this.account().save_local_track(file, buffer)
				}
			}
			return next ?? []
		}

		// =====================================================================
		// VK: список моих аудио и докачка плейлиста
		// =====================================================================

		@$mol_mem
		vk_audios(): $bog_music_api_audio[] {
			if (!$bog_music_api.in_extension()) return []
			if (!$bog_music_api.token()) return []
			return $bog_music_api.my_audios()?.items ?? []
		}

		@$mol_mem
		prefetch_state(next?: { total: number, done: number, failed: number }) {
			return next ?? { total: 0, done: 0, failed: 0 }
		}

		@$mol_mem
		download_playlist_status(next?: string): string {
			return next ?? ''
		}

		/** Кнопка в аккаунте: extension качает с VK в baza, PWA отдаёт zip. */
		@$mol_action
		download_playlist() {
			$mol_wire_async(this).download_playlist_async()
		}

		async download_playlist_async() {
			if (!$bog_music_api.in_extension()) {
				await this.download_zip_async()
				return
			}
			const items: $bog_music_api_audio[] = this.page() === 'my'
				? await ($mol_wire_async(this) as any).vk_audios()
				: await ($mol_wire_async(this) as any).visible_audios()
			if (!items.length) {
				this.download_playlist_status('Плейлист пуст')
				return
			}
			this.download_playlist_status(`Скачиваю ${items.length}…`)
			await this.prefetch_blobs(items)
			const s = this.prefetch_state()
			this.download_playlist_status(`Готово: ${s.done}/${s.total}${s.failed ? `, ошибок ${s.failed}` : ''}`)
		}

		/** Sync-хелперы для чтения baza из async-кода через фибру. */
		visible_audios(): $bog_music_api_audio[] {
			return this.visible_keys()
				.map(key => this.account().track(key)?.audio())
				.filter(Boolean) as $bog_music_api_audio[]
		}

		track_blob(key: string): Blob | null {
			return this.account().track(key)?.blob() ?? null
		}

		/** Качает блобы треков в baza по одному, с прогрессом. */
		async prefetch_blobs(items: $bog_music_api_audio[]) {
			if (!items?.length) return
			this.prefetch_state({ total: items.length, done: 0, failed: 0 })
			let done = 0, failed = 0
			for (const audio of items) {
				try {
					const account = $mol_wire_async(this.account()) as any
					await account.save_track(audio)
					const key = $bog_music_account_baza.key_of(audio)
					if (await account.track_cached(key)) { done++; continue }
					let target = audio
					if (!target.url) {
						const id = `${audio.owner_id}_${audio.id}${audio.access_key ? '_' + audio.access_key : ''}`
						const fresh = await $bog_music_api.fetch_vk_direct('audio.getById', { audios: id })
							.then((r: $bog_music_api_audio[]) => r?.[0]).catch(() => null)
						if (!fresh?.url) {
							failed++
							this.prefetch_state({ total: items.length, done, failed })
							continue
						}
						target = { ...audio, url: fresh.url }
					}
					await this.account().save_hls(target)
					done++
				} catch (e: any) {
					failed++
					console.warn('[app] prefetch failed:', audio.artist, '—', audio.title, '|', e?.message ?? String(e))
				}
				this.prefetch_state({ total: items.length, done, failed })
			}
		}

		/** PWA-путь: локально засинканные блобы → zip → браузерный download. */
		async download_zip_async() {
			const keys = await ($mol_wire_async(this) as any).visible_keys() as string[]
			if (!keys.length) {
				this.download_playlist_status('Плейлист пуст')
				return
			}
			const files: { name: string, data: Uint8Array }[] = []
			let skipped = 0
			for (const key of keys) {
				this.download_playlist_status(`Архивирую ${files.length}/${keys.length}…`)
				const blob = await ($mol_wire_async(this) as any).track_blob(key).catch(() => null) as Blob | null
				const audio = this.account().track(key)?.audio()
				if (!blob || !audio) { skipped++; continue }
				const data = new Uint8Array(await blob.arrayBuffer())
				files.push({
					name: $bog_music_zip.entry_name(files.length + 1, audio.artist, audio.title, blob.type),
					data,
				})
			}
			if (!files.length) {
				this.download_playlist_status('Нет локально доступных треков для архива')
				return
			}
			this.download_playlist_status('Собираю zip…')
			const blob = new Blob([$bog_music_zip.build(files)], { type: 'application/zip' })
			const url = URL.createObjectURL(blob)
			const a = document.createElement('a')
			a.href = url
			a.download = `music-playlist-${new Date().toISOString().slice(0, 10)}.zip`
			document.body.appendChild(a)
			a.click()
			a.remove()
			setTimeout(() => URL.revokeObjectURL(url), 1000)
			const skipped_note = skipped ? `, пропущено ${skipped}` : ''
			this.download_playlist_status(`Готово: ${files.length} ${$bog_music_share.plural_tracks(files.length)}${skipped_note}`)
		}

		// =====================================================================
		// Тулбар, панели, тосты
		// =====================================================================

		version_label() {
			return $bog_music_version
		}

		/** Нижняя навигация: music / account / feedback. */
		@$mol_mem
		section(next?: string): string {
			return next ?? 'music'
		}

		body() {
			switch (this.section()) {
				case 'account': return [this.Account()]
				case 'feedback': return [this.Feedback()]
				case 'search': return [this.Tube_bar(), this.Tube_list()]
			}
			return [
				this.Share_toast(),
				this.Tabs(),
				this.Tracks(),
			]
		}

		// =====================================================================
		// Поиск и скачивание из YouTube (сервер bog/music/tube)
		// =====================================================================

		/**
		 * Поле ввода. Дефолт — из committed (URL), чтобы при возврате на
		 * секцию/заходе по ссылке в поле был текущий запрос, а не пусто.
		 */
		@$mol_mem
		tube_query(next?: string): string {
			if (next !== undefined) return next
			return this.tube_committed()
		}

		/**
		 * Запрос, по которому реально ищем. Хранится в URL (`?q=`) — переживает
		 * переключение вкладок и перезагрузку, шарится ссылкой.
		 */
		@$mol_mem
		tube_committed(next?: string): string {
			return $mol_state_arg.value('q', next) ?? ''
		}

		@$mol_action
		tube_find() {
			this.tube_committed(this.tube_query())
		}

		@$mol_mem
		tube_items(): $bog_music_tube_item[] {
			const q = this.tube_committed()
			if (!q.trim()) return []
			return $bog_music_tube.search(q)
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

		/** Прослушать трек стримом с сервера, не скачивая в baza. */
		@$mol_action
		tube_play(index: number) {
			const item = this.tube_item(index)
			if (!item) return
			;(this.Player() as any).play_external(
				$bog_music_tube.audio_url(item.id),
				item.title,
				item.channel,
			)
		}

		@$mol_mem_key
		tube_status_text(index: number, next?: string): string {
			return next ?? ''
		}

		@$mol_action
		tube_get(index: number) {
			const item = this.tube_item(index)
			if (!item) return
			;($mol_wire_async(this) as any).tube_download(index, item)
		}

		async tube_download(index: number, item: $bog_music_tube_item) {
			if (this.tube_status_text(index)) return
			this.tube_status_text(index, 'Качаю…')
			try {
				const bytes = await $bog_music_tube.audio_bytes(item.id)
				const audio: $bog_music_api_audio = {
					id: $bog_music_account_baza.hash_str('yt:' + item.id),
					owner_id: 0,
					artist: item.channel,
					title: item.title,
					duration: item.duration,
					url: '',
				}
				await ($mol_wire_async(this.account()) as any).import_audio(audio, bytes, 'audio/mp4')
				this.tube_status_text(index, '✓ в Моей музыке')
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[tube] download failed:', e?.message ?? e)
				this.tube_status_text(index, 'Ошибка')
				setTimeout(() => this.tube_status_text(index, ''), 4000)
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

		// =====================================================================
		// Фоновые процессы
		// =====================================================================

		private _drain_busy = false

		/**
		 * Разбор очереди треков, сохранённых со страницы vk.com (см. ext/).
		 * Запись каждого — своя фибра: save_blob создаёт blob-land с PoW,
		 * и только внутри фибры PoW-task кешируется между ретраями.
		 */
		async drain_pending() {
			if (this._drain_busy) return
			this._drain_busy = true
			try {
				while (true) {
					const entries = await $bog_music_pending.all()
					if (!entries.length) break
					for (const entry of entries) {
						const raw = entry.buf
						const buf = raw instanceof Uint8Array ? raw : new Uint8Array(raw)
						try {
							await ($mol_wire_async(this.account()) as any)
								.import_audio(entry.audio, buf, entry.mime || 'audio/aac')
						} catch (e: any) {
							console.warn('[app] pending save failed:', entry.key, e?.message ?? e)
							continue
						}
						await $bog_music_pending.remove(entry.key)
					}
				}
			} finally {
				this._drain_busy = false
			}
		}

		/** Однократная подписка на сигнал от background.js о новом pending-треке. */
		@$mol_mem
		private pending_listener() {
			const ext = (globalThis as any).chrome
			if (!ext?.runtime?.onMessage?.addListener) return null
			ext.runtime.onMessage.addListener((msg: any) => {
				if (msg?.target !== 'popup' || msg.type !== 'pending_added') return
				$mol_wire_async(this).drain_pending()
			})
			return null
		}

		async import_share(token: string) {
			const playlist = await this.share().import(token)
			if (playlist) this.page(playlist)
		}

		auto() {
			this.pending_listener()
			$mol_wire_async(this).drain_pending()
			const token = $bog_music_boot.share_token
			if (token) {
				$bog_music_boot.share_token = ''
				$mol_wire_async(this).import_share(token)
			}
			return super.auto()
		}

	}

}
