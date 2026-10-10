export { onBeforeRender }

function onBeforeRender (pageContext) {
	const urlOriginal = pageContext.urlOriginal
	const params = pageContext.params
	const langues = pageContext.langues
	const langue = pageContext.langue
	const titre = 'Maintenance - Board DigiLang'
	const pageProps = { urlOriginal, params, langues, langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
