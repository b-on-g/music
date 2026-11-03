namespace $ {

	function pair() {

		const make = () => Object.assign( new EventTarget, {
			readyState: 'open',
			bufferedAmount: 0,
			bufferedAmountLowThreshold: 0,
			binaryType: 'arraybuffer',
			other: null as any,
			send( data: any ) {
				const target = this.other
				setTimeout( () => target.dispatchEvent( new MessageEvent( 'message', { data } ) ) )
			},
		} )

		const left = make()
		const right = make()
		left.other = right
		right.other = left

		return [ left, right ] as any as [ RTCDataChannel, RTCDataChannel ]
	}

	$mol_test({

		async 'files go through channel in chunks with meta'() {

			const [ sender, receiver ] = pair()
			const big = new Uint8Array( $bog_music_peer.chunk * 2 + 5 ).map( ( _, i ) => i % 251 )
			const items: $bog_music_peer_item[] = [
				{ key: 'a', meta: { title: 'A', artist: 'X', duration: 1, cover: '' }, file: new Blob([ big ]) },
				{ key: 'b', meta: { title: 'B', artist: 'Y', duration: 2, cover: '' }, file: new Blob([ new Uint8Array([ 7 ]) ]) },
			]

			const got = [] as $bog_music_peer_got[]
			const counted = [] as string[]

			const [ count ] = await Promise.all([
				$bog_music_peer.receive( receiver, async item => { got.push( item ) }, ( done, all ) => counted.push( `${ done }/${ all }` ) ),
				$bog_music_peer.send( sender, items ),
			])

			$mol_assert_equal( count, 2 )
			$mol_assert_equal( got.map( item => item.key ), [ 'a', 'b' ] )
			$mol_assert_equal( got[ 0 ].meta.title, 'A' )
			$mol_assert_equal( [ ... got[ 0 ].bytes ], [ ... big ] )
			$mol_assert_equal( [ ... got[ 1 ].bytes ], [ 7 ] )
			$mol_assert_equal( counted, [ '0/2', '1/2', '2/2' ] )

		},

	})

}
