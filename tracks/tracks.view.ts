namespace $.$$ {
	export class $bog_music_tracks extends $.$bog_music_tracks {

		private _drag_index = -1

		@$mol_mem
		track_rows() {
			return this.track_keys().map((_: string, i: number) => this.Track(i))
		}

		track_key(index: number): string {
			return this.track_keys()[index] ?? ''
		}

		track_current(index: number) {
			const key = this.track_key(index)
			return !!key && key === this.current_key()
		}

		@$mol_action
		track_play(index: number) {
			const key = this.track_key(index)
			if (key) this.play_key(key)
		}

		track_can_drag(_index: number) {
			return !this.archive_mode()
		}

		track_drag_start(index: number) {
			this._drag_index = index
		}

		@$mol_action
		track_drop_here(index: number) {
			const from = this._drag_index
			this._drag_index = -1
			if (from < 0 || from === index) return
			this.reorder_to({ from, to: index })
		}

		@$mol_action
		track_archive(index: number) {
			const key = this.track_key(index)
			if (key) this.archive_key(key)
		}

		@$mol_action
		track_restore(index: number) {
			const key = this.track_key(index)
			if (key) this.restore_key(key)
		}

		@$mol_action
		track_delete(index: number) {
			const key = this.track_key(index)
			if (key) this.delete_key(key)
		}

	}
}
