namespace $.$$ {
	const cover_size = $mol_style_func.clamp( '12rem', '70vw', '20rem' )

	$mol_style_define($bog_music_player, {
		width: '100%',
		flex: {
			direction: 'column',
			shrink: 0,
		},
		background: {
			color: $mol_theme.card,
		},
		border: { top: { width: '1px', style: 'solid', color: $mol_theme.line } },
		position: 'sticky',
		bottom: 0,

		Progress_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			padding: {
				top: 0,
				bottom: 0,
				left: '0.75rem',
				right: '0.75rem',
			},
		},

		// Зона касания выше самой полоски: палец попадает, полоска остаётся тонкой.
		Progress: {
			height: '1.75rem',
			cursor: 'pointer',
			flex: {
				grow: 1,
				shrink: 1,
			},
			position: 'relative',
			touchAction: 'none',
			userSelect: 'none',
		},

		Progress_line: {
			position: 'absolute',
			left: 0,
			right: 0,
			top: $mol_style_func.calc('50% - 0.125rem'),
			height: '0.25rem',
			borderRadius: '0.125rem',
			background: {
				color: $mol_theme.line,
			},
			pointerEvents: 'none',
		},

		Progress_bar: {
			position: 'absolute',
			left: 0,
			top: $mol_style_func.calc('50% - 0.125rem'),
			height: '0.25rem',
			borderRadius: '0.125rem',
			background: {
				color: $mol_theme.focus,
			},
			width: 0,
			pointerEvents: 'none',
		},

		// Ползунок в rem: растёт вместе с размером шрифта из настроек.
		Progress_knob: {
			position: 'absolute',
			top: $mol_style_func.calc('50% - 0.625rem'),
			width: '1.25rem',
			height: '1.25rem',
			margin: { left: '-0.625rem' },
			borderRadius: '50%',
			background: { color: $mol_theme.focus },
			box: { shadow: [[ 0, '0.0625rem', '0.25rem', 0, '#00000060' ]] },
			pointerEvents: 'none',
			zIndex: 1,
		},

		Trim_start_handle: {
			position: 'absolute',
			top: $mol_style_func.calc('50% - 0.75rem'),
			width: '0.75rem',
			height: '1.5rem',
			margin: { left: '-0.375rem' },
			background: { color: $mol_theme.text },
			borderRadius: '0.1875rem',
			cursor: 'ew-resize',
			touchAction: 'none',
			userSelect: 'none',
			zIndex: 2,
		},

		Trim_end_handle: {
			position: 'absolute',
			top: $mol_style_func.calc('50% - 0.75rem'),
			width: '0.75rem',
			height: '1.5rem',
			margin: { left: '-0.375rem' },
			background: { color: $mol_theme.text },
			borderRadius: '0.1875rem',
			cursor: 'ew-resize',
			touchAction: 'none',
			userSelect: 'none',
			zIndex: 2,
		},

		Time_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
			justify: { content: 'space-between' },
			align: { items: 'center' },
			padding: {
				top: 0,
				bottom: 0,
				left: '0.75rem',
				right: '0.75rem',
			},
			margin: { top: '-0.375rem' },
			gap: $mol_gap.text,
		},

