namespace $.$$ {
	$mol_style_define($bog_music_player, {
		width: '100%',
		flex: {
			direction: 'column',
			shrink: 0,
		},
		background: {
			color: $mol_theme.card,
		},
		position: 'sticky',
		bottom: 0,

		Progress_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			align: {
				items: 'center',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: $mol_gap.text,
		},

		Progress: {
			height: '3px',
			background: {
				color: $mol_theme.line,
			},
			cursor: 'pointer',
			flex: {
				grow: 1,
				shrink: 1,
			},
			position: 'relative',
		},

		Progress_bar: {
			height: '3px',
			background: {
				color: $mol_theme.focus,
			},
			width: 0,
			pointerEvents: 'none',
		},

		Trim_start_handle: {
			position: 'absolute',
			top: '-3px',
			width: '8px',
			height: '9px',
			margin: { left: '-4px' },
			background: { color: $mol_theme.text },
			borderRadius: '1px',
			cursor: 'ew-resize',
			touchAction: 'none',
			userSelect: 'none',
			zIndex: 2,
		},

		Trim_end_handle: {
			position: 'absolute',
			top: '-3px',
			width: '8px',
			height: '9px',
			margin: { left: '-4px' },
			background: { color: $mol_theme.text },
			borderRadius: '1px',
			cursor: 'ew-resize',
			touchAction: 'none',
			userSelect: 'none',
			zIndex: 2,
		},

		Time_current: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
			minWidth: '2.5rem',
			textAlign: 'right',
			fontVariantNumeric: 'tabular-nums',
		},

		Time_total: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
			minWidth: '2.5rem',
			fontVariantNumeric: 'tabular-nums',
		},

		Controls: {
			flex: {
				direction: 'row',
			},
			align: {
				items: 'center',
			},
			padding: {
				top: '0.25rem',
				bottom: '0.25rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			gap: $mol_gap.text,
		},

		Left: {
			flex: {
				direction: 'row',
				grow: 1,
				shrink: 1,
			},
			align: {
				items: 'center',
			},
			gap: $mol_gap.text,
			overflow: {
				x: 'hidden',
			},
		},

		Cover_placeholder: {
			width: '2.5rem',
			height: '2.5rem',
			borderRadius: '4px',
			flex: {
				shrink: 0,
			},
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

		Track_info: {
			flex: {
				direction: 'column',
				shrink: 1,
			},
			overflow: {
				x: 'hidden',
			},
			gap: '0.125rem',
		},

		Title: {
			font: {
				weight: 'bold',
				size: '0.8125rem',
			},
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Artist: {
			font: {
				size: '0.75rem',
			},
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Center: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			align: {
				items: 'center',
			},
			gap: '0.25rem',
		},

		Volume_panel: {
			padding: {
				top: '0.75rem',
				bottom: '0.75rem',
				left: '0.5rem',
				right: '0.5rem',
			},
			flex: {
				direction: 'column',
			},
			align: {
				items: 'center',
			},
			gap: $mol_gap.text,
		},

		Volume_slider: {
			width: '6px',
			height: '8rem',
			background: { color: $mol_theme.line },
			borderRadius: '3px',
			cursor: 'pointer',
			position: 'relative',
			overflow: { x: 'hidden', y: 'hidden' },
			touchAction: 'none',
			userSelect: 'none',
		},

		Volume_fill: {
			position: 'absolute',
			left: 0,
			right: 0,
			bottom: 0,
			background: { color: $mol_theme.focus },
			borderRadius: '3px',
		},

		Eq_panel: {
			padding: {
				top: '0.75rem',
				bottom: '0.5rem',
				left: '0.75rem',
				right: '0.75rem',
			},
			flex: {
				direction: 'column',
			},
			align: {
				items: 'stretch',
			},
			gap: $mol_gap.text,
			width: '17rem',
		},

		Eq_presets: {
			flex: {
				direction: 'column',
			},
			align: {
				items: 'stretch',
			},
		},

		/** Строка списка пресетов: подпись слева, галочка выбранного справа. */
		Eq_preset_row: {
			justify: {
				content: 'space-between',
			},
			textAlign: 'left',
			'::after': {
				content: '"✓"',
				color: $mol_theme.focus,
				opacity: 0,
			},
			'@': {
				mol_check_checked: {
					'true': {
						color: $mol_theme.focus,
						'::after': {
							opacity: 1,
						},
					},
				},
			},
		},

	})
}
