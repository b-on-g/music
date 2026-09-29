namespace $.$$ {
	export class $bog_music_playlists extends $.$bog_music_playlists {

		account() {
			return $bog_music_account_baza.home()
		}

		my_current() {
			return this.page() === 'my'
		}

		archive_current() {
			return this.page() === 'archive'
		}

		list_active() {
			return !this.my_current() && !this.archive_current()
		}

		own_list() {
			return this.page().startsWith('list:') ? this.page() : ''
		}

		@$mol_action
		my_click() {
			this.page('my')
		}

		@$mol_action
		archive_click() {
			this.page('archive')
		}

		list_current(next?: string) {
			if (next) this.page(next)
			return this.list_active() ? this.page() : ''
		}

		middle() {
			return [
				... Object.keys(this.list_dict()).length ? [ this.List() ] : [],
				this.Add(),
			]
		}

		@$mol_mem
		add_title(next?: string) {
			return next ?? ''
		}

		add_content() {
			return this.own_list() ? [ this.Add_panel(), this.Edit_panel() ] : [ this.Add_panel() ]
		}

		@$mol_action
		add_toggle() {
			this.remove_asked(false)
			if ($bog_music_pop_toggle(this.Add())) this.focus_later(this.Add_title())
		}

		@$mol_action
		add_submit() {
			const title = this.add_title().trim()
			if (!title) return
			const id = this.account().playlist_create(title)
			this.add_title('')
			this.Add().showed(false)
			this.page(id)
		}

		@$mol_mem
		rename_title(next?: string) {
			const id = this.own_list()
			if (next === undefined) return this.account().playlist_title(id)
			if (id && next.trim()) this.account().playlist_rename(id, next)
			return next
		}

		@$mol_action
		rename_submit() {
			this.Add().showed(false)
		}

		@$mol_mem
		remove_asked(next?: boolean) {
			this.own_list()
			return next ?? false
		}

		remove_label() {
			return this.remove_asked() ? 'Точно удалить?' : 'Удалить'
		}

		@$mol_action
		remove_click() {
			if (!this.remove_asked()) {
				this.remove_asked(true)
				return
			}
			const id = this.own_list()
			if (!id) return
			this.Add().showed(false)
			this.account().playlist_delete(id)
			this.page('my')
		}

		focus_later(field: $.$mol_view) {
			new $mol_after_frame(() => {
				try { field.focused(true) } catch {}
			})
		}

	}
}
