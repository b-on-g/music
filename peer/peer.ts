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

		static rtc() {
			return new RTCPeerConnection({ iceServers: this.ice })
		}

		static async gather( rtc: RTCPeerConnection ) {
			if( rtc.iceGatheringState !== 'complete' ) {
				await new Promise< void >( done => {
					const timer = setTimeout( done, this.gather_limit )
					rtc.addEventListener( 'icegatheringstatechange', () => {
						if( rtc.iceGatheringState !== 'complete' ) return
						clearTimeout( timer )
						done()
					} )
				} )
			}
			return rtc.localDescription!.sdp
		}

		static async offer() {
			const rtc = this.rtc()
			const channel = rtc.createDataChannel( 'bog_music', { ordered: true } )
			await rtc.setLocalDescription( await rtc.createOffer() )
			return { rtc, channel, sdp: await this.gather( rtc ) }
		}

		static async answer( offer: string ) {
			const rtc = this.rtc()
			const channel = new Promise< RTCDataChannel >( done => {
				rtc.addEventListener( 'datachannel', event => done( event.channel ) )
			} )
			await rtc.setRemoteDescription({ type: 'offer', sdp: offer })
			await rtc.setLocalDescription( await rtc.createAnswer() )
			return { rtc, channel, sdp: await this.gather( rtc ) }
		}

		static async finish( rtc: RTCPeerConnection, answer: string ) {
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

		static message( channel: RTCDataChannel ) {
			return new Promise< any >( ( done, fail ) => {
				const on = ( event: MessageEvent ) => {
					if( typeof event.data !== 'string' ) return
					channel.removeEventListener( 'message', on )
					done( JSON.parse( event.data ) )
				}
				channel.addEventListener( 'message', on )
				channel.addEventListener( 'close', () => fail( new Error( 'Соединение закрылось' ) ) )
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
			await this.message( channel )
		}

		static receive( channel: RTCDataChannel, take: ( got: $bog_music_peer_got )=> Promise< void >, progress?: ( done: number, count: number )=> void ) {

			return new Promise< number >( ( resolve, fail ) => {

				let count = 0
				let done = 0
				let head = null as null | { key: string, meta: $bog_music_track_baza_info, size: number }
				let parts = [] as ArrayBuffer[]
				let queue = Promise.resolve()

				channel.addEventListener( 'close', () => fail( new Error( 'Соединение оборвалось' ) ) )

				channel.addEventListener( 'message', event => {

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
