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
			top: '0.5rem',
			bottom: '0.5rem',
			left: '0.5rem',
			right: '0.5rem',
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
		},

		Cover_placeholder: {
			width: '100%',
			height: '100%',
			background: {
				color: $mol_theme.line,
			},
			color: $mol_theme.shade,
			justify: {
				content: 'center',
			},
			align: {
				items: 'center',
			},
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
				size: '0.8125rem',
			},
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Artist: {
			font: {
				size: '0.75rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'normal',
			wordBreak: 'break-word',
		},

		Delete: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Archive: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Restore: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Delete_forever: {
			flex: { shrink: 0 },
			justify: { content: 'flex-end' },
		},

		Share: {
			flex: {
				shrink: 0,
				grow: 0,
			},
			width: '2rem',
			height: '2rem',
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
			width: '1rem',
			height: '1rem',
		},

		'@': {
			bog_music_track_current: {
				true: {
					color: $mol_theme.focus,
				},
			},
			bog_music_track_share_selected: {
				true: {
					background: { color: $mol_theme.focus },
					color: $mol_theme.card,
				},
			},
			// Blob ещё не на устройстве (докачивается после переноса аккаунта):
			// приглушаем как индикатор. Клик работает — плеер дождётся blob.
			bog_music_track_available: {
				false: {
					opacity: 0.4,
				},
			},
			// Пока идёт докачка blob с мастера — мигаем тем же mol-миганием
			// (keyframes mol_view_wait определён в mol/view). Перекрывает static
			// opacity выше, поэтому виден пульс, а не постоянное приглушение.
			bog_music_track_syncing: {
				true: {
					animation: {
						name: 'mol_view_wait',
						duration: '1s',
						iterationCount: 'infinite',
					},
				},
			},
		},
	})
}
