namespace $ {

	/**
	 * Домен приложения: home land пользователя целиком — профиль, треки,
	 * последняя сессия. Единственное место работы с Giper Baza: view-слой
	 * зовёт методы модели и не знает про lands, sync и PoW.
	 *
	 * Правила (см. memory/giper-baza):
	 * - НЕ вешать @$mol_mem на методы, возвращающие pawn'ы — baza сама кеширует.
	 * - Мутации — instance @$mol_action (паттерн survey), НЕ static.
	 * - Запись blob / создание land — только через $mol_wire_async-фибру,
	 *   иначе PoW пересчитывается на каждом ретрае.
	 */
	export class $bog_music_account_baza extends $giper_baza_dict.with({
		Nickname: $giper_baza_atom.of( $mol_schema_string ),
		Last_track_key: $giper_baza_atom.of( $mol_schema_string ),
		Last_position: $giper_baza_atom.of( $mol_schema_float ),
		Tracks: $bog_music_tracks_dict,
	}) {

		/** Модель текущего пользователя (home land). */
		static home() {
			return $giper_baza_glob.home().land().Data( $bog_music_account_baza )
		}

		static key_of(audio: $bog_music_api_audio): string {
			return `${audio.owner_id}_${audio.id}`
		}

		tracks() {
			return this.Tracks(null)!
		}

		track(key: string) {
			return this.tracks().key(key)
		}

		nickname(next?: string): string {
			if (next !== undefined) this.Nickname('auto')!.val(next)
			return this.Nickname()?.val() ?? ''
		}

		/**
		 * Ключи треков плейлиста, сортировка по Order (fallback — Added desc).
		 * '' = основной, 'archive' = архив, 'shared:<имя>' — импортированный шар.
		 */
		keys_in(playlist: string): string[] {
			const dict = this.tracks()
			const rows: { key: string, order: number, added: number }[] = []
			for (const key of (dict.keys() ?? []) as string[]) {
				// Догружающийся трек (атомы кидают Promise) скипаем, не блокируя
				// список: подписка уже зарегистрирована, по приезде атома список
				// пересчитается и трек появится.
				try {
					const track = dict.key(key)
					if (!track) continue
					if (track.playlist() !== playlist) continue
					if (!track.audio()) continue
					rows.push({ key, order: track.order(), added: track.added() })
				} catch {
					continue
				}
			}
			rows.sort((a, b) => a.order !== b.order ? a.order - b.order : b.added - a.added)
			return rows.map(r => r.key)
		}

		audios_in(playlist: string): $bog_music_api_audio[] {
			return this.keys_in(playlist)
				.map(key => this.track(key)?.audio())
				.filter(Boolean) as $bog_music_api_audio[]
		}

		/** Плейлисты, импортированные из шаров, с числом треков. */
		shared_playlists(): { id: string, sender: string, count: number }[] {
			const dict = this.tracks()
			const map = new Map<string, number>()
			for (const key of (dict.keys() ?? []) as string[]) {
				try {
					const pl = dict.key(key)?.playlist() ?? ''
					if (!pl.startsWith('shared:')) continue
					map.set(pl, (map.get(pl) ?? 0) + 1)
				} catch {
					continue
				}
			}
			return Array.from(map.entries()).map(([id, count]) => ({
				id,
				sender: id.slice('shared:'.length),
				count,
			}))
		}

		max_order(): number {
			let max = 0
			const dict = this.tracks()
			for (const key of (dict.keys() ?? []) as string[]) {
				const track = dict.key(key)
				if (!track) continue
				max = Math.max(max, track.order(), track.added())
			}
			return max
		}

		/** Создаёт/обновляет метаданные трека. Blob — отдельно (save_blob). */
		@$mol_action
		save_track(audio: $bog_music_api_audio): void {
			const key = $bog_music_account_baza.key_of(audio)
			const track = this.tracks().key(key, 'auto')
			if (!track) return
			if (track.Vk_id()?.val() !== key) track.Vk_id('auto')!.val(key)
			const title = audio.title ?? ''
			if (track.Title()?.val() !== title) track.Title('auto')!.val(title)
			const artist = audio.artist ?? ''
			if (track.Artist()?.val() !== artist) track.Artist('auto')!.val(artist)
			const dur = Number(audio.duration ?? 0)
			if (track.Duration()?.val() !== dur) track.Duration('auto')!.val(dur)
			if (audio.url && track.Url()?.val() !== audio.url) track.Url('auto')!.val(audio.url)
			if (track.Added()?.val() == null) track.Added('auto')!.val(Date.now())
			if (track.Order()?.val() == null) track.Order('auto')!.val(this.max_order() + 1)
		}

		/**
		 * Пишет blob трека в отдельный land с публичным чтением.
		 * `.remote(store)` после `.ensure` обязателен — без него ссылка
		 * существует только локально и не попадает в pack для пуша.
		 */
		@$mol_action
		save_blob(audio: $bog_music_api_audio, buffer: Uint8Array, mime: string): void {
			const track = this.tracks().key($bog_music_account_baza.key_of(audio), 'auto')
			if (!track) return
			const store = track.File('auto')!.ensure([])
			if (!store) return
			store.buffer(buffer as Uint8Array<ArrayBuffer>)
			store.type(mime || 'audio/mpeg')
			track.File('auto')!.remote(store)
		}

		/** Метаданные + blob + плейлист одним действием (одна фибра снаружи). */
		@$mol_action
		import_audio(audio: $bog_music_api_audio, buffer: Uint8Array, mime: string, playlist = ''): void {
			this.save_track(audio)
			if (playlist) this.move_to_playlist($bog_music_account_baza.key_of(audio), playlist)
			this.save_blob(audio, buffer, mime)
		}

		/** Загрузка локального файла с устройства. */
		@$mol_action
		save_local_track(file: File, buffer: Uint8Array): $bog_music_api_audio | null {
			const { artist, title } = $bog_music_account_baza.parse_filename(file.name)
			const id = $bog_music_account_baza.hash_str(`${file.name}|${file.size}|${file.lastModified}`)
			const audio: $bog_music_api_audio = { id, owner_id: 0, artist, title, duration: 0, url: '' }
			this.save_track(audio)
			const track = this.tracks().key($bog_music_account_baza.key_of(audio), 'auto')
			if (!track) return null
			if (track.Playlist()?.val() == null) track.Playlist('auto')!.val('')
			const store = track.File('auto')!.ensure([])
			if (store) {
				store.buffer(buffer as Uint8Array<ArrayBuffer>)
				store.type(file.type || 'audio/mpeg')
				if (file.name) store.name(file.name)
				track.File('auto')!.remote(store)
			}
			return audio
		}

		@$mol_action
		swap_order(key_a: string, key_b: string): void {
			const ta = this.tracks().key(key_a, 'auto')
			const tb = this.tracks().key(key_b, 'auto')
			if (!ta || !tb) return
			const oa = ta.order()
			const ob = tb.order()
			ta.order_set(ob === oa ? oa + 1 : ob)
			tb.order_set(oa)
		}

		@$mol_action
		move_to_playlist(key: string, playlist: string): void {
			const track = this.track(key)
			if (!track) return
			track.Playlist('auto')!.val(playlist)
		}

		@$mol_action
		delete_track(key: string): void {
			this.tracks().cut(key)
		}

		/** Убирает только blob-кеш, метаданные остаются. */
		@$mol_action
		drop_blob(key: string): void {
			const track = this.track(key)
			if (!track) return
			track.File('auto')!.val(null)
		}

		@$mol_action
		save_loudness(key: string, db: number): void {
			this.track(key)?.loudness(db)
		}

		// ---------- последняя сессия (трек + позиция) ----------

		last_session(): { key: string, position: number } | null {
			const key = this.Last_track_key()?.val() ?? ''
			if (!key) return null
			if (!this.track(key)) return null
			const position = Number(this.Last_position()?.val() ?? 0) || 0
			return { key, position }
		}

		@$mol_action
		save_last_session(key: string, position: number): void {
			this.Last_track_key('auto')!.val(key)
			this.Last_position('auto')!.val(Math.max(0, position || 0))
		}

		// ---------- докачка с VK ----------

		track_cached(key: string): boolean {
			return this.track(key)?.cached() ?? false
		}

		/** Качает HLS и пишет blob в baza. Ошибки сети — в warn, не наружу. */
		async save_hls(audio: $bog_music_api_audio): Promise<void> {
			const key = $bog_music_account_baza.key_of(audio)
			if (await ($mol_wire_async(this) as any).track_cached(key)) return
			const result = await $bog_music_hls.download(audio)
			if (!result) return
			// Запись в фибре: ensure() нового blob-land делает PoW, и только
			// внутри фибры его wire_task кешируется между ретраями.
			await ($mol_wire_async(this) as any).import_audio(audio, result.buffer, result.mime)
		}

		// ---------- утилиты ----------

		static parse_filename(name: string): { artist: string, title: string } {
			const base = name.replace(/\.[^.]+$/, '').trim()
			const m = base.match(/^(.+?)\s*[-–—]\s*(.+)$/)
			if (m) return { artist: m[1].trim(), title: m[2].trim() }
			return { artist: '', title: base }
		}

		/** Детерминированный hash (FNV-1a 32 bit) — id локальных файлов. */
		static hash_str(s: string): number {
			let h = 2166136261
			for (let i = 0; i < s.length; i++) {
				h ^= s.charCodeAt(i)
				h = Math.imul(h, 16777619)
			}
			return h >>> 0
		}

	}

}
