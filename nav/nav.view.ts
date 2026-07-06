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

		@$mol_action
		feedback_click(e?: Event) {
			if (e) e.preventDefault()
			this.section('feedback')
			return null
		}

	}

}
