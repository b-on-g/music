namespace $ {

	$mol_style_define($bog_music_tube_row, {
		flex: { direction: 'row' },
		align: { items: 'center' },
		gap: '0.5rem',
		padding: {
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
		},

		Play: {
			flex: { shrink: 0 },
		},

		Cover_box: {
			flex: { shrink: 0, grow: 0 },
			width: '2.5rem',
			height: '2.5rem',
			borderRadius: '0.25rem',
			overflow: { x: 'hidden', y: 'hidden' },
			cursor: 'pointer',
			justify: { content: 'center' },
			align: { items: 'center' },
			background: { color: $mol_theme.line },
		},

		Cover: {
			width: '100%',
			height: '100%',
			objectFit: 'cover',
		},

		Cover_placeholder: {
			width: '1.5rem',
			height: '1.5rem',
			color: $mol_theme.shade,
		},

		Info: {
			flex: { direction: 'column', grow: 1, shrink: 1 },
			minWidth: 0,
			cursor: 'pointer',
		},

		Title: {
			whiteSpace: 'nowrap',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
		},

		Subtitle: {
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			overflow: { x: 'hidden', y: 'hidden' },
			textOverflow: 'ellipsis',
		},

		Status: {
			flex: { shrink: 0 },
			font: { size: '0.8125rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
		},

		Get: {
			flex: { shrink: 0 },
		},

		'@': {
			// Пока идёт скачивание — мигаем кнопкой Get (тем же mol-миганием,
			// что и Upload), в дополнение к текстовому статусу «Качаю…».
			bog_music_tube_row_busy: {
				true: {
					Get: {
						animation: {
							name: 'mol_view_wait',
							duration: '1s',
							iterationCount: 'infinite',
						},
					},
				},
			},
		},
	})

}
