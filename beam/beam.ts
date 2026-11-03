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

		signal( kind: 'offer' | 'answer', from: string, to: string, next?: string ): string {
			const dict = this.account().signals()
			const id = `${ kind }:${ from }>${ to }`
			if( next !== undefined ) dict.key( id, 'auto' )!.val( next )
			return dict.key( id )?.val() ?? ''
		}

		incoming( me: string ): { from: string, signal: $bog_music_beam_signal }[] {
			const dict = this.account().signals()
			const out = [] as { from: string, signal: $bog_music_beam_signal }[]
			for( const id of ( dict.keys() ?? [] ) as string[] ) {
				const [ kind, pair = '' ] = id.split( ':' )
				const [ from, to ] = pair.split( '>' )
				if( kind !== 'offer' || to !== me || !from ) continue
				const signal = $bog_music_beam.signal_parse( dict.key( id )?.val() ?? '' )
				if( signal ) out.push({ from, signal })
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

		_handled = new Map< string, number >()

		_busy = false

		_beat_at = 0

		_started_at = Date.now()

		async step() {
			if( this._busy ) return
			this._busy = true
			try {
				const self = $mol_wire_async( this )
				if( Date.now() - this._beat_at > $bog_music_beam.beat_every ) {
					this._beat_at = Date.now()
					await $mol_wire_async( this.account() ).device_beat()
				}
				const me = $bog_music_device.id()
				for( const { from, signal } of await self.incoming( me ) ) {
					if( signal.at < this._started_at - $bog_music_beam.answer_limit ) continue
					if( ( this._handled.get( from ) ?? 0 ) >= signal.at ) continue
					this._handled.set( from, signal.at )
					await this.serve( from, signal )
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

		async serve( from: string, signal: $bog_music_beam_signal ) {
			const me = $bog_music_device.id()
			const name = await $mol_wire_async( this.account() ).device_name( from )
			$bog_music_log.act( `запрос файлов с «${ name }»` )
			const { rtc, channel, sdp } = await $bog_music_peer.answer( signal.sdp )
			try {
				await $mol_wire_async( this ).signal( 'answer', me, from, JSON.stringify({ at: Date.now(), sdp }) )
				const open = await $bog_music_peer.opened( await channel )
				const want = await $bog_music_peer.message( open )
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

			const { rtc, channel, sdp } = await $bog_music_peer.offer()

			try {

				const at = Date.now()
				await $mol_wire_async( this ).signal( 'offer', me, from, JSON.stringify({ at, sdp }) )

				let answer = null as null | $bog_music_beam_signal
				while( Date.now() - at < $bog_music_beam.answer_limit ) {
					answer = $bog_music_beam.signal_parse( await $mol_wire_async( this ).signal( 'answer', from, me ) )
					if( answer && answer.at >= at ) break
					answer = null
					await new Promise( done => setTimeout( done, 1000 ) )
				}
				if( !answer ) throw new Error( `«${ name }» не ответило, открой на нём приложение` )

				await $bog_music_peer.finish( rtc, answer.sdp )
				const open = await $bog_music_peer.opened( channel )
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
			if( !from ) return
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
