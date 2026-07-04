namespace $ {

	export interface $bog_music_pending_entry {
		key: string
		audio: $bog_music_api_audio
		mime: string
		buf: Uint8Array | ArrayBuffer
	}

	/**
	 * Очередь треков, сохранённых кнопкой на vk.com: content.js → background.js
	 * (скачивает HLS) → IDB `bog_music_pending`. Приложение при старте и по
	 * сообщению `pending_added` разбирает очередь в Giper Baza.
	 */
	export class $bog_music_pending extends $mol_object {

		static db_name = 'bog_music_pending'
		static store_name = 'pending'

		private static open(): Promise<IDBDatabase> {
			return new Promise((resolve, reject) => {
				const req = indexedDB.open(this.db_name, 1)
				req.onupgradeneeded = () => {
					const db = req.result
					if (!db.objectStoreNames.contains(this.store_name)) {
						db.createObjectStore(this.store_name, { keyPath: 'key' })
					}
				}
				req.onsuccess = () => resolve(req.result)
				req.onerror = () => reject(req.error)
			})
		}

		static async all(): Promise<$bog_music_pending_entry[]> {
			const db = await this.open()
			try {
				return await new Promise((resolve, reject) => {
					const tx = db.transaction([this.store_name], 'readonly')
					const req = tx.objectStore(this.store_name).getAll()
					req.onsuccess = () => resolve(req.result || [])
					req.onerror = () => reject(req.error)
				})
			} finally {
				db.close()
			}
		}

		static async remove(key: string): Promise<void> {
			const db = await this.open()
			try {
				await new Promise<void>((resolve, reject) => {
					const tx = db.transaction([this.store_name], 'readwrite')
					tx.objectStore(this.store_name).delete(key)
					tx.oncomplete = () => resolve()
					tx.onerror = () => reject(tx.error)
					tx.onabort = () => reject(tx.error)
				})
			} finally {
				db.close()
			}
		}

	}

}
