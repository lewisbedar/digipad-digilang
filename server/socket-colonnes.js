import dayjs from 'dayjs'
import { randomBytes } from 'crypto'
import { etat } from './etat.js'
import {
	tailleLotTransaction,
	verifierColonneMasquee,
	verifierBlocVisible,
	definirSalonAdmin,
	sauvegarderSession,
	definirAccesLecture,
	executerTransactions,
	parseJSON
} from './fonctions.js'

// Colonnes du pad : ajout, duplication, titre, affichage, vidage, suppression et déplacement
export default function creerGestionnairesColonnes ({
	io,
	db,
	dureeSession,
	fonctions
}) {
	const {
		recupererDonneesPadProtege,
		verifierAdmin,
		acquerirVerrouColonnes,
		libererVerrouColonnes,
		supprimerBlocs,
		verifierEspaceDisque,
		annulerDupliquerBloc,
		dupliquerBloc,
		definirScoreMaximum
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('ajoutercolonne', async (pad, titre, indexColonne, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes') || !donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				if (!Number.isInteger(indexColonne) || indexColonne < 0 || indexColonne > colonnes.length) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				colonnes.splice(indexColonne, 0, titre)
				affichageColonnes.splice(indexColonne, 0, true)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await Promise.all(blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				}))
				// Décalage des blocs situés dans une colonne insérée avant la leur (un bloc sans colonne est considéré comme faisant partie de la colonne 0)
				const blocsADecaler = donneesBlocs.filter((item) => {
					if (!item) return false
					const colonneActuelle = item.hasOwnProperty('colonne') ? parseInt(item.colonne, 10) : 0
					return colonneActuelle >= parseInt(indexColonne, 10)
				})
				const transaction = db.multi()
				blocsADecaler.forEach((bloc) => {
					const colonneActuelle = bloc.hasOwnProperty('colonne') ? parseInt(bloc.colonne, 10) : 0
					transaction.HSET('pad-' + pad + ':' + bloc.bloc, 'colonne', colonneActuelle + 1)
				})
				await transaction
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-ajoutee' }) }])
					.exec()
				io.to('pad-' + pad).emit('ajoutercolonne', { identifiant, nom, titre, indexColonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad, verrouColonne)
			}
		})

		socket.on('dupliquercolonne', async (pad, token, colonne, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			const contenusANettoyer = []
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'colonnes', 'bloc', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (!await verifierEspaceDisque()) return socket.emit('espacedisque')
				const colonnes = JSON.parse(donneesPad.colonnes)
				let affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? parseJSON(donneesPad.affichageColonnes, null) : null
				if (!Array.isArray(affichageColonnes) || affichageColonnes.length !== colonnes.length) {
					affichageColonnes = colonnes.map(() => true)
				}
				const indexSource = parseInt(colonne, 10)
				if (!Number.isInteger(indexSource) || indexSource < 0 || indexSource >= colonnes.length) return socket.emit('erreur')
				const indexColonne = indexSource + 1
				const titre = colonnes[indexSource]
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await Promise.all(blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				}))
				// Séparation des capsules à dupliquer et des capsules à décaler
				const blocsADupliquer = []
				const blocsADecaler = []
				donneesBlocs.forEach((item) => {
					if (!item || !item.hasOwnProperty('bloc')) return
					const colonneActuelle = item.hasOwnProperty('colonne') ? parseInt(item.colonne, 10) : 0
					if (colonneActuelle === indexSource) {
						blocsADupliquer.push(item)
					} else if (colonneActuelle >= indexColonne) {
						blocsADecaler.push(item)
					}
				})
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const blocCourant = parseInt(donneesPad.bloc, 10)
				const scoreBase = Math.max(await definirScoreMaximum(pad), blocCourant)
				// Contenu dupliqué avant toute écriture : si une copie échoue, rien n'a encore été modifié et la duplication est abandonnée
				const duplications = await executerTransactions(blocsADupliquer, async (donneesBloc, index) => {
					const nouveauBloc = 'bloc-id-' + Date.now() + randomBytes(8).toString('hex')
					const contenu = await dupliquerBloc(pad, donneesBloc, contenusANettoyer)
					return { nouveauBloc, contenu, donneesBloc, blocId: blocCourant + index + 1, score: scoreBase + index + 1 }
				}, tailleLotTransaction)
				if (duplications.some((duplication) => duplication.contenu.echec)) {
					await annulerDupliquerBloc(pad, contenusANettoyer)
					return socket.emit('erreur')
				}
				colonnes.splice(indexColonne, 0, titre)
				affichageColonnes.splice(indexColonne, 0, affichageColonnes[indexSource] !== false)
				const pipeline = db.multi()
				blocsADecaler.forEach((item) => {
					const colonneActuelle = item.hasOwnProperty('colonne') ? parseInt(item.colonne, 10) : 0
					pipeline.HSET('pad-' + pad + ':' + item.bloc, 'colonne', colonneActuelle + 1)
				})
				duplications.forEach((duplication) => {
					const { nouveauBloc, contenu, donneesBloc, blocId, score } = duplication
					pipeline.HSET('pad-' + pad + ':' + nouveauBloc, ['id', blocId, 'bloc', nouveauBloc, 'titre', donneesBloc.titre || '', 'texte', contenu.texte, 'media', contenu.media, 'alt', contenu.alt, 'iframe', contenu.iframe, 'type', donneesBloc.type || '', 'source', donneesBloc.source || '', 'vignette', contenu.vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', indexColonne, 'visibilite', donneesBloc.visibilite || 'visible', 'couleur', donneesBloc.couleur || ''])
					pipeline.ZADD('blocs:' + pad, [{ score: score, value: nouveauBloc }])
				})
				pipeline.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', blocCourant + duplications.length])
				pipeline.HSET('dates-pads:' + pad, 'date', date)
				pipeline.HINCRBY('pads:' + pad, 'activite', 1)
				pipeline.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-dupliquee' }) }])
				await pipeline.exec()
				contenusANettoyer.length = 0
				const blocsDupliques = duplications.map((duplication) => {
					const { nouveauBloc, contenu, donneesBloc, blocId } = duplication
					return { bloc: nouveauBloc, titre: donneesBloc.titre || '', type: donneesBloc.type || '', source: donneesBloc.source || '', identifiant, nom, date, couleur: donneesBloc.couleur || '', commentaires: 0, commentairesEnAttente: 0, evaluations: [], colonne: indexColonne, visibilite: donneesBloc.visibilite || 'visible', texte: contenu.texte, media: contenu.media, alt: contenu.alt, iframe: contenu.iframe, vignette: contenu.vignette, id: blocId }
				})
				const donneesColonne = { identifiant, nom, titre, indexColonne, colonnes, affichageColonnes, date, activiteId }
				const salonAdmin = definirSalonAdmin(pad)
				io.to(salonAdmin).emit('dupliquercolonne', { ...donneesColonne, blocs: blocsDupliques })
				const colonneMasquee = verifierColonneMasquee(donneesPad, affichageColonnes, indexColonne)
				io.to('pad-' + pad).except(salonAdmin).emit('dupliquercolonne', { ...donneesColonne, blocs: colonneMasquee ? [] : blocsDupliques.filter((item) => verifierBlocVisible(item, donneesPad.contributions)) })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
				await annulerDupliquerBloc(pad, contenusANettoyer)
			} finally {
				await libererVerrouColonnes(pad, verrouColonne)
			}
		})

		socket.on('modifiertitrecolonne', async (pad, titre, index, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				if (typeof index !== 'number' || index < 0 || index > colonnes.length) return socket.emit('erreur')
				if (index === colonnes.length) {
					const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : []
					colonnes.push(titre)
					affichageColonnes.push(true)
					await db.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
				} else {
					colonnes[index] = titre
					await db.HSET('pads:' + pad, 'colonnes', JSON.stringify(colonnes))
				}
				io.to('pad-' + pad).emit('modifiertitrecolonne', colonnes, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieraffichagecolonne', async (pad, valeur, index, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				let affichageColonnes = []
				if (donneesPad.hasOwnProperty('affichageColonnes')) {
					affichageColonnes = JSON.parse(donneesPad.affichageColonnes)
				} else {
					colonnes.forEach(() => {
						affichageColonnes.push(true)
					})
				}
				if (typeof index !== 'number' || index < 0 || index >= colonnes.length) return socket.emit('erreur')
				affichageColonnes[index] = valeur
				await db.HSET('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes))
				io.to('pad-' + pad).emit('modifieraffichagecolonne', affichageColonnes, valeur, index, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('verifierblocscolonnes', async (pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant, admin)
				if (donneesPadProtege === 'erreur') return socket.emit('erreur')
				socket.emit('verifierblocscolonnes', donneesPadProtege.blocs)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('vidercolonne', async (pad, titre, colonne, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				colonne = parseInt(colonne, 10)
				if (!Number.isInteger(colonne) || colonne < 0 || colonne >= colonnes.length) return socket.emit('erreur')
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await Promise.all(blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				}))
				const blocsASupprimer = []
				donneesBlocs.forEach((item) => {
					if (!item) return
					if (item.hasOwnProperty('colonne') && parseInt(item.colonne, 10) === parseInt(colonne, 10)) {
						blocsASupprimer.push(item)
					}
				})
				await supprimerBlocs(pad, blocsASupprimer)
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-videe' }) }])
					.exec()
				io.to('pad-' + pad).emit('vidercolonne', { identifiant, nom, titre, colonne, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimercolonne', async (pad, titre, colonne, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				colonnes.splice(colonne, 1)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				affichageColonnes.splice(colonne, 1)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await Promise.all(blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				}))
				// Séparation des blocs à supprimer et des blocs à modifier (décalage de colonne)
				const blocsASupprimer = []
				const blocsADecaler = []
				donneesBlocs.forEach((item) => {
					if (!item) return
					// Vérification si le bloc est dans la colonne supprimée
					if (item.hasOwnProperty('colonne') && parseInt(item.colonne, 10) === parseInt(colonne, 10)) {
						blocsASupprimer.push(item)
					}
					// Vérification si le bloc est dans une colonne supérieure (nécessite décalage)
					else if (parseInt(item.colonne, 10) > parseInt(colonne, 10)) {
						blocsADecaler.push(item)
					}
				})
				const blocsTraites = await supprimerBlocs(pad, blocsASupprimer)
				if (blocsTraites.length !== blocsASupprimer.length) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const transaction = db.multi()
				blocsADecaler.forEach((bloc) => {
					transaction.HSET('pad-' + pad + ':' + bloc.bloc, 'colonne', parseInt(bloc.colonne, 10) - 1)
				})
				await transaction
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-supprimee' }) }])
					.exec()
				io.to('pad-' + pad).emit('supprimercolonne', { identifiant, nom, titre, colonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad, verrouColonne)
			}
		})

		socket.on('deplacercolonne', async (pad, titre, affichage, direction, colonne, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				const indexColonne = parseInt(colonne, 10)
				if (direction === 'gauche') {
					const titreColonne = colonnes.splice(indexColonne, 1)[0]
					const affichageColonne = affichageColonnes.splice(indexColonne, 1)[0]
					colonnes.splice(indexColonne - 1, 0, titreColonne)
					affichageColonnes.splice(indexColonne - 1, 0, affichageColonne)
				} else if (direction === 'droite') {
					const titreColonne = colonnes.splice(indexColonne, 1)[0]
					const affichageColonne = affichageColonnes.splice(indexColonne, 1)[0]
					colonnes.splice(indexColonne + 1, 0, titreColonne)
					affichageColonnes.splice(indexColonne + 1, 0, affichageColonne)
				}
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await Promise.all(blocs.map(async (blocId) => {
					const bloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return bloc ? { ...bloc } : null
				}))
				// Identification des blocs impactés
				const misesAJour = []
				await Promise.all(donneesBlocs.map(async (item) => {
					if (!item || !item.hasOwnProperty('bloc')) return
					const blocId = item.bloc
					const colonneActuelle = parseInt(item.colonne, 10)
					let nouvelleColonne = null
					// Détermination de la nouvelle colonne selon la direction
					if (direction === 'gauche') {
						if (colonneActuelle === indexColonne) {
							nouvelleColonne = indexColonne - 1
						} else if (colonneActuelle === indexColonne - 1) {
							nouvelleColonne = indexColonne
						}
					} else if (direction === 'droite') {
						if (colonneActuelle === indexColonne) {
							nouvelleColonne = indexColonne + 1
						} else if (colonneActuelle === indexColonne + 1) {
							nouvelleColonne = indexColonne
						}
					}
					if (nouvelleColonne === null) return
					const blocExiste = await db.EXISTS('pad-' + pad + ':' + blocId)
					if (blocExiste === 1) misesAJour.push({ blocId: blocId, nouvelleColonne: nouvelleColonne })
				}))
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const transaction = db.multi()
				misesAJour.forEach((miseAJour) => {
					transaction.HSET('pad-' + pad + ':' + miseAJour.blocId, 'colonne', miseAJour.nouvelleColonne)
				})
				await transaction
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-deplacee' }) }])
					.exec()
				io.to('pad-' + pad).emit('deplacercolonne', { identifiant, nom, titre, direction, colonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad, verrouColonne)
			}
		})
	}
}
