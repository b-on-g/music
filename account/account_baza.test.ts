namespace $ {

	$mol_test({

		async 'Файл из выгрузки находит исходный трек, дубль ранжируется после трека с обложкой'( $ ) {

			const land = $giper_baza_land.make({ $ })
			const account = land.Data( $bog_music_account_baza )

			const ops = {
				fill() {
					account.save_track( '0_1', { artist: 'PedrinhoWG', title: `JoJo's Bizarre Adventure: Stone Ocean - OP || Opening 1 v2 [HD]`, duration: 90, cover: 'https://i.ytimg.com/vi/x/hqdefault.jpg' } )
					account.save_track( '0_2', { artist: '007', title: `003 - Eve - 風のアンセム (Wind's Anthem)`, duration: 0, cover: '' } )
					return true
				},
				find() {
					const jojo = $bog_music_account_baza.parse_filename( `001 - PedrinhoWG - JoJo's Bizarre Adventure_ Stone Ocean - OP __ Opening 1 v2 [HD].m4a` )
					const eve = $bog_music_account_baza.parse_filename( `012 - 007 - 003 - Eve - 風のアンセム (Wind's Anthem).mp3` )
					return { jojo: account.twin( jojo.artist, jojo.title ), eve: account.twin( eve.artist, eve.title ), order: eve.order }
				},
				twins() {
					account.save_track( '0_3', { artist: 'PedrinhoWG', title: `JoJo's Bizarre Adventure_ Stone Ocean - OP __ Opening 1 v2 [HD]`, duration: 0, cover: '' } )
					return account.twins()
				},
			}

			await $mol_wire_async( ops ).fill()
			const found = await $mol_wire_async( ops ).find()
			const twins = await $mol_wire_async( ops ).twins()

			$mol_assert_equal( found, { jojo: '0_1', eve: '0_2', order: 12 } )
			$mol_assert_equal( twins, [ [ '0_1', '0_3' ] ] )

		},

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
