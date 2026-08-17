namespace $ {

	export type $bog_music_log_record = {
		readonly time: number
		readonly kind: 'act' | 'err'
		readonly text: string
	}

	/**
	 * Журнал действий и ошибок для разбора багов с телефона, где консоли нет.
	 *
	 * Записи держатся в обычном массиве, а не в реактивной ячейке: писать в
	 * журнал приходится из любых мест, включая тела реактивных вычислений, а
	 * запись в ячейку оттуда роняет пересчёт. Страница вместо подписки на
	 * данные перечитывает их по таймеру.
	 */
	export class $bog_music_log extends $mol_object {

		/** Сколько записей держим. Дальше вытесняются старые. */
		static limit = 500

		static records = [] as $bog_music_log_record[]

		static add( kind: $bog_music_log_record['kind'], text: string ) {
			this.records.push({ time: Date.now(), kind, text: String( text ).slice( 0, 500 ) })
			if( this.records.length > this.limit ) this.records.splice( 0, this.records.length - this.limit )
		}

		/** Действие пользователя или приложения. */
		static act( text: string ) {
			this.add( 'act', text )
		}

		/** Ошибка. Пишется и руками, и автоматически из общего обработчика. */
		static err( text: string ) {
			this.add( 'err', text )
		}

		/** Перехват необработанных ошибок. Вызывается один раз при старте. */
		@ $mol_mem
		static init() {

			const handler: $mol_report_handler_type = ( report: any )=> {
				const text = report?.message ?? report?.error?.message ?? String( report )
				const place = report?.place ? ` @ ${ report.place }` : ''
				this.add( 'err', text + place )
			}

			$mol_report_handler_all.add( handler )

			return { destructor: ()=> $mol_report_handler_all.delete( handler ) }
		}

		static clear() {
			this.records = []
		}

		/** Журнал текстом — чтобы переслать себе или приложить к багу. */
		static dump() {
			return this.records.map( rec => {
				const time = new Date( rec.time ).toISOString().slice( 11, 23 )
				return `${ time } ${ rec.kind === 'err' ? 'ОШИБКА' : 'действие' } ${ rec.text }`
			} ).join( '\n' )
		}

	}

}
