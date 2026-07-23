namespace $.$$ {
	export class $bog_music_track extends $.$bog_music_track {

		/** Доменная модель трека по ключу. */
		track() {
			return $bog_music_account_baza.home().track(this.key())
		}

		title() {
			return this.track()?.Title()?.val() ?? ''
		}

		artist() {
			return this.track()?.Artist()?.val() ?? ''
		}

		cached() {
			return this.track()?.cached() ?? false
		}

		is_local() {
			return this.track()?.audio()?.owner_id === 0
		}

		can_drag() {
			return !this.archive_mode()
		}

		Archive() {
			if (this.archive_mode()) return null as any
			return super.Archive()
		}

		Restore() {
			if (!this.archive_mode()) return null as any
			return super.Restore()
		}

		Delete_forever() {
			if (!this.archive_mode()) return null as any
			return super.Delete_forever()
		}

		Delete() {
			if (this.archive_mode()) return null as any
			if (this.is_local()) return null as any
			if (!this.cached()) return null as any
			return super.Delete()
		}

		on_play_click() {
			// Клик играет всегда: если blob ещё докачивается, плеер сам дождётся
			// (blob_wait suspend'ится до досинка) и заиграет без второго клика.
			// Приглушение/мигание строки — лишь индикатор, клик не блокирует.
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
			$bog_music_account_baza.home().drop_blob(this.key())
		}

		// =====================================================================
		// Share: long-press = вход в multi-select, клик = single share / toggle
		// =====================================================================

		share() {
			return $bog_music_share.instance()
		}

		share_selected() {
			return this.share().selected(this.key())
		}

		// Состояние жеста long-press: не reactive-состояние, а таймер DOM-жеста.
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

	}
}
