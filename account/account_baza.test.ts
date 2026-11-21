namespace $ {

	$mol_test({

		async 'Треки под убитым ключом корня возвращаются на место пустого Tracks'( $ ) {

			const land = $giper_baza_land.make({ $ })
			const account = land.Data( $bog_music_account_baza )

			const ops = {
				fill() {
					account.Tracks( 'auto' )!.key( '0_1', 'auto' )!.Title( 'auto' )!.val( 'Первый' )
					account.Tracks( 'auto' )!.key( '0_2', 'auto' )!.Title( 'auto' )!.val( 'Второй' )
					account.Nickname( 'auto' )!.val( 'Кирилл' )
					return true
				},
				wipe() {
					const root = land.Data( $giper_baza_dict )
					for( const key of root.keys() ) root.cut( key )
					account.Tracks( 'auto' )
					return account.tracks().keys().length
				},
				rescue() {
					return account.tracks_rescue()
				},
				read() {
					return {
						keys: account.tracks().keys().map( String ),
						title: account.track( '0_2' )?.Title()?.val() ?? '',
						tracks: land.Data( $giper_baza_dict ).keys().filter( key => key === 'Tracks' ).length,
						lost: account.tracks_lost(),
					}
				},
			}

			await $mol_wire_async( ops ).fill()
			const wiped = await $mol_wire_async( ops ).wipe()
			const rescued = await $mol_wire_async( ops ).rescue()
			const state = await $mol_wire_async( ops ).read()

			$mol_assert_equal( wiped, 0 )
			$mol_assert_equal( rescued, true )
			$mol_assert_equal( state.keys.sort(), [ '0_1', '0_2' ] )
			$mol_assert_equal( state.title, 'Второй' )
			$mol_assert_equal( state.tracks, 1 )
			$mol_assert_equal( state.lost, null )

		},

	})

}
