export { onBeforeRender }

function onBeforeRender (pageContext) {
	const params = pageContext.params
	const langues = pageContext.langues
	const langue = pageContext.langue
	const titre = 'Erreur - Digipad by La Digitale'
	const pageProps = { params, langues, langue, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
