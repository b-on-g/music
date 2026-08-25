namespace $ {

	/**
	 * Счётчики памяти для дебага «вся фонотека в оперативке».
	 *
	 * Без цифр правки не проверить: экономия здесь — это не сделанные копии, и
	 * увидеть её можно только по размеру кучи и по числу треков, чьё содержимое
	 * реально поднято из IndexedDB.
	 *
	 * Счётчики — обычные статические поля, а не реактивные ячейки: писать в них
	 * приходится из тел вычислений (`blob()` зовётся из мемоизированных
	 * методов), а запись в ячейку оттуда роняет пересчёт. Панель вместо подписки
	 * перечитывает их по таймеру — как это уже сделано в журнале
	 * ($bog_music_log).
	 */
	export class $bog_music_mem extends $mol_object {

		/** Сколько раз материализовали Blob трека. */
		static blobs = 0
		/** Суммарный объём материализованных Blob'ов, байт. */
		static blob_bytes = 0
		/** Сколько треков запускали на воспроизведение. */
		static plays = 0

		static blob_made( bytes: number ) {
			this.blobs += 1
			this.blob_bytes += bytes
		}

		static play_started() {
			this.plays += 1
		}

		static reset() {
			this.blobs = 0
			this.blob_bytes = 0
			this.plays = 0
		}

		/**
		 * Занятая JS-куча, байт. Есть только в Chromium (в Firefox и Safari
		 * `performance.memory` нет) — 0 значит «браузер не говорит».
		 */
		static heap() {
			return Number( ( performance as any )?.memory?.usedJSHeapSize ?? 0 )
		}

		/** Потолок JS-кучи, байт. 0 — браузер не говорит. */
		static heap_limit() {
			return Number( ( performance as any )?.memory?.jsHeapSizeLimit ?? 0 )
		}

		/**
		 * Сколько нагрузки чанков реально поднято в память.
		 *
		 * Заголовок sand-юнита живёт в ленде всегда, а нагрузка (`ball`)
		 * приезжает лениво и потом уже не отпускается. Так что «сколько байт
		 * звука висит в куче» — это ровно сумма по юнитам с проставленным
		 * `_ball`/`_open`, и считается она по заголовкам, ничего не подгружая.
		 */
		static units_stat( units: readonly $giper_baza_unit_sand[] ) {

			let loaded = 0
			let bytes_total = 0
			let bytes_loaded = 0

			for( const unit of units ) {
				const size = unit.size()
				bytes_total += size
				if( !unit._ball && !unit._open ) continue
				loaded += 1
				bytes_loaded += size
			}

			return { units: units.length, loaded, bytes_total, bytes_loaded }
		}

		/** Байты человеку: 12.3 МБ. */
		static size_label( bytes: number ) {
			if( !bytes ) return '0'
			const units = [ 'Б', 'КБ', 'МБ', 'ГБ' ]
			let rank = 0
			let value = bytes
			while( value >= 1024 && rank < units.length - 1 ) {
				value /= 1024
				rank += 1
			}
			return `${ value.toFixed( rank ? 1 : 0 ) } ${ units[ rank ] }`
		}

	}

}
