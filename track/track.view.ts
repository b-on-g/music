namespace $.$$ {
	export class $bog_vk_track extends $.$bog_vk_track {
		audio_data() {
			return this.audio() as $bog_vk_api_audio | null
		}

		title() {
			return this.audio_data()?.title ?? ''
		}

		artist() {
			return this.audio_data()?.artist ?? ''
		}

		cover() {
			return this.audio_data()?.album?.thumb?.photo_300 ?? ''
		}

		Cover() {
			if (!this.cover()) return null as any
			return super.Cover()
		}

		Cover_placeholder() {
			if (this.cover()) return null as any
			return super.Cover_placeholder()
		}


		@$mol_mem
		cached(next?: boolean) {
			const audio = this.audio_data()
			if (!audio) return false
			if (next !== undefined) return next
			try {
				return $bog_vk_app.Root(0).is_cached(audio)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return false
			}
		}

		is_local() {
			return this.audio_data()?.owner_id === 0
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
			if (!this.archive_mode()) return null as any
			if (this.is_local()) return null as any
			if (!this.cached()) return null as any
			return super.Delete()
		}

		on_play_click() {
			this.play(this.audio())
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

		delete_cached() {
			const audio = this.audio_data()
			if (!audio) return
			$bog_vk_app.Root(0).drop_blob(audio)
			this.cached(false)
		}

		// =========================================================================
		// Share — long-press = вход в multi-select, click = single share / toggle
		// =========================================================================

		private _share_press_timer: ReturnType<typeof setTimeout> | null = null
		private _share_long_press_fired = false
		private static SHARE_LONG_PRESS_MS = 450

		@$mol_mem
		share_selected() {
			const audio = this.audio_data()
			if (!audio) return false
			try {
				return $bog_vk_app.Root(0).share_is_selected(audio)
			} catch (e: any) {
				if (e instanceof Promise) throw e
				return false
			}
		}

		share_pointer_down(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			e.stopPropagation()
			this._share_long_press_fired = false
			if (this._share_press_timer) clearTimeout(this._share_press_timer)
			this._share_press_timer = setTimeout(() => {
				this._share_press_timer = null
				this._share_long_press_fired = true
				try {
					const audio = this.audio_data()
					if (audio) $bog_vk_app.Root(0).share_enter(audio)
				} catch (err) {
					// audio_data может бросить Promise при загрузке baza —
					// глотаем, long-press теряется, пользователь повторит.
				}
			}, $bog_vk_track.SHARE_LONG_PRESS_MS)
			return null
		}

		share_pointer_up(event?: Event) {
			if (!event) return null
			const e = event as PointerEvent
			e.stopPropagation()
			if (this._share_press_timer) {
				clearTimeout(this._share_press_timer)
				this._share_press_timer = null
			}
			if (this._share_long_press_fired) return null
			try {
				const audio = this.audio_data()
				if (!audio) return null
				const app = $bog_vk_app.Root(0)
				if (app.share_mode()) app.share_toggle(audio)
				else app.share_single(audio)
			} catch (err) {
				// audio_data() / share_mode() могут бросить Promise при загрузке
				// baza. Глотаем — пользователь повторит, повторный wire-retry
				// не нужен (он бы ничего полезного не делал, audio тот же).
			}
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
