namespace $ {

	/**
	 * Выравнивание громкости треков по EBU R128 (ITU-R BS.1770): интегральная
	 * громкость записи в LUFS меряется один раз, лениво, при первом
	 * проигрывании и хранится в baza; при воспроизведении все треки
	 * приводятся к target_lufs.
	 *
	 * Раньше мерили обычный RMS. Он не совпадает с восприятием: басовитая
	 * запись по RMS громче, чем звучит, и после «выравнивания» оказывалась
	 * тише соседней. R128 сначала прогоняет сигнал через K-взвешивание
	 * (подъём верха + обрез низа), потом усредняет по 400-мс блокам с
	 * отсечкой тишины — по этому же стандарту нормализуют Spotify и YouTube.
	 */
	export class $bog_music_gain extends $mol_object {

		/** Целевая громкость (LUFS). -14 — как у Spotify/YouTube Music. */
		static target_lufs = -14

		/** Потолок усиления (dB): выше вытащим шум и дыхание зала. */
		static gain_max_db = 12

		/** Предел приглушения (dB). */
		static gain_min_db = -20

		/** Абсолютный гейт: блоки тише этого — тишина, в среднее не идут. */
		static gate_abs = -70

		/** Считаем на 48 кГц — частота, для которой BS.1770 задаёт фильтры. */
		static rate = 48000

		/**
		 * Коэффициенты K-взвешивания из BS.1770 для 48 кГц.
		 * Первый каскад — шельф +4 dB от ~1.5 кГц (голова и ушная раковина
		 * подчёркивают верх), второй — обрез ниже ~40 Гц (низы весят по
		 * энергии больше, чем слышны).
		 */
		static shelf: readonly number[] = [ 1.53512485958697, -2.69169618940638, 1.19839281085285, -1.69065929318241, 0.73248077421585 ]
		static cut: readonly number[] = [ 1.0, -2.0, 1.0, -1.99004745483398, 0.99007225036621 ]

		/**
		 * Интегральная громкость записи в LUFS. null — мерить нечего:
		 * запись короче 400 мс или сплошная тишина.
		 */
		static async measure_lufs( buf: ArrayBuffer ): Promise<number | null> {
			const audio = await this.decode( buf )
			const hop = Math.round( audio.sampleRate / 10 ) // 100 мс
			const hops = Math.floor( audio.length / hop )
			if( hops < 4 ) return null

			// Сумма квадратов по каждому 100-мс куску, взвешенная по каналам.
			const power = new Float64Array( hops )
			for( let ch = 0; ch < audio.numberOfChannels; ch++ ) {
				// Фильтруем на месте: копия целого трека на телефоне лишняя,
				// декодированный буфер всё равно выбрасываем сразу после замера.
				const data = audio.getChannelData( ch )
				// Между проходами отпускаем поток: каждый — это десятки
				// миллионов операций, и без пауз отрисовка встала бы колом.
				this.biquad( data, this.shelf )
				await this.breathe()
				this.biquad( data, this.cut )
				await this.breathe()
				const weight = ch < 3 ? 1 : 1.41 // тыловые каналы весят больше
				for( let h = 0; h < hops; h++ ) {
					let sum = 0
					const end = ( h + 1 ) * hop
					for( let i = h * hop; i < end; i++ ) sum += data[ i ] * data[ i ]
					power[ h ] += weight * sum
				}
				await this.breathe()
			}

			return this.integrated( power, hop )
		}

		/**
		 * Интегральная громкость по мощности 100-мс кусков. Блок — 400 мс
		 * (4 куска) с шагом в один кусок, дальше двойной гейт: сначала
		 * выкидываем тишину, потом всё, что на 10 LU тише среднего по
		 * оставшемуся — иначе долгие тихие проигрыши тянут оценку вниз.
		 */
		static integrated( power: Float64Array, hop: number ): number | null {
			const size = hop * 4
			const blocks: number[] = []
			for( let h = 0; h + 4 <= power.length; h++ ) {
				const mean = ( power[ h ] + power[ h + 1 ] + power[ h + 2 ] + power[ h + 3 ] ) / size
				if( mean > 0 ) blocks.push( mean )
			}
			if( !blocks.length ) return null

			const loud = ( mean: number ) => -0.691 + 10 * Math.log10( mean )
			const mean_of = ( list: number[] ) => list.reduce( ( sum, mean ) => sum + mean, 0 ) / list.length

			const heard = blocks.filter( mean => loud( mean ) > this.gate_abs )
			if( !heard.length ) return null
			const gate_rel = loud( mean_of( heard ) ) - 10
			const rest = heard.filter( mean => loud( mean ) > gate_rel )
			if( !rest.length ) return null
			return loud( mean_of( rest ) )
		}

		/** Линейный множитель приведения записи к target_lufs. */
		static factor( lufs: number | null ): number {
			if( lufs == null || !Number.isFinite( lufs ) ) return 1
			const db = Math.max( this.gain_min_db, Math.min( this.gain_max_db, this.target_lufs - lufs ) )
			return Math.pow( 10, db / 20 )
		}

		/** Отпустить поток, чтобы браузер успел отрисовать кадр. */
		static breathe(): Promise<void> {
			return new Promise<void>( done => setTimeout( done, 0 ) )
		}

		/** Каскад БИХ-фильтра (direct form I) по сэмплам, на месте. */
		static biquad( data: Float32Array, c: readonly number[] ) {
			let x1 = 0, x2 = 0, y1 = 0, y2 = 0
			for( let i = 0; i < data.length; i++ ) {
				const x = data[ i ]
				const y = c[ 0 ] * x + c[ 1 ] * x1 + c[ 2 ] * x2 - c[ 3 ] * y1 - c[ 4 ] * y2
				x2 = x1; x1 = x
				y2 = y1; y1 = y
				data[ i ] = y
			}
		}

		/**
		 * Декод в 48 кГц: decodeAudioData отдаёт сэмплы на частоте контекста,
		 * так что коэффициенты фильтров подходят без пересчёта. Safari отдаёт
		 * результат колбэком, остальные — промисом.
		 */
		static decode( buf: ArrayBuffer ): Promise<AudioBuffer> {
			const OAC = ( globalThis as any ).OfflineAudioContext ?? ( globalThis as any ).webkitOfflineAudioContext
			const ctx = new OAC( 1, 1, this.rate ) as OfflineAudioContext
			return new Promise<AudioBuffer>( ( done, fail ) => {
				const ret = ctx.decodeAudioData( buf, done, fail ) as any
				if( ret && typeof ret.then === 'function' ) ret.then( done, fail )
			} )
		}

	}

}
