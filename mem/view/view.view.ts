namespace $.$$ {

	type Audit = {
		tracks: number
		files: number
		units: number
		loaded: number
		bytes_total: number
		bytes_loaded: number
		pending: number
	}

	/**
	 * Панель диагностики памяти в отладочной секции (рядом с журналом).
	 *
	 * Показывает три вещи: занятую кучу от браузера, счётчики приложения
	 * (сколько Blob'ов материализовали и сколько треков запускали) и обход
	 * фонотеки — сколько чанков у треков и у скольких из них поднято в память
	 * содержимое. Последнее и есть та цифра, ради которой всё затевалось:
	 * пока она близка к нулю при полном списке — фонотека в куче не оседает.
	 */
	export class $bog_music_mem_view extends $.$bog_music_mem_view {

		account() {
			return $bog_music_account_baza.home()
		}

		/**
		 * Счётчики лежат в обычных полях, подписаться на них нельзя —
		 * перечитываем раз в секунду, как в журнале.
		 */
		heap_label() {
			this.$.$mol_state_time.now( 1000 )
			const used = $bog_music_mem.heap()
			if( !used ) return 'Куча: браузер не сообщает (только Chromium)'
			const limit = $bog_music_mem.heap_limit()
			const size = $bog_music_mem.size_label( used )
			return limit
				? `Куча: ${ size } из ${ $bog_music_mem.size_label( limit ) }`
				: `Куча: ${ size }`
		}

		counters_label() {
			this.$.$mol_state_time.now( 1000 )
			const blobs = $bog_music_mem.blobs
			const bytes = $bog_music_mem.size_label( $bog_music_mem.blob_bytes )
			return `Запусков ${ $bog_music_mem.plays }, Blob'ов собрано ${ blobs } на ${ bytes }`
		}

		@ $mol_mem
		audit( next?: Audit ): Audit | null {
			return next ?? null
		}

		audit_label() {
			const a = this.audit()
			if( !a ) return 'Фонотека: нажми «Пересчитать»'
			const loaded = $bog_music_mem.size_label( a.bytes_loaded )
			const total = $bog_music_mem.size_label( a.bytes_total )
			const pending = a.pending ? `, ждут загрузки ${ a.pending }` : ''
			return `Фонотека: треков ${ a.tracks }, с файлом ${ a.files }`
				+ `, чанков ${ a.units } на ${ total }`
				+ `, поднято в память ${ a.loaded } на ${ loaded }${ pending }`
		}

		/**
		 * Один проход по фонотеке. Трек, чей blob-land в этот момент ещё
		 * читается из IndexedDB, кидает Promise — считаем его «ждущим» и идём
		 * дальше, а не ретраим весь обход: ретрай на каждом ленде превратил бы
		 * проход в квадрат.
		 */
		audit_run() {

			const account = this.account()
			const dict = account.tracks()
			const keys = ( dict.keys() ?? [] ) as string[]

			const res: Audit = {
				tracks: keys.length,
				files: 0,
				units: 0,
				loaded: 0,
				bytes_total: 0,
				bytes_loaded: 0,
				pending: 0,
			}

			for( const key of keys ) {
				try {
					const stat = dict.key( key )?.chunks_stat()
					if( !stat || !stat.units ) continue
					res.files += 1
					res.units += stat.units
					res.loaded += stat.loaded
					res.bytes_total += stat.bytes_total
					res.bytes_loaded += stat.bytes_loaded
				} catch {
					res.pending += 1
				}
			}

			this.audit( res )
		}

		@ $mol_action
		refresh() {
			$mol_wire_async( this ).audit_run()
			return null
		}

		@ $mol_action
		reset() {
			$bog_music_mem.reset()
			return null
		}

	}

}
