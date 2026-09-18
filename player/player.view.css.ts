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
					},

					Progress: {
						height: '6px',
						borderRadius: '3px',
					},

					Progress_bar: {
						height: '6px',
						borderRadius: '3px',
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
