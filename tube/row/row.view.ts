namespace $.$$ {
	export class $bog_music_tube_row extends $.$bog_music_tube_row {

		Cover() {
			if (!this.cover()) return null as any
			return super.Cover()
		}

		Cover_placeholder() {
			if (this.cover()) return null as any
			return super.Cover_placeholder()
		}

	}
}
