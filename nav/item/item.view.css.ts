namespace $ {

	$mol_style_define($bog_music_nav_item, {
		flex: { direction: 'column', grow: 1, basis: '0%' },
		align: { items: 'center' },
		justify: { content: 'center' },
		gap: '2px',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},
		minWidth: 0,
		minHeight: '3.5rem',
		cursor: 'pointer',
		userSelect: 'none',
		borderRadius: '0.75rem',
		color: $mol_theme.shade,
		background: { color: 'transparent' },
		transition: 'color 120ms ease, background-color 120ms ease',

		Icon: {
			width: '1.5rem',
			height: '1.5rem',
			color: 'inherit',
		},

		Label: {
			font: { size: '0.6875rem', weight: 500 },
			color: 'inherit',
			whiteSpace: 'nowrap',
		},

		':hover': {
			background: { color: $mol_theme.hover },
			color: $mol_theme.text,
		},

		'@': {
			bog_music_nav_active: {
				on: {
					color: $mol_theme.focus,
				},
			},
		},
	})

}
