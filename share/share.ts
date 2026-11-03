namespace $ {

	export type $bog_music_share_open = {
		land: string
		key: string
		keys: string[]
		at: number
	}

	export class $bog_music_share extends $mol_object {

		@ $mol_mem
		static instance() {
			return new $bog_music_share
		}

		account() {
			return $bog_music_account_baza.home()
		}

		static plural_tracks( n: number ): string {
			const mod10 = n % 10
			const mod100 = n % 100
			if( mod10 === 1 && mod100 !== 11 ) return 'трек'
			if( mod10 >= 2 && mod10 <= 4 && ( mod100 < 12 || mod100 > 14 ) ) return 'трека'
			return 'треков'
		}

		@ $mol_mem
		mode( next?: boolean ): boolean {
			return next ?? false
		}

		@ $mol_mem
		selection( next?: readonly string[] ): readonly string[] {
			return next ?? []
		}

		selected( key: string ): boolean {
			return this.selection().includes( key )
		}

		@ $mol_action
		enter( key: string ) {
			$bog_music_log.act( `режим шаринга включён с ${ key }` )
			this.selection([ key ])
			this.mode( true )
		}

		@ $mol_action
		toggle( key: string ) {
			const cur = this.selection()
			const next = cur.includes( key ) ? cur.filter( k => k !== key ) : [ ... cur, key ]
			this.selection( next )
		}

		@ $mol_action
		exit() {
			this.selection([])
			this.mode( false )
		}

		_status_logged = ''

		@ $mol_mem
		status( next?: string ): string {
			if( next && next !== this._status_logged ) $bog_music_log.act( `шар: ${ next }` )
			if( next !== undefined ) this._status_logged = next
			return next ?? ''
		}

		_import_logged = ''

		@ $mol_mem
		import_status( next?: string ): string {
			if( next && next !== this._import_logged ) $bog_music_log.act( `приём шара: ${ next }` )
			if( next !== undefined ) this._import_logged = next
			return next ?? ''
		}

		@ $mol_action
		share_single( key: string ) {
			void this.share_keys([ key ])
		}

		submit() {
			const keys = [ ... this.selection() ]
			setTimeout( () => {
				this.exit()
				void this.share_keys( keys )
			} )
		}

		static open_span = 7 * 24 * 60 * 60 * 1000

		opens( next?: readonly $bog_music_share_open[] ): readonly $bog_music_share_open[] {
			const list = this.$.$mol_state_local.value( 'bog_music_shares_open', next ) ?? []
			return list.filter( open => Date.now() - open.at < $bog_music_share.open_span )
		}

		sender_name() {
			return this.account().nickname() || $bog_music_device.name()
		}

		async share_keys( keys: string[] ) {
			try {
				const ready = [] as string[]
				for( const key of keys ) {
					if( await $bog_music_disk.probe( key ) ) ready.push( key )
				}
				if( !ready.length ) {
					this.status( 'Этих треков нет на устройстве' )
					return
				}

				this.status( 'Готовлю ссылку…' )
				const secret = $mol_crypto_sacred.make()
				const sender = await $mol_wire_async( this ).sender_name()
				const sender_cipher = await this.encrypt( secret, $mol_charset_encode( sender ) )
				const burn = await ( $giper_baza_auth as any )._generate() as $giper_baza_auth
				const land = await $mol_wire_async( this ).land_make( sender_cipher, ready.length, burn.pass() )

				this.opens([ ... this.opens(), { land, key: secret.toString(), keys: ready, at: Date.now() } ])
				$bog_music_log.act( `одноразовая ссылка на ${ ready.length }`, land )

				const url = this.url_for( land, secret.toString(), burn.toString() + burn.toStringPrivate() )
				const note = 'Не закрывай приложение, пока получатель не заберёт'
				try {
					await navigator.clipboard.writeText( url )
					this.status( `Ссылка на ${ ready.length } ${ $bog_music_share.plural_tracks( ready.length ) } скопирована. ${ note }` )
				} catch {
					this.status( `${ url } · ${ note }` )
				}
			} catch( error: any ) {
				$bog_music_log.err( `шар не создан: ${ error?.message ?? error }` )
				this.status( 'Не получилось создать ссылку' )
			}
		}

		@ $mol_action
		land_make( sender_cipher: Uint8Array< ArrayBuffer >, count: number, burn: $giper_baza_auth_pass ): string {
			const preset: $giper_baza_rank_preset = [ [ null, $giper_baza_rank_read ], [ burn, $giper_baza_rank_post( 'just' ) ] ]
			const land = $giper_baza_glob.land_grab( preset )
			const data = land.Data( $bog_music_share_baza )
			data.Kind( 'auto' )!.val( $bog_music_share_baza.kind )
			data.Sender( 'auto' )!.val( sender_cipher )
			data.Count( 'auto' )!.val( count )
			this.keep( land.link().str )
			return land.link().str
		}

		url_for( land: string, key: string, burn: string ): string {
			return location.origin + location.pathname + location.search + '#share=' + land + '.' + key + '.' + burn
		}

		_kept = new Map< string, $mol_wire_atom< any, any, null > >()

		keep( link: string ) {
			if( this._kept.has( link ) ) return
			const atom = new $mol_wire_atom( `bog_music_share_keep<${ link }>`, () => {
				$giper_baza_glob.Land( new $giper_baza_link( link ) ).sync()
				return null
			} )
			this._kept.set( link, atom )
			atom.fresh()
		}

		data( link: string ) {
			return $giper_baza_glob.Land( new $giper_baza_link( link ) ).Data( $bog_music_share_baza )
		}

		offer_of( link: string ) {
			return ( this.data( link ).Offer()?.val() ?? null ) as Uint8Array | null
		}

		@ $mol_action
		answer_put( link: string, cipher: Uint8Array< ArrayBuffer > ) {
			const data = this.data( link )
			data.Answer( 'auto' )!.val( cipher )
			data.Done( 'auto' )!.val( true )
		}

		_timer = 0 as any

		_busy = false

		@ $mol_mem
		watch() {
			if( this._timer ) clearInterval( this._timer )
			for( const open of this.opens() ) this.keep( open.land )
			this._timer = setInterval( () => void this.step(), 3000 )
			return null
		}

		destructor() {
			clearInterval( this._timer )
		}

		async step() {
			if( this._busy ) return
			this._busy = true
			try {
				for( const open of this.opens() ) {
					this.keep( open.land )
					const cipher = await $mol_wire_async( this ).offer_of( open.land )
					if( !cipher?.byteLength ) continue
					this.opens( this.opens().filter( one => one.land !== open.land ) )
					await this.serve( open, cipher ).catch( ( error: any ) => {
						$bog_music_log.err( `шар не отдан: ${ error?.message ?? error }`, open.land )
						this.status( 'Не получилось отдать треки, ссылка сгорела — сделай новую' )
					} )
				}
			} finally {
				this._busy = false
			}
		}

		async serve( open: $bog_music_share_open, cipher: Uint8Array ) {
			const secret = $mol_crypto_sacred.from( open.key )
			const offer = JSON.parse( $mol_charset_decode( await this.decrypt( secret, cipher ) ) )
			if( typeof offer?.sdp !== 'string' ) throw new Error( 'битое приглашение' )

			const { rtc, channel, sdp } = await $bog_music_peer.answer( offer.sdp )
			try {
				const answer = await this.encrypt( secret, $mol_charset_encode( JSON.stringify({ sdp }) ) )
				await $mol_wire_async( this ).answer_put( open.land, answer )
				this.status( 'Получатель на связи, отдаю…' )
				const ready = await $bog_music_peer.opened( await channel )
				const items = [] as $bog_music_peer_item[]
				for( const key of open.keys ) {
					const file = await $bog_music_disk.file( key )
					const meta = await $mol_wire_async( this.account() ).info( key )
					if( file && meta ) items.push({ key, meta, file })
				}
				await $bog_music_peer.send( ready, items, done => this.status( `Отдаю: ${ done } из ${ items.length }` ) )
				$bog_music_log.act( `шар отдан: ${ items.length }`, open.land )
				this.status( `Отдано: ${ items.length } ${ $bog_music_share.plural_tracks( items.length ) }, ссылка сгорела` )
			} finally {
				rtc.close()
			}
		}

		@ $mol_mem_key
		token_done( token: string, next?: boolean ): boolean {
			return next ?? false
		}

		head( link: string ) {
			const data = this.data( link )
			return {
				kind: data.Kind()?.val() ?? '',
				sender: ( data.Sender()?.val() ?? null ) as Uint8Array | null,
				count: Number( data.Count()?.val() ?? 0 ),
				done: Boolean( data.Done()?.val() ),
				answer: ( data.Answer()?.val() ?? null ) as Uint8Array | null,
			}
		}

		@ $mol_action
		offer_put( link: string, cipher: Uint8Array< ArrayBuffer >, burn_str: string ) {
			const burn = $giper_baza_auth.from( burn_str )
			const land = $giper_baza_glob.Land( new $giper_baza_link( link ) )
			Object.assign( land, { auth: () => burn } )
			land.Data( $bog_music_share_baza ).Offer( 'auto' )!.val( cipher )
		}

		static wait( ms: number ) {
			return new Promise( done => setTimeout( done, ms ) )
		}

		async import( token: string ): Promise< string | null > {

			if( !token || this.token_done( token ) ) return null
			this.token_done( token, true )
			$bog_music_boot.clear_share_hash()

			const [ link, key_str, burn_str ] = token.split( '.' )
			if( !link || !key_str || !burn_str ) {
				this.import_status( 'Битая ссылка' )
				return null
			}

			const self = $mol_wire_async( this )

			try {

				const secret = $mol_crypto_sacred.from( key_str )
				this.keep( link )
				this.import_status( 'Открываю ссылку…' )

				let head = null as null | ReturnType< $bog_music_share[ 'head' ] >
				for( let i = 0; i < 30; i++ ) {
					head = await self.head( link ).catch( () => null )
					if( head?.kind ) break
					await $bog_music_share.wait( 1000 )
				}
				if( !head?.kind ) {
					this.import_status( 'Ссылка не открылась — она старая или ещё не доехала' )
					return null
				}
				if( head.kind !== $bog_music_share_baza.kind ) {
					this.import_status( 'Старая ссылка, попроси новую' )
					return null
				}
				if( head.done ) {
					this.import_status( 'Ссылка уже использована' )
					return null
				}

				const sender = head.sender?.byteLength
					? $mol_charset_decode( await this.decrypt( secret, head.sender ) )
					: 'Расшаренный'
				const playlist = 'shared:' + sender

				const { rtc, channel, sdp } = await $bog_music_peer.offer()

				try {

					const cipher = await this.encrypt( secret, $mol_charset_encode( JSON.stringify({ sdp }) ) )
					await self.offer_put( link, cipher, burn_str )

					let answer = null as null | { sdp: string }
					for( let i = 0; i < 300 && !answer; i++ ) {
						this.import_status( `Жду, когда ${ sender } откроет приложение…` )
						const now = await self.head( link ).catch( () => null )
						if( now?.answer?.byteLength ) {
							answer = JSON.parse( $mol_charset_decode( await this.decrypt( secret, now.answer ) ) )
							break
						}
						await $bog_music_share.wait( 1000 )
					}
					if( !answer ) {
						this.import_status( `${ sender } так и не открыл приложение` )
						return null
					}

					await $bog_music_peer.finish( rtc, answer.sdp )
					const open = await $bog_music_peer.opened( channel )
					const got = await $bog_music_peer.receive(
						open,
						item => this.account().import_audio( item.key, item.meta, item.bytes, playlist ),
						( done, count ) => this.import_status( `От ${ sender }: ${ done } из ${ count }` ),
					)

					this.import_status( `От ${ sender }: ${ got } ${ $bog_music_share.plural_tracks( got ) }` )
					return got ? playlist : null

				} finally {
					rtc.close()
				}

			} catch( error: any ) {
				$bog_music_log.err( `приём шара не удался: ${ error?.message ?? error }`, link )
				this.import_status( 'Не получилось: ' + ( error?.message ?? 'ошибка' ) )
				return null
			}

		}

		async encrypt( key: $mol_crypto_sacred, data: Uint8Array ): Promise< Uint8Array< ArrayBuffer > > {
			const iv = crypto.getRandomValues( new Uint8Array( 16 ) )
			const ct = await key.encrypt( data as BufferSource, iv )
			const out = new Uint8Array( iv.length + ct.length )
			out.set( iv, 0 )
			out.set( ct, iv.length )
			return out
		}

		async decrypt( key: $mol_crypto_sacred, blob: Uint8Array ): Promise< Uint8Array > {
			if( blob.length < 17 ) throw new Error( 'cipher too short' )
			return key.decrypt( blob.slice( 16 ), blob.slice( 0, 16 ) )
		}

	}

}
