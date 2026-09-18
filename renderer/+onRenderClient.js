export { render as onRenderClient }

import { createPageApp } from './app'
import axios from 'axios'

axios.interceptors.response.use(null, (err) => {
	if (err.response?.status === 503 && err.response?.data === 'maintenance') {
		window.location.href = '/maintenance'
		return new Promise(() => {})
	}
	return Promise.reject(err)
})

function render (pageContext) {
	if (pageContext.pageProps.hasOwnProperty('redirection')) {
		window.location.href = pageContext.pageProps.redirection
	} else {
		const app = createPageApp(pageContext)
		app.mount('#app')
	}
}

if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
	window.addEventListener('load', () => {
		navigator.serviceWorker.register('/sw.js').catch(() => {})
	})
}

if (process.env.NODE_ENV === 'production' && import.meta.env.VITE_MATOMO && import.meta.env.VITE_MATOMO !== '') {
	const matomo = import.meta.env.VITE_MATOMO
	let matomoSiteId = 1
	if (import.meta.env.VITE_MATOMO_SITE_ID && import.meta.env.VITE_MATOMO_SITE_ID !== '') {
		matomoSiteId = import.meta.env.VITE_MATOMO_SITE_ID
	}
	const paq = window._paq = window._paq || []
	paq.push(['trackPageView'])
	paq.push(['enableLinkTracking'])
	paq.push(['setTrackerUrl', matomo + 'matomo.php'])
	paq.push(['setSiteId', String(matomoSiteId)])
	const script = document.createElement('script')
	script.async = true
	script.src = matomo + 'matomo.js'
	document.head.appendChild(script)
}
