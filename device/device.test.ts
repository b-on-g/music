namespace $ {

	$mol_test({

		'iPhone and iPad with desktop Safari agent are not Mac'() {
			const agent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15'
			$mol_assert_equal( $bog_music_device.title_of( agent, 5, 390 ), 'iPhone · Safari' )
			$mol_assert_equal( $bog_music_device.title_of( agent, 5, 820 ), 'iPad · Safari' )
			$mol_assert_equal( $bog_music_device.title_of( agent, 0, 900 ), 'Mac · Safari' )
		},

	})

}
