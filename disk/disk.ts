namespace $ {

	export type $bog_music_disk_dir = Pick< FileSystemDirectoryHandle, 'getFileHandle' | 'removeEntry' | 'keys' >

	export class $bog_music_disk extends $mol_object {

		static folder = 'bog_music'

		static supported() {
			return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
		}

		static _dir = null as null | Promise< $bog_music_disk_dir >

		static dir(): Promise< $bog_music_disk_dir > {
			if( this._dir ) return this._dir
			return this._dir = navigator.storage.getDirectory()
				.then( root => root.getDirectoryHandle( this.folder, { create: true } ) )
		}

		static name_of( key: string ) {
			return encodeURIComponent( key )
		}

		static key_of( name: string ) {
			return decodeURIComponent( name )
		}

		static async file( key: string ): Promise< File | null > {
			const dir = await this.dir()
			try {
				const handle = await dir.getFileHandle( this.name_of( key ) )
				const file = await handle.getFile()
				return file.size ? file : null
			} catch( error: any ) {
				if( error?.name === 'NotFoundError' ) return null
				throw error
			}
		}

		static async put( key: string, data: Blob | Uint8Array ) {
			const dir = await this.dir()
			const handle = await dir.getFileHandle( this.name_of( key ), { create: true } )
			const blob = data instanceof Blob ? data : new Blob( [ data as Uint8Array< ArrayBuffer > ] )
			if( 'createWritable' in handle ) {
				const stream = await ( handle as any ).createWritable() as FileSystemWritableFileStream
				await stream.write( blob )
				await stream.close()
			} else {
				await this.put_worker( this.name_of( key ), blob )
			}
			this.has( key, true )
		}

		static async drop( key: string ) {
			const dir = await this.dir()
			try {
				await dir.removeEntry( this.name_of( key ) )
			} catch( error: any ) {
				if( error?.name !== 'NotFoundError' ) throw error
			}
			this.has( key, false )
		}

		static async keys(): Promise< string[] > {
			const dir = await this.dir()
			const keys = [] as string[]
			for await ( const name of dir.keys() ) keys.push( this.key_of( name ) )
			return keys
		}

		static async probe( key: string ) {
			return Boolean( await this.file( key ) )
		}

		@ $mol_mem_key
		static has( key: string, next?: boolean ): boolean {
			if( next !== undefined ) return next
			if( !this.supported() ) return false
			return $mol_wire_sync( this ).probe( key )
		}

		static async bytes( key: string, start: number, end: number ) {
			const file = await this.file( key )
			if( !file ) return null
			const from = Math.max( 0, Math.min( file.size, start ) )
			const to = end < 0 ? file.size : Math.max( from, Math.min( file.size, end ) )
			const head = await file.slice( 0, 12 ).arrayBuffer()
			return {
				bytes: await file.slice( from, to ).arrayBuffer(),
				total: file.size,
				mime: this.mime( new Uint8Array( head ) ),
				start: from,
				end: to,
			}
		}

		static mime( head: Uint8Array ) {
			const text = String.fromCharCode( ...head )
			if( text.slice( 4, 8 ) === 'ftyp' ) return 'audio/mp4'
			if( text.startsWith( 'OggS' ) ) return 'audio/ogg'
			if( text.startsWith( 'fLaC' ) ) return 'audio/flac'
			if( text.startsWith( 'RIFF' ) ) return 'audio/wav'
			if( head[0] === 0xFF && ( head[1] & 0xF6 ) === 0xF0 ) return 'audio/aac'
			return 'audio/mpeg'
		}

		static worker_source = `
			onmessage = async event => {
				const { folder, name, blob } = event.data
				try {
					const root = await navigator.storage.getDirectory()
					const dir = await root.getDirectoryHandle( folder, { create: true } )
					const handle = await dir.getFileHandle( name, { create: true } )
					const access = await handle.createSyncAccessHandle()
					const bytes = new Uint8Array( await blob.arrayBuffer() )
					access.truncate( 0 )
					access.write( bytes, { at: 0 } )
					access.flush()
					access.close()
					postMessage({ ok: true })
				} catch( error ) {
					postMessage({ ok: false, error: String( error?.message ?? error ) })
				}
			}
		`

		static put_worker( name: string, blob: Blob ) {
			const url = URL.createObjectURL( new Blob( [ this.worker_source ], { type: 'text/javascript' } ) )
			const worker = new Worker( url )
			return new Promise< void >( ( done, fail ) => {
				worker.onmessage = event => {
					worker.terminate()
					URL.revokeObjectURL( url )
					if( event.data.ok ) done()
					else fail( new Error( event.data.error ) )
				}
				worker.postMessage({ folder: this.folder, name, blob })
			} )
		}

	}

}
