import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';
import type { Config } from 'tailwindcss';
import daisyui from 'daisyui';

export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],

	theme: {
		extend: {}
	},

	plugins: [typography, forms, daisyui],

	daisyui: {
		themes: [
			{
				...require('daisyui/src/theming/themes'),
				web3hub: {
					primary: 'oklch(65% 0.20 245)',
					'primary-content': 'oklch(97% 0.01 255)',

					secondary: 'oklch(60% 0.22 310)',
					'secondary-content': 'oklch(97% 0.01 255)',

					accent: 'oklch(62% 0.20 290)',
					'accent-content': 'oklch(97% 0.01 255)',

					neutral: 'oklch(40% 0.025 255)',
					'neutral-content': 'oklch(85% 0.01 255)',

					'base-100': 'oklch(12% 0.01 255)', // slightly lighter
					'base-200': 'oklch(18% 0.015 255)', // more diff from base-100
					'base-300': 'oklch(25% 0.02 255)', // card background
					'base-content': 'oklch(97% 0.01 255)',

					info: 'oklch(70% 0.18 235)',
					'info-content': 'oklch(97% 0.01 255)',

					success: 'oklch(68% 0.16 150)',
					'success-content': 'oklch(97% 0.01 255)',

					warning: 'oklch(75% 0.20 75)',
					'warning-content': 'oklch(97% 0.01 255)',

					error: 'oklch(62% 0.22 30)',
					'error-content': 'oklch(97% 0.01 255)'
				}
			}
		]
	}
} as Config;
