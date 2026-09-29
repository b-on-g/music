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
			// Неблокирующая проверка: НЕ триггерит sync (иначе рендер списка поднял
			// бы загрузку всех blob-лендов разом). blob догоняет фоновый prefetch.
			return this.track()?.blob_local() ?? false
		}

		/** Blob ещё не на устройстве — строка приглушается до докачки. */
		blob_pending() {
			return !this.cached()
		}

		is_local() {
			return this.track()?.audio()?.owner_id === 0
		}

		can_drag() {
			return !this.archive_mode()
		}

		// =====================================================================
		// Меню действий: одна кнопка «⋯» вместо ряда иконок, чтобы тексту
		// доставалась вся ширина строки (на крупном шрифте иконки распирали
		// строку до одной буквы в линии).
		// =====================================================================

		@$mol_action
		menu_toggle() {
			$bog_music_pop_toggle(this.Menu())
			return null
		}

		menu_items() {
			return this.archive_mode()
				? [ this.Restore(), this.Delete_forever() ]
				: [
					this.Demote(),
					... this.can_drop_cache() ? [ this.Delete() ] : [],
					this.Archive(),
				]
		}

		/** Локальный файл с устройства больше взять неоткуда — кеш не сбрасываем. */
		can_drop_cache() {
			return !this.is_local() && this.cached()
		}

		// =====================================================================
		// Удаление навсегда — только через подтверждение прямо в строке.
		// =====================================================================

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
			this.Menu().showed(false)
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

		// Пункты меню: закрыть панель и дёрнуть действие, которое привязал
		// список ($bog_music_tracks через <=>).

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
