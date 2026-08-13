namespace $ {

	/**
	 * Серверная половина скробблинга: держит api-секрет и session key юзера,
	 * подписывает запросы к last.fm. Клиенту (bog/music/scrobble) остаётся
	 * сказать «играет вот это» — ни ключей, ни подписи он не видит.
	 *
	 * Маршруты (монтируются в bog/music/srv/tube — один процесс на бокс;
	 * токеном класс тут не зовём: mam читает и комментарии, а встречная
	 * ссылка замкнула бы граф модулей):
	 * - GET /fm/login?code=&back=  → редирект на подтверждение last.fm
	 * - GET /fm/callback?code=&token= → обмен токена на сессию, возврат в приложение
	 * - GET /fm/status?code=       → { user }
	 * - GET /fm/now?code=&artist=&track=&duration=
	 * - GET /fm/scrobble?code=&artist=&track=&duration=&ts=
	 * - GET /fm/logout?code=
	 *
	 * Без BOG_MUSIC_FM_KEY/SECRET маршруты отвечают 503 и ничего не ломают.
	 */
	export class $bog_music_srv_fm extends $mol_object {

		static ROOT = 'https://ws.audioscrobbler.com/2.0/'

		protected static _instance: $bog_music_srv_fm | null = null

		static instance(): $bog_music_srv_fm {
			if (!this._instance) {
				this._instance = new $bog_music_srv_fm
				this._instance.load()
			}
			return this._instance
		}

		key() { return String(process.env.BOG_MUSIC_FM_KEY ?? '') }
		secret() { return String(process.env.BOG_MUSIC_FM_SECRET ?? '') }
		state_path() { return String(process.env.BOG_MUSIC_FM_STATE ?? '') }

		/** Публичный origin этого сервера — last.fm вернёт юзера сюда. */
		public_base(req: any): string {
			const env = String(process.env.BOG_MUSIC_FM_BASE ?? '')
			if (env) return env.replace(/\/+$/, '')
			const proto = String(req.headers?.['x-forwarded-proto'] ?? 'https')
			const host = String(req.headers?.host ?? '')
			return `${proto}://${host}`
		}

		/** code → сессия last.fm */
		protected sessions = new Map<string, { key: string, name: string }>()
		/** code → куда вернуть юзера после подтверждения */
		protected backs = new Map<string, string>()

		// ---------- подпись ----------

		/**
		 * api_sig: все параметры (кроме format и callback) в алфавитном порядке
		 * склеиваются как имя+значение, в хвост — секрет, от всего md5.
		 */
		sign(params: Record<string, string>): string {
			const body = Object.keys(params).sort()
				.filter(name => name !== 'format' && name !== 'callback')
				.map(name => name + params[name])
				.join('')
			return $node['crypto'].createHash('md5').update(body + this.secret(), 'utf8').digest('hex')
		}

		async call(params: Record<string, string>, method: 'GET' | 'POST'): Promise<any> {
			const signed = { ...params, api_key: this.key() }
			const query = new URLSearchParams({ ...signed, api_sig: this.sign(signed), format: 'json' })
			const resp = method === 'GET'
				? await fetch(`${$bog_music_srv_fm.ROOT}?${query}`)
				: await fetch($bog_music_srv_fm.ROOT, {
					method: 'POST',
					headers: { 'content-type': 'application/x-www-form-urlencoded' },
					body: String(query),
				})
			const json: any = await resp.json()
			if (json?.error) throw new Error(`last.fm ${json.error}: ${json.message}`)
			return json
		}

		// ---------- HTTP ----------

		/** true = запрос наш и уже отвечен. */
		handle(req: any, res: any): boolean {
			const path = String(req.path ?? '')
			if (!path.startsWith('/fm/')) return false

			if (path === '/fm/health') {
				res.end(this.key() && this.secret() ? 'ok' : 'no keys')
				return true
			}
			if (!this.key() || !this.secret()) {
				this.fail(res, 503, 'scrobbling disabled')
				return true
			}

			const code = String(req.query?.code ?? '')
			if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
				this.fail(res, 400, 'bad code')
				return true
			}
			res.setHeader('Cache-Control', 'no-store')

			switch (path) {
				case '/fm/login': return this.login(req, res, code)
				case '/fm/callback': {
					this.callback(req, res, code)
					return true
				}
				case '/fm/status': {
					this.json(res, { user: this.sessions.get(code)?.name ?? '' })
					return true
				}
				case '/fm/logout': {
					this.sessions.delete(code)
					this.save()
					this.json(res, { ok: true })
					return true
				}
				case '/fm/now':
				case '/fm/scrobble': {
					this.track(req, res, code, path === '/fm/scrobble')
					return true
				}
			}

			this.fail(res, 404, 'unknown method')
			return true
		}

		login(req: any, res: any, code: string): boolean {
			const back = String(req.query?.back ?? '')
			if (/^https?:\/\//.test(back)) this.backs.set(code, back)
			else this.backs.delete(code)
			const cb = `${this.public_base(req)}/fm/callback?code=${encodeURIComponent(code)}`
			res.statusCode = 302
			res.setHeader('Location', `https://www.last.fm/api/auth/?api_key=${encodeURIComponent(this.key())}&cb=${encodeURIComponent(cb)}`)
			res.end()
			return true
		}

		async callback(req: any, res: any, code: string) {
			const token = String(req.query?.token ?? '')
			if (!token) {
				this.page(res, 'Last.fm не прислал токен. Попробуй ещё раз из приложения.')
				return
			}
			try {
				const answer = await this.call({ method: 'auth.getSession', token }, 'GET')
				const session = answer?.session
				if (!session?.key) throw new Error('нет ключа сессии')
				this.sessions.set(code, { key: String(session.key), name: String(session.name ?? '') })
				this.save()
				const back = this.backs.get(code)
				this.backs.delete(code)
				if (back) {
					res.statusCode = 302
					res.setHeader('Location', back)
					res.end()
					return
				}
				this.page(res, `Готово, ${session.name}. Возвращайся в Bog Music.`)
			} catch (e: any) {
				console.warn('[fm] getSession:', e?.message ?? e)
				this.page(res, 'Не получилось подключить last.fm: ' + (e?.message ?? e))
			}
		}

		async track(req: any, res: any, code: string, scrobble: boolean) {
			const session = this.sessions.get(code)
			if (!session) {
				this.fail(res, 401, 'not linked')
				return
			}
			const artist = String(req.query?.artist ?? '').slice(0, 200)
			const name = String(req.query?.track ?? '').slice(0, 200)
			if (!artist || !name) {
				// Трек без исполнителя last.fm не примет — это не ошибка клиента,
				// просто в теге пусто (частый случай у файлов из Телеграма).
				this.json(res, { ok: false, skipped: 'no artist' })
				return
			}
			const params: Record<string, string> = {
				method: scrobble ? 'track.scrobble' : 'track.updateNowPlaying',
				artist,
				track: name,
				sk: session.key,
			}
			const duration = Number(req.query?.duration ?? 0)
			if (duration > 0) params.duration = String(Math.round(duration))
			if (scrobble) {
				const ts = Number(req.query?.ts ?? 0)
				params.timestamp = String(ts > 0 ? Math.round(ts) : Math.floor(Date.now() / 1000))
			}
			try {
				await this.call(params, 'POST')
				this.json(res, { ok: true })
			} catch (e: any) {
				console.warn('[fm] ' + params.method + ':', e?.message ?? e)
				this.fail(res, 502, String(e?.message ?? e))
			}
		}

		json(res: any, data: unknown) {
			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify(data))
		}

		page(res: any, text: string) {
			res.setHeader('Content-Type', 'text/html; charset=utf-8')
			res.end(`<!doctype html><meta charset="utf-8"><title>Bog Music</title>`
				+ `<body style="font:16px system-ui;padding:2rem">${text}</body>`)
		}

		fail(res: any, code: number, error: string) {
			res.statusCode = code
			res.setHeader('Content-Type', 'application/json')
			try { res.end(JSON.stringify({ error })) } catch {}
		}

		// ---------- состояние на диске ----------

		/** Сессий мало и меняются они редко — пишем сразу. */
		save() {
			const path = this.state_path()
			if (!path) return
			try {
				$node['fs'].writeFileSync(path, JSON.stringify(Array.from(this.sessions.entries())))
			} catch (e: any) {
				console.warn('[fm] save failed:', e?.message)
			}
		}

		load() {
			const path = this.state_path()
			if (!path) return
			try {
				if (!$node['fs'].existsSync(path)) return
				this.sessions = new Map(JSON.parse($node['fs'].readFileSync(path, 'utf8')))
				console.info('[fm] сессий загружено:', this.sessions.size)
			} catch (e: any) {
				console.warn('[fm] load failed:', e?.message)
			}
		}

	}

}
