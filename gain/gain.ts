namespace $ {

	/**
	 * Выравнивание громкости треков: интегральный RMS-уровень записи меряется
	 * один раз (лениво, при первом проигрывании) и хранится в baza; при
	 * воспроизведении все треки приводятся к target_db.
	 */
	export class $bog_music_gain extends $mol_object {

		/** Целевой уровень (dB RMS относительно full scale). */
		static target_db = -14

		/** Интегральный RMS-уровень записи в dBFS. */
		static async measure_db(buf: ArrayBuffer): Promise<number> {
			const AC = (globalThis as any).OfflineAudioContext || (globalThis as any).webkitOfflineAudioContext
			const probe = new AC(1, 1, 44100)
			const audio: AudioBuffer = await probe.decodeAudioData(buf)
			let sum = 0
			let count = 0
			for (let ch = 0; ch < audio.numberOfChannels; ch++) {
				const data = audio.getChannelData(ch)
				// каждый 4-й сэмпл: точности для выравнивания хватает, в 4 раза быстрее
				for (let i = 0; i < data.length; i += 4) sum += data[i] * data[i]
				count += Math.ceil(data.length / 4)
			}
			const rms = Math.sqrt(sum / Math.max(1, count))
			return 20 * Math.log10(Math.max(rms, 1e-6))
		}

		/** Линейный множитель приведения к target_db. 1 — уровень неизвестен. */
		static factor(db: number | null): number {
			if (db == null || !Number.isFinite(db)) return 1
			const f = Math.pow(10, (this.target_db - db) / 20)
			return Math.max(0.2, Math.min(2.5, f))
		}

	}

}
