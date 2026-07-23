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
		// Интегральная громкость записи (dB RMS), меряется один раз при первом
		// проигрывании — для выравнивания треков между собой ($bog_music_gain).
		Loudness: $giper_baza_atom.of( $mol_schema_float ),
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

		/** Blob из baza. null если не закеширован. */
		blob(): Blob | null {
			const file = this.File()?.remote()
			if (!file) return null
			const buf = file.buffer()
			if (!buf || buf.byteLength === 0) return null
			const type = file.type() || 'audio/mpeg'
			return new Blob(
				[buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer],
				{ type },
			)
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
			const buf = file.buffer()
			if (!buf || buf.byteLength === 0) return null
			const type = file.type() || 'audio/mpeg'
			return new Blob(
				[buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer],
				{ type },
			)
		}

		cached(): boolean {
			try {
				return this.blob() !== null
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return false // битый pawn/CBOR — считаем что кеша нет
			}
		}

		/** Интегральная громкость (dB RMS). null — ещё не измерена. */
		loudness(next?: number): number | null {
			if (next !== undefined) this.Loudness('auto')!.val(next)
			const v = this.Loudness()?.val()
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
