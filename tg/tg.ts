namespace $ {

	/** Трек в очереди бота (то, что отдаёт /tg/inbox). */
	export interface $bog_music_tg_row {
		id: string
		uid: string
		title: string
		performer: string
		file_name: string
		duration: number
		size: number
		mime: string
	}

	export interface $bog_music_tg_status {
		bot: string
		linked: boolean
		name: string
		pending: number
	}

	/**
	 * Клиент телеграм-инбокса: юзер пересылает музыку боту, приложение забирает
	 * её и кладёт в baza. Сервер — bog/music/srv/tg, живёт в том же процессе,
	 * что и tube (см. tube/api/api.node.ts).
	 *
	 * Методы плоско-асинхронные, без @$mol_mem: очередь меняется на стороне
	 * Телеграма, и мемоизировать её нечем — опросом рулит view приложения.
	 */
	export class $bog_music_tg extends $mol_object {

		static base = 'https://tube.87.120.36.150.ip.giper.dev'

		/** Юзернейм бота. Уточняется из /tg/status, чтобы не хардкодить дважды. */
		static bot = 'bog_music_bot'

		/** Секрет устройства: им линкуется чат и читается очередь. */
		static code(): string {
			return $bog_music_code.value('bog_music_tg_code')
		}

		/** Завести код при первом подключении. Только из @$mol_action. */
		static code_ensure(): string {
			return $bog_music_code.ensure('bog_music_tg_code')
		}

		static link_url(code: string): string {
			return `https://t.me/${this.bot}?start=${encodeURIComponent(code)}`
		}

		static async status(code: string): Promise<$bog_music_tg_status> {
			const resp = await fetch(`${this.base}/tg/status?code=${encodeURIComponent(code)}`)
			if (!resp.ok) throw new Error(`tg status ${resp.status}`)
			const data = await resp.json() as $bog_music_tg_status
			if (data.bot) this.bot = data.bot
			return data
		}

		static async inbox(code: string): Promise<$bog_music_tg_row[]> {
			const resp = await fetch(`${this.base}/tg/inbox?code=${encodeURIComponent(code)}`)
			if (!resp.ok) throw new Error(`tg inbox ${resp.status}`)
			return await resp.json() as $bog_music_tg_row[]
		}

		static async file(code: string, id: string): Promise<Uint8Array> {
			const resp = await fetch(`${this.base}/tg/file?code=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`)
			if (!resp.ok) throw new Error(`tg file ${resp.status}`)
			const buffer = new Uint8Array(await resp.arrayBuffer())
			if (!buffer.byteLength) throw new Error('tg file: пустой ответ')
			return buffer
		}

		static async ack(code: string, id: string): Promise<void> {
			await fetch(`${this.base}/tg/ack?code=${encodeURIComponent(code)}&id=${encodeURIComponent(id)}`)
		}

		// Сборка метаданных для baza живёт во view приложения (tg_audio):
		// mam подключает родительский модуль к каждому вложенному, так что
		// ссылка отсюда на доменную модель утащила бы весь baza-слой в бандл
		// серверной части (tg/api) — на боксе это лишние мегабайты в RSS.

	}

}
