namespace $.$$ {

	const current = {
		'[bog_music_playlists_current]': {
			true: {
				color: $mol_theme.current,
				background: { color: $mol_theme.hover },
			},
		},
	} as const

	const cell = {
		... current,
		flex: { grow: 1, shrink: 1, basis: '0%' },
		justify: { content: 'center' },
		align: { items: 'center' },
		minWidth: 0,
	} as const

	const label = {
		display: 'block',
		flex: { shrink: 1 },
		minWidth: 0,
		overflow: { x: 'hidden', y: 'hidden' },
		whiteSpace: 'nowrap',
		textOverflow: 'ellipsis',
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

		My_label: label,

		Archive: {
			... cell,
			textAlign: 'center',
		},

		Archive_label: label,

		Middle: {
			... cell,
			flex: { grow: 1.5, shrink: 1, basis: '0%' },
			gap: 0,
		},

		List: {
			flex: { grow: 1, shrink: 1, basis: 'auto' },
			minWidth: 0,
			Trigger: {
				minWidth: 0,
				maxWidth: '100%',
				flex: { wrap: 'nowrap' },
				$mol_dimmer: label,
			},
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

		Add_anchor: {
			padding: { left: 0, right: 0 },
			justify: { content: 'center' },
			width: '24px',
			height: '24px',
		},

	})

}
