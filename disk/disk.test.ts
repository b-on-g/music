namespace $ {

	function fake_dir() {

		const files = new Map< string, Blob >()

		const dir = {
			async getFileHandle( name: string, opts?: { create?: boolean } ) {
				if( !files.has( name ) ) {
					if( !opts?.create ) throw Object.assign( new Error( 'no' ), { name: 'NotFoundError' } )
					files.set( name, new Blob( [] ) )
				}
				return {
					async getFile() {
						return new File( [ files.get( name )! ], name )
					},
					async createWritable() {
						const parts = [] as Blob[]
						return {
							async write( blob: Blob ) { parts.push( blob ) },
							async close() { files.set( name, new Blob( parts ) ) },
						}
					},
				}
			},
			async removeEntry( name: string ) {
				if( !files.delete( name ) ) throw Object.assign( new Error( 'no' ), { name: 'NotFoundError' } )
			},
			async *keys() {
				yield* files.keys()
			},
		}

		return dir as any as $bog_music_disk_dir
	}

	$mol_test({

		async 'put, read range, list and drop'() {

			$bog_music_disk._dir = Promise.resolve( fake_dir() )

			const bytes = new Uint8Array([ 0, 0, 0, 0, 102, 116, 121, 112, 1, 2, 3, 4, 5, 6 ])
			await $bog_music_disk.put( 'tube/x y', bytes )

			$mol_assert_equal( $bog_music_disk.has( 'tube/x y' ), true )
			$mol_assert_equal( await $bog_music_disk.keys(), [ 'tube/x y' ] )

			const range = await $bog_music_disk.bytes( 'tube/x y', 10, -1 )
			$mol_assert_equal( range!.total, 14 )
			$mol_assert_equal( range!.mime, 'audio/mp4' )
			$mol_assert_equal( [ ... new Uint8Array( range!.bytes ) ], [ 3, 4, 5, 6 ] )

			await $bog_music_disk.drop( 'tube/x y' )
			$mol_assert_equal( $bog_music_disk.has( 'tube/x y' ), false )
			$mol_assert_equal( await $bog_music_disk.file( 'tube/x y' ), null )
			$mol_assert_equal( await $bog_music_disk.bytes( 'tube/x y', 0, -1 ), null )

			$bog_music_disk._dir = null

		},

		'mime by magic bytes'() {
			$mol_assert_equal( $bog_music_disk.mime( new Uint8Array([ 0x4F, 0x67, 0x67, 0x53 ]) ), 'audio/ogg' )
			$mol_assert_equal( $bog_music_disk.mime( new Uint8Array([ 0xFF, 0xF1, 0x50 ]) ), 'audio/aac' )
			$mol_assert_equal( $bog_music_disk.mime( new Uint8Array([ 0x49, 0x44, 0x33 ]) ), 'audio/mpeg' )
		},

	})

}
