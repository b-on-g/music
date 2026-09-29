namespace $ {

	$mol_style_define($bog_music_nav_item, {
		// shrink явно: у $mol_view по умолчанию flex-shrink: 0, и на крупном
		// шрифте четыре nowrap-подписи распирали приложение шире экрана.
		flex: { direction: 'column', grow: 1, shrink: 1, basis: '0%' },
		align: { items: 'center' },
		justify: { content: 'center' },
		gap: '0.125rem',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.25rem',
			right: '0.25rem',
		},
		minWidth: 0,
		minHeight: '3.75rem',
		cursor: 'pointer',
		userSelect: 'none',
		border: { radius: $bog_builderui_tokens.radius },
		color: $bog_builderui_tokens.shade,
		background: { color: 'transparent' },
		transition: 'color 120ms ease, background-color 120ms ease',

		Icon: {
			width: '2rem',
			height: '2rem',
			color: 'inherit',
		},

		Label: {
			font: { size: '0.8125rem', weight: 500 },
			color: 'inherit',
			whiteSpace: 'nowrap',
			maxWidth: '100%',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
		},

		':hover': {
			background: { color: $bog_builderui_tokens.hover },
			color: $bog_builderui_tokens.text,
		},

		'@': {
			bog_music_nav_active: {
				on: {
					color: $bog_builderui_tokens.special,
				},
			},
		},
	})

}
