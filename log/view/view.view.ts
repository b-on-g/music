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

		log_rows() {
			const records = this.records()
			if( !records.length ) return [ this.Head(), this.Empty() ]
			return [ this.Head(), ... records.map( ( _, index )=> this.Row( index ) ) ]
		}

		count_label() {
			const records = this.records()
			const errors = records.filter( rec => rec.kind === 'err' ).length
			return errors
				? `${ records.length } записей, из них ошибок ${ errors }`
				: `${ records.length } записей`
		}

		record( index: number ) {
			return this.records()[ index ]
		}

		time( index: number ) {
			const rec = this.record( index )
			return rec ? new Date( rec.time ).toISOString().slice( 11, 19 ) : ''
		}

		text( index: number ) {
			return this.record( index )?.text ?? ''
		}

		/** Ошибки подсвечиваем темой, чтобы находить их взглядом. */
		row_theme( index: number ) {
			return this.record( index )?.kind === 'err' ? '$mol_theme_special' : '$mol_theme_base'
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
			return null
		}

	}

}
