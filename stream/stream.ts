namespace $ {

	/**
	 * Стрим трека через Service Worker + HTTP Range.
	 *
	 * `<audio src>` не умеет ReadableStream напрямую. SW перехватывает
	 * `bog-music-stream?key=…` (query — чтобы $mol_offline не кешировал),
	 * страница отдаёт окно из `$mws_baza_file.read_range` через peer.@$mol_action.
	 * Play стартует сразу; в RAM — окно чанков, не весь файл.
	 */
	export class $bog_music_stream extends $mol_object {

		static readonly name = 'bog-music-stream'

		private static _page_ready = false
		private static _sw_ready = false

		/** Кеш meta в SW — иначе каждый Range снова round-trip на страницу. */
		private static _meta_cache = new Map< string, { total: number, mime: string } >()
		/** Слить параллельные одинаковые Range (браузер часто дублирует). */
		private static _inflight = new Map< string, Promise< any > >()
		/** Готовые окна в SW — повторные одинаковые Range без page round-trip. */
		private static _range_cache = new Map< string, {
			bytes: ArrayBuffer
			total: number
			mime: string
			start: number
			end: number
		} >()
		private static _range_cache_max = 48

		/** URL для `<audio src>` / fetch. Stable string — sync play на iOS. */
		static url( key: string ): string {
			const url = new URL( typeof location !== 'undefined' ? location.href : 'http://localhost/' )
			url.hash = ''
			url.search = ''
			url.pathname = url.pathname.replace( /[^/]*$/, this.name )
			url.searchParams.set( 'key', key )
			return url.href
		}

		static matches( request_url: string ): string | null {
			try {
				const url = new URL( request_url )
				if( !url.pathname.endsWith( '/' + this.name ) && !url.pathname.endsWith( this.name ) ) {
					return null
				}
				return url.searchParams.get( 'key' )
			} catch {
				return null
			}
		}

		/** SW API есть (PWA). Не путать с controller — после reload он бывает null секунду. */
		static supported(): boolean {
			if( typeof navigator === 'undefined' ) return false
			return Boolean( navigator.serviceWorker )
		}

		/** SW уже контролирует страницу — sync play без await. */
		static active(): boolean {
			return this.supported() && Boolean( navigator.serviceWorker!.controller )
		}

		/** Дождаться controller (после reload / первой установки). */
		static async when_ready(): Promise< boolean > {
			if( !this.supported() ) return false
			try {
				await navigator.serviceWorker!.ready
				return Boolean( navigator.serviceWorker!.controller )
			} catch {
				return false
			}
		}

		/** Страница: слушать запросы Range от SW. */
		static install_page() {
			if( typeof window === 'undefined' ) return
			if( this._page_ready ) return
			this._page_ready = true
			navigator.serviceWorker?.addEventListener( 'message', event => {
				void this.on_sw_message( event )
			} )
		}

		/** SW-контекст (web.js как worker): отвечать на fetch Range. */
		static install_sw() {
			// Страница — window есть. Node-тесты — нет ни window, ни self.
			if( typeof window !== 'undefined' ) return
			if( typeof self === 'undefined' ) return
			if( this._sw_ready ) return
			this._sw_ready = true
			;( self as any ).addEventListener( 'fetch', ( event: any ) => {
				const key = this.matches( event.request.url )
				if( !key ) return
				event.respondWith( this.sw_respond( event.request, key ) )
			} )
		}

		/** Прогреть начало трека (первый кусок) — для авто-next. */
		static warm( key: string ) {
			if( !this.supported() || !key ) return
			const go = () => fetch( this.url( key ), {
				headers: { Range: 'bytes=0-65535' },
				credentials: 'same-origin',
			} ).catch( () => {} )
			if( this.active() ) go()
			else void this.when_ready().then( ok => { if( ok ) go() } )
		}

		
		/**
		 * Sync API для SW→page. `$mol_wire_async` — только на границе
		 * (MessagePort); внутри — обычный pull / @$mol_action.
		 */
		static peer = new class extends $mol_object {

			@ $mol_action
			meta( key: string ) {
				return $bog_music_stream.meta_sync( key )
			}

			@ $mol_action
			range( key: string, start: number, end: number ) {
				return $bog_music_stream.range_sync( key, start, end )
			}

		}

		private static async on_sw_message( event: MessageEvent ) {
			const data = event.data
			if( !data || ( data.type !== 'bog_music_stream_range' && data.type !== 'bog_music_stream_meta' ) ) {
				return
			}
			const port = event.ports?.[0]
			if( !port ) return
			try {
				if( data.type === 'bog_music_stream_meta' ) {
					const meta = await $mol_wire_async( this.peer ).meta( data.key as string )
					port.postMessage({ ok: true, ...meta })
					return
				}
				const result = await $mol_wire_async( this.peer ).range(
					data.key as string,
					data.start as number,
					data.end as number,
				)
				port.postMessage(
					{
						ok: true,
						total: result.total,
						mime: result.mime,
						start: result.start,
						end: result.end,
						bytes: result.bytes,
					},
					[ result.bytes ],
				)
			} catch( e: any ) {
				port.postMessage({
					ok: false,
					error: e?.message ?? String( e ),
				})
			}
		}

		private static file_of( key: string ): $mws_baza_file {
			const track = $bog_music_account_baza.home().track( key )
			if( !track ) throw new Error( `stream: no track ${ key }` )

			let file = track.File()?.remote() as $mws_baza_file | null
			if( !file ) {
				track.land().sync()
				file = track.File()?.remote() as $mws_baza_file | null
			}
			if( !file ) throw new Error( `stream: no file ${ key }` )
			file.land().sync()

			if( typeof file.byte_length !== 'function' ) {
				throw new Error( 'stream: $mws_baza_file not installed' )
			}
			return file
		}

		static meta_sync( key: string ) {
			const file = this.file_of( key )
			const mime_raw = file.type()
			const mime = !mime_raw || mime_raw === 'application/octet-stream'
				? 'audio/mpeg'
				: mime_raw
			return { total: file.byte_length(), mime }
		}

		/** Байты [start, end); звать из peer.@$mol_action. */
		static range_sync( key: string, start: number, end: number ) {
			const file = this.file_of( key )
			const total = file.byte_length()
			const mime_raw = file.type()
			const mime = !mime_raw || mime_raw === 'application/octet-stream'
				? 'audio/mpeg'
				: mime_raw

			const from = Math.max( 0, Math.min( total, start | 0 ) )
			const to = end < 0
				? total
				: Math.max( from, Math.min( total, end | 0 ) )
			const slice = file.read_range( from, to )
			const bytes = slice.buffer.slice(
				slice.byteOffset,
				slice.byteOffset + slice.byteLength,
			) as ArrayBuffer

			return { bytes, total, mime, start: from, end: to }
		}

		private static async sw_client(): Promise<{ postMessage: Function } | null > {
			const list = await ( self as any ).clients.matchAll({
				type: 'window',
				includeUncontrolled: true,
			}) as ReadonlyArray<{ postMessage: Function }>
			return list[0] ?? null
		}

		private static sw_call< T >(
			client: { postMessage: Function },
			message: object,
		): Promise< T > {
			return new Promise( resolve => {
				const channel = new MessageChannel()
				const timer = setTimeout( () => {
					resolve({ ok: false, error: 'stream: page timeout' } as T )
				}, 60000 )
				channel.port1.onmessage = ( event: MessageEvent ) => {
					clearTimeout( timer )
					resolve( event.data )
				}
				client.postMessage( message, [ channel.port2 ] )
			})
		}

		private static async sw_meta( key: string ) {
			const cached = this._meta_cache.get( key )
			if( cached ) return { ok: true as const, ...cached }

			const client = await this.sw_client()
			if( !client ) return { ok: false as const, error: 'stream: no page client' }
			const res = await this.sw_call<{ ok: true, total: number, mime: string } | { ok: false, error: string } >(
				client,
				{ type: 'bog_music_stream_meta', key },
			)
			if( res.ok ) this._meta_cache.set( key, { total: res.total, mime: res.mime } )
			return res
		}

		private static range_cache_put( id: string, entry: {
			bytes: ArrayBuffer
			total: number
			mime: string
			start: number
			end: number
		} ) {
			if( this._range_cache.has( id ) ) this._range_cache.delete( id )
			this._range_cache.set( id, entry )
			while( this._range_cache.size > this._range_cache_max ) {
				const oldest = this._range_cache.keys().next().value
				if( oldest === undefined ) break
				this._range_cache.delete( oldest )
			}
		}

		private static async sw_ask(
			key: string,
			start: number,
			end: number,
		): Promise<{
			ok: true
			bytes: ArrayBuffer
			total: number
			mime: string
			start: number
			end: number
		} | { ok: false, error: string }> {

			const id = `${ key }:${ start }:${ end }`
			const hit = this._range_cache.get( id )
			if( hit ) {
				return {
					ok: true,
					bytes: hit.bytes.slice( 0 ),
					total: hit.total,
					mime: hit.mime,
					start: hit.start,
					end: hit.end,
				}
			}

			const wait = this._inflight.get( id )
			if( wait ) return wait

			const client = await this.sw_client()
			if( !client ) return { ok: false, error: 'stream: no page client' }

			const task = this.sw_call<{
				ok: true
				bytes: ArrayBuffer
				total: number
				mime: string
				start: number
				end: number
			} | { ok: false, error: string } >( client, {
				type: 'bog_music_stream_range',
				key,
				start,
				end,
			} ).then( res => {
				if( res.ok ) {
					this.range_cache_put( id, {
						bytes: res.bytes.slice( 0 ),
						total: res.total,
						mime: res.mime,
						start: res.start,
						end: res.end,
					} )
				}
				return res
			} ).finally( () => this._inflight.delete( id ) )

			this._inflight.set( id, task )
			return task
		}

		/**
		 * Потолок только для open-ended `bytes=N-`.
		 * Явно запрошенный диапазон отдаём целиком — иначе Chromium
		 * долбит один и тот же Range десятками повторов.
		 */
		private static open_ended_window = 2 * 1024 * 1024

		private static async sw_respond( request: Request, key: string ): Promise< Response > {

			const range_hdr = request.headers.get( 'Range' )

			// Без Range — progressive stream.
			if( !range_hdr ) {
				return this.sw_respond_stream( key )
			}

			let start = 0
			let end = -1 // exclusive; -1 = open-ended
			let open_ended = false

			const m = /^bytes=(\d*)-(\d*)$/i.exec( range_hdr.trim() )
			if( m ) {
				if( m[1] !== '' ) start = parseInt( m[1], 10 )
				if( m[2] !== '' ) end = parseInt( m[2], 10 ) + 1
				else open_ended = true
			}

			const meta = await this.sw_meta( key )
			if( !meta.ok ) {
				return new Response( meta.error, { status: 503 } )
			}
			const total = meta.total
			if( start >= total ) {
				return new Response( null, {
					status: 416,
					headers: { 'Content-Range': `bytes */${ total }` },
				})
			}

			if( open_ended || end < 0 ) {
				end = Math.min( total, start + this.open_ended_window )
			} else {
				// Явный Range — как просили (медиа-пробы обычно крошечные).
				end = Math.min( total, end )
			}

			const data = await this.sw_ask( key, start, end )
			if( !data.ok ) {
				return new Response( data.error, { status: 503 } )
			}

			return new Response( data.bytes, {
				status: 206,
				headers: {
					'Content-Type': data.mime || meta.mime,
					'Accept-Ranges': 'bytes',
					'Content-Length': String( data.bytes.byteLength ),
					'Content-Range': `bytes ${ data.start }-${ data.end - 1 }/${ total }`,
					'Cache-Control': 'no-store',
				},
			})
		}

		/** GET без Range: тело — поток окон, Content-Length = полный размер. */
		private static async sw_respond_stream( key: string ): Promise< Response > {

			const meta = await this.sw_meta( key )
			if( !meta.ok ) {
				return new Response( meta.error, { status: 503 } )
			}

			const total = meta.total
			const mime = meta.mime
			const win = this.open_ended_window
			let pos = 0

			const stream = new ReadableStream< Uint8Array >({
				async pull( controller ) {
					if( pos >= total ) {
						controller.close()
						return
					}
					const next = Math.min( total, pos + win )
					const data = await $bog_music_stream.sw_ask( key, pos, next )
					if( !data.ok ) {
						controller.error( new Error( data.error ) )
						return
					}
					controller.enqueue( new Uint8Array( data.bytes ) )
					pos = data.end
				},
			})

			return new Response( stream, {
				status: 200,
				headers: {
					'Content-Type': mime,
					'Accept-Ranges': 'bytes',
					'Content-Length': String( total ),
					'Cache-Control': 'no-store',
				},
			})
		}

	}

	// Регистрация на загрузке бандла (и страница, и SW — один web.js).
	$bog_music_stream.install_sw()
	$bog_music_stream.install_page()

}
