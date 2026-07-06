namespace $ {

	/** Результат поиска на сервере tube (bog/music/tube/api). */
	export interface $bog_music_tube_item {
		id: string
		title: string
		channel: string
		duration: number
	}

	/**
	 * Клиент поиска и скачивания музыки из YouTube. Сервер — наш
	 * $bog_music_tube_api в докере (yt-dlp + ffmpeg), см. tube/deploy/.
	 */
	export class $bog_music_tube extends $mol_object {

		static base = 'https://tube.87.120.36.150.ip.giper.dev'

		/** Поиск. Wire-метод: suspend'ится пока грузится. */
		@$mol_mem_key
		static search(query: string): $bog_music_tube_item[] {
			const q = query.trim()
			if (!q) return []
			return $mol_fetch.json(
				`${this.base}/tube/search?q=${encodeURIComponent(q)}`
			) as any ?? []
		}

		/** URL стрима аудио — для прослушивания без скачивания в baza. */
		static audio_url(id: string): string {
			return `${this.base}/tube/audio?id=${encodeURIComponent(id)}`
		}

		/** URL превью-обложки YouTube (строится по id, без запроса к серверу). */
		static cover_url(id: string): string {
			return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`
		}

		/** Аудио-байты трека (m4a) — для скачивания в baza. */
		static async audio_bytes(id: string): Promise<Uint8Array> {
			const resp = await fetch(this.audio_url(id))
			if (!resp.ok) throw new Error(`tube audio ${resp.status}`)
			const buf = new Uint8Array(await resp.arrayBuffer())
			if (!buf.byteLength) throw new Error('tube audio: пустой ответ')
			return buf
		}

	}

}
