import pluginVue from 'eslint-plugin-vue'
import skipFormatting from '@vue/eslint-config-prettier/skip-formatting'

// Globales du navigateur et globales communes aux deux environnements
const globalesNavigateur = {
	alert: 'readonly',
	prompt: 'readonly',
	confirm: 'readonly',
	window: 'readonly',
	document: 'readonly',
	navigator: 'readonly',
	location: 'readonly',
	history: 'readonly',
	localStorage: 'readonly',
	sessionStorage: 'readonly',
	getComputedStyle: 'readonly',
	requestAnimationFrame: 'readonly',
	cancelAnimationFrame: 'readonly',
	Image: 'readonly',
	Blob: 'readonly',
	File: 'readonly',
	FileReader: 'readonly',
	FormData: 'readonly',
	Event: 'readonly',
	CustomEvent: 'readonly',
	HTMLElement: 'readonly',
	HTMLInputElement: 'readonly',
	AudioContext: 'readonly',
	MediaRecorder: 'readonly',
	PerformanceObserver: 'readonly',
	MutationObserver: 'readonly',
	ResizeObserver: 'readonly',
	IntersectionObserver: 'readonly',
	atob: 'readonly',
	btoa: 'readonly',
	self: 'readonly',
	caches: 'readonly'
}

// Disponibles côté navigateur comme côté Node
const globalesCommunes = {
	console: 'readonly',
	process: 'readonly',
	crypto: 'readonly',
	fetch: 'readonly',
	URL: 'readonly',
	URLSearchParams: 'readonly',
	AbortController: 'readonly',
	TextEncoder: 'readonly',
	TextDecoder: 'readonly',
	structuredClone: 'readonly',
	setTimeout: 'readonly',
	clearTimeout: 'readonly',
	setInterval: 'readonly',
	clearInterval: 'readonly',
	queueMicrotask: 'readonly'
}

// Spécifiques à Node, pour le serveur
const globalesNode = {
	Buffer: 'readonly',
	global: 'readonly',
	__dirname: 'readonly',
	__filename: 'readonly',
	setImmediate: 'readonly',
	clearImmediate: 'readonly'
}

// Bibliothèques chargées par balise <script>, sans import
const globalesExternes = {
	app_version: 'readonly',
	pell: 'readonly',
	QRCode: 'readonly',
	flexImages: 'readonly',
	jsPanel: 'readonly',
	Panzoom: 'readonly',
	v: 'readonly',
	RecordRTC: 'readonly',
	StereoAudioRecorder: 'readonly'
}

// Règles communes aux deux environnements
const regles = {
	'no-undef': 'error',
	'no-prototype-builtins': 'off',
	'indent': ['error', 'tab'],
	'no-tabs': 'off',
	'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
	'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off'
}

export default [
	{
		name: 'app/files-to-ignore',
		ignores: ['**/dist/**', '**/dist-ssr/**', 'static/**', 'public/js/**', '_resources/**'],
	},
	...pluginVue.configs['flat/essential'],
	skipFormatting,
	{
		files: ['**/*.{js,mjs,vue}'],
		ignores: ['server/**/*.js'],
		languageOptions: {
			globals: {
				...globalesNavigateur,
				...globalesCommunes,
				...globalesExternes
			},
			ecmaVersion: 'latest'
		},
		rules: regles
	},
	{
		files: ['server/**/*.js'],
		languageOptions: {
			globals: {
				...globalesCommunes,
				...globalesNode
			},
			ecmaVersion: 'latest'
		},
		rules: regles
	}
]
