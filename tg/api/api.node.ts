namespace $ {

	/** Трек, пересланный боту и ожидающий переезда в baza. */
	export interface $bog_music_tg_item {
		/** `${chat_id}_${message_id}` — идентификатор в очереди. */
		id: string
		/** file_unique_id Телеграма: один и тот же файл в любом чате даёт один uid. */
		uid: string
		file_id: string
		title: string
		performer: string
		file_name: string
		duration: number
		size: number
		mime: string
		added: number
	}

	/**
	 * Телеграм-бот как источник музыки: юзер пересылает боту аудио, приложение
	 * забирает его и кладёт в свой home land.
	 *
	 * Байты у нас НЕ хранятся: в очереди лежат только метаданные и `file_id`,
	 * файл тянется из Телеграма в момент, когда клиент за ним пришёл. Диск не
	 * растёт, чистить нечего.
	 *
	 * Маршруты (монтируются в bog/music/tube/api — один процесс на весь бокс;
	 * упоминать там класс токеном нельзя, mam ловит его и в комментарии, а
	 * встречная ссылка замкнула бы граф модулей):
	 * - GET /tg/status?code= → { bot, linked, name, pending }
	 * - GET /tg/inbox?code=  → $bog_music_tg_item[]
	 * - GET /tg/file?code=&id= → байты трека
	 * - GET /tg/ack?code=&id=  → выкинуть из очереди (клиент записал в baza)
	 *
	 * `code` — секрет устройства (см. $bog_music_tg на клиенте): им и линкуется
	 * чат, и читается очередь. Без токена бота (BOG_MUSIC_TG_TOKEN) модуль
	 * молчит и отвечает 503, не мешая остальному серверу.
	 */
	export class $bog_music_tg_api extends $mol_object {

		/** Bot API отдаёт боту файлы только до 20 МБ. */
		static MAX_FILE = 20 * 1024 * 1024

		/** Сколько файлов проксируем одновременно. */
		static MAX_JOBS = 4

		/** Протухание неразобранной очереди. */
		static TTL = 30 * 24 * 3600e3

		protected static _instance: $bog_music_tg_api | null = null

		static instance(): $bog_music_tg_api {
			if (!this._instance) {
				this._instance = new $bog_music_tg_api
				this._instance.start()
			}
			return this._instance
		}

		token() {
			return String(process.env.BOG_MUSIC_TG_TOKEN ?? '')
		}

		/** Файл состояния (докер-том). Пусто — живём только в памяти. */
		state_path() {
			return String(process.env.BOG_MUSIC_TG_STATE ?? '')
		}

		/** chat_id → code */
		protected chats = new Map<number, string>()
		/** code → очередь треков */
		protected queues = new Map<string, $bog_music_tg_item[]>()
		/** code → имя из Телеграма (для «подключено к Кириллу») */
		protected names = new Map<string, string>()

		protected bot_name = ''
		protected offset = 0
		protected jobs = 0
		protected started = false

		start() {
			if (this.started) return
			this.started = true
			if (!this.token()) {
				console.warn('[tg] BOG_MUSIC_TG_TOKEN не задан — бот выключен')
				return
			}
			this.load()
			this.call('getMe', {})
				.then((me: any) => {
					this.bot_name = String(me?.username ?? '')
					console.info('[tg] бот @' + this.bot_name)
				})
				.catch((e: any) => console.error('[tg] getMe:', e?.message))
			this.poll()
		}

		// ---------- Bot API ----------

		async call(method: string, params: Record<string, unknown>): Promise<any> {
			const resp = await fetch(`https://api.telegram.org/bot${this.token()}/${method}`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(params),
			})
			const json: any = await resp.json()
			if (!json?.ok) throw new Error(`${method}: ${json?.description ?? resp.status}`)
			return json.result
		}

		say(chat_id: number, text: string) {
			this.call('sendMessage', { chat_id, text, disable_notification: true })
				.catch((e: any) => console.warn('[tg] sendMessage:', e?.message))
		}

		/**
		 * Long polling вместо вебхука: не нужен ни публичный путь с секретом, ни
		 * правка nginx. Один висящий запрос раз в 25 с стоит дешевле.
		 */
		async poll() {
			while (true) {
				try {
					const updates = await this.call('getUpdates', {
						offset: this.offset,
						timeout: 25,
						allowed_updates: ['message'],
					})
					for (const update of updates ?? []) {
						this.offset = Number(update.update_id) + 1
						try {
							this.on_message(update.message)
						} catch (e: any) {
							console.warn('[tg] update failed:', e?.message ?? e)
						}
					}
				} catch (e: any) {
					console.warn('[tg] poll:', e?.message ?? e)
					await new Promise(done => setTimeout(done, 5000))
				}
			}
		}

		on_message(msg: any) {
			if (!msg) return
			const chat_id = Number(msg.chat?.id)
			if (!Number.isFinite(chat_id)) return

			const text = String(msg.text ?? '')
			if (text.startsWith('/start')) {
				this.on_start(chat_id, msg, text.slice('/start'.length).trim())
				return
			}

			const audio = this.audio_of(msg)
			if (!audio) {
				if (text) this.say(chat_id, 'Пришли или перешли сюда аудиофайл — он появится в приложении.')
				return
			}

			const code = this.chats.get(chat_id)
			if (!code) {
				this.say(chat_id, 'Сначала нажми «Подключить Телеграм» в приложении — оттуда придёт ссылка на этот чат.')
				return
			}

			if (Number(audio.file_size ?? 0) > $bog_music_tg_api.MAX_FILE) {
				this.say(chat_id, `«${audio.title ?? audio.file_name ?? 'Трек'}» больше 20 МБ — Телеграм не отдаёт ботам такие файлы.`)
				return
			}

			const item: $bog_music_tg_item = {
				id: `${chat_id}_${msg.message_id}`,
				uid: String(audio.file_unique_id ?? ''),
				file_id: String(audio.file_id ?? ''),
				title: String(audio.title ?? ''),
				performer: String(audio.performer ?? ''),
				file_name: String(audio.file_name ?? ''),
				duration: Number(audio.duration ?? 0) || 0,
				size: Number(audio.file_size ?? 0) || 0,
				mime: String(audio.mime_type ?? 'audio/mpeg'),
				added: Date.now(),
			}
			if (!item.file_id) return

			const queue = this.queue(code)
			// Один и тот же файл из разных чатов даёт одинаковый uid — не плодим.
			if (item.uid && queue.some(q => q.uid === item.uid)) {
				this.say(chat_id, 'Этот трек уже в очереди.')
				return
			}
			queue.push(item)
			this.save()

			const label = [item.performer, item.title].filter(Boolean).join(' — ') || item.file_name || 'Трек'
			this.say(chat_id, `✓ ${label} — заберу, когда откроешь приложение.`)
		}

		/** Аудио-сообщение или документ с аудио-mime (так шлют mp3 «файлом»). */
		audio_of(msg: any): any {
			if (msg.audio) return msg.audio
			const doc = msg.document
			if (doc && /^audio\//.test(String(doc.mime_type ?? ''))) return doc
			if (doc && /\.(mp3|m4a|aac|ogg|opus|flac|wav)$/i.test(String(doc.file_name ?? ''))) return doc
			return null
		}

		on_start(chat_id: number, msg: any, code: string) {
			if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
				this.say(chat_id, 'Открой приложение и нажми «Подключить Телеграм» — оттуда придёт ссылка с кодом.')
				return
			}
			// Перепривязка старого чата к тому же коду: одному аккаунту — один чат.
			for (const [chat, bound] of this.chats) {
				if (bound === code && chat !== chat_id) this.chats.delete(chat)
			}
			this.chats.set(chat_id, code)
			const name = String(msg.chat?.first_name ?? msg.from?.first_name ?? '')
			if (name) this.names.set(code, name)
			this.queue(code)
			this.save()
			this.say(chat_id, 'Готово. Теперь пересылай сюда любые треки — они приедут в Bog Music.')
		}

		// ---------- очередь ----------

		queue(code: string): $bog_music_tg_item[] {
			let queue = this.queues.get(code)
			if (!queue) {
				queue = []
				this.queues.set(code, queue)
			}
			const dead = Date.now() - $bog_music_tg_api.TTL
			if (queue.some(item => item.added < dead)) {
				queue = queue.filter(item => item.added >= dead)
				this.queues.set(code, queue)
			}
			return queue
		}

		linked(code: string): boolean {
			for (const bound of this.chats.values()) if (bound === code) return true
			return false
		}

		// ---------- HTTP ----------

		/** true = запрос наш и уже отвечен. */
		handle(req: any, res: any): boolean {
			const path = String(req.path ?? '')
			if (!path.startsWith('/tg/')) return false

			if (path === '/tg/health') {
				res.end(this.token() ? 'ok' : 'no token')
				return true
			}
			if (!this.token()) {
				this.fail(res, 503, 'bot disabled')
				return true
			}

			const code = String(req.query?.code ?? '')
			if (!/^[A-Za-z0-9_-]{8,64}$/.test(code)) {
				this.fail(res, 400, 'bad code')
				return true
			}
			// Очередь без ответов кэшировать нельзя — статус меняется от пересылки.
			res.setHeader('Cache-Control', 'no-store')

			if (path === '/tg/status') {
				this.json(res, {
					bot: this.bot_name,
					linked: this.linked(code),
					name: this.names.get(code) ?? '',
					pending: this.queue(code).length,
				})
				return true
			}

			if (path === '/tg/inbox') {
				// file_id наружу не отдаём: по нему любой бот может скачать файл.
				this.json(res, this.queue(code).map(item => ({
					id: item.id,
					uid: item.uid,
					title: item.title,
					performer: item.performer,
					file_name: item.file_name,
					duration: item.duration,
					size: item.size,
					mime: item.mime,
				})))
				return true
			}

			if (path === '/tg/ack') {
				const id = String(req.query?.id ?? '')
				const queue = this.queue(code)
				const idx = queue.findIndex(item => item.id === id)
				if (idx >= 0) {
					queue.splice(idx, 1)
					this.save()
				}
				this.json(res, { ok: true, pending: queue.length })
				return true
			}

			if (path === '/tg/file') {
				this.file(req, res, code)
				return true
			}

			this.fail(res, 404, 'unknown method')
			return true
		}

		json(res: any, data: unknown) {
			res.setHeader('Content-Type', 'application/json')
			res.end(JSON.stringify(data))
		}

		fail(res: any, code: number, error: string) {
			res.statusCode = code
			res.setHeader('Content-Type', 'application/json')
			try { res.end(JSON.stringify({ error })) } catch {}
		}

		/** Проксируем байты из Телеграма клиенту, не складывая на диск. */
		async file(req: any, res: any, code: string) {
			const id = String(req.query?.id ?? '')
			const item = this.queue(code).find(item => item.id === id)
			if (!item) {
				this.fail(res, 404, 'no such track')
				return
			}
			if (this.jobs >= $bog_music_tg_api.MAX_JOBS) {
				res.statusCode = 503
				res.setHeader('Retry-After', '3')
				try { res.end('{"error":"busy"}') } catch {}
				return
			}
			this.jobs++
			try {
				const info = await this.call('getFile', { file_id: item.file_id })
				const path = String(info?.file_path ?? '')
				if (!path) throw new Error('getFile: нет file_path')
				const source = await fetch(`https://api.telegram.org/file/bot${this.token()}/${path}`)
				if (!source.ok || !source.body) throw new Error(`file ${source.status}`)

				res.setHeader('Content-Type', item.mime || 'audio/mpeg')
				if (item.size) res.setHeader('Content-Length', String(item.size))

				const reader = source.body.getReader()
				let gone = false
				req.on('close', () => { gone = true; reader.cancel().catch(() => {}) })
				while (!gone) {
					const chunk = await reader.read()
					if (chunk.done) break
					if (!res.write(Buffer.from(chunk.value))) {
						await new Promise(done => res.once('drain', done))
					}
				}
				res.end()
			} catch (e: any) {
				console.warn('[tg] file failed:', item.id, e?.message ?? e)
				if (!res.headersSent) this.fail(res, 502, 'file fetch failed')
				else try { res.end() } catch {}
			} finally {
				this.jobs--
			}
		}

		// ---------- состояние на диске ----------

		/**
		 * Пишем сразу, без дебаунса: файл на пару килобайт, а отложенная запись
		 * теряла бы пересланные треки при рестарте контейнера — Телеграм их уже
		 * не отдаст, getUpdates подтверждает приём следующим же опросом.
		 */
		save() {
			const path = this.state_path()
			if (!path) return
			try {
				$node['fs'].writeFileSync(path, JSON.stringify({
					chats: Array.from(this.chats.entries()),
					queues: Array.from(this.queues.entries()),
					names: Array.from(this.names.entries()),
				}))
			} catch (e: any) {
				console.warn('[tg] save failed:', e?.message)
			}
		}

		load() {
			const path = this.state_path()
			if (!path) return
			try {
				if (!$node['fs'].existsSync(path)) return
				const raw = JSON.parse($node['fs'].readFileSync(path, 'utf8'))
				this.chats = new Map(raw.chats ?? [])
				this.queues = new Map(raw.queues ?? [])
				this.names = new Map(raw.names ?? [])
				console.info('[tg] состояние загружено:', this.chats.size, 'чатов')
			} catch (e: any) {
				console.warn('[tg] load failed:', e?.message)
			}
		}

	}

}
