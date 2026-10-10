export { onBeforeRender }

function onBeforeRender (pageContext) {
	const urlOriginal = pageContext.urlOriginal
	const params = pageContext.params
	const hote = pageContext.hote
	const langues = pageContext.langues
	const langue = pageContext.langue
	const titre = 'Admin - Board DigiLang'
	const pageProps = { urlOriginal, params, hote, langues, langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
