namespace $ {

	/**
	 * Секрет устройства для нашего маленького backend'а (телеграм-инбокс,
	 * скробблинг). Живёт в localStorage, в baza не едет: на каждом устройстве
	 * связка своя, и потеря кода не роняет ни аккаунт, ни треки.
	 *
	 * Не путать с ключом аккаунта Гипер Базы — тот открывает всю музыку, этот
	 * только очередь пересланного и сессию last.fm.
	 */
	export class $bog_music_code extends $mol_object {

		/** Текущий код, '' — ещё не заводили. */
		static value(name: string, next?: string): string {
			return ($mol_state_local.value(name, next) as string) ?? ''
		}

		/** Код, заводя его при первом обращении. Только из @$mol_action. */
		static ensure(name: string): string {
			return this.value(name) || this.value(name, this.random())
		}

		/** 96 бит hex: перебором не угадать, в URL и диплинк лезет как есть. */
		static random(): string {
			const bytes = new Uint8Array(12)
			crypto.getRandomValues(bytes)
			return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
		}

		/** Формат, который принимает сервер. */
		static valid(code: string): boolean {
			return /^[A-Za-z0-9_-]{8,64}$/.test(code)
		}

	}

}
