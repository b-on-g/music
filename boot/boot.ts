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
			this.fix_yard_masters()
			this.bridge_vk_token()
			this.import_account_hash()
			this.parse_share_hash()
		}

		static in_extension(): boolean {
			if (typeof location === 'undefined') return false
			const proto = location.protocol
			return proto === 'chrome-extension:' || proto === 'moz-extension:'
		}

		/**
		 * В chrome-extension контексте `location.origin` имеет схему
		 * `chrome-extension://`, и yard.web.ts пушит его в masters_default; peers
		 * из Seed могут принести относительные URL с той же проблемой. Любой
		 * такой URL → `new WebSocket(...)` → SyntaxError. Чистим список и
		 * подкладываем актуальный master (bundled Seed на холодном старте может
		 * не успеть отдать его до первого connect).
		 */
		static fix_yard_masters() {
			try {
				if (!this.in_extension()) return

				const FALLBACK_MASTER = 'https://baza.91.219.148.98.ip.giper.dev/'

				const yard = $giper_baza_yard as any
				const list: string[] = yard.masters_default
				for (let i = list.length - 1; i >= 0; i--) {
					const stale = list[i] === 'https://baza.giper.dev/' // мёртвый мастер
					if (stale || !/^(http|https|ws|wss):/.test(list[i])) list.splice(i, 1)
				}
				if (!list.includes(FALLBACK_MASTER)) list.push(FALLBACK_MASTER)

				if (!yard.__bog_music_masters_patched) {
					const orig = yard.masters.bind(yard)
					Object.defineProperty(yard, 'masters', {
						configurable: true,
						value: function() {
							const all = orig() as string[]
							return all.filter(url => /^(http|https|ws|wss):/.test(url))
						},
					})
					yard.__bog_music_masters_patched = true
				}
			} catch (e: any) {
				console.warn('[boot] yard masters fix failed:', e?.message)
			}
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
