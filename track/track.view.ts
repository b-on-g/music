namespace $.$$ {
	export class $bog_music_track extends $.$bog_music_track {

		track() {
			return $bog_music_account_baza.home().track(this.key())
		}

		title() {
			return this.track()?.Title()?.val() ?? ''
		}

		place() {
			return this.account().place(this.key())
		}

		holder_name() {
			const holders = this.account().holders_other(this.key())
			return holders.length ? this.account().device_name(holders[0]) : ''
		}

		artist() {
			const artist = this.track()?.Artist()?.val() ?? ''
			const status = $bog_music_beam.instance().status(this.key())
			const where = status
				|| ( this.place() === 'remote' ? `на «${this.holder_name()}»` : '' )
				|| ( this.place() === 'lost' ? 'файла нет' : '' )
			return [artist, where].filter(Boolean).join(' · ')
		}

		cover() {
			return this.track()?.cover() ?? ''
		}

		Cover() {
			return this.cover() ? super.Cover() : null as any
		}

		Cover_placeholder() {
			return this.cover() ? null as any : super.Cover_placeholder()
		}

		cached() {
			return this.place() === 'disk'
		}

		blob_pending() {
			return !this.cached()
		}

		can_drag() {
			return !this.archive_mode()
		}

		@$mol_action
		menu_toggle() {
			$bog_music_pop_toggle(this.Menu())
			return null
		}

		menu_items() {
			return this.archive_mode()
				? [ this.Restore(), this.Delete_forever() ]
				: [
					... this.place() === 'remote' ? [ this.Pull() ] : [],
					this.Demote(),
					... this.can_drop_cache() ? [ this.Delete() ] : [],
					... this.move_targets().map( id => this.Move( id ) ),
					this.Archive(),
				]
		}

		pull_label() {
			return `Перенести с «${this.holder_name()}»`
		}

		@$mol_action
		pull_click() {
			this.Menu().showed(false)
			$bog_music_beam.instance().pull_one(this.key())
			return null
		}

		account() {
			return $bog_music_account_baza.home()
		}

		move_targets() {
			return this.account().playlists().map( pl => pl.id )
		}

		move_member( id: string ) {
			return this.account().list_has( id, this.key() )
		}

		move_content( id: string ) {
			return [
				this.move_member( id ) ? this.Move_cut_icon( id ) : this.Move_add_icon( id ),
				this.Move_label( id ),
			]
		}

		move_label( id: string ) {
			const title = this.account().playlist_title( id )
			return this.move_member( id ) ? `Убрать из «${ title }»` : `В «${ title }»`
		}

		@$mol_action
		move_click( id: string ) {
			this.Menu().showed( false )
			if( this.move_member( id ) ) this.account().list_cut( id, this.key() )
			else this.account().list_add( id, this.key() )
			return null
		}

		can_drop_cache() {
			return this.cached() && this.account().holders_other(this.key()).length > 0
		}

		@$mol_mem
		delete_asked(next?: boolean) {
			return next ?? false
		}

		content() {
			return this.delete_asked() ? [ this.Confirm() ] : super.content()
		}

		confirm_text() {
			return `Удалить «${this.title()}» навсегда?`
		}

		@$mol_action
		delete_ask() {
			this.Menu().showed(false)
			this.delete_asked(true)
			return null
		}

		@$mol_action
		delete_cancel() {
			this.delete_asked(false)
			return null
		}

		@$mol_action
		delete_confirm() {
			this.delete_asked(false)
			this.delete_forever()
			return null
		}

		on_play_click() {
			this.play(this.key())
		}

		event_drag_start(event: DragEvent) {
			if (!this.can_drag()) {
				event.preventDefault()
				return
			}
			try {
				event.dataTransfer?.setData('text/x-bog-track', '1')
				if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
			} catch {}
			this.drag_start()
		}

		event_drag_over(event: DragEvent) {
			if (!this.can_drag()) return
			event.preventDefault()
			if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
		}

		event_drop(event: DragEvent) {
			if (!this.can_drag()) return
			event.preventDefault()
			this.drop_here()
		}

		@$mol_action
		delete_cached() {
			this.Menu().showed(false)
			void this.account().drop_file(this.key())
		}

		share() {
			return $bog_music_share.instance()
		}

		share_selected() {
			return this.share().selected(this.key())
		}

		private _share_press_timer: ReturnType<typeof setTimeout> | null = null
		private _share_long_press_fired = false
		private static SHARE_LONG_PRESS_MS = 450

		share_pointer_down(event?: Event) {
			if (!event) return null
			event.stopPropagation()
			this._share_long_press_fired = false
			if (this._share_press_timer) clearTimeout(this._share_press_timer)
			this._share_press_timer = setTimeout(() => {
				this._share_press_timer = null
				this._share_long_press_fired = true
				this.share().enter(this.key())
			}, $bog_music_track.SHARE_LONG_PRESS_MS)
			return null
		}

		share_pointer_up(event?: Event) {
			if (!event) return null
			event.stopPropagation()
			if (this._share_press_timer) {
				clearTimeout(this._share_press_timer)
				this._share_press_timer = null
			}
			if (this._share_long_press_fired) return null
			const share = this.share()
			if (share.mode()) share.toggle(this.key())
			else share.share_single(this.key())
			return null
		}

		share_pointer_cancel(event?: Event) {
			if (this._share_press_timer) {
				clearTimeout(this._share_press_timer)
				this._share_press_timer = null
			}
			return null
		}

		share_pointer_leave(event?: Event) {
			return this.share_pointer_cancel(event)
		}

		@$mol_action
		demote_click() {
			this.Menu().showed(false)
			this.demote(null)
			return null
		}

		@$mol_action
		archive_click() {
			this.Menu().showed(false)
			this.archive(null)
			return null
		}

		@$mol_action
		restore_click() {
			this.Menu().showed(false)
			this.restore(null)
			return null
		}

	}
}