		Time_current: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
			fontVariantNumeric: 'tabular-nums',
		},

		Trim_hint: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			overflow: { x: 'hidden' },
			textOverflow: 'ellipsis',
			minWidth: 0,
		},

		Time_total: {
			font: { size: '0.75rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
			flex: { shrink: 0 },
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

		Cover: {
			width: '2.75rem',
			height: '2.75rem',
			border: { radius: $bog_builderui_tokens.radius },
			flex: {
				shrink: 0,
			},
			objectFit: 'cover',
		},

		Cover_placeholder: {
			width: '2.75rem',
			height: '2.75rem',
			border: { radius: $bog_builderui_tokens.radius },
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

		Empty: {
			flex: { direction: 'column', grow: 1 },
			align: { items: 'center' },
			justify: { content: 'center' },
			gap: $mol_gap.block,
			color: $mol_theme.shade,
			padding: {
				top: '3rem',
				bottom: '3rem',
				left: '1rem',
				right: '1rem',
			},
		},

		Empty_icon: {
			width: '4rem',
			height: '4rem',
		},

		Track_info: {
			flex: {
				direction: 'column',
				shrink: 1,
			},
			minWidth: 0,
			overflow: {
				x: 'hidden',
			},
			gap: '0.125rem',
		},

		Title: {
			font: {
				weight: 600,
				size: '0.9375rem',
			},
			whiteSpace: 'nowrap',
			overflow: {
				x: 'hidden',
			},
			textOverflow: 'ellipsis',
		},

		Artist: {
			font: {
				size: '0.875rem',
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

		':not([bog_music_player_full="true"])': {
			Repeat: { display: 'none' },
			Volume: { display: 'none' },
			Eq: { display: 'none' },
			Trim_toggle: { display: 'none' },
		},

		'@': {
			bog_music_player_full: {
				true: {
					position: 'relative',
					flex: { direction: 'row', wrap: 'wrap', grow: 1 },
					justify: { content: 'center' },
					align: { items: 'center', content: 'center' },
					gap: '1rem',
					padding: {
						top: '1.5rem',
						bottom: '1.5rem',
						left: '1rem',
						right: '1rem',
					},
					background: { color: 'transparent' },
					border: { top: { style: 'none' } },

					Controls: {
						display: 'contents',
					},

					Left: {
						flex: { direction: 'column', basis: '100%', grow: 0 },
						overflow: { x: 'visible' },
						gap: '1rem',
					},

					Cover: {
						width: cover_size,
						height: cover_size,
						borderRadius: '1rem',
						box: { shadow: [[ 0, '1rem', '2rem', '-0.5rem', '#00000080' ]] },
					},

					Cover_placeholder: {
						width: cover_size,
						height: cover_size,
						borderRadius: '1rem',
						boxSizing: 'border-box',
						padding: {
							top: '4rem',
							bottom: '4rem',
							left: '4rem',
							right: '4rem',
						},
					},

					Track_info: {
						align: { items: 'center' },
						textAlign: 'center',
						maxWidth: '100%',
					},

					Title: {
						font: {
							family: $bog_builderui_tokens.font_head,
							size: '1.5rem',
							weight: 500,
						},
						whiteSpace: 'normal',
					},

					Artist: {
						font: { size: '1rem' },
						whiteSpace: 'normal',
					},

					Progress_row: {
						flex: { basis: '100%' },
						padding: { left: 0, right: 0 },
					},

					Time_row: {
						flex: { basis: '100%' },
						padding: { left: 0, right: 0 },
						margin: { top: '-1rem' },
					},

					Progress: {
						height: '2.5rem',
					},

					Progress_line: {
						top: $mol_style_func.calc('50% - 0.1875rem'),
						height: '0.375rem',
						borderRadius: '0.1875rem',
					},

					Progress_bar: {
						top: $mol_style_func.calc('50% - 0.1875rem'),
						height: '0.375rem',
						borderRadius: '0.1875rem',
					},

					Progress_knob: {
						top: $mol_style_func.calc('50% - 0.75rem'),
						width: '1.5rem',
						height: '1.5rem',
						margin: { left: '-0.75rem' },
					},

					Trim_start_handle: {
						top: $mol_style_func.calc('50% - 1rem'),
						height: '2rem',
					},

					Trim_end_handle: {
						top: $mol_style_func.calc('50% - 1rem'),
						height: '2rem',
					},

					Time_current: {
						font: { size: '0.875rem' },
					},

					Trim_hint: {
						font: { size: '0.875rem' },
					},

					Time_total: {
						font: { size: '0.875rem' },
					},

					Center: {
						flex: { wrap: 'wrap' },
						justify: { content: 'center' },
					},

					Close: {
						position: 'absolute',
						top: '0.5rem',
						right: '0.5rem',
					},

					Play_icon: {
						width: '3rem',
						height: '3rem',
					},

					Pause_icon: {
						width: '3rem',
						height: '3rem',
					},

					Prev_icon: {
						width: '2rem',
						height: '2rem',
					},

					Next_icon: {
						width: '2rem',
						height: '2rem',
					},
				},
			},
		},

	})
}
