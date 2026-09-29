namespace $.$$ {

	const cell = {
		flex: { grow: 1, shrink: 1, basis: '0%' },
		justify: { content: 'center' },
		align: { items: 'center' },
		minWidth: 0,
	} as const

	$mol_style_define($bog_music_playlists, {
		flex: { direction: 'row' },
		align: { items: 'stretch' },
		gap: '0.25rem',
		padding: {
			top: '0.5rem',
			bottom: '0.25rem',
			left: '0.5rem',
			right: '0.5rem',
		},

		My: {
			... cell,
			textAlign: 'center',
		},

		Archive: {
			... cell,
			textAlign: 'center',
		},

		Middle: {
			... cell,
			flex: { grow: 1.5, shrink: 1, basis: '0%' },
			gap: 0,
		},

		List: {
			flex: { shrink: 1 },
			minWidth: 0,
		},

		Edit_panel: {
			border: { top: { width: '1px', style: 'solid', color: $mol_theme.line } },
			flex: { direction: 'column' },
			gap: $mol_gap.text,
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			width: '16rem',
			maxWidth: '80vw',
		},

		Edit_actions: {
			flex: { wrap: 'wrap' },
			justify: { content: 'space-between' },
			gap: $mol_gap.text,
		},

		Remove: {
			gap: $mol_gap.text,
			color: $mol_theme.special,
		},

		Add_panel: {
			flex: { direction: 'column' },
			gap: $mol_gap.text,
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			width: '16rem',
			maxWidth: '80vw',
		},

	})

}
