namespace $ {

	export type $bog_music_peer_item = {
		key: string
		meta: $bog_music_track_baza_info
		file: Blob
	}

	export type $bog_music_peer_got = {
		key: string
		meta: $bog_music_track_baza_info
		bytes: Uint8Array< ArrayBuffer >
	}

	export class $bog_music_peer extends $mol_object {

		static ice: RTCIceServer[] = [
			{ urls: [ 'stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478' ] },
		]

		static chunk = 16 * 1024

		static buffer_high = 1024 * 1024

		static gather_limit = 5000

		static open_limit = 30000

		static rtc( tag: string ) {
			const rtc = new RTCPeerConnection({ iceServers: this.ice })
			this.trace( rtc, tag )
			return rtc
		}

		static candidates( sdp: string ) {
			const found = [] as string[]
			for( const line of sdp.split( /\r?\n/ ) ) {
				const match = line.match( /^a=candidate:\S+ \d+ (\S+) \d+ (\S+) (\d+) typ (\S+)/ )
				if( match ) found.push( `${ match[ 4 ] } ${ match[ 1 ].toLowerCase() } ${ match[ 2 ] }:${ match[ 3 ] }` )
			}
			return found.length ? found.join( ', ' ) : 'ни одного'
		}

		static candidate_text( stats: RTCStatsReport, id: string ) {
			const one = stats.get( id )
			if( !one ) return '?'
			return `${ one.candidateType } ${ one.protocol } ${ one.address ?? one.ip ?? '?' }:${ one.port }`
		}

		static async route( rtc: RTCPeerConnection ) {
			const stats = await rtc.getStats()
			const pairs = [] as string[]
			let chosen = ''
			stats.forEach( one => {
				if( one.type === 'transport' && one.selectedCandidatePairId ) chosen = one.selectedCandidatePairId
			} )
			stats.forEach( one => {
				if( one.type !== 'candidate-pair' ) return
				if( !chosen && one.nominated && one.state === 'succeeded' ) chosen = one.id
				pairs.push( `${ one.state }: ${ this.candidate_text( stats, one.localCandidateId ) } → ${ this.candidate_text( stats, one.remoteCandidateId ) }` )
			} )
			const pair = chosen ? stats.get( chosen ) : null
			if( pair ) return `${ this.candidate_text( stats, pair.localCandidateId ) } → ${ this.candidate_text( stats, pair.remoteCandidateId ) }`
			return pairs.length ? `не выбран, пары: ${ pairs.join( '; ' ) }` : 'не выбран, пар нет'
		}

		static trace( rtc: RTCPeerConnection, tag: string ) {

			const log = ( text: string ) => $bog_music_log.act( `${ tag }: ${ text }` )
			const route = () => void this.route( rtc ).then( log, ( error: any ) => log( `маршрут не прочитан: ${ error?.message ?? error }` ) )

			rtc.addEventListener( 'icegatheringstatechange', () => log( `сбор адресов ${ rtc.iceGatheringState }` ) )
			rtc.addEventListener( 'signalingstatechange', () => log( `сигналинг ${ rtc.signalingState }` ) )
			rtc.addEventListener( 'iceconnectionstatechange', () => log( `ice ${ rtc.iceConnectionState }` ) )

			rtc.addEventListener( 'icecandidateerror', ( event: Event ) => {
				const error = event as RTCPeerConnectionIceErrorEvent
				$bog_music_log.err( `${ tag }: адрес с ${ error.url } не получен: ${ error.errorCode } ${ error.errorText }` )
			} )

			rtc.addEventListener( 'connectionstatechange', () => {
				log( `соединение ${ rtc.connectionState }` )
				if( rtc.connectionState === 'connected' || rtc.connectionState === 'failed' ) route()
			} )

		}

		static async gather( rtc: RTCPeerConnection ) {
			if( rtc.iceGatheringState !== 'complete' ) {
				await new Promise< void >( done => {
					const timer = setTimeout( () => {
						$bog_music_log.act( `сбор адресов не закончился за ${ this.gather_limit } мс, шлю что есть` )
						done()
					}, this.gather_limit )
					rtc.addEventListener( 'icegatheringstatechange', () => {
						if( rtc.iceGatheringState !== 'complete' ) return
						clearTimeout( timer )
						done()
					} )
				} )
			}
			return rtc.localDescription!.sdp
		}

		static async offer( tag = 'пара' ) {
			const rtc = this.rtc( tag )
			const channel = rtc.createDataChannel( 'bog_music', { ordered: true } )
			await rtc.setLocalDescription( await rtc.createOffer() )
			const sdp = await this.gather( rtc )
			$bog_music_log.act( `${ tag }: свои адреса: ${ this.candidates( sdp ) }` )
			return { rtc, channel, sdp }
		}

		static async answer( offer: string, tag = 'пара' ) {
			const rtc = this.rtc( tag )
			const channel = new Promise< RTCDataChannel >( done => {
				rtc.addEventListener( 'datachannel', event => {
					$bog_music_log.act( `${ tag }: пришёл канал ${ event.channel.readyState }` )
					done( event.channel )
				} )
			} )
			$bog_music_log.act( `${ tag }: адреса соседа: ${ this.candidates( offer ) }` )
			await rtc.setRemoteDescription({ type: 'offer', sdp: offer })
			await rtc.setLocalDescription( await rtc.createAnswer() )
			const sdp = await this.gather( rtc )
			$bog_music_log.act( `${ tag }: свои адреса: ${ this.candidates( sdp ) }` )
			return { rtc, channel, sdp }
		}

