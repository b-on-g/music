namespace $ {

	$mol_test({

		'Пресеты покрывают все полосы и лежат в диапазоне'() {
			for( const preset of $bog_music_eq.presets ) {
				$mol_assert_equal( preset.gains.length, $bog_music_eq.bands.length )
				for( const db of preset.gains ) {
					$mol_assert_ok( Math.abs( db ) <= $bog_music_eq.range_db )
				}
			}
		},

		'Пресет узнаётся по своему же набору'() {
			for( const preset of $bog_music_eq.presets ) {
				$mol_assert_equal( $bog_music_eq.preset_of( preset.gains ), preset.id )
			}
		},

		'Набор мимо пресетов — «Свой»'() {
			$mol_assert_equal( $bog_music_eq.preset_of( [ 1, 2, 3, 4, 5 ] ), '' )
		},

		'Ровный набор — это пресет «По умолчанию», а не «Свой»'() {
			$mol_assert_equal( $bog_music_eq.preset_of( $bog_music_eq.flat() ), 'default' )
		},

		'Чужой набор приводится к нашим полосам'() {
			// Короче — недостающие полосы в ноль, длиннее — лишние прочь.
			$mol_assert_equal( $bog_music_eq.clamp( [ 3 ] ).join(), '3,0,0,0,0,0' )
			$mol_assert_equal( $bog_music_eq.clamp( [ 1, 1, 1, 1, 1, 1, 1, 1 ] ).join(), '1,1,1,1,1,1' )
			// За пределом — в потолок, дробное — к целым dB.
			$mol_assert_equal( $bog_music_eq.clamp( [ 99, -99, 2.4, 2.6, NaN, 5 ] ).join(), '12,-12,2,3,0,5' )
		},

		'Настройка от пятиполосной версии не роняет полосы'() {
			// В baza могла остаться строка на пять значений: шестая полоса в ноль,
			// первые пять сохраняются как были.
			$mol_assert_equal( $bog_music_eq.parse( '8,4,0,0,1' ).join(), '8,4,0,0,1,0' )
		},

		'Цвет едет от зелёного через жёлтый к красному'() {
			$mol_assert_equal( $bog_music_eq.color( -12 ), 'hsl( 120 80% 55% )' )
			$mol_assert_equal( $bog_music_eq.color( 0 ), 'hsl( 50 80% 55% )' )
			$mol_assert_equal( $bog_music_eq.color( 12 ), 'hsl( 0 80% 55% )' )
			// За пределом диапазона цвет не уезжает дальше края.
			$mol_assert_equal( $bog_music_eq.color( 99 ), $bog_music_eq.color( 12 ) )
		},

		'Набор переживает запись строкой и чтение обратно'() {
			const gains = $bog_music_eq.preset( 'bass' )!
			$mol_assert_equal( $bog_music_eq.parse( $bog_music_eq.stringify( gains ) ).join(), gains.join() )
			// Пусто в baza (настройки ещё не сохраняли) — плоский набор.
			$mol_assert_equal( $bog_music_eq.parse( '' ).join(), $bog_music_eq.flat().join() )
			$mol_assert_equal( $bog_music_eq.parse( null ).join(), $bog_music_eq.flat().join() )
		},

		'Неизвестный пресет не выдумывается'() {
			$mol_assert_equal( $bog_music_eq.preset( 'nope' ), null )
		},

	})

}
