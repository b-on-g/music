namespace $ {

	/**
	 * Скробблинг в last.fm. Ключ приложения и session key юзера лежат на нашем
	 * сервере ($bog_music_scrobble_api): подпись запроса требует api-секрет, а
	 * ему в клиентском бандле не место. Отсюда уходят только «что играет» и
	 * «что доиграло».
	 */
	export class $bog_music_scrobble extends $mol_object {

		static base = 'https://tube.87.120.36.150.ip.giper.dev'

		static code(): string {
			return $bog_music_code.value('bog_music_fm_code')
		}

		/** Завести код при первом подключении. Только из @$mol_action. */
		static code_ensure(): string {
			return $bog_music_code.ensure('bog_music_fm_code')
		}

		/**
		 * Имя на last.fm — оно же признак «подключено». Держим локально, чтобы
		 * плеер на каждом тике проверял скробблинг синхронно и без запроса.
		 */
		static user(next?: string): string {
			return ($mol_state_local.value('bog_music_fm_user', next) as string) ?? ''
		}

		static enabled(): boolean {
			return !!this.code() && !!this.user()
		}

		/**
		 * Страница подтверждения last.fm. Возврат — на наш сервер, он меняет
		 * токен на сессию и отправляет юзера обратно в приложение. В расширении
		 * возвращаться некуда (chrome-extension:// last.fm не примет), поэтому
		 * сервер просто показывает «готово».
		 */
		static login_url(code: string): string {
			const web = location.protocol === 'https:' || location.protocol === 'http:'
			const back = web ? location.origin + location.pathname + location.search : ''
			return `${this.base}/fm/login?code=${encodeURIComponent(code)}&back=${encodeURIComponent(back)}`
		}

		/** Подтягивает имя юзера с сервера и кеширует его локально. */
		static async status(): Promise<string> {
			const code = this.code()
			if (!code) return ''
			const resp = await fetch(`${this.base}/fm/status?code=${encodeURIComponent(code)}`)
			if (!resp.ok) throw new Error(`fm status ${resp.status}`)
			const data = await resp.json() as { user: string }
			const user = String(data?.user ?? '')
			if (this.user() !== user) this.user(user)
			return user
		}

		static async logout(): Promise<void> {
			const code = this.code()
			this.user('')
			if (!code) return
			await fetch(`${this.base}/fm/logout?code=${encodeURIComponent(code)}`)
		}

		/**
		 * Пуляем и забываем: скробблинг не должен ни задерживать плеер, ни
		 * ронять его своими ошибками. keepalive — потому что отправка часто
		 * совпадает с уходом со страницы (последний трек, закрытие вкладки).
		 */
		protected static send(method: string, params: Record<string, string | number>) {
			const code = this.code()
			if (!code) return
			const query = new URLSearchParams({ code, ...params as Record<string, string> })
			fetch(`${this.base}/fm/${method}?${query}`, { keepalive: true })
				.catch(e => console.warn('[fm] ' + method + ':', e?.message ?? e))
		}

		static now_playing(artist: string, track: string, duration: number) {
			if (!this.enabled() || !track) return
			this.send('now', { artist, track, duration: Math.round(duration) || 0 })
		}

		static scrobble(artist: string, track: string, duration: number, started: number) {
			if (!this.enabled() || !track) return
			this.send('scrobble', {
				artist,
				track,
				duration: Math.round(duration) || 0,
				ts: Math.round(started),
			})
		}

	}

}
