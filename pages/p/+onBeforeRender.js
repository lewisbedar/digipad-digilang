export { onBeforeRender }

import { render } from 'vike/abort'

function onBeforeRender (pageContext) {
	let pageProps
	let redirection = '/'
	const identifiant = pageContext.identifiant
	const statut = pageContext.statut
	let pads = pageContext.pads
	const donneesPad = pageContext.donneesPad
	if (donneesPad === 'pad_inexistant') {
		throw render(404, 'pad_inexistant')
	} else if (donneesPad === 'erreur') {
		throw render(500, 'erreur')
	} else if (typeof donneesPad !== 'object' || !donneesPad || !donneesPad.hasOwnProperty('pad') || !donneesPad.hasOwnProperty('blocs') || !donneesPad.hasOwnProperty('activite')) {
		if (statut === 'utilisateur') {
			redirection = '/u/' + identifiant
		}
		pageProps = { redirection }
	} else {
		let admin = false
		if ((statut === 'utilisateur' && ((donneesPad.pad.hasOwnProperty('identifiant') && donneesPad.pad.identifiant === identifiant) || (donneesPad.pad.hasOwnProperty('admins') && donneesPad.pad.admins.includes(identifiant)))) || (statut === 'auteur' && donneesPad.pad.hasOwnProperty('identifiant') && donneesPad.pad.identifiant === identifiant && donneesPad.pad.hasOwnProperty('id') && pads.includes(parseInt(donneesPad.pad.id, 10)))) {
			admin = true
		}
		if (!admin && donneesPad.pad.acces === 'prive' && statut === 'utilisateur') {
			redirection = '/u/' + identifiant
			pageProps = { redirection }
		} else if (!admin && donneesPad.pad.acces === 'prive' && statut !== 'utilisateur') {
			pageProps = { redirection }
		} else {
			const urlOriginal = pageContext.urlOriginal
			const params = pageContext.params
			const hote = pageContext.hote
			const hoteTeleversement = pageContext.hoteTeleversement
			const userAgent = pageContext.userAgent
			const langues = pageContext.langues
			const nom = pageContext.nom
			const langue = pageContext.langue
			const pad = donneesPad.pad
			const blocs = donneesPad.blocs
			const activite = donneesPad.activite
			const titre = pad.titre + ' - Digipad by La Digitale'
			if (!admin) {
				pads = []
			}
			pageProps = { urlOriginal, params, hote, hoteTeleversement, userAgent, langues, identifiant, nom, langue, statut, pads, pad, blocs, activite, titre }
		}
	}
	return {
		pageContext: {
			pageProps
		}
	}
}
