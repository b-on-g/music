namespace $ {

	/**
	 * Расширение `$giper_baza_atom_link.to` с автоматическим запуском `.sync()`
	 * на target-land при чтении ссылки: стандартный `remote()` только создаёт
	 * Pawn proxy без триггера sync. Благодаря обёртке достаточно прочитать
	 * ссылку (например, отрендерив трек) — синхронизация blob-land стартует
	 * сама, view-слой о ней не думает.
	 */
	export function $bog_music_link_synced<const Value extends any>(Value: Value) {
		const Base = $giper_baza_atom_link.to(Value)
		class $bog_music_link_synced extends Base {
			remote(next?: any) {
				const r = (super.remote as any)(next)
				if (r && next === undefined) {
					try {
						(r as any).land().sync()
					} catch (e: any) {
						// Promise = sync пошёл в фоне, ждать его здесь не нужно.
						if (!(e instanceof Promise)) throw e
					}
				}
				return r
			}
		}
		return $bog_music_link_synced as typeof Base
	}

}
