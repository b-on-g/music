namespace $.$$ {

	const { rem } = $mol_style_unit

	$mol_style_define($bog_music_app, {
		minWidth: '20rem',
		maxWidth: '50rem',
		margin: {
			left: 'auto',
			right: 'auto',
		},
		font: { family: $bog_builderui_tokens.font_body },
		background: { color: $bog_builderui_tokens.back },
		color: $bog_builderui_tokens.text,

		$mol_icon: {
			width: '1.5em',
		},

		$mol_button_major: {
			background: { color: $bog_builderui_tokens.control },
			color: $bog_builderui_tokens.back,
		},

		Head: {
			justifyContent: 'space-between',
			background: { color: $bog_builderui_tokens.back },
			border: {
				radius: 0,
				bottom: { width: '1px', style: 'solid', color: $bog_builderui_tokens.line },
			},
			box: { shadow: 'none' },
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
			align: { items: 'center' },
			gap: $mol_gap.text,
			padding: { left: '0.5rem' },
		},

		Brand_image: {
			width: '2rem',
			height: '2rem',
			flex: { shrink: 0, grow: 0 },
			objectFit: 'contain',
		},

		Brand_name: {
			font: {
				family: $bog_builderui_tokens.font_head,
				size: rem(1.5),
				weight: 500,
			},
			whiteSpace: 'nowrap',
		},

		Version: {
			font: {
				size: '0.6875rem',
				family: 'monospace',
			},
			color: $bog_builderui_tokens.shade,
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
			color: $bog_builderui_tokens.shade,
			padding: {
				left: '0.5rem',
				right: '0.5rem',
			},
			maxWidth: '8rem',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
			whiteSpace: 'nowrap',
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
			background: { color: $bog_builderui_tokens.control },
			color: $bog_builderui_tokens.back,
			border: { radius: $bog_builderui_tokens.radius },
			font: { size: '0.875rem' },
		},
	})

}
