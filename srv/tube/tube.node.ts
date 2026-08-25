namespace $ {

	const { spawn } = $node['child_process']
	const fs = $node['fs']
	const os = $node['os']
	const path = $node['path']

	/**
	 * Сервер поиска и скачивания музыки из YouTube (yt-dlp + ffmpeg).
	 *
	 * GET /tube/health     → ok
	 * GET /tube/search?q=  → [{ id, title, channel, duration }]
	 * GET /tube/audio?id=  → байты m4a (audio/mp4)
	 *
	 * Запуск: node bog/music/srv/tube/-/node.js (в докере, см. srv/deploy/).
	 */
	export class $bog_music_srv_tube extends $mol_server {

		override port() {
			return Number(process.env.BOG_MUSIC_TUBE_PORT ?? 9092)
		}

		// Предохранитель от форк-бомбы: каждый search/audio форкает yt-dlp
		// (search ~5с CPU, audio ~10-30с). Без лимита спам с прода забивает
		// CPU/память и вешает всю машину (вплоть до отказа ssh). Держим не
		// больше MAX_JOBS одновременно, лишние запросы сразу отвечают 503,
		// а не копят процессы.
		static MAX_JOBS = 3
		private active_jobs = 0

		/** Разрешить новый yt-dlp job? Если да — резервирует слот. */
		private take_slot(): boolean {
			if (this.active_jobs >= $bog_music_srv_tube.MAX_JOBS) return false
			this.active_jobs++
			return true
		}

		private free_slot() {
			if (this.active_jobs > 0) this.active_jobs--
		}

		private busy(res: any) {
			res.statusCode = 503
			res.setHeader('Retry-After', '5')
			try { res.end('{"error":"busy"}') } catch {}
		}

		override expressHandlers(): readonly $mol_server_middleware[] {
			// Телеграм-бот ($bog_music_srv_tg) поднимается здесь же: на боксе
			// 1 CPU / ~960МБ, где рядом baza, отдельный node стоил бы ещё ~70МБ
			// RSS и свой TLS-серверблок. Логика бота — в своём модуле, тут
			// только монтирование их маршрутов.
			// Звёздочку после слэша в комментариях тут не писать: mam режет
			// блок-комментарии раньше строчных, и такой «/» со звездой съедает
			// весь код до ближайшего конца doc-комментария — модули молча
			// выпадают из бандла.
			const tg = $bog_music_srv_tg.instance()
			const fm = $bog_music_srv_fm.instance()
			return [
				this.expressCors(),
				(req: any, res: any, next: any) => {
					if (tg.handle(req, res)) return
					if (fm.handle(req, res)) return
					next()
				},
				this.expressApi(),
			]
		}

		expressApi(): $mol_server_middleware {
			return (req: any, res: any, next: any) => {
				if (req.method !== 'GET') return next()
				if (req.path === '/tube/health') { res.end('ok'); return }
				if (req.path === '/tube/search') { this.search(req, res); return }
				if (req.path === '/tube/audio') { this.audio(req, res); return }
				next()
			}
		}

		search(req: any, res: any) {
			const q = String(req.query.q ?? '').slice(0, 200)
			if (!q) {
				res.statusCode = 400
				res.end('{"error":"no query"}')
				return
			}
			if (!this.take_slot()) { this.busy(res); return }
			const child = spawn('yt-dlp', [
				'--dump-json',
				'--flat-playlist',
				'--no-warnings',
				`ytsearch15:${q}`,
			])
			child.on('error', (e: any) => {
				console.error('[tube] spawn fail:', e?.message)
				res.statusCode = 500
				try { res.end('{"error":"yt-dlp not available"}') } catch {}
			})
			let out = ''
			let err = ''
			child.stdout.on('data', (d: any) => out += d)
			child.stderr.on('data', (d: any) => err += d)
			const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 30000)
			// Клиент ушёл (закрыл вкладку/отменил) — не держим yt-dlp зря.
			req.on('close', () => { try { child.kill('SIGKILL') } catch {} })
			child.on('close', (code: number) => {
				clearTimeout(timer)
				this.free_slot()
				if (res.writableEnded) return
				if (code !== 0 && !out) {
					console.error('[tube] search fail:', err.slice(0, 300))
					res.statusCode = 502
					res.end(JSON.stringify({ error: 'search failed' }))
					return
				}
				const items = out.split('\n')
					.filter(Boolean)
					.map(line => { try { return JSON.parse(line) } catch { return null } })
					.filter(Boolean)
					.map((v: any) => ({
						id: String(v.id ?? ''),
						title: String(v.title ?? ''),
						channel: String(v.channel ?? v.uploader ?? ''),
						duration: Number(v.duration ?? 0) || 0,
					}))
					.filter((v: any) => v.id)
				res.setHeader('Content-Type', 'application/json')
				// Кэш: одинаковые запросы часты (переключение вкладок, повторный
				// ввод). 5 мин в браузере снимают нагрузку и убирают скелетон.
				res.setHeader('Cache-Control', 'public, max-age=300')
				res.end(JSON.stringify(items))
			})
		}

		// ---------- кеш готовых m4a ----------
		//
		// Готовый файл оставляем на диске и переиспользуем. Прослушивание и
		// следующее за ним «скачать» — это два запроса к одному id, и раньше
		// сервер дважды гонял yt-dlp с ffmpeg (по 10-30 с CPU) ради одного и
		// того же трека. Кеш-заголовки от этого не спасают: <audio> ходит
		// Range-запросами, а скачивание — обычным fetch, и переиспользовать
		// ответ между ними браузер не обязан.
		//
		// Объём ограничен: на боксе 10 ГБ диска под всё, включая baza и VPN, и
		// незаметно растущий кеш положил бы хост целиком.

		static cache_dir() {
			return String(process.env.BOG_MUSIC_TUBE_CACHE ?? '')
		}

		static cache_limit() {
			return Number(process.env.BOG_MUSIC_TUBE_CACHE_MB ?? 256) * 1024 * 1024
		}

		private cache_made = false

		/** Каталог кеша, создав его при первом обращении. '' — кеш недоступен. */
		private cache_ensure() {
			const dir = $bog_music_srv_tube.cache_dir()
			if (!dir) return ''
			if (this.cache_made) return dir
			try {
				fs.mkdirSync(dir, { recursive: true })
				this.cache_made = true
				return dir
			} catch (e: any) {
				console.warn('[tube] cache dir:', e?.message)
				return ''
			}
		}

		private cache_file(id: string) {
			const dir = $bog_music_srv_tube.cache_dir()
			return dir ? path.join(dir, `${id}.m4a`) : ''
		}

		/** Путь готового файла, либо '' — кеш выключен или промах. */
		private cache_hit(id: string) {
			const file = this.cache_file(id)
			if (!file) return ''
			try {
				if (!fs.statSync(file).size) return ''
				// mtime — отметка последнего использования для вытеснения.
				const now = new Date()
				fs.utimesSync(file, now, now)
				return file
			} catch {
				return ''
			}
		}

		/** Вытесняем самые давние, пока кеш не влезет в лимит. */
		private cache_trim() {
			const dir = this.cache_ensure()
			if (!dir) return
			try {
				const files = fs.readdirSync(dir)
					.filter((name: string) => name.endsWith('.m4a'))
					.map((name: string) => {
						const full = path.join(dir, name)
						const stat = fs.statSync(full)
						return { full, size: stat.size, used: stat.mtimeMs }
					})
				let total = files.reduce((sum: number, f: any) => sum + f.size, 0)
				const limit = $bog_music_srv_tube.cache_limit()
				if (total <= limit) return
				files.sort((a: any, b: any) => a.used - b.used)
				for (const f of files) {
					if (total <= limit) break
					try {
						fs.rmSync(f.full, { force: true })
						total -= f.size
						console.info('[tube] кеш: вытеснен', path.basename(f.full))
					} catch {}
				}
			} catch (e: any) {
				console.warn('[tube] cache trim:', e?.message)
			}
		}

		/**
		 * Один yt-dlp-job на id, сколько бы клиентов его ни просило: клик
		 * «скачать» во время прослушивания не должен заводить вторую качалку.
		 * Ждущих считаем, чтобы уход одного клиента не убивал работу остальных.
		 */
		private jobs = new Map<string, { done: Promise<string>, waiters: number, kill: () => void }>()

		private audio_job(id: string): { done: Promise<string>, waiters: number, kill: () => void } {

			const running = this.jobs.get(id)
			if (running) {
				console.info('[tube] кеш: присоединился к идущей качалке', id)
				return running
			}

			let kill = () => {}

			const done = new Promise<string>((ok, fail) => {

				if (!this.take_slot()) return fail(new Error('busy'))

				const dir = this.cache_ensure()
				// Качаем рядом с кешем: rename в пределах одной ФС атомарен, и
				// недокачанный файл не попадёт в выдачу под видом готового.
				const tmp_dir = dir || fs.mkdtempSync(path.join(os.tmpdir(), 'tube-'))
				const part = path.join(tmp_dir, `${id}.part.m4a`)
				const target = dir ? this.cache_file(id) : part

				console.info('[tube] качаю', id)
				const child = spawn('yt-dlp', [
					'-f', 'bestaudio[ext=m4a]/bestaudio',
					'-x', '--audio-format', 'm4a',
					'--no-warnings', '--no-playlist',
					'-o', part,
					`https://www.youtube.com/watch?v=${id}`,
				])
				kill = () => { try { child.kill('SIGKILL') } catch {} }

				child.on('error', (e: any) => {
					console.error('[tube] spawn fail:', e?.message)
					this.free_slot()
					fail(e)
				})

				let err = ''
				child.stderr.on('data', (d: any) => err += d)
				// 3 мин достаточно на трек; раньше 10 мин копили процессы при спаме.
				const timer = setTimeout(kill, 3 * 60000)

				child.on('close', (code: number) => {
					clearTimeout(timer)
					this.free_slot()
					if (code !== 0 || !fs.existsSync(part)) {
						console.error('[tube] audio fail:', id, err.slice(0, 300))
						try { fs.rmSync(part, { force: true }) } catch {}
						return fail(new Error('yt-dlp failed'))
					}
					if (target !== part) {
						try { fs.renameSync(part, target) } catch (e: any) {
							console.warn('[tube] cache put:', e?.message)
							return ok(part)
						}
						console.info('[tube] кеш: положен', id)
						this.cache_trim()
					}
					ok(target)
				})

			})

			const job = { done, waiters: 0, kill }
			this.jobs.set(id, job)
			done.catch(() => {}).then(() => { this.jobs.delete(id) })
			return job
		}

		/**
		 * Отдаём готовый m4a. Конверсия нужна ради iOS Safari, который не играет
		 * webm/opus, а ffmpeg-постпроцессинг yt-dlp не умеет в stdout — поэтому
		 * через файл.
		 */
		audio(req: any, res: any) {

			const id = String(req.query.id ?? '')
			if (!/^[\w-]{6,16}$/.test(id)) {
				res.statusCode = 400
				res.end()
				return
			}

			const cached = this.cache_hit(id)
			if (cached) {
				console.info('[tube] кеш: попадание', id)
				this.send_audio(res, cached, false)
				return
			}

			const job = this.audio_job(id)
			job.waiters++
			// Ушёл последний ждущий — работу можно бросить. Пока ждёт хоть один,
			// чужой disconnect job не убивает.
			req.on('close', () => {
				job.waiters--
				if (job.waiters <= 0) job.kill()
			})

			job.done.then(
				(file: string) => {
					if (res.writableEnded) return
					this.send_audio(res, file, !this.cache_ensure())
				},
				(e: any) => {
					if (res.writableEnded) return
					if (e?.message === 'busy') return this.busy(res)
					res.statusCode = 502
					try { res.end() } catch {}
				},
			)
		}

		/** Отдать файл. `temp` — удалить после отдачи (режим без кеша). */
		private send_audio(res: any, file: string, temp: boolean) {
			const drop = () => {
				if (!temp) return
				try { fs.rmSync(path.dirname(file), { recursive: true, force: true }) } catch {}
			}
			try {
				res.setHeader('Content-Type', 'audio/mp4')
				res.setHeader('Content-Length', String(fs.statSync(file).size))
				// Аудио трека по id неизменно — кэшируем надолго (сутки, immutable).
				res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
			} catch (e: any) {
				console.warn('[tube] send:', e?.message)
				res.statusCode = 502
				drop()
				try { res.end() } catch {}
				return
			}
			const stream = fs.createReadStream(file)
			stream.pipe(res)
			stream.on('close', drop)
			stream.on('error', () => { drop(); try { res.end() } catch {} })
		}

	}

}
