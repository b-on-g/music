namespace $ {

	$mol_test_mocks.push( $ => {
		$.$giper_baza_land = $bog_music_land
		$.$giper_baza_file = $mws_baza_file
	} )

	$mol_test({

		async 'diff_units loads unloaded big sands back'( $ ) {
			const land = $.$giper_baza_land.make({ $ }) as $bog_music_land
			const file = land.Data( $.$giper_baza_file ) as $mws_baza_file
			file.buffer( new Uint8Array( 2 ** 15 + 100 ).fill( 7 ) )

			const big = file.chunk_units().filter( sand => sand.big() )
			$mol_assert_equal( big.length > 0, true )

			await $mol_wire_async( land ).diff_units()
			const balls = new Map( big.map( sand => [ sand, sand._ball ] as const ) )
			land.mine().ball_load = sand => balls.get( sand )!
			for( const sand of big ) land.sand_unload( sand )

			await $mol_wire_async( land ).diff_units()
			for( const sand of big ) $mol_assert_equal( sand._ball, balls.get( sand )! )
		},

	})

}
