import vue from '@vitejs/plugin-vue'
import ssr from 'vike/plugin'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default {
	plugins: [vue(), ssr()],
	resolve: {
		alias: {
			'#root': __dirname
		}
	},
	define: {
		'app_version': JSON.stringify(process.env.npm_package_version)
	},
	server: {
		watch: {
			ignored: ["**/static/**"],
		}
	},
	build: {
		target: ['es2019'],
		modulePreload: {
			polyfill: false
		}
	}
}
