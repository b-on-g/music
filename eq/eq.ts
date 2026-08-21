namespace $ {

	/**
	 * Пятиполосный эквалайзер. Раскладка частот — как у системного эквалайзера
	 * Android и Я.Музыки: 60 / 230 / 910 / 3600 / 14000 Гц.
	 *
	 * Крайние полосы — шельфы, а не колокола. «Добавить глубины» означает
	 * поднять весь низ до 60 Гц; колокол на 60 Гц поднял бы узкую горку и
	 * оставил самое дно нетронутым. Средние три — колокола с Q=1: примерно
	 * полторы октавы на полосу, соседние сходятся без провалов между ними.
	 */
	export class $bog_music_eq extends $mol_object {

		static bands: readonly {
			freq: number
			type: 'lowshelf' | 'peaking' | 'highshelf'
			title: string
		}[] = [
			{ freq: 60, type: 'lowshelf', title: '60' },
			{ freq: 230, type: 'peaking', title: '230' },
			{ freq: 910, type: 'peaking', title: '910' },
			{ freq: 3600, type: 'peaking', title: '3.6K' },
			{ freq: 14000, type: 'highshelf', title: '14K' },
		]

		/** Добротность колоколов. */
		static q = 1

		/**
		 * Потолок полосы (dB). Тот же, что gain_max_db у автогромкости: выше
		 * лимитер на плотных миксах начинает дышать слышимо.
		 */
		static range_db = 12

		/**
		 * Пресеты. Формы взяты у классических эквалайзеров и сведены с десяти
		 * полос к нашим пяти. `flat` первым — это же и состояние «выключено».
		 */
		static presets: readonly { id: string, title: string, gains: readonly number[] }[] = [
			{ id: 'flat', title: 'Плоский', gains: [ 0, 0, 0, 0, 0 ] },
			{ id: 'bass', title: 'Глубокий бас', gains: [ 8, 4, 0, 0, 1 ] },
			{ id: 'pop', title: 'Поп', gains: [ -1, 4, 2, -1, -1 ] },
			{ id: 'rock', title: 'Рок', gains: [ 5, 3, -1, 2, 4 ] },
			{ id: 'jazz', title: 'Джаз', gains: [ 4, 2, -2, 0, 4 ] },
			{ id: 'classic', title: 'Классика', gains: [ 3, 0, 0, -3, -6 ] },
			{ id: 'vocal', title: 'Голос', gains: [ -2, -1, 3, 4, 1 ] },
		]

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
