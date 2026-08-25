namespace $ {

	/**
	 * `act` — действие пользователя или приложения, `sync` — событие обмена с
	 * Гипер Базой, `err` — ошибка (своя или пойманная общим обработчиком).
	 */
	export type $bog_music_log_kind = 'act' | 'sync' | 'err'

	export type $bog_music_log_record = {
		readonly time: number
		readonly kind: $bog_music_log_kind
		readonly text: string
		/** Ленд, которого касается запись. Пусто — запись не про ленд. */
		readonly land: string
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
		static limit = 2000

		static records = [] as $bog_music_log_record[]

		static add( kind: $bog_music_log_kind, text: string, land = '' ) {
			this.records.push({ time: Date.now(), kind, text: String( text ).slice( 0, 500 ), land })
			if( this.records.length > this.limit ) this.records.splice( 0, this.records.length - this.limit )
		}

		/** Действие пользователя или приложения. */
		static act( text: string, land = '' ) {
			this.add( 'act', text, land )
		}

		/** Событие обмена с Гипер Базой. */
		static sync( text: string, land = '' ) {
			this.add( 'sync', text, land )
		}

		/** Ошибка. Пишется и руками, и автоматически из общего обработчика. */
		static err( text: string, land = '' ) {
			this.add( 'err', text, land )
		}

		// =====================================================================
		// Логи Гипер Базы
		// =====================================================================

		/**
		 * Baza пишет события через `$mol_log3_*`, но только когда взведён
		 * URL-аргумент `giper_baza_log` — его же читает `$giper_baza_log()`.
		 * Гейт общий, поэтому переключатель в журнале дёргает именно его.
		 */
		static sync_logging( next?: boolean ) {
			if( next === undefined ) return $mol_state_arg.value( 'giper_baza_log' ) !== null
			$mol_state_arg.value( 'giper_baza_log', next ? '1' : null )
			return next
		}

		/**
		 * Ленд из `place` события. Baza подписывает события местом вида
		 * `$giper_baza_mine_fs.land<24q6G0lY_q0azSzlh>.store<>` — вытаскиваем
		 * оттуда идентификатор, чтобы журнал можно было отфильтровать по ленду.
		 */
		static land_of( place: unknown ) {
			return String( place ?? '' ).match( /land<([^>]*)>/ )?.[ 1 ] ?? ''
		}

		/** Событие baza одной строкой: сообщение плюс осмысленные поля. */
		static event_text( event: $mol_log3_event<{}> ) {
			const parts = [ String( event.message ) ]
			for( const key of Object.keys( event ) ) {
				if( key === 'message' || key === 'place' || key === 'time' ) continue
				parts.push( `${ key }=${ String( event[ key ] ).slice( 0, 80 ) }` )
			}
			const place = String( event.place ?? '' )
			if( place ) parts.push( `@ ${ place.slice( 0, 120 ) }` )
			return parts.join( ' ' )
		}

		/**
		 * Зеркалит события baza в журнал. Консольные логгеры — обычные `let` на
		 * `$`, поэтому оборачиваем их, сохраняя возврат: у `$mol_log3_area` это
		 * функция закрытия группы, потерять её нельзя.
		 */
		static hook_baza() {

			const mirror = ( kind: $bog_music_log_kind, event: $mol_log3_event<{}> ) => {
				this.add( kind, this.event_text( event ), this.land_of( event.place ) )
			}

			const rise = $.$mol_log3_rise
			$.$mol_log3_rise = function( this: $, event ) { mirror( 'sync', event ); return rise.call( this, event ) }

			const done = $.$mol_log3_done
			$.$mol_log3_done = function( this: $, event ) { mirror( 'sync', event ); return done.call( this, event ) }

			const come = $.$mol_log3_come
			$.$mol_log3_come = function( this: $, event ) { mirror( 'sync', event ); return come.call( this, event ) }

			const warn = $.$mol_log3_warn
			$.$mol_log3_warn = function( this: $, event ) { mirror( 'sync', event ); return warn.call( this, event ) }

			const fail = $.$mol_log3_fail
			$.$mol_log3_fail = function( this: $, event ) { mirror( 'err', event ); return fail.call( this, event ) }

		}

		/** Перехват необработанных ошибок. Вызывается один раз при старте. */
		@ $mol_mem
		static init() {

			const handler: $mol_report_handler_type = ( report: any )=> {
				const text = report?.message ?? report?.error?.message ?? String( report )
				const place = report?.place ? ` @ ${ report.place }` : ''
				this.add( 'err', text + place, this.land_of( report?.place ) )
			}

			$mol_report_handler_all.add( handler )
			this.hook_baza()

			return { destructor: ()=> $mol_report_handler_all.delete( handler ) }
		}

		static clear() {
			this.records = []
		}

		/** Журнал текстом — чтобы переслать себе или приложить к багу. */
		static dump() {
			return this.records.map( rec => {
				const time = new Date( rec.time ).toISOString().slice( 11, 23 )
				const kind = rec.kind === 'err' ? 'ОШИБКА' : rec.kind === 'sync' ? 'синк' : 'действие'
				const land = rec.land ? ` [${ rec.land }]` : ''
				return `${ time } ${ kind }${ land } ${ rec.text }`
			} ).join( '\n' )
		}

	}

}
