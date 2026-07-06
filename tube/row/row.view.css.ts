namespace $ {

	$mol_style_define($bog_music_tube_row, {
		flex: { direction: 'row' },
		align: { items: 'center' },
		gap: '0.5rem',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.75rem',
			right: '0.75rem',
		},

		Info: {
			flex: { direction: 'column', grow: 1 },
			minWidth: 0,
		},

		Title: {
			whiteSpace: 'nowrap',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
		},

		Subtitle: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
		},

		Status: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
		},
	})

}
