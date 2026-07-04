namespace $ {

	/**
	 * Минимальный ZIP-энкодер (STORE, без компрессии — аудио и так сжато).
	 * Используется для выгрузки плейлиста файлом в PWA-режиме.
	 */
	export class $bog_music_zip extends $mol_object {

		/** Имя файла внутри архива: `001 - Artist - Title.mp3`. */
		static entry_name(index: number, artist: string, title: string, mime: string): string {
			const ext_map: Record<string, string> = {
				'audio/mpeg': 'mp3',
				'audio/mp3': 'mp3',
				'audio/mp4': 'm4a',
				'audio/aac': 'aac',
				'audio/ogg': 'ogg',
				'audio/webm': 'webm',
				'audio/wav': 'wav',
				'audio/flac': 'flac',
			}
			const ext = ext_map[(mime || '').toLowerCase()] || 'mp3'
			const safe = (s: string) => (s || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().slice(0, 80)
			const num = String(index).padStart(3, '0')
			return `${num} - ${safe(artist) || 'unknown'} - ${safe(title) || 'unknown'}.${ext}`
		}

		private static _crc32_table: Uint32Array | null = null

		private static crc32_table() {
			if (this._crc32_table) return this._crc32_table
			const t = new Uint32Array(256)
			for (let i = 0; i < 256; i++) {
				let c = i
				for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1)
				t[i] = c
			}
			this._crc32_table = t
			return t
		}

		private static crc32(data: Uint8Array): number {
			const t = this.crc32_table()
			let crc = 0xFFFFFFFF
			for (let i = 0; i < data.length; i++) crc = (crc >>> 8) ^ t[(crc ^ data[i]) & 0xFF]
			return (crc ^ 0xFFFFFFFF) >>> 0
		}

		static build(files: { name: string, data: Uint8Array }[]): ArrayBuffer {
			const enc = new TextEncoder()
			type Entry = { name: Uint8Array, data: Uint8Array, crc: number, offset: number }
			const entries: Entry[] = files.map(f => ({
				name: enc.encode(f.name),
				data: f.data,
				crc: this.crc32(f.data),
				offset: 0,
			}))
			let local_size = 0
			let cd_size = 0
			for (const e of entries) {
				local_size += 30 + e.name.length + e.data.length
				cd_size += 46 + e.name.length
			}
			const ab = new ArrayBuffer(local_size + cd_size + 22)
			const buf = new Uint8Array(ab)
			const view = new DataView(ab)
			let off = 0
			for (const e of entries) {
				e.offset = off
				view.setUint32(off, 0x04034b50, true)
				view.setUint16(off + 4, 20, true)
				view.setUint16(off + 6, 0x0800, true) // UTF-8 filename
				view.setUint16(off + 8, 0, true) // STORE
				view.setUint16(off + 10, 0, true)
				view.setUint16(off + 12, 0, true)
				view.setUint32(off + 14, e.crc, true)
				view.setUint32(off + 18, e.data.length, true)
				view.setUint32(off + 22, e.data.length, true)
				view.setUint16(off + 26, e.name.length, true)
				view.setUint16(off + 28, 0, true)
				buf.set(e.name, off + 30)
				buf.set(e.data, off + 30 + e.name.length)
				off += 30 + e.name.length + e.data.length
			}
			const cd_off = off
			for (const e of entries) {
				view.setUint32(off, 0x02014b50, true)
				view.setUint16(off + 4, 20, true)
				view.setUint16(off + 6, 20, true)
				view.setUint16(off + 8, 0x0800, true)
				view.setUint16(off + 10, 0, true)
				view.setUint16(off + 12, 0, true)
				view.setUint16(off + 14, 0, true)
				view.setUint32(off + 16, e.crc, true)
				view.setUint32(off + 20, e.data.length, true)
				view.setUint32(off + 24, e.data.length, true)
				view.setUint16(off + 28, e.name.length, true)
				view.setUint16(off + 30, 0, true)
				view.setUint16(off + 32, 0, true)
				view.setUint16(off + 34, 0, true)
				view.setUint16(off + 36, 0, true)
				view.setUint32(off + 38, 0, true)
				view.setUint32(off + 42, e.offset, true)
				buf.set(e.name, off + 46)
				off += 46 + e.name.length
			}
			view.setUint32(off, 0x06054b50, true)
			view.setUint16(off + 4, 0, true)
			view.setUint16(off + 6, 0, true)
			view.setUint16(off + 8, entries.length, true)
			view.setUint16(off + 10, entries.length, true)
			view.setUint32(off + 12, cd_size, true)
			view.setUint32(off + 16, cd_off, true)
			view.setUint16(off + 20, 0, true)
			return ab
		}

	}

}