		static async finish( rtc: RTCPeerConnection, answer: string, tag = 'пара' ) {
			$bog_music_log.act( `${ tag }: адреса соседа: ${ this.candidates( answer ) }` )
			await rtc.setRemoteDescription({ type: 'answer', sdp: answer })
		}

		static opened( channel: RTCDataChannel ) {
			channel.binaryType = 'arraybuffer'
			if( channel.readyState === 'open' ) return Promise.resolve( channel )
			return new Promise< RTCDataChannel >( ( done, fail ) => {
				const timer = setTimeout( () => fail( new Error( 'Устройства не соединились' ) ), this.open_limit )
				channel.addEventListener( 'open', () => {
					clearTimeout( timer )
					done( channel )
				} )
				channel.addEventListener( 'close', () => {
					clearTimeout( timer )
					fail( new Error( 'Соединение закрылось' ) )
				} )
			} )
		}

		static idle_limit = 60000

		static ack_limit = 300000

		static message( channel: RTCDataChannel, limit = this.idle_limit ) {
			return new Promise< any >( ( done, fail ) => {
				const stop = () => {
					clearTimeout( timer )
					channel.removeEventListener( 'message', on )
					channel.removeEventListener( 'close', close )
				}
				const on = ( event: MessageEvent ) => {
					if( typeof event.data !== 'string' ) return
					stop()
					done( JSON.parse( event.data ) )
				}
				const close = () => {
					stop()
					fail( new Error( 'Соединение закрылось' ) )
				}
				const timer = setTimeout( () => {
					stop()
					fail( new Error( 'Другое устройство замолчало' ) )
				}, limit )
				channel.addEventListener( 'message', on )
				channel.addEventListener( 'close', close )
				if( channel.readyState !== 'open' ) close()
			} )
		}

		static async drain( channel: RTCDataChannel ) {
			if( channel.bufferedAmount < this.buffer_high ) return
			channel.bufferedAmountLowThreshold = this.buffer_high / 4
			await new Promise< void >( ( done, fail ) => {
				const low = () => {
					channel.removeEventListener( 'close', close )
					done()
				}
				const close = () => {
					channel.removeEventListener( 'bufferedamountlow', low )
					fail( new Error( 'Соединение оборвалось' ) )
				}
				channel.addEventListener( 'bufferedamountlow', low, { once: true } )
				channel.addEventListener( 'close', close, { once: true } )
				if( channel.readyState !== 'open' ) close()
			} )
		}

		static async send( channel: RTCDataChannel, items: readonly $bog_music_peer_item[], progress?: ( done: number )=> void ) {
			channel.send( JSON.stringify({ type: 'list', count: items.length }) )
			let done = 0
			for( const item of items ) {
				channel.send( JSON.stringify({ type: 'file', key: item.key, meta: item.meta, size: item.file.size }) )
				for( let at = 0; at < item.file.size; at += this.chunk ) {
					await this.drain( channel )
					channel.send( await item.file.slice( at, at + this.chunk ).arrayBuffer() )
				}
				channel.send( JSON.stringify({ type: 'end', key: item.key }) )
				progress?.( ++done )
			}
			channel.send( JSON.stringify({ type: 'done' }) )
			await this.message( channel, this.ack_limit )
		}

		static receive( channel: RTCDataChannel, take: ( got: $bog_music_peer_got )=> Promise< void >, progress?: ( done: number, count: number )=> void ) {

			return new Promise< number >( ( resolve, fail ) => {

				let count = 0
				let done = 0
				let head = null as null | { key: string, meta: $bog_music_track_baza_info, size: number }
				let parts = [] as ArrayBuffer[]
				let queue = Promise.resolve()

				let timer = 0 as any
				const idle = () => {
					clearTimeout( timer )
					timer = setTimeout( () => fail( new Error( 'Передача замерла' ) ), this.idle_limit )
				}
				idle()

				channel.addEventListener( 'close', () => {
					clearTimeout( timer )
					fail( new Error( 'Соединение оборвалось' ) )
				} )

				channel.addEventListener( 'message', event => {

					idle()

					if( typeof event.data !== 'string' ) {
						parts.push( event.data )
						return
					}

					const msg = JSON.parse( event.data )

					if( msg.type === 'list' ) {
						count = msg.count
						progress?.( done, count )
					}

					if( msg.type === 'file' ) {
						head = msg
						parts = []
					}

					if( msg.type === 'end' && head ) {
						const bytes = new Uint8Array( head.size )
						let at = 0
						for( const part of parts ) {
							bytes.set( new Uint8Array( part ), at )
							at += part.byteLength
						}
						const got = { key: head.key, meta: head.meta, bytes }
						head = null
						parts = []
						queue = queue.then( () => take( got ) ).then( () => progress?.( ++done, count ) )
					}

					if( msg.type === 'done' ) {
						clearTimeout( timer )
						queue.then( () => {
							channel.send( JSON.stringify({ type: 'ack' }) )
							resolve( done )
						}, fail )
					}

				} )

			} )
		}

	}

}
