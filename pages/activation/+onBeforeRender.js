export { onBeforeRender }

function onBeforeRender (pageContext) {
	const urlOriginal = pageContext.urlOriginal
	const params = pageContext.params
	const hote = pageContext.hote
	const langues = pageContext.langues
	const langue = pageContext.langue
	const titre = 'Activation - Digipad by La Digitale'
	const pageProps = { urlOriginal, params, hote, langues, langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
