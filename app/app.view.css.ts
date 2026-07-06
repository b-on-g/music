namespace $.$$ {
	$mol_style_define($bog_music_app, {
		minWidth: '20rem',
		maxWidth: '50rem',
		margin: {
			left: 'auto',
			right: 'auto',
		},
		Head: {
			justifyContent: 'space-between'
		},

		Tabs: {
			flex: {
				direction: 'row',
			},
			gap: '0.25rem',
			padding: {
				top: '0.5rem',
				bottom: '0.25rem',
				left: '0.5rem',
				right: '0.5rem',
			},
		},


		Tools: {
			alignItems: 'center',
		},

		Brand: {
			width: '2rem',
			height: '2rem',
			flex: { shrink: 0, grow: 0 },
			objectFit: 'contain',
			alignSelf: 'center',
			margin: { left: '0.5rem', right: '0.25rem' },
		},

		Version: {
			font: {
				size: '0.6875rem',
				family: 'monospace',
			},
			color: $mol_theme.shade,
			alignSelf: 'center',
			padding: {
				left: '0.25rem',
				right: '0.25rem',
			},
		},

		Tube_bar: {
			flex: { direction: 'row' },
			gap: '0.5rem',
			padding: {
				top: '0.75rem',
				bottom: '0.5rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			align: { items: 'center' },
		},

		Tube_query: {
			flex: { grow: 1 },
		},

		Foot: {
			flex: {
				direction: 'column',
			},
			align: {
				items: 'stretch',
			},
			gap: 0,
		},

		Nickname_label: {
			font: { size: '0.875rem' },
			color: $mol_theme.shade,
			padding: {
				left: '0.5rem',
				right: '0.5rem',
			},
			maxWidth: '8rem',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
			whiteSpace: 'nowrap',
		},

		Player: {
			position: 'sticky',
			bottom: 0,
		},

		Share_toast: {
			margin: {
				left: '0.5rem',
				right: '0.5rem',
				top: '0.5rem',
			},
			padding: {
				top: '0.5rem',
				bottom: '0.5rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			background: { color: $mol_theme.focus },
			color: $mol_theme.card,
			borderRadius: '0.375rem',
			font: { size: '0.8125rem' },
		},
	})
}
