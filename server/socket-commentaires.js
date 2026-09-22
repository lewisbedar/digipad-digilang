import dayjs from 'dayjs'
import { etat } from './etat.js'
import {
	limitesTailleInput,
	definirAccesLecture,
	verifierCapsuleLisible,
	verifierColonneMasquee,
	definirSalonUtilisateur,
	definirSalonAdmin,
	sauvegarderSession,
	assainirHTML,
	parseJSON
} from './fonctions.js'

// Commentaires et évaluations des blocs + modération
export default function creerGestionnairesCommentaires ({
	io,
	db,
	dureeSession,
	fonctions
}) {
	const {
		recupererNomUtilisateur,
		diffuserAdmin,
		recupererCommentairesMasques,
		diffuserCommentaires,
		notifierAdminsAbsents,
		verifierAdmin
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('commenterbloc', async (bloc, pad, titre, texte, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof texte !== 'string' || texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if ((donneesPad.accesCommentaires === 'admin' || donneesPad.visibiliteCommentaires === 'admin') && !admin) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('commentaires')) return socket.emit('erreur')
				const blocMasque = (donneesBloc.visibilite === 'masquee' || donneesBloc.visibilite === 'privee')
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), donneesBloc.colonne)
				if ((blocMasque || colonneMasquee) && donneesBloc.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires === null) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				let commentaireId = parseInt(donneesBloc.commentaires, 10) + 1
				const listeCommentaires = []
				for (let commentaire of commentaires) {
					const commentaireJSON = parseJSON(commentaire, false)
					if (commentaireJSON === false) return
					listeCommentaires.push(commentaireJSON)
				}
				let maxCommentaireId = 0
				if (listeCommentaires.length > 0) {
					maxCommentaireId = listeCommentaires.reduce((p, c) => { return (p && p.id > c.id) ? p : c })
				}
				if (commentaireId === maxCommentaireId.id || commentaireId < maxCommentaireId.id) {
					commentaireId = maxCommentaireId.id + 1
				}
				texte = assainirHTML(texte)
				const visibilite = (!admin && donneesPad.commentairesModeration === 'activee') ? 'masquee' : 'visible'
				const commentaire = { id: commentaireId, identifiant, date, texte, visibilite, activiteId }
				const pipelineCommentaire = db.multi()
					.HSET('pad-' + pad + ':' + bloc, 'commentaires', commentaireId)
					.HSET('dates-pads:' + pad, 'date', date)
					.ZADD('commentaires:' + bloc, [{ score: commentaireId, value: JSON.stringify(commentaire) }])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc, identifiant, titre, date, type: 'bloc-commente', commentaire: commentaireId }) }])
				if (visibilite === 'masquee') {
					pipelineCommentaire.ZADD('commentaires-masques:' + bloc, [{ score: commentaireId, value: commentaireId + ':' + identifiant }])
				}
				await pipelineCommentaire.exec()
				const commentairesMasques = await recupererCommentairesMasques(bloc)
				if (commentairesMasques === null) return socket.emit('erreur')
				const contenuAMasquer = (visibilite === 'masquee' || donneesPad.visibiliteCommentaires === 'admin')
				const commentaireAuteur = { id: commentaireId, bloc, identifiant, nom, titre, date, activiteId, visibilite }
				const commentaireAdmin = { ...commentaireAuteur, texte }
				const commentaireDiffuse = contenuAMasquer ? { id: commentaireId, bloc } : { ...commentaireAuteur, texte }
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				diffuserCommentaires(pad, 'commenterbloc', commentaireDiffuse, commentairesMasques, identifiant, contenuAMasquer ? commentaireAdmin : null, donneesPad.visibiliteCommentaires !== 'admin', contenuAMasquer ? commentaireAuteur : null, !capsuleLisible, donneesBloc.identifiant)
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('autorisercommentaire', async (pad, bloc, id, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('titre')) return socket.emit('erreur')
				const entrees = await db.ZRANGEBYSCORE('commentaires:' + bloc, id, id)
				const commentaireJSON = parseJSON(entrees[0], false)
				if (commentaireJSON === false || commentaireJSON.visibilite !== 'masquee') return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const commentaire = { ...commentaireJSON, visibilite: 'visible' }
				const nomAuteur = await recupererNomUtilisateur(commentaireJSON.identifiant)
				await db.multi()
					.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
					.ZADD('commentaires:' + bloc, [{ score: id, value: JSON.stringify(commentaire) }])
					.HSET('dates-pads:' + pad, 'date', date)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc, identifiant, titre: donneesBloc.titre, date, type: 'commentaire-valide' }) }])
					.ZREMRANGEBYSCORE('commentaires-masques:' + bloc, id, id)
					.exec()
				const commentairesMasques = await recupererCommentairesMasques(bloc)
				if (commentairesMasques === null) return socket.emit('erreur')
				const contenuAMasquer = (donneesPad.visibiliteCommentaires === 'admin')
				const commentaireDiffuse = { id: commentaire.id, identifiant: commentaire.identifiant, date: commentaire.date, dateValidation: date, visibilite: commentaire.visibilite, bloc, titre: donneesBloc.titre, nom: nomAuteur, activiteId, admin: identifiant, nomAdmin: nom }
				const commentaireAdmin = { ...commentaireDiffuse, texte: commentaire.texte }
				if (!contenuAMasquer) {
					commentaireDiffuse.texte = commentaire.texte
				}
				if (commentaireJSON.activiteId) {
					const publication = { activiteId: commentaireJSON.activiteId, date: commentaireJSON.date, identifiant: commentaireJSON.identifiant, nom: nomAuteur }
					commentaireDiffuse.publication = publication
					commentaireAdmin.publication = publication
				}
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				diffuserCommentaires(pad, 'autorisercommentaire', commentaireDiffuse, commentairesMasques, commentaire.identifiant, contenuAMasquer ? commentaireAdmin : null, donneesPad.visibiliteCommentaires !== 'admin', null, !capsuleLisible, donneesBloc.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercommentaire', async (bloc, pad, id, texte, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof texte !== 'string' || texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			try {
				let [commentaires, donneesPad, donneesBloc] = await Promise.all([db.ZRANGEBYSCORE('commentaires:' + bloc, id, id), db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc)])
				if (commentaires === null) return socket.emit('erreur')
				const dateModification = dayjs().format()
				const commentairesJSON = parseJSON(commentaires[0], false)
				if (commentairesJSON === false) return socket.emit('erreur')
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('bloc')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesPad.visibiliteCommentaires === 'admin' && !admin) return socket.emit('nonautorise')
				if (commentairesJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				texte = assainirHTML(texte)
				const commentaire = { id, identifiant: commentairesJSON.identifiant, date: commentairesJSON.date, modifie: dateModification, texte, visibilite: commentairesJSON.visibilite || 'visible', activiteId: commentairesJSON.activiteId }
				await db.multi()
					.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
					.ZADD('commentaires:' + bloc, [{ score: id, value: JSON.stringify(commentaire) }])
					.HSET('dates-pads:' + pad, 'date', dateModification)
					.exec()
				const contenuAMasquer = (commentaire.visibilite === 'masquee' || donneesPad.visibiliteCommentaires === 'admin')
				// Une capsule masquée, privée ou en colonne masquée n'est pas diffusée hors du salon admin et de celui de son auteur
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				if (contenuAMasquer) {
					diffuserAdmin(pad, 'modifiercommentaire', { id, bloc, texte }, { id, bloc }, { identifiantCapsule: donneesBloc.identifiant, diffusionRestreinte: !capsuleLisible })
				} else if (capsuleLisible) {
					io.to('pad-' + pad).emit('modifiercommentaire', { id, bloc, texte })
				} else {
					diffuserAdmin(pad, 'modifiercommentaire', { id, bloc, texte }, { id, bloc, texte }, { identifiantAuteur: donneesBloc.identifiant, diffusionRestreinte: true })
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimercommentaire', async (bloc, pad, id, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [entrees, donneesPad, donneesBloc] = await Promise.all([db.ZRANGEBYSCORE('commentaires:' + bloc, id, id), db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc)])
				const commentaireJSON = parseJSON(entrees[0], false)
				if (commentaireJSON === false) return socket.emit('erreur')
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (Object.keys(donneesBloc).length === 0) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesPad.visibiliteCommentaires === 'admin' && !admin) return socket.emit('nonautorise')
				if (commentaireJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				const pipelineSuppression = db.multi()
					.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
					.HSET('dates-pads:' + pad, 'date', date)
				if (commentaireJSON.visibilite === 'masquee') {
					pipelineSuppression.ZREMRANGEBYSCORE('commentaires-masques:' + bloc, id, id)
				}
				await pipelineSuppression.exec()
				const commentairesMasques = await recupererCommentairesMasques(bloc)
				if (commentairesMasques === null) return socket.emit('erreur')
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				diffuserCommentaires(pad, 'supprimercommentaire', { id, bloc }, commentairesMasques, commentaireJSON.identifiant, null, donneesPad.visibiliteCommentaires !== 'admin', null, !capsuleLisible, donneesBloc.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('commentaires', async (bloc, pad, type, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [donneesPad, donneesBloc, commentaires] = await Promise.all([db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc), db.ZRANGE('commentaires:' + bloc, 0, -1)])
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('bloc')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesPad.visibiliteCommentaires === 'admin' && !admin) return socket.emit('nonautorise')
				if (!verifierCapsuleLisible(donneesPad, donneesBloc, admin, identifiant)) return socket.emit('nonautorise')
				if (commentaires === null) return socket.emit('erreur')
				const nomsUtilisateurs = new Map()
				const promessesCommentaires = commentaires.map(async (comm) => {
					const commentaireJSON = parseJSON(comm, false)
					if (commentaireJSON === false) return null
					if (commentaireJSON.visibilite === 'masquee' && !admin && commentaireJSON.identifiant !== identifiant) return null
					const commentaire = commentaireJSON
					commentaire.nom = await recupererNomUtilisateur(commentaire.identifiant, nomsUtilisateurs)
					return commentaire
				})
				const listeCommentaires = (await Promise.all(promessesCommentaires)).filter(c => c !== null)
				socket.emit('commentaires', listeCommentaires, type, bloc)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('evaluerbloc', async (bloc, pad, titre, etoiles, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if ((donneesPad.accesEvaluations === 'admin' || donneesPad.visibiliteEvaluations === 'admin') && !admin) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('evaluations')) return socket.emit('erreur')
				const blocMasque = (donneesBloc.visibilite === 'masquee' || donneesBloc.visibilite === 'privee')
				const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), donneesBloc.colonne)
				if ((blocMasque || colonneMasquee) && donneesBloc.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const evaluationId = parseInt(donneesBloc.evaluations, 10) + 1
				const evaluation = { id: evaluationId, identifiant, date, etoiles }
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, 'evaluations', evaluationId)
					.ZADD('evaluations:' + bloc, [{ score: evaluationId, value: JSON.stringify(evaluation) }])
					.HSET('dates-pads:' + pad, 'date', date)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc, identifiant, titre, date, type: 'bloc-evalue' }) }])
					.exec()
				const evaluationDiffusee = { id: evaluationId, bloc, identifiant, nom, titre, date, evaluation, activiteId }
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				if (donneesPad.visibiliteEvaluations === 'admin') {
					diffuserAdmin(pad, 'evaluerbloc', evaluationDiffusee, { bloc }, { identifiantAuteur: identifiant, identifiantCapsule: donneesBloc.identifiant, diffusionRestreinte: !capsuleLisible })
				} else if (capsuleLisible) {
					io.to('pad-' + pad).emit('evaluerbloc', evaluationDiffusee)
				} else {
					diffuserAdmin(pad, 'evaluerbloc', evaluationDiffusee, evaluationDiffusee, { identifiantAuteur: identifiant, identifiantCapsule: donneesBloc.identifiant, diffusionRestreinte: true })
				}
				notifierAdminsAbsents(pad, donneesPad, req.session.identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierevaluation', async (bloc, pad, id, etoiles, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [entrees, donneesPad, donneesBloc] = await Promise.all([db.ZRANGEBYSCORE('evaluations:' + bloc, id, id), db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc)])
				const evaluationJSON = parseJSON(entrees[0], false)
				if (evaluationJSON === false) return socket.emit('erreur')
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (Object.keys(donneesBloc).length === 0) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesPad.visibiliteEvaluations === 'admin' && !admin) return socket.emit('nonautorise')
				if (evaluationJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				const evaluation = { id, identifiant: evaluationJSON.identifiant, date, etoiles }
				await db.multi()
					.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
					.ZADD('evaluations:' + bloc, [{ score: id, value: JSON.stringify(evaluation) }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				if (donneesPad.visibiliteEvaluations === 'admin' || !capsuleLisible) {
					const salonAdmin = definirSalonAdmin(pad)
					const destinataires = new Set()
					if (evaluationJSON.identifiant) destinataires.add(evaluationJSON.identifiant)
					if (!capsuleLisible && donneesBloc.identifiant) destinataires.add(donneesBloc.identifiant)
					io.to(salonAdmin).emit('modifierevaluation', id, bloc, date, etoiles)
					destinataires.forEach((destinataire) => {
						io.to(definirSalonUtilisateur(pad, destinataire)).except(salonAdmin).emit('modifierevaluation', id, bloc, date, etoiles)
					})
				} else {
					io.to('pad-' + pad).emit('modifierevaluation', id, bloc, date, etoiles)
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimerevaluation', async (bloc, pad, id, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [entrees, donneesPad, donneesBloc] = await Promise.all([db.ZRANGEBYSCORE('evaluations:' + bloc, id, id), db.HGETALL('pads:' + pad), db.HGETALL('pad-' + pad + ':' + bloc)])
				const evaluationJSON = parseJSON(entrees[0], false)
				if (evaluationJSON === false) return socket.emit('erreur')
				donneesPad = donneesPad ? { ...donneesPad } : {}
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (Object.keys(donneesBloc).length === 0) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				if (donneesPad.visibiliteEvaluations === 'admin' && !admin) return socket.emit('nonautorise')
				if (evaluationJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				await db.multi()
					.HSET('dates-pads:' + pad, 'date', date)
					.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
					.exec()
				const capsuleLisible = verifierCapsuleLisible(donneesPad, donneesBloc, false, null)
				if (donneesPad.visibiliteEvaluations === 'admin' || !capsuleLisible) {
					const salonAdmin = definirSalonAdmin(pad)
					const destinataires = new Set()
					if (evaluationJSON.identifiant) destinataires.add(evaluationJSON.identifiant)
					if (!capsuleLisible && donneesBloc.identifiant) destinataires.add(donneesBloc.identifiant)
					io.to(salonAdmin).emit('supprimerevaluation', id, bloc)
					destinataires.forEach((destinataire) => {
						io.to(definirSalonUtilisateur(pad, destinataire)).except(salonAdmin).emit('supprimerevaluation', id, bloc)
					})
				} else {
					io.to('pad-' + pad).emit('supprimerevaluation', id, bloc)
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('evaluations', async (bloc, pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let [donneesPad, blocExiste, evaluations] = await Promise.all([db.HGETALL('pads:' + pad), db.EXISTS('pad-' + pad + ':' + bloc), db.ZRANGE('evaluations:' + bloc, 0, -1)])
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (blocExiste !== 1) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (evaluations === null) return socket.emit('erreur')
				const nomsUtilisateurs = new Map()
				const promessesEvaluations = evaluations.map(async (ev) => {
					const evaluationJSON = parseJSON(ev, false)
					if (evaluationJSON === false) return null
					evaluationJSON.nom = await recupererNomUtilisateur(evaluationJSON.identifiant, nomsUtilisateurs)
					return evaluationJSON
				})
				const listeEvaluations = (await Promise.all(promessesEvaluations)).filter(e => e !== null)
				socket.emit('evaluations', listeEvaluations, bloc)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})
	}
}
