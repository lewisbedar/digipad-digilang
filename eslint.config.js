import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

export default [
	{
		name: 'app/files-to-ignore',
		ignores: ['**/dist/**', '**/dist-ssr/**', 'static/**', 'public/js/**'],
	},
	...pluginVue.configs['flat/essential'],
	skipFormatting,
	{
		files: ['**/*.{js,mjs,vue}'],
		languageOptions: {
			globals: {
				app_version: 'readonly',
				pell: 'readonly',
				QRCode: 'readonly',
				flexImages: 'readonly',
				jsPanel: 'readonly',
				Panzoom: 'readonly',
				v: 'readonly',
				RecordRTC: 'readonly',
				StereoAudioRecorder: 'readonly',
			},
			ecmaVersion: 'latest',
		},
		rules: {
			'no-prototype-builtins': 'off',
			'indent': ['error', 'tab'],
			'no-tabs': 'off',
			'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
			'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
		},
	},
]
