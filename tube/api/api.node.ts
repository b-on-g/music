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
	 * Запуск: node bog/music/tube/api/-/node.js (в докере, см. tube/deploy/).
	 */
	export class $bog_music_tube_api extends $mol_server {

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
			if (this.active_jobs >= $bog_music_tube_api.MAX_JOBS) return false
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
			return [
				this.expressCors(),
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

		/**
		 * Качаем с конверсией в m4a во временный файл (ffmpeg-постпроцессинг
		 * yt-dlp не умеет в stdout), отдаём и удаляем. m4a — ради iOS Safari,
		 * который не играет webm/opus.
		 */
		audio(req: any, res: any) {
			const id = String(req.query.id ?? '')
			if (!/^[\w-]{6,16}$/.test(id)) {
				res.statusCode = 400
				res.end()
				return
			}
			if (!this.take_slot()) { this.busy(res); return }
			const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tube-'))
			const file = path.join(dir, `${id}.m4a`)
			const cleanup = () => { try { fs.rmSync(dir, { recursive: true, force: true }) } catch {} }

			const child = spawn('yt-dlp', [
				'-f', 'bestaudio[ext=m4a]/bestaudio',
				'-x', '--audio-format', 'm4a',
				'--no-warnings', '--no-playlist',
				'-o', file,
				`https://www.youtube.com/watch?v=${id}`,
			])
			child.on('error', (e: any) => {
				console.error('[tube] spawn fail:', e?.message)
				cleanup()
				res.statusCode = 500
				try { res.end() } catch {}
			})
			let err = ''
			child.stderr.on('data', (d: any) => err += d)
			// 3 мин достаточно на трек; раньше 10 мин копили процессы при спаме.
			const timer = setTimeout(() => { try { child.kill('SIGKILL') } catch {} }, 3 * 60000)
			req.on('close', () => { try { child.kill('SIGKILL') } catch {} })

			child.on('close', (code: number) => {
				clearTimeout(timer)
				this.free_slot()
				if (res.writableEnded) return
				if (code !== 0 || !fs.existsSync(file)) {
					console.error('[tube] audio fail:', id, err.slice(0, 300))
					res.statusCode = 502
					cleanup()
					try { res.end() } catch {}
					return
				}
				res.setHeader('Content-Type', 'audio/mp4')
				res.setHeader('Content-Length', String(fs.statSync(file).size))
				// Аудио трека по id неизменно — кэшируем надолго (сутки, immutable).
				// Экономит и трафик, и дорогие yt-dlp-перекачки.
				res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
				const stream = fs.createReadStream(file)
				stream.pipe(res)
				stream.on('close', cleanup)
				stream.on('error', () => { cleanup(); try { res.end() } catch {} })
			})
		}

	}

}
