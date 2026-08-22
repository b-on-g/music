namespace $ {

	/**
	 * Шестиполосный эквалайзер. Раскладка и названия пресетов — как в Я.Музыке
	 * на Android: 60 / 150 / 400 / 1.0k / 2.4k / 15k Гц.
	 *
	 * Крайние полосы — шельфы: низ и верх двигают целиком, а колокол цепляет
	 * только свою метку и спадает по обе стороны от неё. Средние четыре —
	 * колокола с Q=1.4, около октавы на полосу: полосы стоят в 1.3 октавы друг
	 * от друга, и при более широком колоколе они бы заметно складывались.
	 *
	 * У шельфа `frequency` — середина перехода, где набрана ПОЛОВИНА усиления,
	 * а не начало полки, поэтому углы стоят выше своих меток. Замерено
	 * (getFrequencyResponse, +12 на одну полосу, остальные в нуле):
	 *
	 *   полоса 60    → +9.7 на 60 Гц,  +1.7 на 150 Гц
	 *   полоса 150   → +12  на 150 Гц, +1.5 на 60 и +1.3 на 400
	 *   полоса 15000 → +11  на 15 кГц, 0 на 2.4 кГц
	 *
	 * То есть каждый ползунок делает то, что написано на его метке, а соседу
	 * достаётся полтора децибела — нарисованная кривая совпадает со слышимым.
	 */
	export class $bog_music_eq extends $mol_object {

		static bands: readonly {
			/** Частота фильтра. У шельфов выше метки: там половина усиления. */
			freq: number
			type: 'lowshelf' | 'peaking' | 'highshelf'
			/** Что написано под точкой на графике. */
			title: string
		}[] = [
			{ freq: 90, type: 'lowshelf', title: '60 Hz' },
			{ freq: 150, type: 'peaking', title: '150 Hz' },
			{ freq: 400, type: 'peaking', title: '400 Hz' },
			{ freq: 1000, type: 'peaking', title: '1.0 kHz' },
			{ freq: 2400, type: 'peaking', title: '2.4 kHz' },
			{ freq: 10000, type: 'highshelf', title: '15 kHz' },
		]

		/** Добротность колоколов. */
		static q = 1.4

		/**
		 * Потолок полосы (dB). Тот же, что gain_max_db у автогромкости: выше
		 * лимитер на плотных миксах начинает дышать слышимо.
		 */
		static range_db = 12

		/**
		 * Пресеты. Названия и порядок — как в Я.Музыке; формы подобраны под нашу
		 * сетку полос по смыслу названия, а не скопированы из чужих таблиц.
		 * `default` первым: ровная кривая, она же состояние «ничего не трогали».
		 */
		static presets: readonly { id: string, title: string, gains: readonly number[] }[] = [
			{ id: 'default', title: 'По умолчанию', gains: [ 0, 0, 0, 0, 0, 0 ] },
			{ id: 'classic', title: 'Классическая музыка', gains: [ 4, 2, 0, -1, -3, 4 ] },
			{ id: 'club', title: 'Клубная музыка', gains: [ 0, 2, 5, 5, 3, 0 ] },
			{ id: 'dance', title: 'Танцевальная музыка', gains: [ 7, 5, 0, -2, 2, 5 ] },
			{ id: 'bass', title: 'Усиление НЧ', gains: [ 10, 7, 3, 0, 0, 0 ] },
			{ id: 'bass_treble', title: 'Усиление НЧ и ВЧ', gains: [ 9, 6, 1, -2, 3, 8 ] },
			{ id: 'treble', title: 'Усиление ВЧ', gains: [ 0, 0, 0, 2, 5, 10 ] },
		]

		/** Подпись состояния, которое ни одному пресету не соответствует. */
		static custom_title = 'Своя настройка'

		/** Все полосы в нуле — сигнал проходит нетронутым. */
		static flat(): number[] {
			return this.bands.map( () => 0 )
		}

		static preset( id: string ): number[] | null {
			const found = this.presets.find( preset => preset.id === id )
			return found ? found.gains.slice() : null
		}

		/** Пресет, совпадающий с набором, или '' — значит «Свой». */
		static preset_of( gains: readonly number[] ): string {
			const norm = this.clamp( gains )
			const found = this.presets.find(
				preset => preset.gains.every( ( db, i ) => db === norm[ i ] )
			)
			return found ? found.id : ''
		}

		/**
		 * Привести чужой набор к нашему: длина по числу полос, целые dB в
		 * пределах диапазона. Набор приезжает из baza и мог быть записан
		 * версией с другим числом полос — недостающие в ноль, лишние прочь.
		 */
		static clamp( gains: readonly number[] | null | undefined ): number[] {
			return this.bands.map( ( _, i ) => {
				const db = Number( gains?.[ i ] )
				if( !Number.isFinite( db ) ) return 0
				return Math.round( Math.max( -this.range_db, Math.min( this.range_db, db ) ) )
			} )
		}

		/**
		 * Цвет точки по её усилению, как на графике в Я.Музыке: красный наверху,
		 * жёлтый в нуле, зелёный внизу.
		 */
		static color( db: number ): string {
			const part = Math.max( -1, Math.min( 1, db / this.range_db ) )
			const hue = part >= 0 ? 50 - part * 50 : 50 - part * 70
			return `hsl( ${ hue.toFixed( 0 ) } 80% 55% )`
		}

		/** Подпись усиления над точкой. */
		static db_text( db: number ): string {
			return `${ db } dB`
		}

		/** Набор одной строкой — так он и лежит в baza. */
		static stringify( gains: readonly number[] ): string {
			return this.clamp( gains ).join( ',' )
		}

		static parse( text: string | null | undefined ): number[] {
			if( !text ) return this.flat()
			return this.clamp( text.split( ',' ).map( Number ) )
		}

	}

}
