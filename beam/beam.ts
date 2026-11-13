namespace $ {

	export type $bog_music_beam_signal = {
		at: number
		sdp: string
	}

	export class $bog_music_beam extends $mol_object {

		@ $mol_mem
		static instance() {
			return new this
		}

		account() {
			return $bog_music_account_baza.home()
		}

		static answer_limit = 60000

		static tick = 2000

		static beat_every = 30000

		static signal_parse( text: string ): $bog_music_beam_signal | null {
			try {
				const data = JSON.parse( text )
				if( typeof data?.sdp !== 'string' || typeof data?.at !== 'number' ) return null
				return data
			} catch {
				return null
			}
		}

		signal_id( kind: 'offer' | 'answer', from: string, to: string, req: string ) {
			return `${ kind }:${ from }>${ to }:${ req }`
		}

		signal( kind: 'offer' | 'answer', from: string, to: string, req: string, next?: string ): string {
			const dict = this.account().signals()
			const id = this.signal_id( kind, from, to, req )
			if( next !== undefined ) dict.key( id, 'auto' )!.val( next )
			return dict.key( id )?.val() ?? ''
		}

		@ $mol_action
		signal_cut( from: string, to: string, req: string ) {
			const dict = this.account().signals()
			dict.cut( this.signal_id( 'offer', from, to, req ) )
			dict.cut( this.signal_id( 'answer', to, from, req ) )
		}

		incoming( me: string ): { from: string, req: string, signal: $bog_music_beam_signal }[] {
			const dict = this.account().signals()
			const out = [] as { from: string, req: string, signal: $bog_music_beam_signal }[]
			for( const id of ( dict.keys() ?? [] ) as string[] ) {
				const [ kind, pair = '', req = '' ] = id.split( ':' )
				const [ from, to ] = pair.split( '>' )
				if( kind !== 'offer' || to !== me || !from || !req ) continue
				const signal = $bog_music_beam.signal_parse( dict.key( id )?.val() ?? '' )
				if( signal ) out.push({ from, req, signal })
			}
			return out
		}

		@ $mol_mem_key
		status( key: string, next?: string ): string {
			return next ?? ''
		}

		@ $mol_mem
		summary( next?: string ): string {
			return next ?? ''
		}

		_handled = new Set< string >()

		_busy = false

		_beat_at = 0

		_started_at = Date.now()

		async step() {
			if( this._busy ) return
			this._busy = true
			try {
				const self = $mol_wire_async( this )
				const me = $bog_music_device.id()
				if( Date.now() - this._beat_at > $bog_music_beam.beat_every ) {
					if( !this._beat_at ) $bog_music_log.act( `пара: я ${ me } «${ $bog_music_device.title() }», жду запросов` )
					this._beat_at = Date.now()
					await $mol_wire_async( this.account() ).device_beat()
				}
				for( const { from, req, signal } of await self.incoming( me ) ) {
					if( this._handled.has( req ) ) continue
					this._handled.add( req )
					const age = Date.now() - signal.at
					if( signal.at < this._started_at - $bog_music_beam.answer_limit ) {
						$bog_music_log.act( `пара: старый запрос ${ req } от ${ from } пропущен, ему ${ Math.round( age / 1000 ) } с` )
						continue
					}
					$bog_music_log.act( `пара: запрос ${ req } от ${ from }, по моим часам ему ${ age } мс` )
					void this.serve( from, req, signal ).catch( ( error: any ) => {
						$bog_music_log.err( `отдача файлов не удалась: ${ error?.message ?? error }` )
						this.summary( '' )
					} )
				}
			} catch( error: any ) {
				$bog_music_log.err( `передача между устройствами: ${ error?.message ?? error }` )
			} finally {
				this._busy = false
			}
		}

		_timer = 0 as any

		@ $mol_mem
		watch() {
			if( this._timer ) clearInterval( this._timer )
			this._timer = setInterval( () => void this.step(), $bog_music_beam.tick )
			void this.step()
			return null
		}

		destructor() {
			clearInterval( this._timer )
		}

		async serve( from: string, req: string, signal: $bog_music_beam_signal ) {
			const me = $bog_music_device.id()
			const name = await $mol_wire_async( this.account() ).device_name( from )
			$bog_music_log.act( `запрос файлов с «${ name }»` )
			const tag = `пара ${ req } отдача`
			const { rtc, channel, sdp } = await $bog_music_peer.answer( signal.sdp, tag )
			try {
				await $mol_wire_async( this ).signal( 'answer', me, from, req, JSON.stringify({ at: Date.now(), sdp }) )
				$bog_music_log.act( `${ tag }: ответ записан в Базу, жду канал` )
				const open = await $bog_music_peer.opened( await channel )
				$bog_music_log.act( `${ tag }: канал открыт, жду список` )
				const want = await $bog_music_peer.message( open )
				$bog_music_log.act( `${ tag }: просят ${ want.keys?.length ?? 0 }` )
				const items = [] as $bog_music_peer_item[]
				for( const key of ( want.keys ?? [] ) as string[] ) {
					const file = await $bog_music_disk.file( key )
					const meta = await $mol_wire_async( this.account() ).info( key )
					if( file && meta ) items.push({ key, meta, file })
				}
				this.summary( `Отдаю на «${ name }»: 0 из ${ items.length }` )
				await $bog_music_peer.send( open, items, done => this.summary( `Отдаю на «${ name }»: ${ done } из ${ items.length }` ) )
				$bog_music_log.act( `отдано на «${ name }»: ${ items.length }` )
				this.summary( '' )
			} finally {
				rtc.close()
			}
		}

		async pull( from: string, keys: readonly string[] ) {

			const me = $bog_music_device.id()
			const account = $mol_wire_async( this.account() )
			const name = await account.device_name( from )
			for( const key of keys ) this.status( key, 'Соединяюсь…' )
			this.summary( `Соединяюсь с «${ name }»…` )
			$bog_music_log.act( `перенос ${ keys.length } с «${ name }»` )

			const req = $mol_guid( 8 )
			const tag = `пара ${ req } приём`
			const online = await account.device_online( from )
			$bog_music_log.act( `${ tag }: я ${ me }, беру с ${ from } «${ name }», ${ online ? 'на связи' : 'пульса нет' }` )
			const { rtc, channel, sdp } = await $bog_music_peer.offer( tag )

			try {

				const at = Date.now()
				await $mol_wire_async( this ).signal( 'offer', me, from, req, JSON.stringify({ at, sdp }) )
				$bog_music_log.act( `${ tag }: запрос записан в Базу, жду ответ` )

				let answer = null as null | $bog_music_beam_signal
				let skewed = false
				while( Date.now() - at < $bog_music_beam.answer_limit ) {
					answer = $bog_music_beam.signal_parse( await $mol_wire_async( this ).signal( 'answer', from, me, req ) )
					if( answer && answer.at >= at ) break
					if( answer && !skewed ) {
						skewed = true
						$bog_music_log.err( `${ tag }: ответ есть, но его время ${ answer.at } раньше запроса ${ at } на ${ at - answer.at } мс, часы устройств расходятся` )
					}
					answer = null
					await new Promise( done => setTimeout( done, 1000 ) )
				}
				if( !answer ) throw new Error( `«${ name }» не ответило, открой на нём приложение` )
				$bog_music_log.act( `${ tag }: ответ пришёл через ${ Date.now() - at } мс` )

				await $bog_music_peer.finish( rtc, answer.sdp, tag )
				const open = await $bog_music_peer.opened( channel )
				$bog_music_log.act( `${ tag }: канал открыт, прошу ${ keys.length }` )
				open.send( JSON.stringify({ type: 'want', keys }) )

				const got = await $bog_music_peer.receive(
					open,
					async item => {
						await $bog_music_disk.put( item.key, item.bytes )
						await account.holder_add( item.key )
						this.status( item.key, '' )
					},
					( done, count ) => this.summary( `Переношу с «${ name }»: ${ done } из ${ count }` ),
				)

				$bog_music_log.act( `перенесено с «${ name }»: ${ got }` )
				this.summary( got ? `Перенесено с «${ name }»: ${ got }` : `На «${ name }» этих файлов уже нет` )

			} catch( error: any ) {
				const text = error?.message ?? String( error )
				$bog_music_log.err( `перенос с «${ name }» не удался: ${ text }` )
				this.summary( text )
				throw error
			} finally {
				for( const key of keys ) this.status( key, '' )
				rtc.close()
				await $mol_wire_async( this ).signal_cut( me, from, req ).catch( () => {} )
			}

		}

		pick_holder( key: string ): string | null {
			const account = this.account()
			const holders = account.holders_other( key )
			return holders.find( id => account.device_online( id ) ) ?? holders[ 0 ] ?? null
		}

		@ $mol_action
		pull_one( key: string ) {
			const from = this.pick_holder( key )
			if( !from ) {
				$bog_music_log.act( `пара: у ${ key } нет держателей кроме меня` )
				return
			}
			void this.pull( from, [ key ] ).catch( () => {} )
		}

		remote_groups( keys: readonly string[] ): Map< string, string[] > {
			const account = this.account()
			const groups = new Map< string, string[] >()
			for( const key of keys ) {
				if( account.place( key ) !== 'remote' ) continue
				const from = this.pick_holder( key )
				if( !from ) continue
				groups.set( from, [ ... groups.get( from ) ?? [], key ] )
			}
			return groups
		}

		@ $mol_action
		pull_all( keys: readonly string[] ) {
			const groups = this.remote_groups( keys )
			void ( async () => {
				for( const [ from, list ] of groups ) {
					await this.pull( from, list ).catch( () => {} )
				}
			} )()
		}

	}

}
