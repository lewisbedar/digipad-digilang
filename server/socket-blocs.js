import path from 'path'
import dayjs from 'dayjs'
import { etat } from './etat.js'
import {
	limitesTailleInput,
	definirBlocDiffuse,
	verifierColonneMasquee,
	validerIndexColonne,
	definirColonneBloc,
	verifierBlocVisible,
	verifierCapsuleLisible,
	definirAccesLecture,
	verifierIdentifiantBloc,
	recupererNombreCommentaires,
	sauvegarderSession,
	assainirHTML,
	assainirIframe,
	assainirTexteAlternatif,
	assainirEtiquettes,
	parseJSON
} from './fonctions.js'

// Cycle de vie des blocs : ajout, modification, duplication, copie, validation, déplacement et suppression
export default function creerGestionnairesBlocs ({
	io,
	db,
	dureeSession,
	fonctions
}) {
	const {
		diffuserAdmin,
		diffuserBloc,
		recupererNomUtilisateur,
		diffuserBlocsDeplaces,
		notifierAdminsAbsents,
		recupererCommentairesMasques,
		verifierAdmin,
		verifierAccesLecturePad,
		definirVignettePersonnalisee,
		supprimerFichierSansEchec,
		realignerACLFichiers,
		televerserFichierTemp,
		copierFichier,
		verifierEspaceDisque,
		annulerDupliquerBloc,
		supprimerEtherpad,
		dupliquerBloc,
		definirScoreDuplication,
		ajouterUrlsFichiers,
		definirAdministrateursPad
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('ajouterbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom, alt, etiquettes) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!verifierIdentifiantBloc(bloc)) return socket.emit('erreur')
			if (typeof titre === 'string' && titre.length > limitesTailleInput.titre) return socket.emit('erreur')
			if (typeof texte === 'string' && texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			if (typeof iframe === 'string' && iframe.length > limitesTailleInput.iframe) return socket.emit('erreur')
			if (typeof alt === 'string' && alt.length > limitesTailleInput.alt) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'bloc', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && (donneesPad.contributions !== 'fermees' || admin))
				if (!autorisation) return socket.emit('nonautorise')
				colonne = validerIndexColonne(colonne, parseJSON(donneesPad.colonnes, []).length)
				if (colonne === null) return socket.emit('erreur')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + bloc)
				if (blocExiste === 1) return socket.emit('erreur')
				const blocId = parseInt(donneesPad.bloc, 10) + 1
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				let visibilite = 'visible'
				if (admin && privee === true) {
					visibilite = 'privee'
				} else if (!admin && donneesPad.contributions === 'moderees') {
					visibilite = 'masquee'
				}
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				if (vignettePersonnalisee) {
					vignette = path.basename(vignette)
				}
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				alt = assainirTexteAlternatif(alt)
				etiquettes = (donneesPad.etiquettes === 'activees') ? assainirEtiquettes(etiquettes) : []
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, ['id', blocId, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'alt', alt, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'etiquettes', JSON.stringify(etiquettes), 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: blocId, value: bloc }])
					.HSET('pads:' + pad, 'bloc', blocId)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				// Entrée d'activité enregistrée que si la capsule n'est pas privée
				const activiteEnregistree = (visibilite === 'visible' || visibilite === 'masquee')
				if (activiteEnregistree) {
					const transactionActivite = db.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
					if (visibilite === 'masquee') {
						transactionActivite.HSET('pad-' + pad + ':' + bloc, 'activitePublication', activiteId)
					}
					await transactionActivite.exec()
				}
				if (media !== '' && type !== 'embed' && type !== 'lien') {
					await televerserFichierTemp(media, pad, donneesPad.acces)
				}
				if (vignettePersonnalisee) {
					await televerserFichierTemp(vignette, pad, donneesPad.acces)
				}
				await realignerACLFichiers(pad, donneesPad.acces, [media, vignettePersonnalisee ? vignette : ''])
				const blocDiffuse = definirBlocDiffuse({ bloc, titre, type, source, identifiant, nom, date, couleur, etiquettes, commentaires: 0, commentairesEnAttente: 0, evaluations: [], colonne, ...(activiteEnregistree ? { activiteId } : {}) }, visibilite, { texte, media, alt, iframe, vignette }, donneesPad.contributions)
				await ajouterUrlsFichiers(pad, blocDiffuse.complet, donneesPad.acces)
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonne)
				diffuserBloc(pad, 'ajouterbloc', blocDiffuse, identifiant, colonneMasquee)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('recupererbloc', async (pad, bloc, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [donneesPad, donneesBloc] = await Promise.all([db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc)])
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('titre')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesBloc.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				let vignette = donneesBloc.vignette
				if (vignette && definirVignettePersonnalisee(vignette) === true) {
					vignette = path.basename(vignette)
				}
				const reponse = { bloc, titre: donneesBloc.titre, texte: donneesBloc.texte, media: donneesBloc.media, alt: donneesBloc.alt || '', iframe: donneesBloc.iframe, vignette, type: donneesBloc.type, etiquettes: parseJSON(donneesBloc.etiquettes, []) }
				await ajouterUrlsFichiers(pad, reponse, donneesPad.acces)
				socket.emit('recupererbloc', reponse)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, privee, identifiant, nom, alt, etiquettes) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof titre !== 'string' || titre.length > limitesTailleInput.titre) return socket.emit('erreur')
			if (typeof texte !== 'string' || texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			if (typeof iframe !== 'string' || iframe.length > limitesTailleInput.iframe) return socket.emit('erreur')
			if (typeof alt === 'string' && alt.length > limitesTailleInput.alt) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (Object.keys(donneesBloc).length === 0) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				const autorisation = (donneesBloc.identifiant === identifiant || admin || (donneesPad.contributions === 'modifiables' && verifierCapsuleLisible(donneesPad, donneesBloc, false, identifiant)))
				if (!autorisation) return socket.emit('nonautorise')
				let visibilite = donneesBloc.visibilite || 'visible'
				if (admin && privee === true) {
					visibilite = 'privee'
				}
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				const vignetteModifiee = (donneesBloc.hasOwnProperty('vignette') && path.basename(donneesBloc.vignette) !== path.basename(vignette))
				if (vignettePersonnalisee && vignetteModifiee) {
					vignette = path.basename(vignette)
				}
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				alt = (typeof alt === 'string') ? assainirTexteAlternatif(alt) : (donneesBloc.alt || '')
				etiquettes = (donneesPad.etiquettes === 'activees') ? assainirEtiquettes(etiquettes) : assainirEtiquettes(donneesBloc.etiquettes)
				const statuts = ['visible', 'privee', 'masquee']
				// Ajout dans le registre d'activité, seulement si la capsule n'est pas privée
				const activiteEnregistree = (visibilite === 'visible' || visibilite === 'masquee')
				if (statuts.includes(visibilite)) {
					if (activiteEnregistree) {
						await db.multi()
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-modifie' }) }])
							.exec()
					}
					await db.multi()
						.HSET('pad-' + pad + ':' + bloc, ['titre', titre, 'texte', texte, 'media', media, 'alt', alt, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'etiquettes', JSON.stringify(etiquettes), 'visibilite', visibilite, 'couleur', couleur, 'modifie', date])
						.HSET('dates-pads:' + pad, 'date', date)
						.exec()
				}
				const mediaModifie = (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== media)
				// Suppression de l'ancien media si modifié
				if (mediaModifie && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
					await supprimerFichierSansEchec(pad, donneesBloc.media)
				}
				// Ajout du nouveau media si modifié
				if (mediaModifie && media !== '' && type !== 'embed' && type !== 'lien') {
					await televerserFichierTemp(media, pad, donneesPad.acces)
				}
				const ancienneVignettePersonnalisee = (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true)
				if (vignetteModifiee && ancienneVignettePersonnalisee) {
					await supprimerFichierSansEchec(pad, path.basename(donneesBloc.vignette))
				}
				if (vignettePersonnalisee && vignetteModifiee) {
					await televerserFichierTemp(vignette, pad, donneesPad.acces)
				}
				await realignerACLFichiers(pad, donneesPad.acces, [media, vignettePersonnalisee ? vignette : ''])
				const colonneStockee = definirColonneBloc(donneesBloc.colonne, parseJSON(donneesPad.colonnes, []).length)
				const blocDiffuse = definirBlocDiffuse({ bloc, titre, type, source, identifiant, nom, modifie: date, couleur, etiquettes, colonne: colonneStockee, ...(activiteEnregistree ? { activiteId } : {}) }, visibilite, { texte, media, alt, iframe, vignette }, donneesPad.contributions)
				await ajouterUrlsFichiers(pad, blocDiffuse.complet, donneesPad.acces)
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonneStockee)
				diffuserBloc(pad, 'modifierbloc', blocDiffuse, donneesBloc.identifiant, colonneMasquee)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('dupliquerbloc', async (bloc, pad, token, blocOrigine, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!verifierIdentifiantBloc(bloc)) return socket.emit('erreur')
			const contenusANettoyer = []
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'bloc', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocOrigine)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== blocOrigine) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + bloc)
				if (blocExiste === 1) return socket.emit('erreur')
				if (!await verifierEspaceDisque()) return socket.emit('espacedisque')
				const blocId = parseInt(donneesPad.bloc, 10) + 1
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const visibilite = donneesBloc.visibilite || 'visible'
				const colonne = donneesBloc.hasOwnProperty('colonne') ? parseInt(donneesBloc.colonne, 10) || 0 : 0
				const titre = donneesBloc.titre || ''
				const type = donneesBloc.type || ''
				const sourceBloc = donneesBloc.source || ''
				const couleur = donneesBloc.couleur || ''
				const etiquettes = assainirEtiquettes(donneesBloc.etiquettes)
				const contenu = await dupliquerBloc(pad, donneesBloc, contenusANettoyer, donneesPad.acces)
				if (contenu.echec) {
					await annulerDupliquerBloc(pad, contenusANettoyer)
					return socket.emit('erreur')
				}
				const score = await definirScoreDuplication(pad, blocOrigine, blocId)
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, ['id', blocId, 'bloc', bloc, 'titre', titre, 'texte', contenu.texte, 'media', contenu.media, 'alt', contenu.alt, 'iframe', contenu.iframe, 'type', type, 'source', sourceBloc, 'vignette', contenu.vignette, 'etiquettes', JSON.stringify(etiquettes), 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: score, value: bloc }])
					.HSET('pads:' + pad, 'bloc', blocId)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				await realignerACLFichiers(pad, donneesPad.acces, contenu.fichiersCrees)
				contenusANettoyer.length = 0
				// Ajout dans le registre d'activité, seulement si la capsule n'est pas privée
				const activiteEnregistree = (visibilite === 'visible' || visibilite === 'masquee')
				if (activiteEnregistree) {
					await db.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-duplique' }) }])
						.exec()
				}
				const blocDiffuse = definirBlocDiffuse({ bloc, blocOrigine, titre, type, source: sourceBloc, identifiant, nom, date, couleur, etiquettes, commentaires: 0, commentairesEnAttente: 0, evaluations: [], colonne, ...(activiteEnregistree ? { activiteId } : {}) }, visibilite, contenu, donneesPad.contributions)
				await ajouterUrlsFichiers(pad, blocDiffuse.complet, donneesPad.acces)
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonne)
				diffuserBloc(pad, 'dupliquerbloc', blocDiffuse, identifiant, colonneMasquee)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
				await annulerDupliquerBloc(pad, contenusANettoyer)
			}
		})

		socket.on('copierbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, visibilite, identifiant, nom, padOrigine, alt, etiquettes) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!verifierIdentifiantBloc(bloc)) return socket.emit('erreur')
			if (typeof titre === 'string' && titre.length > limitesTailleInput.titre) return socket.emit('erreur')
			if (typeof texte === 'string' && texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			if (typeof iframe === 'string' && iframe.length > limitesTailleInput.iframe) return socket.emit('erreur')
			if (typeof alt === 'string' && alt.length > limitesTailleInput.alt) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'identifiant', 'bloc', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				const admin = definirAdministrateursPad(donneesPad).includes(identifiant)
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && admin)
				if (!autorisation) return socket.emit('nonautorise')
				if (String(padOrigine) !== String(pad) && !await verifierAccesLecturePad(padOrigine, req.session)) return socket.emit('nonautorise')
				colonne = validerIndexColonne(colonne, parseJSON(donneesPad.colonnes, []).length)
				if (colonne === null) return socket.emit('erreur')
				const blocId = parseInt(donneesPad.bloc, 10) + 1
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				if (vignettePersonnalisee) {
					vignette = path.basename(vignette)
				}
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				alt = assainirTexteAlternatif(alt)
				etiquettes = (donneesPad.etiquettes === 'activees') ? assainirEtiquettes(etiquettes) : []
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, ['id', blocId, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'alt', alt, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'etiquettes', JSON.stringify(etiquettes), 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: blocId, value: bloc }])
					.HSET('pads:' + pad, 'bloc', blocId)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				// Ajout dans le registre d'activité, seulement si la capsule n'est pas privée ou en attente de modération
				const activiteEnregistree = (visibilite === 'visible')
				if (activiteEnregistree) {
					await db.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
				}
				if (media !== '' && type !== 'embed' && type !== 'lien') {
					await copierFichier(padOrigine, pad, media, 'media', donneesPad.acces)
				}
				if (vignettePersonnalisee && vignette !== '') {
					await copierFichier(padOrigine, pad, vignette, 'vignette', donneesPad.acces)
				}
				await realignerACLFichiers(pad, donneesPad.acces, [media, (vignettePersonnalisee && vignette !== '') ? vignette : ''])
				const blocDiffuse = definirBlocDiffuse({ bloc, titre, identifiant, nom, date, couleur, etiquettes, commentaires: 0, commentairesEnAttente: 0, evaluations: [], colonne, ...(activiteEnregistree ? { activiteId } : {}), type, source }, visibilite, { texte, media, alt, iframe, vignette }, donneesPad.contributions)
				await ajouterUrlsFichiers(pad, blocDiffuse.complet, donneesPad.acces)
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonne)
				diffuserBloc(pad, 'ajouterbloc', blocDiffuse, identifiant, colonneMasquee)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				socket.emit('copierbloc')
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('autoriserbloc', async (pad, token, item, indexBloc, indexBlocColonne, moderation, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && await verifierAdmin(pad, donneesPad, req.session) === true)
				if (!autorisation) return socket.emit('nonautorise')
				if (!item || typeof item.bloc !== 'string') return socket.emit('erreur')
				if (moderation !== 'privee' && moderation !== 'moderee') return socket.emit('erreur')
				const bloc = item.bloc
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== bloc) return socket.emit('erreur')
				const visibiliteAttendue = (moderation === 'privee') ? 'privee' : 'masquee'
				if (donneesBloc.visibilite !== visibiliteAttendue) return socket.emit('erreur')
				const colonneBloc = definirColonneBloc(donneesBloc.colonne, parseJSON(donneesPad.colonnes, []).length)
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const nomAuteur = await recupererNomUtilisateur(donneesBloc.identifiant)
				const activitePublication = parseInt(donneesBloc.activitePublication, 10)
				const transaction = db.multi()
					.HDEL('pad-' + pad + ':' + bloc, ['modifie', 'activitePublication'])
				if (moderation === 'privee') {
					transaction
						.HSET('pad-' + pad + ':' + bloc, ['visibilite', 'visible', 'date', date])
						.HSET('dates-pads:' + pad, 'date', date)
					// Enregistrer entrée du registre d'activité
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: donneesBloc.identifiant, titre: donneesBloc.titre, date: date, type: 'bloc-ajoute' }) }])
				} else {
					transaction
						.HSET('pad-' + pad + ':' + bloc, 'visibilite', 'visible')
					// Enregistrer entrée du registre d'activité
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: donneesBloc.titre, date: date, type: 'bloc-valide' }) }])
				}
				await transaction.exec()
				const [commentairesMasques, evaluationsBrutes] = await Promise.all([
					recupererCommentairesMasques(bloc),
					db.ZRANGE('evaluations:' + bloc, 0, -1)
				])
				if (commentairesMasques === null) return socket.emit('erreur')
				const commentairesAdmin = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, true, null)
				const commentairesVisibles = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, false, null, donneesPad.visibiliteCommentaires !== 'admin')
				const listeEvaluations = (evaluationsBrutes || []).map(ev => parseJSON(ev, null)).filter(e => e !== null)
				const evaluationsVisibles = (donneesPad.visibiliteEvaluations === 'admin') ? [] : listeEvaluations
				let vignette = donneesBloc.vignette || ''
				if (vignette !== '' && definirVignettePersonnalisee(vignette) === true) {
					vignette = path.basename(vignette)
				}
				const donneesBlocAutoriseBase = { bloc, titre: donneesBloc.titre, texte: assainirHTML(donneesBloc.texte || ''), media: donneesBloc.media || '', alt: donneesBloc.alt || '', iframe: assainirIframe(donneesBloc.iframe || ''), type: donneesBloc.type, source: donneesBloc.source, vignette, identifiant: donneesBloc.identifiant, nom: nomAuteur, date, couleur: donneesBloc.couleur, etiquettes: assainirEtiquettes(donneesBloc.etiquettes), colonne: colonneBloc, visibilite: 'visible', activiteId, moderation, admin: identifiant, nomAdmin: nom, indexBloc, indexBlocColonne }
				await ajouterUrlsFichiers(pad, donneesBlocAutoriseBase, donneesPad.acces)
				if (moderation === 'moderee' && Number.isInteger(activitePublication)) {
					donneesBlocAutoriseBase.publication = { activiteId: activitePublication, date: donneesBloc.date, identifiant: donneesBloc.identifiant, nom: nomAuteur }
				}
				const donneesBlocAutoriseAdmin = { ...donneesBlocAutoriseBase, ...commentairesAdmin, evaluations: listeEvaluations }
				const donneesBlocAutorise = { ...donneesBlocAutoriseBase, ...commentairesVisibles, evaluations: evaluationsVisibles }
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonneBloc)
				diffuserAdmin(pad, 'autoriserbloc', donneesBlocAutoriseAdmin, donneesBlocAutorise, { identifiantAuteur: donneesBloc.identifiant, diffusionRestreinte: colonneMasquee })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('deplacerbloc', async (items, pad, affichage, ordre, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (donneesPad.id !== pad || !admin) return socket.emit('nonautorise')
				let listeItems = [...items]
				if (ordre === 'decroissant') {
					listeItems.reverse()
				}
				if (affichage === 'colonnes') {
					const nombreColonnes = parseJSON(donneesPad.colonnes, []).length
					for (const item of listeItems) {
						if (!item || !item.hasOwnProperty('colonne')) continue
						item.colonne = nombreColonnes > 0 ? definirColonneBloc(item.colonne, nombreColonnes) : 0
					}
				}
				const pipelineBlocsExistants = db.multi()
				listeItems.forEach((item) => {
					pipelineBlocsExistants.EXISTS('pad-' + pad + ':' + item.bloc)
				})
				const blocsExistants = await pipelineBlocsExistants.exec()
				let compteurErreurs = 0
				const pipelineDeplacements = db.multi()
				let deplacements = 0
				for (let i = 0; i < listeItems.length; i++) {
					const item = listeItems[i]
					if (blocsExistants[i] !== 1) {
						compteurErreurs++
						continue
					}
					pipelineDeplacements
						.ZREM('blocs:' + pad, item.bloc)
						.ZADD('blocs:' + pad, [{ score: i + 1, value: item.bloc }])
					// Mise à jour de la colonne si l'affichage est en colonnes
					if (affichage === 'colonnes' && item.hasOwnProperty('colonne')) {
						pipelineDeplacements.HSET('pad-' + pad + ':' + item.bloc, 'colonne', item.colonne)
					}
					deplacements++
				}
				if (deplacements > 0) await pipelineDeplacements.exec()
				if (compteurErreurs === 0) {
					if (ordre === 'decroissant') {
						listeItems.reverse()
					}
					let blocs = []
					if (listeItems.length > 0) {
						const pipelineVisibilites = db.multi()
						listeItems.forEach((item) => {
							pipelineVisibilites.HMGET('pad-' + pad + ':' + item.bloc, ['visibilite', 'identifiant', 'colonne'])
						})
						const visibilites = await pipelineVisibilites.exec()
						blocs = listeItems.map((item, index) => {
							const champs = visibilites[index] || []
							return { bloc: item.bloc, visibilite: champs[0] || 'visible', identifiant: champs[1] || '', colonne: champs[2] || 0 }
						})
					}
					diffuserBlocsDeplaces(pad, listeItems, blocs, donneesPad, identifiant)
				} else {
					socket.emit('erreur')
				}
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimerbloc', async (bloc, pad, token, titre, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + bloc)
				if (blocExiste !== 1) return socket.emit('erreur')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				const autorisation = (donneesBloc.identifiant === identifiant || admin === true)
				if (!autorisation) return socket.emit('nonautorise')
				if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== bloc) return socket.emit('erreur')
				if (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
					await supprimerFichierSansEchec(pad, donneesBloc.media)
				}
				if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
					await supprimerFichierSansEchec(pad, path.basename(donneesBloc.vignette))
				}
				await supprimerEtherpad([donneesBloc.iframe, donneesBloc.media])
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.UNLINK('pad-' + pad + ':' + bloc)
					.ZREM('blocs:' + pad, bloc)
					.UNLINK('commentaires:' + bloc)
					.UNLINK('commentaires-masques:' + bloc)
					.UNLINK('evaluations:' + bloc)
					.HSET('dates-pads:' + pad, 'date', date)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-supprime' }) }])
					.exec()
				const blocMasque = !verifierBlocVisible(donneesBloc, donneesPad.contributions)
				const colonneStockee = definirColonneBloc(donneesBloc.colonne, parseJSON(donneesPad.colonnes, []).length)
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), colonneStockee)
				const donneesSuppression = { bloc, identifiant, nom, titre, date, colonne: colonneStockee, activiteId }
				diffuserBloc(pad, 'supprimerbloc', { complet: donneesSuppression, reduit: donneesSuppression }, donneesBloc.identifiant, blocMasque || colonneMasquee)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('verifiermodifierbloc', async (pad, bloc, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!socket.rooms.has('pad-' + pad)) return
			socket.to('pad-' + pad).emit('verifiermodifierbloc', bloc, identifiant)
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			await sauvegarderSession(req)
		})

		socket.on('reponsemodifierbloc', (pad, identifiant, reponse) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!socket.rooms.has('pad-' + pad)) return
			socket.to('pad-' + pad).emit('reponsemodifierbloc', identifiant, reponse)
		})
	}
}
