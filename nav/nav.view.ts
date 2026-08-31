namespace $.$$ {

	export class $bog_music_nav extends $.$bog_music_nav {

		music_active() { return this.section() === 'music' ? 'on' : 'off' }
		search_active() { return this.section() === 'search' ? 'on' : 'off' }
		account_active() { return this.section() === 'account' ? 'on' : 'off' }
		feedback_active() { return this.section() === 'feedback' ? 'on' : 'off' }

		@$mol_action
		music_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('music')
			return null
		}

		@$mol_action
		search_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('search')
			return null
		}

		@$mol_action
		account_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('account')
			return null
		}

		logs_active() { return this.section() === 'logs' ? 'on' : 'off' }

		/**
		 * Вкладка журнала — только для владельца приложения. Сравнивается
		 * публичный идентификатор личности, а не ключ: ключ в коде держать
		 * нельзя, он даёт полный доступ к аккаунту.
		 */
		static owner_lords = [
			'rkya36Pg_4GhW4PYB',
			'xSwlxBfW_flwwJqOO',
			'24q6G0lY_q0azSzlh',
		]

		Tab_logs() {
			try {
				const self = this.$.$giper_baza_auth.current().pass().lord().str
				if( !$bog_music_nav.owner_lords.includes( self ) ) return null as any
			} catch( error ) {
				return null as any
			}
			return super.Tab_logs()
		}

		@$mol_action
		logs_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('logs')
			return null
		}

		@$mol_action
		feedback_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('feedback')
			return null
		}

	}

}
