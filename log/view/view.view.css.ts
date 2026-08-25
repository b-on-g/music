namespace $.$$ {

	/**
	 * `$mol_view` по умолчанию — `display: flex` в строку, поэтому каждому
	 * блоку, который должен идти сверху вниз, направление задаётся явно.
	 */
	$mol_style_define( $bog_music_log_view, {

		flex: { direction: 'column' },
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		gap: '0.25rem',

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
				bottom: '0.5rem',
				left: '0.25rem',
				right: '0.25rem',
			},
		},

		Count: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			// Счётчик уступает место кнопкам, но не режется в ноль.
			flex: { shrink: 1 },
			minWidth: 0,
		},

		Tools: {
			flex: {
				direction: 'row',
				wrap: 'wrap',
				shrink: 0,
			},
			alignItems: 'center',
			gap: '0.25rem',
		},

		Filter: {
			margin: { bottom: '0.5rem' },
		},

		Row: {
			flex: { direction: 'column' },
			gap: '0.125rem',
			padding: {
				top: '0.375rem',
				bottom: '0.375rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			border: {
				radius: $mol_gap.round,
			},
			background: { color: $mol_theme.card },

			'@': {
				bog_music_log_kind: {
					sync: {
						color: $mol_theme.shade,
					},
				},
			},
		},

		Meta: {
			flex: {
				direction: 'row',
				wrap: 'wrap',
			},
			alignItems: 'baseline',
			gap: '0.5rem',
			font: {
				size: '0.6875rem',
				family: 'monospace',
			},
			color: $mol_theme.shade,
		},

		Time: {
			flex: { shrink: 0 },
		},

		Kind: {
			flex: { shrink: 0 },
			textTransform: 'uppercase',
			letterSpacing: '0.03em',
		},

		Land: {
			// Идентификатор ленда длинный: пусть переносится, а не растягивает
			// строку и не выдавливает время с видом записи.
			minWidth: 0,
			overflowWrap: 'anywhere',
			opacity: 0.8,
		},

		Text: {
			font: {
				size: '0.8125rem',
				family: 'monospace',
			},
			// Логи — длинные строки без пробелов (ссылки, id). Без minWidth: 0
			// flex-элемент не сжимается и уезжает за край экрана.
			minWidth: 0,
			whiteSpace: 'pre-wrap',
			overflowWrap: 'anywhere',
			color: $mol_theme.text,
		},

		Empty: {
			padding: {
				top: '1rem',
				bottom: '1rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			color: $mol_theme.shade,
			font: { size: '0.8125rem' },
			textAlign: 'center',
		},

	} )

}
