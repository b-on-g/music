namespace $.$$ {

	$mol_style_define($bog_music_landing, {
		flex: { direction: 'column' },
		align: { items: 'center' },
		gap: '3rem',
		padding: {
			top: '3rem',
			bottom: '3rem',
			left: $mol_gap.block,
			right: $mol_gap.block,
		},
		font: { family: $bog_builderui_tokens.font_body },
		background: { color: $bog_builderui_tokens.back },
		color: $bog_builderui_tokens.text,
		minHeight: '100vh',
		width: '100%',
		boxSizing: 'border-box',

		$mol_icon: {
			width: '1.5em',
		},

		Hero: {
			flex: { direction: 'column' },
			align: { items: 'center' },
			gap: '1rem',
			width: '100%',
			maxWidth: '40rem',
			textAlign: 'center',
		},

		Hero_image: {
			width: '6rem',
			height: '6rem',
		},

		Hero_title: {
			display: 'block',
			font: { family: $bog_builderui_tokens.font_head, size: '3rem', weight: 500 },
			lineHeight: '1.1',
			margin: { top: 0, bottom: 0 },
		},

		Hero_subtitle: {
			display: 'block',
			whiteSpace: 'normal',
			font: { size: '1.25rem' },
			lineHeight: '1.5',
			color: $bog_builderui_tokens.shade,
			margin: { top: 0, bottom: 0 },
		},

		Hero_actions: {
			flex: { direction: 'row', wrap: 'wrap' },
			justify: { content: 'center' },
			gap: $mol_gap.block,
			margin: { top: '0.5rem' },
		},

		Open: {
			align: { items: 'center' },
			gap: $mol_gap.text,
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '1.5rem',
				right: '1.5rem',
			},
			border: { radius: $bog_builderui_tokens.radius },
			background: { color: $bog_builderui_tokens.control },
			color: $bog_builderui_tokens.back,
			font: { weight: 600 },
			textDecoration: 'none',
		},

		Extension: {
			align: { items: 'center' },
			gap: $mol_gap.text,
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '1.5rem',
				right: '1.5rem',
			},
			border: { radius: $bog_builderui_tokens.radius, width: '1px', style: 'solid', color: $bog_builderui_tokens.line },
			color: $bog_builderui_tokens.text,
			textDecoration: 'none',
		},

		Features: {
			flex: { direction: 'column' },
			gap: '1.5rem',
			width: '100%',
			maxWidth: '50rem',
		},

		Features_title: {
			display: 'block',
			font: { family: $bog_builderui_tokens.font_head, size: '2rem', weight: 500 },
			textAlign: 'center',
			margin: { top: 0, bottom: 0 },
		},

		Features_list: {
			display: 'grid',
			gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
			gap: $mol_gap.block,
		},

		Install: {
			flex: { direction: 'column' },
			align: { items: 'center' },
			gap: '1.5rem',
			width: '100%',
			maxWidth: '50rem',
		},

		Install_title: {
			display: 'block',
			font: { family: $bog_builderui_tokens.font_head, size: '2rem', weight: 500 },
			textAlign: 'center',
			margin: { top: 0, bottom: 0 },
		},

		Install_text: {
			display: 'block',
			whiteSpace: 'normal',
			textAlign: 'center',
			color: $bog_builderui_tokens.shade,
			margin: { top: 0, bottom: 0 },
		},

		Install_list: {
			display: 'grid',
			gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))',
			gap: $mol_gap.block,
			width: '100%',
		},

		Install_open: {
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '1.5rem',
				right: '1.5rem',
			},
			border: { radius: $bog_builderui_tokens.radius },
			background: { color: $bog_builderui_tokens.control },
			color: $bog_builderui_tokens.back,
			font: { weight: 600 },
			textDecoration: 'none',
		},

		Foot: {
			flex: { direction: 'row', wrap: 'wrap' },
			justify: { content: 'center' },
			gap: $mol_gap.block,
			color: $bog_builderui_tokens.shade,
			font: { size: '0.875rem' },
		},

	})

	$mol_style_define($bog_music_landing_feature, {
		flex: { direction: 'row' },
		minWidth: 0,
		align: { items: 'flex-start' },
		gap: $mol_gap.block,
		padding: $mol_gap.block,
		background: { color: $bog_builderui_tokens.card },
		border: { radius: $bog_builderui_tokens.radius, width: '1px', style: 'solid', color: $bog_builderui_tokens.line },

		Icon: {
			flex: { shrink: 0 },
			width: '2rem',
			height: '2rem',
			color: $bog_builderui_tokens.control,
		},

		Body: {
			flex: { direction: 'column', grow: 1, shrink: 1 },
			gap: '0.25rem',
			minWidth: 0,
		},

		Title: {
			display: 'block',
			whiteSpace: 'normal',
			font: { size: '1.125rem', weight: 600 },
			margin: { top: 0, bottom: 0 },
		},

		Text: {
			display: 'block',
			whiteSpace: 'normal',
			color: $bog_builderui_tokens.shade,
			lineHeight: '1.5',
			margin: { top: 0, bottom: 0 },
		},
	})

}
