namespace $.$$ {

	export class $bog_music_log_view extends $.$bog_music_log_view {

		/**
		 * Свежие записи сверху. Данные лежат в обычном массиве, поэтому
		 * подписаться на них нельзя — перечитываем раз в секунду по таймеру.
		 */
		records() {
			this.$.$mol_state_time.now( 1000 )
			return [ ... $bog_music_log.records ].reverse()
		}

		/**
		 * Фильтр живёт в URL, поэтому журнал по конкретному ленду открывается
		 * ссылкой: `#!log_filter=24q6G0lY_q0azSzlh`. Совпадение ищем и в ленде,
		 * и в тексте — по идентификатору, по слову из действия, по тексту ошибки.
		 */
		filter( next?: string ) {
			return this.$.$mol_state_arg.value( 'log_filter', next ) ?? ''
		}

		filtered() {
			const query = this.filter().trim().toLowerCase()
			const records = this.records()
			if( !query ) return records
			return records.filter( rec =>
				rec.land.toLowerCase().includes( query )
				|| rec.text.toLowerCase().includes( query )
			)
		}

		/** Гейт логов baza общий с самим движком — см. $bog_music_log. */
		sync_logging( next?: boolean ) {
			return $bog_music_log.sync_logging( next )
		}

		log_rows() {
			const rows: readonly $mol_view[] = this.filtered().map( ( _, index )=> this.Row( index ) )
			if( !rows.length ) return [ this.Head(), this.Filter(), this.Empty() ]
			return [ this.Head(), this.Filter(), ... rows ]
		}

		count_label() {
			const all = this.records()
			const shown = this.filtered()
			const errors = shown.filter( rec => rec.kind === 'err' ).length
			const head = shown.length === all.length
				? `${ all.length } записей`
				: `${ shown.length } из ${ all.length } записей`
			return errors ? `${ head }, ошибок ${ errors }` : head
		}

		empty_label() {
			if( this.filter().trim() ) return 'Под фильтр ничего не подошло. Очисти поле, чтобы увидеть весь журнал.'
			return 'Пока пусто. Понажимай в приложении — записи появятся здесь.'
		}

		record( index: number ) {
			return this.filtered()[ index ]
		}

		time( index: number ) {
			const rec = this.record( index )
			return rec ? new Date( rec.time ).toISOString().slice( 11, 19 ) : ''
		}

		kind_id( index: number ) {
			return this.record( index )?.kind ?? ''
		}

		kind( index: number ) {
			const kind = this.kind_id( index )
			if( kind === 'err' ) return 'ошибка'
			if( kind === 'sync' ) return 'синк'
			return 'действие'
		}

		land( index: number ) {
			return this.record( index )?.land ?? ''
		}

		text( index: number ) {
			return this.record( index )?.text ?? ''
		}

		/** Ошибки подсвечиваем темой, чтобы находить их взглядом. */
		row_theme( index: number ) {
			return this.kind_id( index ) === 'err' ? '$mol_theme_special' : '$mol_theme_base'
		}

		@ $mol_action
		copy() {
			this.$.$mol_dom_context.navigator.clipboard.writeText( $bog_music_log.dump() )
			$bog_music_log.act( 'журнал скопирован' )
			return null
		}

		@ $mol_action
		clear() {
			$bog_music_log.clear()
			$bog_music_log.act( 'журнал очищен' )
			return null
		}

	}

}
