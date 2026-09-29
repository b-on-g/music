namespace $ {

	const dismissed = new WeakSet< $mol_pop >()

	/**
	 * Тап мимо панели закрывает её. Сам $mol_pop закрывается, только когда
	 * фокус уезжает на другой фокусируемый элемент, а тап по пустому месту
	 * на телефоне фокус никуда не переносит — панель висела бы на экране.
	 */
	export function $bog_music_pop_dismiss( pop: $mol_pop ) {
		if( dismissed.has( pop ) ) return
		dismissed.add( pop )
		window.addEventListener( 'pointerdown', event => {
			if( !pop.showed() ) return
			const target = event.target as Node | null
			if( !target ) return
			if( pop.dom_node().contains( target ) ) return
			if( pop.Bubble().dom_node().contains( target ) ) return
			pop.showed( false )
		}, true )
	}

	/**
	 * Тап по якорю открывает и закрывает панель. $mol_pop_over для этого не
	 * годится: он показан, пока «в фокусе ИЛИ под курсором», а на телефоне
	 * фокус остаётся на кнопке, и повторный тап ничего не закрывает.
	 */
	export function $bog_music_pop_toggle( pop: $mol_pop ) {
		const showed = pop.showed()
		pop.showed( !showed )
		if( !showed ) $bog_music_pop_dismiss( pop )
		return !showed
	}

}
