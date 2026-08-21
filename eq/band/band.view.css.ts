namespace $.$$ {
	$mol_style_define($bog_music_eq_band, {

		flex: {
			direction: 'column',
			shrink: 0,
		},
		align: {
			items: 'center',
		},
		gap: '0.25rem',
		width: '2.5rem',

		Db: {
			font: { size: '0.6875rem' },
			color: $mol_theme.shade,
			fontVariantNumeric: 'tabular-nums',
			flex: { shrink: 0 },
		},

		Freq: {
			font: { size: '0.6875rem' },
			color: $mol_theme.shade,
			flex: { shrink: 0 },
		},

		Slider: {
			width: '6px',
			height: '8rem',
			background: { color: $mol_theme.line },
			borderRadius: '3px',
			cursor: 'pointer',
			position: 'relative',
			overflow: { x: 'hidden', y: 'hidden' },
			touchAction: 'none',
			userSelect: 'none',
			flex: { shrink: 0 },
		},

		/** Риска нуля: по одной заливке не видно, куда полоса уехала. */
		Zero: {
			position: 'absolute',
			left: 0,
			right: 0,
			top: '50%',
			height: '1px',
			background: { color: $mol_theme.shade },
			pointerEvents: 'none',
		},

		Fill: {
			position: 'absolute',
			left: 0,
			right: 0,
			background: { color: $mol_theme.focus },
			borderRadius: '3px',
			pointerEvents: 'none',
		},

	})
}
