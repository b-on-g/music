namespace $ {

	export type $bog_music_stream_slice = {
		ok: true
		bytes: ArrayBuffer
		total: number
		mime: string
		start: number
		end: number
	} | { ok: false, error: string }

	export class $bog_music_stream extends $mol_object {

		static readonly name = 'bog-music-stream'

		static readonly ping = '~ping'

		static _page_ready = false
		static _sw_ready = false
		static _served = null as null | boolean
		static _served_wait = null as null | Promise< boolean >

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
				if( !url.pathname.endsWith( this.name ) ) return null
				return url.searchParams.get( 'key' )
			} catch {
				return null
			}
		}

		static supported(): boolean {
			if( typeof navigator === 'undefined' ) return false
			return Boolean( navigator.serviceWorker )
		}

		static active(): boolean {
			return this.supported() && Boolean( navigator.serviceWorker!.controller ) && this._served === true
		}

		static served(): Promise< boolean > {
			if( this._served_wait ) return this._served_wait
			return this._served_wait = fetch( this.url( this.ping ), { cache: 'no-store' } )
				.then( res => res.status === 204 )
				.catch( () => false )
				.then( ok => {
					this._served = ok
					if( !ok ) void navigator.serviceWorker!.getRegistration().then( reg => reg?.update() ).catch( () => {} )
					return ok
				} )
		}

		static async when_ready(): Promise< boolean > {
			if( !this.supported() ) return false
			try {
				await navigator.serviceWorker!.ready
				if( !navigator.serviceWorker!.controller ) return false
				return await this.served()
			} catch {
				return false
			}
		}

		static install_page() {
			if( typeof window === 'undefined' ) return
			if( this._page_ready ) return
			this._page_ready = true
			navigator.serviceWorker?.addEventListener( 'message', event => {
				void this.on_sw_message( event )
			} )
			navigator.serviceWorker?.addEventListener( 'controllerchange', () => {
				this._served = null
				this._served_wait = null
				void this.served()
			} )
			if( navigator.serviceWorker?.controller ) void this.served()
		}

		static install_sw() {
			if( typeof window !== 'undefined' ) return
			if( typeof self === 'undefined' ) return
			if( typeof ( self as any ).clients === 'undefined' ) return
			if( this._sw_ready ) return
			this._sw_ready = true
			;( self as any ).addEventListener( 'fetch', ( event: any ) => {
				const key = this.matches( event.request.url )
				if( !key ) return
				if( key === this.ping ) return event.respondWith( new Response( null, { status: 204 } ) )
				event.respondWith( this.sw_respond( event.request, key ) )
			} )
		}

		static warm( key: string ) {
			if( !this.supported() || !key ) return
			const go = () => fetch( this.url( key ), {
				headers: { Range: 'bytes=0-65535' },
				credentials: 'same-origin',
			} ).catch( () => {} )
			if( this.active() ) go()
			else void this.when_ready().then( ok => { if( ok ) go() } )
		}

		static async read( key: string, start: number, end: number ): Promise< $bog_music_stream_slice > {
			try {
				const slice = await $bog_music_disk.bytes( key, start, end )
				if( !slice ) return { ok: false, error: `stream: no file ${ key }` }
				return { ok: true, ...slice }
			} catch( error: any ) {
				return { ok: false, error: error?.message ?? String( error ) }
			}
		}

		static async on_sw_message( event: MessageEvent ) {
			const data = event.data
			if( data?.type !== 'bog_music_stream_range' ) return
			const port = event.ports?.[ 0 ]
			if( !port ) return
			const slice = await this.read( data.key, data.start, data.end )
			port.postMessage( slice, slice.ok ? [ slice.bytes ] : [] )
		}

		static async sw_client(): Promise< { postMessage: Function } | null > {
			const list = await ( self as any ).clients.matchAll({
				type: 'window',
				includeUncontrolled: true,
			}) as ReadonlyArray< { postMessage: Function } >
			return list[ 0 ] ?? null
		}

		static sw_page( key: string, start: number, end: number ) {
			return new Promise< $bog_music_stream_slice >( async done => {
				const client = await this.sw_client()
				if( !client ) return done({ ok: false, error: 'stream: no page client' })
				const channel = new MessageChannel()
				const timer = setTimeout( () => done({ ok: false, error: 'stream: page timeout' }), 30000 )
				channel.port1.onmessage = ( event: MessageEvent ) => {
					clearTimeout( timer )
					done( event.data )
				}
				client.postMessage( { type: 'bog_music_stream_range', key, start, end }, [ channel.port2 ] )
			} )
		}

		static async sw_read( key: string, start: number, end: number ) {
			if( $bog_music_disk.supported() ) return this.read( key, start, end )
			return this.sw_page( key, start, end )
		}

		static open_ended_window = 512 * 1024

		static async sw_respond( request: Request, key: string ): Promise< Response > {

			const range = request.headers.get( 'Range' )
			let start = 0
			let end = -1

			const m = range ? /^bytes=(\d*)-(\d*)$/i.exec( range.trim() ) : null
			if( m ) {
				if( m[ 1 ] !== '' ) start = parseInt( m[ 1 ], 10 )
				end = m[ 2 ] !== '' ? parseInt( m[ 2 ], 10 ) + 1 : start + this.open_ended_window
			}

			const data = await this.sw_read( key, start, end )
			if( !data.ok ) return new Response( data.error, { status: 404 } )

			if( !range ) {
				return new Response( data.bytes, {
					status: 200,
					headers: {
						'Content-Type': data.mime,
						'Accept-Ranges': 'bytes',
						'Content-Length': String( data.total ),
						'Cache-Control': 'no-store',
					},
				})
			}

			if( start >= data.total ) {
				return new Response( null, {
					status: 416,
					headers: { 'Content-Range': `bytes */${ data.total }` },
				})
			}

			return new Response( data.bytes, {
				status: 206,
				headers: {
					'Content-Type': data.mime,
					'Accept-Ranges': 'bytes',
					'Content-Length': String( data.bytes.byteLength ),
					'Content-Range': `bytes ${ data.start }-${ data.end - 1 }/${ data.total }`,
					'Cache-Control': 'no-store',
				},
			})
		}

	}

	$bog_music_stream.install_sw()
	$bog_music_stream.install_page()

}
