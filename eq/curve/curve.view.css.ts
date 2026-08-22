namespace $.$$ {
	$mol_style_define($bog_music_eq_curve, {

		flex: {
			direction: 'column',
			shrink: 0,
		},
		gap: '0.25rem',

		Db_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
		},

		Freq_row: {
			flex: {
				direction: 'row',
				shrink: 0,
			},
		},

		/**
		 * Доли равны и совпадают с колонками графика: подпись стоит ровно над
		 * своей точкой и под ней.
		 */
		Db: {
			flex: {
				grow: 1,
				basis: 0,
			},
			textAlign: 'center',
			font: {
				size: '0.625rem',
				weight: 'bold',
			},
			fontVariantNumeric: 'tabular-nums',
			whiteSpace: 'nowrap',
		},

		Freq: {
			flex: {
				grow: 1,
				basis: 0,
			},
			textAlign: 'center',
			font: { size: '0.625rem' },
			color: $mol_theme.shade,
			whiteSpace: 'nowrap',
		},

		/**
		 * Пропорция та же, что у view_box, — иначе SVG отрисуется с полями и
		 * колонки разъедутся с подписями.
		 */
		Plot: {
			width: '100%',
			aspectRatio: '240 / 110',
			flex: { shrink: 0 },
			touchAction: 'none',
			userSelect: 'none',
			cursor: 'pointer',
			overflow: { x: 'visible', y: 'visible' },
		},

		Zero: {
			stroke: `${ $mol_theme.line }`,
			strokeWidth: '1',
		},

		Curve: {
			fill: 'none',
			strokeWidth: '2.5',
			strokeLinecap: 'round',
			strokeLinejoin: 'round',
			pointerEvents: 'none',
		},

		Dot: {
			// Гайд типизирует SVG-свойства строками, а токен темы — это объект
			// CSS-функции; шаблонная строка отдаёт из него var(--mol_theme_card).
			fill: `${ $mol_theme.card }`,
			strokeWidth: '2.5',
			pointerEvents: 'none',
		},

	})
}
