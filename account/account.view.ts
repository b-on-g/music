namespace $.$$ {

	export class $bog_music_account extends $.$bog_music_account {

		account() {
			return $bog_music_account_baza.home()
		}

		nickname(next?: string) {
			return this.account().nickname(next)
		}

		@$mol_mem
		lord_short() {
			const auth = this.$.$giper_baza_auth.current()
			if (!auth) return '—'
			return auth.pass().lord().str.slice(0, 8) + '…'
		}

		// download_playlist? и download_playlist_status прибиндены в app.view.tree
		// — логика скачивания живёт в $bog_music_app.

		download_playlist_label() {
			return $bog_music_api.in_extension() ? this.ext_label() : this.pwa_label()
		}

		download_playlist_hint() {
			return $bog_music_api.in_extension() ? this.ext_hint() : this.pwa_hint()
		}

		// ---------- перенос аккаунта между устройствами ----------

		account_key() {
			return String(this.$.$mol_state_local.value('$giper_baza_auth') ?? '')
		}

		account_link() {
			const key = this.account_key()
			if (!key) return ''
			const base = $bog_music_boot.in_extension()
				? 'https://b-on-g.github.io/music/'
				: location.origin + location.pathname + location.search
			return base + '#account=' + encodeURIComponent(key)
		}

		@$mol_mem
		copy_status(next?: string) {
			return next ?? ''
		}

		@$mol_action
		copy() {
			const link = this.account_link()
			if (!link) {
				this.copy_status('Ключ не найден')
				return
			}
			try {
				navigator.clipboard.writeText(link)
				this.copy_status('Скопировано. Не делись публично!')
			} catch (e: any) {
				console.warn('[account] clipboard failed:', e?.message)
				this.copy_status('Не удалось — скопируй из адресной строки: ' + link)
			}
		}

		@$mol_mem
		import_link(next?: string) {
			return next ?? ''
		}

		@$mol_mem
		import_status(next?: string) {
			return next ?? ''
		}

		@$mol_action
		apply_import() {
			const raw = this.import_link().trim()
			if (!raw) {
				this.import_status('Вставь ссылку с #account=…')
				return
			}
			const match = raw.match(/[#&]account=([^&\s]+)/)
			const key = match ? decodeURIComponent(match[1]) : raw
			if (key.length < 172) {
				this.import_status('Ключ слишком короткий')
				return
			}
			const current = this.$.$mol_state_local.value('$giper_baza_auth')
			if (current !== key) this.$.$mol_state_local.value('$giper_baza_auth', key)
			this.import_status(current === key ? 'Перезапуск…' : 'Применено, перезагрузка…')
			location.reload()
		}

		@$mol_action
		reset_account() {
			if (typeof window === 'undefined') return
			try {
				const ext = (globalThis as any).chrome
				if (ext?.storage?.local?.clear) ext.storage.local.clear()
			} catch {}
			try { window.localStorage.clear() } catch {}
			try {
				const idb = (globalThis as any).indexedDB
				if (idb?.deleteDatabase) {
					idb.deleteDatabase('$giper_baza_mine')
					idb.deleteDatabase('vk_audio_cache') // legacy-кеш старых версий
				}
			} catch {}
			setTimeout(() => location.reload(), 100)
		}

	}
}
