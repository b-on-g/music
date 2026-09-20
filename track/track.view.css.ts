namespace $.$$ {
	$mol_style_define($bog_music_track, {
		flex: {
			direction: 'row',
		},
		align: {
			items: 'center',
		},
		gap: $mol_gap.text,
		padding: {
			top: '0.375rem',
			bottom: '0.375rem',
			left: '0.5rem',
			right: '0.25rem',
		},
		borderRadius: '0.5rem',

		Cover_box: {
			flex: {
				shrink: 0,
				grow: 0,
			},
			width: '3rem',
			height: '3rem',
			borderRadius: '4px',
			overflow: { x: 'hidden', y: 'hidden' },
			cursor: 'pointer',
			justify: { content: 'center' },
			align: { items: 'center' },
			background: {
				color: $mol_theme.line,
			},
		},

		Cover: {
			width: '100%',
			height: '100%',
			objectFit: 'cover',
		},

		Cover_placeholder: {
			width: '1.75rem',
			height: '1.75rem',
			color: $mol_theme.shade,
		},

		Info: {
			flex: {
				direction: 'column',
				grow: 1,
				shrink: 1,
			},
			minWidth: 0,
			gap: '0.125rem',
			cursor: 'pointer',
		},

		Title: {
			font: {
				weight: 500,
				size: '1rem',
			},
			lineHeight: '1.25',
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Artist: {
			font: {
				size: '0.875rem',
			},
			lineHeight: '1.25',
			color: $mol_theme.shade,
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Share: {
			flex: {
				shrink: 0,
				grow: 0,
			},
			width: '2.25rem',
			height: '2.25rem',
			justify: { content: 'center' },
			align: { items: 'center' },
			borderRadius: '4px',
			cursor: 'pointer',
			color: $mol_theme.shade,
			touchAction: 'none',
			userSelect: 'none',
			transition: 'background 0.15s, color 0.15s',
		},

		Share_icon: {
			width: '1.5rem',
			height: '1.5rem',
		},

		Menu: {
			flex: { shrink: 0 },
		},

		Menu_anchor: {
			color: $mol_theme.shade,
			padding: { left: '0.25rem', right: '0.25rem' },
		},

		Menu_panel: {
			flex: { direction: 'column' },
			align: { items: 'stretch' },
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.25rem',
				right: '0.25rem',
			},
			minWidth: '13rem',
		},

		// Пункт меню: иконка + подпись в одну строку, прижаты влево.
		Demote: { justify: { content: 'flex-start' }, gap: $mol_gap.text },
		Delete: { justify: { content: 'flex-start' }, gap: $mol_gap.text },
		Archive: { justify: { content: 'flex-start' }, gap: $mol_gap.text },
		Restore: { justify: { content: 'flex-start' }, gap: $mol_gap.text },
		Delete_forever: { justify: { content: 'flex-start' }, gap: $mol_gap.text, color: $mol_theme.special },

		Confirm: {
			flex: { direction: 'column', grow: 1, shrink: 1 },
			minWidth: 0,
			gap: $mol_gap.text,
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.25rem',
				right: '0.25rem',
			},
		},

		Confirm_text: {
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Confirm_actions: {
			flex: { direction: 'row', wrap: 'wrap' },
			justify: { content: 'flex-end' },
			gap: $mol_gap.text,
		},

		'@': {
			bog_music_track_current: {
				true: {
					color: $mol_theme.focus,
				},
			},
			bog_music_track_pending: {
				true: {
					// blob ещё качается фоном — приглушаем строку, но она кликабельна
					// (клик играет через blob_wait, дождавшись докачки).
					opacity: 0.55,
				},
			},
			bog_music_track_share_selected: {
				true: {
					background: { color: $mol_theme.focus },
					color: $mol_theme.card,
				},
			},
		},
	})
}
