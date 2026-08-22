namespace $.$$ {

	/**
	 * График эквалайзера: точки на общей кривой, как в Я.Музыке. Компонент
	 * только рисует и отдаёт события указателя наружу — какая полоса поехала и
	 * куда, считает владелец (плеер): он же держит настройки.
	 *
	 * Кривая проходит ЧЕРЕЗ точки, а не повторяет расчётную АЧХ. Так у Яндекса,
	 * и так честнее для управления: полосы разведены достаточно (соседу от
	 * поднятой полосы достаётся полтора децибела), чтобы кривая совпадала со
	 * слышимым, а рисовать настоящую АЧХ значило бы уводить линию мимо точки,
	 * за которую человек тянет.
	 */
	export class $bog_music_eq_curve extends $.$bog_music_eq_curve {

		/** Система координат графика. Совпадает с aspectRatio в стилях. */
		static width = 240
		static height = 110
		/** Полувысота поля от нуля: остаток — поля под радиус точки. */
		static amplitude = 45

		view_box() {
			return `0 0 ${ $bog_music_eq_curve.width } ${ $bog_music_eq_curve.height }`
		}

		gains(): readonly number[] {
			return $bog_music_eq.clamp( super.gains() )
		}

		/** Колонки стоят по центрам шести равных долей ширины — как подписи. */
		static column( index: number ) {
			return this.width * ( index + 0.5 ) / $bog_music_eq.bands.length
		}

		static row( db: number ) {
			return this.height / 2 - db / $bog_music_eq.range_db * this.amplitude
		}

		/** Усиление по вертикальной доле касания. Края поля — потолок диапазона. */
		static db_at( part: number ) {
			const db = ( this.height / 2 - part * this.height ) / this.amplitude * $bog_music_eq.range_db
			const range = $bog_music_eq.range_db
			return Math.round( Math.max( -range, Math.min( range, db ) ) )
		}

		/** Полоса, к колонке которой ближе всего точка касания. */
		static band_at( x: number ) {
			const step = this.width / $bog_music_eq.bands.length
			const index = Math.floor( x / step )
			return Math.max( 0, Math.min( $bog_music_eq.bands.length - 1, index ) )
		}

		zero_x1() { return '0' }
		zero_x2() { return String( $bog_music_eq_curve.width ) }
		zero_y() { return String( $bog_music_eq_curve.height / 2 ) }

		// ---------- подписи ----------

		db_list() {
			return this.gains().map( ( _, index ) => this.Db( index ) )
		}

		db_text( index: number ) {
			return $bog_music_eq.db_text( this.gains()[ index ] )
		}

		db_color( index: number ) {
			return $bog_music_eq.color( this.gains()[ index ] )
		}

		freq_list() {
			return $bog_music_eq.bands.map( ( _, index ) => this.Freq( index ) )
		}

		freq_text( index: number ) {
			return $bog_music_eq.bands[ index ].title
		}

		// ---------- точки ----------

		dot_list() {
			return this.gains().map( ( _, index ) => this.Dot( index ) )
		}

		dot_x( index: number ) {
			return String( $bog_music_eq_curve.column( index ) )
		}

		dot_y( index: number ) {
			return String( $bog_music_eq_curve.row( this.gains()[ index ] ) )
		}

		dot_color( index: number ) {
			return $bog_music_eq.color( this.gains()[ index ] )
		}

		// ---------- заливка линии ----------
		// Градиент по всей ширине: цвет линии в каждой колонке равен цвету своей
		// точки, между колонками браузер разводит сам.

		gradient_id() {
			return `${ this }_gradient`
		}

		curve_stroke() {
			return `url(#${ this.gradient_id() })`
		}

		stop_list() {
			return this.gains().map( ( _, index ) => this.Stop( index ) )
		}

		stop_offset( index: number ) {
			return `${ ( $bog_music_eq_curve.column( index ) / $bog_music_eq_curve.width * 100 ).toFixed( 2 ) }%`
		}

		stop_color( index: number ) {
			return $bog_music_eq.color( this.gains()[ index ] )
		}

		// ---------- сама линия ----------

		/**
		 * Гладкая кривая через точки (Catmull-Rom, переведённый в кубические
		 * Безье). По краям добавлены точки у самых границ на высоте крайних
		 * полос: без них линия обрывалась бы на первой точке, а у Яндекса она
		 * доходит до края поля.
		 */
		curve_geometry() {
			const gains = this.gains()
			const { width } = $bog_music_eq_curve
			const points = gains.map( ( db, index ) => [
				$bog_music_eq_curve.column( index ),
				$bog_music_eq_curve.row( db ),
			] as const )
			const all = [
				[ 0, points[ 0 ][ 1 ] ] as const,
				... points,
				[ width, points[ points.length - 1 ][ 1 ] ] as const,
			]

			let path = `M ${ all[ 0 ][ 0 ] } ${ all[ 0 ][ 1 ].toFixed( 2 ) }`
			for( let i = 0; i < all.length - 1; i++ ) {
				const prev = all[ Math.max( 0, i - 1 ) ]
				const from = all[ i ]
				const to = all[ i + 1 ]
				const next = all[ Math.min( all.length - 1, i + 2 ) ]
				const c1x = from[ 0 ] + ( to[ 0 ] - prev[ 0 ] ) / 6
				const c1y = from[ 1 ] + ( to[ 1 ] - prev[ 1 ] ) / 6
				const c2x = to[ 0 ] - ( next[ 0 ] - from[ 0 ] ) / 6
				const c2y = to[ 1 ] - ( next[ 1 ] - from[ 1 ] ) / 6
				path += ` C ${ c1x.toFixed( 2 ) } ${ c1y.toFixed( 2 ) }`
					+ `, ${ c2x.toFixed( 2 ) } ${ c2y.toFixed( 2 ) }`
					+ `, ${ to[ 0 ].toFixed( 2 ) } ${ to[ 1 ].toFixed( 2 ) }`
			}
			return path
		}

	}

}
