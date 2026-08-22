export { render as onRenderHtml }

import { escapeInject, dangerouslySkipEscape } from 'vike/server'

const locales = {
	de: 'de_DE',
	en: 'en_US',
	es: 'es_ES',
	fr: 'fr_FR',
	hr: 'hr_HR',
	it: 'it_IT'
}

async function render (pageContext) {
	let hote = import.meta.env.DOMAIN || 'https://digipad.app'
	let titre = 'Digipad by La Digitale'
	let langueParDefaut = import.meta.env.VITE_DEFAULT_LANGUAGE || 'fr'
	if (!locales.hasOwnProperty(langueParDefaut)) {
		langueParDefaut = 'fr'
	}
	let langue = langueParDefaut
	if (pageContext && pageContext.hasOwnProperty('pageProps') && pageContext.pageProps.hasOwnProperty('titre')) {
		titre = pageContext.pageProps.titre
	}
	if (pageContext && pageContext.hasOwnProperty('pageProps') && pageContext.pageProps.hasOwnProperty('hote')) {
		hote = pageContext.pageProps.hote
	}
	if (pageContext && pageContext.hasOwnProperty('pageProps') && pageContext.pageProps.hasOwnProperty('langue')) {
		langue = pageContext.pageProps.langue
	}
	if (!locales.hasOwnProperty(langue)) {
		langue = langueParDefaut
	}
	let url = hote
	if (pageContext && pageContext.hasOwnProperty('pageProps') && pageContext.pageProps.hasOwnProperty('urlOriginal')) {
		url = hote + pageContext.pageProps.urlOriginal
	}
	let robots = 'index,nofollow'
	if (url !== hote) {
		robots = 'noindex'
	}
	const locale = locales[langue]
	let umami = ''
	if (process.env.NODE_ENV === 'production' && import.meta.env.UMAMI_SCRIPT_URL && import.meta.env.UMAMI_SCRIPT_URL !== '' && import.meta.env.UMAMI_WEBSITE_ID && import.meta.env.UMAMI_WEBSITE_ID !== '') {
		umami = dangerouslySkipEscape('<script defer src="' + import.meta.env.UMAMI_SCRIPT_URL + '" data-website-id="' + import.meta.env.UMAMI_WEBSITE_ID + '"></script>')
	}
	const documentHtml = escapeInject`<!DOCTYPE html>
		<html lang="${langue}">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, minimum-scale=1.0, maximum-scale=1.0, user-scalable=no, shrink-to-fit=no">
				<meta name="mobile-web-app-capable" content="yes">
				<meta name="HandheldFriendly" content="true">
				<meta name="keywords" content="ladigitale, collaborative, education, openedtech, free software">
				<meta name="description" content="Une application en ligne pour créer des murs multimédias collaboratifs proposée par La Digitale">
				<meta name="robots" content="${robots}">
				<meta name="theme-color" content="#00ced1">
				<meta name="apple-mobile-web-app-capable" content="yes">
				<meta name="apple-mobile-web-app-status-bar-style" content="default">
				<meta name="apple-mobile-web-app-title" content="Digipad">
				<meta property="og:title" content="${titre}">
				<meta property="og:description" content="Une application en ligne pour créer des murs multimédias collaboratifs proposée par La Digitale">
				<meta property="og:type" content="website">
				<meta property="og:url" content="${url}">
				<meta property="og:image" content="${hote}/img/digipad.png">
				<meta property="og:locale" content="${locale}">
				<title>${titre}</title>
				<link rel="icon" type="image/png" href="/img/favicon.png">
				<link rel="apple-touch-icon" href="/img/icones/apple-touch-icon.png">
				<link rel="manifest" href="/manifest.json">
				${umami}
			</head>
			<body>
				<noscript>
      				<strong>Veuillez activer Javascript dans votre navigateur pour utiliser <i>Digipad</i>.</strong>
    			</noscript>
				<div id="app"></div>
				<script src="/js/qrcode.js"></script>
				<script src="/js/jspanel.js"></script>
				<script src="/js/flex-images.js"></script>
				<script src="/js/panzoom.js"></script>
				<script src="/js/recordrtc.js"></script>
				<script src="/js/pell.js"></script>
			</body>
		</html>`
  	return {
    	documentHtml
  	}
}
