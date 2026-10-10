export { onBeforeRender }

function onBeforeRender (pageContext) {
	const params = pageContext.params
	const langues = pageContext.langues
	const langue = pageContext.langue
	const is404 = pageContext.is404 === true
	const abortStatusCode = pageContext.abortStatusCode
	const abortReason = pageContext.abortReason
	const titre = 'Erreur - DigiLang Board'
	const pageProps = { params, langues, langue, is404, abortStatusCode, abortReason, titre }
	return {
		pageContext: {
			pageProps
		}
	}
}
