namespace $.$$ {

	/**
	 * Панель памяти стоит на том же экране, что и журнал, и должна читаться
	 * как один с ним блок: та же карточка, те же отступы, тот же размер шрифта.
	 */
	$mol_style_define( $bog_music_mem_view, {

		flex: { direction: 'column' },
		gap: '0.25rem',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		// Отбивка от журнала, который идёт следом на том же экране.
		margin: { bottom: '0.5rem' },

		Head: {
			flex: {
				direction: 'row',
				wrap: 'wrap',
			},
			justifyContent: 'space-between',
			alignItems: 'center',
			gap: '0.5rem',
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.25rem',
				right: '0.25rem',
			},
		},

		// Заголовок забирает свободное место, чтобы обе кнопки встали парой
		// справа, а не разъехались по всей ширине из-за space-between.
		Title: {
			font: { weight: 600 },
			flex: { grow: 1, shrink: 1 },
			minWidth: '0',
		},

		Heap: {
			font: {
				size: '0.8125rem',
				family: 'monospace',
			},
			minWidth: '0',
			overflowWrap: 'anywhere',
			padding: {
				top: '0.375rem',
				bottom: '0.375rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			border: { radius: $mol_gap.round },
			background: { color: $mol_theme.card },
		},

		Counters: {
			font: {
				size: '0.8125rem',
				family: 'monospace',
			},
			minWidth: '0',
			overflowWrap: 'anywhere',
			padding: {
				top: '0.375rem',
				bottom: '0.375rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			border: { radius: $mol_gap.round },
			background: { color: $mol_theme.card },
		},

		Audit: {
			font: {
				size: '0.8125rem',
				family: 'monospace',
			},
			minWidth: '0',
			overflowWrap: 'anywhere',
			padding: {
				top: '0.375rem',
				bottom: '0.375rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			border: { radius: $mol_gap.round },
			background: { color: $mol_theme.card },
		},

		Hint: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			padding: {
				top: '0.25rem',
				left: '0.25rem',
				right: '0.25rem',
			},
		},

	} )

}
