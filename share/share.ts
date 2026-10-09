namespace $ {

	/**
	 * Шаринг треков ссылкой. Sender: выбранные треки шифруются одноразовым
	 * AES-ключом и заливаются в эфемерный land с публичным чтением; ключ
	 * уезжает только в URL-fragment. Receiver: по #share=<link>.<key> тянет
	 * land, расшифровывает и складывает треки в плейлист `shared:<имя>`.
	 *
	 * Все записи в baza — внутри одной $mol_wire_async-фибры (write_in_fiber):
	 * PoW и IDB-load wire_task'и кешируются между ретраями только там.
	 */
	export class $bog_music_share extends $mol_object {

		@$mol_mem
		static instance() {
			return new $bog_music_share
		}

		// Значение верификатора менять нельзя: старые ссылки перестанут читаться.
		static verifier_plain = 'bog-vk-share-v1'

		account() {
			return $bog_music_account_baza.home()
		}

		static plural_tracks(n: number): string {
			const mod10 = n % 10
			const mod100 = n % 100
			if (mod10 === 1 && mod100 !== 11) return 'трек'
			if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'трека'
			return 'треков'
		}

		// ---------- выбор треков (long-press → multi-select) ----------

		@$mol_mem
		mode(next?: boolean): boolean {
			return next ?? false
		}

		@$mol_mem
		selection(next?: readonly string[]): readonly string[] {
			return next ?? []
		}

		selected(key: string): boolean {
			return this.selection().includes(key)
		}

		@$mol_action
		enter(key: string) {
			$bog_music_log.act(`режим шаринга включён с ${key}`)
			this.selection([key])
			this.mode(true)
		}

		@$mol_action
		toggle(key: string) {
			const cur = this.selection()
			const next = cur.includes(key) ? cur.filter(k => k !== key) : [...cur, key]
			$bog_music_log.act(`${cur.includes(key) ? 'снят' : 'выбран'} для шаринга ${key}, всего ${next.length}`)
			this.selection(next)
		}

		@$mol_action
		exit() {
			if (this.mode()) $bog_music_log.act('режим шаринга выключен')
			this.selection([])
			this.mode(false)
		}

		// ---------- статусы для тоста ----------

		private status_logged = ''

		@$mol_mem
		status(next?: string): string {
			if (next && next !== this.status_logged) $bog_music_log.act(`шар: ${next}`)
			if (next !== undefined) this.status_logged = next
			return next ?? ''
		}

		private import_logged = ''

		@$mol_mem
		import_status(next?: string): string {
			if (next && next !== this.import_logged) $bog_music_log.act(`приём шара: ${next}`)
			if (next !== undefined) this.import_logged = next
			return next ?? ''
		}

		@$mol_mem
		busy(next?: boolean): boolean {
			return next ?? false
		}

		// ---------- sender ----------

		/** Клик по share-иконке вне режима выбора — мгновенный одиночный шар. */
		@ $mol_action
		share_single(key: string) {
			$bog_music_log.act(`одиночный шар ${key}`)
			// Не через $mol_wire_async(share_keys): async+wire глотает suspense неправильно.
			void this.share_keys([ key ])
		}

		/**
		 * Клик по табу «Расшаренный» — финализирует мульти-шар.
		 * Только триггер: submit зовётся из page()-мема, а чистка selection
		 * пишет в мемы — делать это синхронно из тела мема нельзя.
		 */
		submit() {
			void this.submit_async()
		}

		async submit_async() {
			const keys = [...this.selection()]
			this.exit()
			await this.share_keys(keys)
		}

		/** Сбор мета+blob. `@$mol_action` + `$mol_wire_async` — suspend до готовности. */
		@ $mol_action
		collect(keys: string[]): { audio: $bog_music_api_audio, blob: Blob }[] {
			const out: { audio: $bog_music_api_audio, blob: Blob }[] = []
			for (const key of keys) {
				const track = this.account().track(key)
				const audio = track?.audio()
				const blob = track?.blob_wait()
				if (audio && blob) out.push({ audio, blob })
			}
			return out
		}

		@ $mol_action
		sender_name(): string {
			return (this.account().nickname() || '').trim() || 'Расшаренный'
		}

		async share_keys(keys: string[]) {
			if (this.busy()) return
			if (!keys.length) {
				$bog_music_log.act('шар отменён: нет выбранных треков')
				this.status('Нет выбранных треков')
				return
			}
			$bog_music_log.act(`сборка шара: ${keys.length} трек(ов)`)
			this.busy(true)
			Promise.resolve().then(() => this.status('Готовлю шар…'))
			try {
				
						await this.share_build( keys )
						
			} catch (e: any) {
				console.warn('[share] failed:', e?.message ?? e)
				$bog_music_log.err(`шар не собрался: ${e?.message ?? e}`)
				this.status('Ошибка: ' + (e?.message ?? 'неизвестно'))
			} finally {
				this.busy(false)
			}
		}

		private async share_build( keys: string[] ) {
			const peer = $mol_wire_async( this ) as {
				collect( keys: string[] ): Promise<{ audio: $bog_music_api_audio, blob: Blob }[]>
				sender_name(): Promise< string >
				write_in_fiber(
					sender_cipher: Uint8Array,
					verifier_cipher: Uint8Array,
					ciphers: { audio: $bog_music_api_audio, mime: string, meta: Uint8Array, blob: Uint8Array }[],
					burn: $giper_baza_auth_pass,
				): Promise< string >
				unload_keys( keys: string[] ): Promise< void >
			}

			type Cipher = { audio: $bog_music_api_audio, mime: string, meta: Uint8Array, blob: Uint8Array }
			let usable: { audio: $bog_music_api_audio, blob: Blob }[] = []
			let ciphers: Cipher[] = []

			try {
				usable = await peer.collect( keys )
				if (!usable.length) {
					this.status('Нет локальных данных для шаринга')
					return
				}
				const sender = await peer.sender_name()

				// Ключи новых lands генерим заранее и параллельно: PoW на каждый —
				// секунды. `land_grab` дальше возьмёт готовые из embryos без PoW.
				const auth_class = $giper_baza_auth as any
				const needed = usable.length + 1 // share-land + по одному на файл
				const to_gen = Math.max(0, needed - (auth_class.embryos?.length ?? 0))
				if (to_gen > 0) {
					this.status(`Генерирую ключи (${to_gen})…`)
					const generated = await Promise.all(
						Array.from({ length: to_gen }, () => auth_class._generate())
					)
					for (const g of generated) {
						auth_class.embryos.push(g.toString() + g.toStringPrivate())
					}
				}

				this.status('Шифрую…')
				const key = $mol_crypto_sacred.make()
				const sender_cipher = await this.encrypt(key, $mol_charset_encode(sender))
				const verifier_cipher = await this.encrypt(key, $mol_charset_encode($bog_music_share.verifier_plain))

				for (const { audio, blob } of usable) {
					const meta_json = JSON.stringify({
						artist: audio.artist ?? '',
						title: audio.title ?? '',
						duration: Number(audio.duration) || 0,
						mime: blob.type || 'audio/mpeg',
						owner_id: audio.owner_id,
						id: audio.id,
						cover: audio.cover ?? '',
					})
					const meta_cipher = await this.encrypt(key, $mol_charset_encode(meta_json))
					const plain = new Uint8Array( await blob.arrayBuffer() )
					const blob_cipher = await this.encrypt( key, plain )
					plain.fill( 0 )
					ciphers.push({ audio, mime: blob.type || 'audio/mpeg', meta: meta_cipher, blob: blob_cipher })
				}
				// plaintext Blob больше не нужны — отпускаем до заливки.
				usable = []

				this.status('Заливаю в baza…')
				const burn = await ($giper_baza_auth as any)._generate() as $giper_baza_auth
				const land_link = await peer.write_in_fiber(
					sender_cipher, verifier_cipher, ciphers, burn.pass(),
				)
				if (!land_link) {
					$bog_music_log.err('шар не залился: write_in_fiber не вернул ленд')
					this.status('Не удалось залить треки')
					return
				}
				$bog_music_log.act(`шар залит: ${ciphers.length} трек(ов)`, land_link)

				const url = this.url_for(land_link, key.toString(), burn.toString() + burn.toStringPrivate())
				try {
					navigator.clipboard.writeText(url)
					this.status(`Скопировано: ${ciphers.length} ${$bog_music_share.plural_tracks(ciphers.length)}`)
				} catch {
					this.status('Ссылка: ' + url)
				}
			} finally {
				// Отпускаем plaintext/cipher из замыкания + unload source sands.
				// Не zero-fill cipher: buffer()/val могли оставить ту же ссылку в land.
				ciphers = []
				usable = []
				await peer.unload_keys( keys )
			}
		}

		/** Сбросить `_ball`/`_open` у file-land треков после шара. */
		@ $mol_action
		unload_keys( keys: string[] ) {
			for( const key of keys ) {
				const file = this.account().track( key )?.File()?.remote() as $mws_baza_file | null
				if( !file || typeof file.chunk_units !== 'function' ) continue
				const land = file.land() as $mws_baza_land
				if( typeof land.sand_unload !== 'function' ) continue
				for( const unit of file.chunk_units() ) land.sand_unload( unit )
			}
		}

		/** Все записи шара одной фиброй: land_grab (PoW) + атомы + file-lands + sync. */
		@ $mol_action
		write_in_fiber(
			sender_cipher: Uint8Array,
			verifier_cipher: Uint8Array,
			ciphers: { audio: $bog_music_api_audio, mime: string, meta: Uint8Array, blob: Uint8Array }[],
			burn: $giper_baza_auth_pass,
		): string {
			const preset: $giper_baza_rank_preset = [[null, $giper_baza_rank_read], [burn, $giper_baza_rank_post('just')]]
			const land = $giper_baza_glob.land_grab(preset)
			const data = land.Data($bog_music_share_baza)
			data.Sender('auto')!.val(sender_cipher as Uint8Array<ArrayBuffer>)
			data.Verifier('auto')!.val(verifier_cipher as Uint8Array<ArrayBuffer>)
			data.Count('auto')!.val(ciphers.length)

			const tracks = data.Tracks(null)!
			const file_lands: $giper_baza_land[] = []
			for (const c of ciphers) {
				const trk = tracks.key($bog_music_account_baza.key_of(c.audio), 'auto')
				if (!trk) continue
				trk.Meta('auto')!.val(c.meta as Uint8Array<ArrayBuffer>)
				const file_store = trk.File('auto')!.ensure(preset)
				if (!file_store) continue
				file_store.buffer(c.blob as Uint8Array<ArrayBuffer>)
				file_store.type(c.mime)
				trk.File('auto')!.remote(file_store)
				file_lands.push(file_store.land())
			}

			// Шар — эфемерный land вне home: пуш на master запускаем явно.
			this.keep(land)
			for (const fl of file_lands) this.keep(fl)

			return land.link().str
		}

		private url_for(link: string, key: string, burn: string): string {
			const base = $bog_music_boot.in_extension()
				? 'https://b-on-g.github.io/music/'
				: location.origin + location.pathname + location.search
			return base + '#share=' + link + '.' + key + '.' + burn
		}

		// ---------- receiver ----------

		@$mol_mem_key
		private token_done(token: string, next?: boolean): boolean {
			return next ?? false
		}

		/** Возвращает id плейлиста с импортированными треками (или null). */
		async import(token: string): Promise<string | null> {
			if (!token || this.token_done(token)) return null

			const [link_str, key_str, burn_str = ''] = token.split('.')
			if (!link_str || !key_str) {
				$bog_music_log.err('импорт шара: битая ссылка, нет разделителя ленда и ключа')
				this.import_status('Битая ссылка')
				this.finish(token)
				return null
			}

			let key: $mol_crypto_sacred
			try {
				key = $mol_crypto_sacred.from(key_str)
			} catch {
				$bog_music_log.err('импорт шара: битый ключ расшифровки', link_str)
				this.import_status('Битый ключ')
				this.finish(token)
				return null
			}
			$bog_music_log.act('импорт шара: ленд и ключ разобраны', link_str)

			try {
				const land = $giper_baza_glob.Land(new $giper_baza_link(link_str))
				this.keep(land)
				this.import_status('Загружаю шар…')

				// Land тянется с master'а асинхронно, а sender мог ещё не долить
				// треки — ждём заголовок с ожидаемым числом ключей.
				type Header = {
					sender_cipher: Uint8Array | null,
					verifier_cipher: Uint8Array | null,
					count: number,
					burned: boolean,
					keys: readonly string[],
				}
				let header: Header | null = null
				for (let i = 0; i < 90; i++) {
					const cur = await ($mol_wire_async(this) as any)
						.header_read(land).catch(() => null) as Header | null
					if (cur?.verifier_cipher) {
						header = cur
						if (cur.burned) break
						if (cur.count > 0 && cur.keys.length >= cur.count) break
						if (cur.count === 0 && cur.keys.length > 0) break
					}
					if (cur) this.import_status(`Жду треки (${cur.keys.length}/${cur.count || '?'})…`)
					await new Promise(r => setTimeout(r, 1000))
				}
				if (!header?.verifier_cipher) {
					this.import_status('Шар не загрузился — попробуй позже')
					return null
				}
				if (header.burned) {
					$bog_music_log.act('импорт шара: ссылка уже использована', link_str)
					this.import_status('Ссылка уже использована')
					this.finish(token)
					return null
				}

				let verifier = ''
				try {
					verifier = $mol_charset_decode(await this.decrypt(key, header.verifier_cipher))
				} catch {}
				if (verifier !== $bog_music_share.verifier_plain) {
					this.import_status('Не тот ключ')
					this.finish(token)
					return null
				}

				const sender = header.sender_cipher?.byteLength
					? $mol_charset_decode(await this.decrypt(key, header.sender_cipher))
					: 'Расшаренный'
				const playlist = 'shared:' + sender

				let imported = 0
				for (let i = 0; i < header.keys.length; i++) {
					const k = header.keys[i]
					try {
						// File-land мог залинковаться раньше, чем master получил
						// его chunks от sender'а — поллим, пока buffer не непустой.
						type TrackData = { meta_cipher: Uint8Array, file_cipher: Uint8Array, file_mime: string }
						let td: TrackData | null = null
						for (let attempt = 0; attempt < 60 && !td; attempt++) {
							this.import_status(`Тяну ${i + 1}/${header.keys.length}${attempt ? ` (${attempt}с)` : ''}…`)
							td = await ($mol_wire_async(this) as any)
								.track_read(land, k).catch(() => null) as TrackData | null
							if (!td) await new Promise(r => setTimeout(r, 1000))
						}
						if (!td) continue

						const meta = JSON.parse($mol_charset_decode(await this.decrypt(key, td.meta_cipher)))
						const buf = await this.decrypt(key, td.file_cipher)
						const audio: $bog_music_api_audio = {
							id: Number(meta.id),
							owner_id: Number(meta.owner_id),
							artist: String(meta.artist ?? ''),
							title: String(meta.title ?? ''),
							duration: Number(meta.duration ?? 0),
							url: '',
							cover: String(meta.cover ?? ''),
						}
						const mime = String(meta.mime || td.file_mime || 'audio/mpeg')
						await ($mol_wire_async(this.account()) as any).import_audio(audio, buf, mime, playlist)
						imported++
					} catch (e: any) {
						if (e instanceof Promise) throw e
						console.warn('[share] track import failed:', e?.message ?? e)
						$bog_music_log.err(`приём шара: трек ${k} не импортирован: ${e?.message ?? e}`, link_str)
					}
				}

				if (imported) {
					const burned = await ($mol_wire_async(this) as any)
						.burn_in_fiber(land, header.keys, burn_str).catch((e: any) => { $bog_music_log.err(`шар не сожжён: ${e?.message ?? e}`, link_str); return false }) as boolean
					$bog_music_log.act(burned ? 'шар сожжён после импорта' : 'шар старый, сжечь нельзя', link_str)
				}

				this.finish(token)
				if (imported) {
					this.import_status(`От ${sender}: ${imported} ${$bog_music_share.plural_tracks(imported)}`)
					return playlist
				}
				this.import_status('Шар пустой')
				return null
			} catch (e: any) {
				if (e instanceof Promise) throw e
				console.warn('[share] import failed:', e?.message ?? e)
				$bog_music_log.err(`приём шара не удался: ${e?.message ?? e}`, link_str)
				this.import_status('Не получилось: ' + (e?.message ?? 'ошибка'))
				return null
			}
		}

		private finish(token: string) {
			this.token_done(token, true)
			$bog_music_boot.clear_share_hash()
		}

		private kept = new Map< string, $mol_wire_atom< any, any, null > >()

		keep(land: $giper_baza_land) {
			const link = land.link().str
			if (this.kept.has(link)) return
			const atom = new $mol_wire_atom(`bog_music_share_keep<${link}>`, () => {
				$giper_baza_glob.Land(new $giper_baza_link(link)).sync()
				return null
			})
			this.kept.set(link, atom)
			atom.fresh()
		}

		burn_in_fiber(land: $giper_baza_land, keys: readonly string[], burn_str: string): boolean {
			if (!burn_str) return false
			const burn = $giper_baza_auth.from(burn_str)
			const sign = (target: $giper_baza_land) => Object.assign(target, { auth: () => burn })
			sign(land)
			const data = land.Data($bog_music_share_baza)
			if (!data.can_change()) return false
			data.Burned('auto')!.val(true)
			const tracks = data.Tracks(null)!
			for (const key of keys) {
				const file = tracks.key(key)?.File()?.remote()
				try {
					if (file) sign(file.land())
					if (file?.can_change()) file.buffer(new Uint8Array())
					if (file) this.keep(file.land())
				} catch (error) {
					if ($mol_promise_like(error)) throw error
				}
				tracks.cut(key)
			}
			this.keep(land)
			return true
		}

		/** Sync-чтение заголовка шара — в фибре, ретраится на загрузке land. */
		header_read(land: $giper_baza_land) {
			const data = land.Data($bog_music_share_baza)
			return {
				sender_cipher: (data.Sender()?.val() as Uint8Array | undefined) ?? null,
				verifier_cipher: (data.Verifier()?.val() as Uint8Array | undefined) ?? null,
				count: Number(data.Count()?.val() ?? 0),
				burned: Boolean(data.Burned()?.val()),
				keys: (data.Tracks()?.keys() ?? []) as string[],
			}
		}

		/** Sync-чтение шифров одного трека — в фибре. null пока чанки не доехали. */
		track_read(land: $giper_baza_land, key: string): {
			meta_cipher: Uint8Array,
			file_cipher: Uint8Array,
			file_mime: string,
		} | null {
			const trk = land.Data($bog_music_share_baza).Tracks()?.key(key)
			if (!trk) return null
			const meta_cipher = trk.Meta()?.val() as Uint8Array | undefined
			if (!meta_cipher?.byteLength) return null
			const file = trk.File()?.remote()
			if (!file) return null
			// Обёртка atom_link_synced глотает Promise от sync — здесь наоборот
			// нужно, чтобы фибра подождала: зовём sync напрямую.
			file.land().sync()
			const file_cipher = file.buffer()
			if (!file_cipher?.byteLength) return null
			return { meta_cipher, file_cipher, file_mime: file.type() || 'audio/mpeg' }
		}

		// ---------- крипто ----------

		private async encrypt(key: $mol_crypto_sacred, data: Uint8Array): Promise<Uint8Array> {
			const iv = crypto.getRandomValues(new Uint8Array(16))
			const ct = await key.encrypt(data as any, iv as any)
			const out = new Uint8Array(iv.length + ct.length)
			out.set(iv, 0)
			out.set(ct, iv.length)
			return out
		}

		private async decrypt(key: $mol_crypto_sacred, blob: Uint8Array): Promise<Uint8Array> {
			if (blob.length < 17) throw new Error('cipher too short')
			const iv = blob.slice(0, 16)
			const ct = blob.slice(16)
			return key.decrypt(ct as any, iv as any)
		}

	}

}
