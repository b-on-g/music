namespace $ {

	/**
	 * Однократные фиксы окружения. Выполняются при загрузке бандла (init()
	 * зовётся из app.view.ts на уровне модуля) — ДО первого обращения
	 * к $giper_baza_auth / yard.
	 */
	export class $bog_music_boot extends $mol_object {

		/** Токен шара из #share=… — забирается приложением один раз в auto(). */
		static share_token = ''

		static init() {
			if (typeof location === 'undefined') return
			this.bridge_vk_token()
			this.import_account_hash()
			this.parse_share_hash()
		}

		static in_extension(): boolean {
			if (typeof location === 'undefined') return false
			const proto = location.protocol
			return proto === 'chrome-extension:' || proto === 'moz-extension:'
		}

		/** Мост `chrome.storage.local.vk_token` → `localStorage.vk_token`. */
		static bridge_vk_token() {
			try {
				const ext = (globalThis as any).chrome
				if (!ext?.storage?.local?.get) return
				const apply = (token: string) => {
					if (!token) return
					try {
						if (window.localStorage.getItem('vk_token') === JSON.stringify(token)) return
						window.localStorage.setItem('vk_token', JSON.stringify(token))
						window.dispatchEvent(new StorageEvent('storage', { key: 'vk_token' }))
					} catch (e: any) {
						console.warn('[boot] vk_token write failed:', e?.message)
					}
				}
				ext.storage.local.get(['vk_token'], (r: any) => apply(r?.vk_token ?? ''))
				ext.storage.onChanged?.addListener?.((changes: any, area: string) => {
					if (area !== 'local' || !changes?.vk_token) return
					apply(changes.vk_token.newValue ?? '')
				})
			} catch (e: any) {
				console.warn('[boot] vk_token bridge failed:', e?.message)
			}
		}

		/**
		 * Импорт аккаунта из URL вида `#account=<key>`. Должен сработать ДО
		 * первого обращения к $giper_baza_auth.current().
		 */
		static import_account_hash() {
			try {
				const hash = location.hash || ''
				const match = hash.match(/[#&]account=([^&]+)/)
				if (!match) return
				const key = decodeURIComponent(match[1])
				if (key.length < 172) {
					console.warn('[boot] account key too short, ignoring')
					return
				}
				const current = $mol_state_local.value('$giper_baza_auth')
				$mol_state_local.value('$giper_baza_auth', key)
				const clean_hash = hash.replace(/[#&]?account=[^&]*/, '').replace(/^#&/, '#')
				const new_url = location.origin + location.pathname + location.search
					+ (clean_hash && clean_hash !== '#' ? clean_hash : '')
				history.replaceState(null, '', new_url)
				if (current !== key) location.reload()
			} catch (e: any) {
				console.warn('[boot] account import failed:', e?.message)
			}
		}

		/** Сохраняет токен из `#share=…`, не трогая baza (импорт — реактивно в app). */
		static parse_share_hash() {
			try {
				const match = (location.hash || '').match(/[#&]share=([^&]+)/)
				if (match) this.share_token = decodeURIComponent(match[1])
			} catch (e: any) {
				console.warn('[boot] share hash parse failed:', e?.message)
			}
		}

		/** Убирает #share=… из адресной строки после обработки. */
		static clear_share_hash() {
			try {
				const new_hash = (location.hash || '').replace(/[#&]?share=[^&]*/, '').replace(/^#&/, '#')
				const new_url = location.origin + location.pathname + location.search
					+ (new_hash && new_hash !== '#' ? new_hash : '')
				history.replaceState(null, '', new_url)
			} catch {}
			this.share_token = ''
		}

	}

}
