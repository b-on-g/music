namespace $ {

	/** Мощность 100-мс кусков постоянного сигнала с заданным средним квадратом. */
	function power_of( hops: number, mean_square: number, hop: number ) {
		const power = new Float64Array( hops )
		power.fill( mean_square * hop )
		return power
	}

	$mol_test({

		'Множитель приводит запись к целевой громкости'() {
			$mol_assert_equal( $bog_music_gain.factor( null ), 1 )
			$mol_assert_equal( Math.round( $bog_music_gain.factor( -14 ) * 1000 ), 1000 )
			// Тише цели на 6 dB — усиление вдвое.
			$mol_assert_equal( Math.round( $bog_music_gain.factor( -20 ) * 100 ), 200 )
			// Громче цели на 6 dB — вдвое тише.
			$mol_assert_equal( Math.round( $bog_music_gain.factor( -8 ) * 100 ), 50 )
		},

		'Множитель зажат пределами'() {
			$mol_assert_equal( $bog_music_gain.factor( -100 ), Math.pow( 10, 12 / 20 ) )
			$mol_assert_equal( $bog_music_gain.factor( 20 ), Math.pow( 10, -20 / 20 ) )
		},

		'Громкость ровного сигнала'() {
			const hop = 4800
			const lufs = $bog_music_gain.integrated( power_of( 20, 0.01, hop ), hop )!
			// -0.691 + 10 * log10( 0.01 )
			$mol_assert_ok( Math.abs( lufs + 20.691 ) < 0.01 )
		},

		'Тишина в конце записи не занижает громкость'() {
			const hop = 4800
			const power = new Float64Array( 40 )
			power.set( power_of( 20, 0.01, hop ), 0 )
			power.fill( 1e-9 * hop, 20 )
			const lufs = $bog_music_gain.integrated( power, hop )!
			$mol_assert_ok( Math.abs( lufs + 20.691 ) < 0.5 )
		},

		'Сплошная тишина не измеряется'() {
			$mol_assert_equal( $bog_music_gain.integrated( new Float64Array( 20 ), 4800 ), null )
			$mol_assert_equal( $bog_music_gain.integrated( new Float64Array( 2 ), 4800 ), null )
		},

	})

}
