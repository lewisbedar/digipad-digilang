import dayjs from 'dayjs'
import { randomBytes } from 'crypto'
import { etat } from './etat.js'
import {
	tailleLotTransaction,
	reduireColonnesMasquees,
	normaliserAffichageColonnes,
	verifierTitreColonne,
	verifierTitreColonneDisponible,
	definirTitreColonneDisponible,
	verifierColonneMasquee,
	verifierBlocVisible,
	definirSalonAdmin,
	sauvegarderSession,
	definirAccesLecture,
	executerTransactions,
	parseJSON
} from './fonctions.js'

// Nombre d'entrées du registre d'activité lues par tranche dans marquerActiviteColonne
const tailleLotActivite = 1000

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
		definirScoreMaximum,
		appliquerUrlsFichiers
	} = fonctions

	async function recupererBlocsPad (pad, blocs) {
		if (!Array.isArray(blocs) || blocs.length === 0) return []
		const pipeline = db.multi()
		blocs.forEach((blocId) => {
			pipeline.HGETALL('pad-' + pad + ':' + blocId)
		})
		const resultats = await pipeline.exec()
		return resultats.map((donneesBloc) => (donneesBloc && Object.keys(donneesBloc).length > 0) ? { ...donneesBloc } : null)
	}

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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				if (!Number.isInteger(indexColonne) || indexColonne < 0 || indexColonne > colonnes.length) return socket.emit('erreur')
				if (!verifierTitreColonne(titre)) return socket.emit('erreur')
				if (!verifierTitreColonneDisponible(colonnes, titre)) return socket.emit('titrecolonneexistant')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				colonnes.splice(indexColonne, 0, titre)
				affichageColonnes.splice(indexColonne, 0, true)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await recupererBlocsPad(pad, blocs)
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
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes), 'activiteColonne', activiteId])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-ajoutee' }) }])
					.exec()
				const donneesColonneAjoutee = { identifiant, nom, titre, indexColonne, colonnes, affichageColonnes, date, activiteId }
				const salonAdminAjout = definirSalonAdmin(pad)
				io.to(salonAdminAjout).emit('ajoutercolonne', donneesColonneAjoutee)
				io.to('pad-' + pad).except(salonAdminAjout).emit('ajoutercolonne', { ...donneesColonneAjoutee, colonnes: reduireColonnesMasquees(colonnes, affichageColonnes) })
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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				const indexSource = parseInt(colonne, 10)
				if (!Number.isInteger(indexSource) || indexSource < 0 || indexSource >= colonnes.length) return socket.emit('erreur')
				const indexColonne = indexSource + 1
				const titre = definirTitreColonneDisponible(colonnes, colonnes[indexSource])
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await recupererBlocsPad(pad, blocs)
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
					const contenu = await dupliquerBloc(pad, donneesBloc, contenusANettoyer, donneesPad.acces)
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
				pipeline.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', blocCourant + duplications.length, 'activiteColonne', activiteId])
				pipeline.HSET('dates-pads:' + pad, 'date', date)
				pipeline.HINCRBY('pads:' + pad, 'activite', 1)
				pipeline.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-dupliquee', ...(affichageColonnes[indexColonne] === false ? { masquee: true } : {}) }) }])
				await pipeline.exec()
				contenusANettoyer.length = 0
				const blocsDupliques = duplications.map((duplication) => {
					const { nouveauBloc, contenu, donneesBloc, blocId } = duplication
					return { bloc: nouveauBloc, titre: donneesBloc.titre || '', type: donneesBloc.type || '', source: donneesBloc.source || '', identifiant, nom, date, couleur: donneesBloc.couleur || '', commentaires: 0, commentairesEnAttente: 0, evaluations: [], colonne: indexColonne, visibilite: donneesBloc.visibilite || 'visible', texte: contenu.texte, media: contenu.media, alt: contenu.alt, iframe: contenu.iframe, vignette: contenu.vignette, id: blocId }
				})
				await appliquerUrlsFichiers(pad, blocsDupliques, donneesPad.acces)
				const donneesColonne = { identifiant, nom, titre, indexColonne, colonnes, affichageColonnes, date, activiteId }
				const salonAdmin = definirSalonAdmin(pad)
				io.to(salonAdmin).emit('dupliquercolonne', { ...donneesColonne, blocs: blocsDupliques })
				const colonneMasquee = verifierColonneMasquee({ ...donneesPad, colonnes }, affichageColonnes, indexColonne)
				const donneesColonneReduite = { ...donneesColonne, colonnes: reduireColonnesMasquees(colonnes, affichageColonnes), blocs: colonneMasquee ? [] : blocsDupliques.filter((item) => verifierBlocVisible(item, donneesPad.contributions)) }
				if (colonneMasquee) {
					donneesColonneReduite.titre = ''
					donneesColonneReduite.identifiant = ''
					donneesColonneReduite.nom = ''
					delete donneesColonneReduite.activiteId
				}
				io.to('pad-' + pad).except(salonAdmin).emit('dupliquercolonne', donneesColonneReduite)
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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				if (typeof index !== 'number' || index < 0 || index > colonnes.length) return socket.emit('erreur')
				if (!verifierTitreColonne(titre)) return socket.emit('erreur')
				if (!verifierTitreColonneDisponible(colonnes, titre, index)) return socket.emit('titrecolonneexistant')
				const ancienTitre = colonnes[index]
				if (ancienTitre !== titre && affichageColonnes[index] === false) {
					await marquerActiviteColonne(pad, ancienTitre, true, donneesPad.activiteColonne)
				}
				if (index === colonnes.length) {
					colonnes.push(titre)
					affichageColonnes.push(true)
					await db.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
				} else {
					colonnes[index] = titre
					await db.HSET('pads:' + pad, 'colonnes', JSON.stringify(colonnes))
				}
				const salonAdminTitre = definirSalonAdmin(pad)
				io.to(salonAdminTitre).emit('modifiertitrecolonne', colonnes, identifiant)
				io.to('pad-' + pad).except(salonAdminTitre).emit('modifiertitrecolonne', reduireColonnesMasquees(colonnes, affichageColonnes), identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		async function marquerActiviteColonne (pad, titreColonne, masquee, activiteColonne) {
			if (typeof titreColonne !== 'string' || titreColonne === '') return
			const borne = parseInt(activiteColonne, 10)
			const derniereEntree = Number.isInteger(borne) && borne >= 0 ? borne - 1 : null
			if (derniereEntree !== null && derniereEntree < 0) return
			const titreEncode = JSON.stringify(titreColonne).slice(1, -1)
			const pipeline = db.multi()
			let modifications = 0
			for (let debut = 0; ; debut += tailleLotActivite) {
				if (derniereEntree !== null && debut > derniereEntree) break
				let fin = debut + tailleLotActivite - 1
				if (derniereEntree !== null) fin = Math.min(fin, derniereEntree)
				const entrees = await db.ZRANGE('activite:' + pad, debut, fin)
				if (!Array.isArray(entrees) || entrees.length === 0) break
				entrees.forEach((entreeStr) => {
					if (typeof entreeStr !== 'string' || !entreeStr.includes(titreEncode)) return
					const entree = parseJSON(entreeStr, null)
					if (!entree || typeof entree.type !== 'string' || !entree.type.includes('colonne')) return
					if (entree.titre !== titreColonne || !Number.isInteger(entree.id)) return
					if ((entree.masquee === true) === masquee) return
					const misAJour = { ...entree }
					if (masquee) misAJour.masquee = true
					else delete misAJour.masquee
					pipeline.ZREMRANGEBYSCORE('activite:' + pad, entree.id, entree.id)
					pipeline.ZADD('activite:' + pad, [{ score: entree.id, value: JSON.stringify(misAJour) }])
					modifications++
				})
				if (entrees.length < tailleLotActivite) break
			}
			if (modifications > 0) await pipeline.exec()
		}

		socket.on('modifieraffichagecolonne', async (pad, valeur, index, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				if (typeof index !== 'number' || index < 0 || index >= colonnes.length) return socket.emit('erreur')
				affichageColonnes[index] = (valeur === true)
				await db.HSET('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes))
				const homonymeMasquee = colonnes.some((titre, i) => i !== index && titre === colonnes[index] && affichageColonnes[i] === false)
				if (!homonymeMasquee) await marquerActiviteColonne(pad, colonnes[index], affichageColonnes[index] === false, donneesPad.activiteColonne)
				const salonAdminAffichage = definirSalonAdmin(pad)
				io.to(salonAdminAffichage).emit('modifieraffichagecolonne', affichageColonnes, valeur, index, identifiant, colonnes)
				io.to('pad-' + pad).except(salonAdminAffichage).emit('modifieraffichagecolonne', affichageColonnes, valeur, index, identifiant, reduireColonnesMasquees(colonnes, affichageColonnes))
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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				colonne = parseInt(colonne, 10)
				if (!Number.isInteger(colonne) || colonne < 0 || colonne >= colonnes.length) return socket.emit('erreur')
				titre = colonnes[colonne]
				const colonneMasquee = verifierColonneMasquee(donneesPad, affichageColonnes, colonne)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await recupererBlocsPad(pad, blocs)
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
					.HSET('pads:' + pad, 'activiteColonne', activiteId)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-videe', ...(colonneMasquee ? { masquee: true } : {}) }) }])
					.exec()
				const donneesColonneVidee = { identifiant, nom, titre, colonne, date, activiteId }
				const salonAdminVider = definirSalonAdmin(pad)
				io.to(salonAdminVider).emit('vidercolonne', donneesColonneVidee)
				if (!colonneMasquee) io.to('pad-' + pad).except(salonAdminVider).emit('vidercolonne', donneesColonneVidee)
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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				colonne = parseInt(colonne, 10)
				if (!Number.isInteger(colonne) || colonne < 0 || colonne >= colonnes.length) return socket.emit('erreur')
				titre = colonnes[colonne]
				const colonneMasquee = verifierColonneMasquee(donneesPad, affichageColonnes, colonne)
				colonnes.splice(colonne, 1)
				affichageColonnes.splice(colonne, 1)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const donneesBlocs = await recupererBlocsPad(pad, blocs)
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
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes), 'activiteColonne', activiteId])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-supprimee', ...(colonneMasquee ? { masquee: true } : {}) }) }])
					.exec()
				const donneesColonneSupprimee = { identifiant, nom, titre, colonne, colonnes, affichageColonnes, date, activiteId }
				const salonAdminSuppression = definirSalonAdmin(pad)
				io.to(salonAdminSuppression).emit('supprimercolonne', donneesColonneSupprimee)
				const donneesSuppressionReduite = { ...donneesColonneSupprimee, colonnes: reduireColonnesMasquees(colonnes, affichageColonnes) }
				if (colonneMasquee) {
					donneesSuppressionReduite.titre = ''
					donneesSuppressionReduite.identifiant = ''
					donneesSuppressionReduite.nom = ''
					delete donneesSuppressionReduite.activiteId
				}
				io.to('pad-' + pad).except(salonAdminSuppression).emit('supprimercolonne', donneesSuppressionReduite)
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
				const colonnes = parseJSON(donneesPad.colonnes, null)
				if (!Array.isArray(colonnes)) return socket.emit('erreur')
				const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				const indexColonne = parseInt(colonne, 10)
				if (!Number.isInteger(indexColonne) || indexColonne < 0 || indexColonne >= colonnes.length) return socket.emit('erreur')
				if (direction !== 'gauche' && direction !== 'droite') return socket.emit('erreur')
				if (direction === 'gauche' && indexColonne === 0) return socket.emit('erreur')
				if (direction === 'droite' && indexColonne === colonnes.length - 1) return socket.emit('erreur')
				titre = colonnes[indexColonne]
				const colonneMasquee = verifierColonneMasquee(donneesPad, affichageColonnes, indexColonne)
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
				const donneesBlocs = await recupererBlocsPad(pad, blocs)
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
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes), 'activiteColonne', activiteId])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-deplacee', ...(colonneMasquee ? { masquee: true } : {}) }) }])
					.exec()
				const donneesColonneDeplacee = { identifiant, nom, titre, direction, colonne, colonnes, affichageColonnes, date, activiteId }
				const salonAdminDeplacement = definirSalonAdmin(pad)
				io.to(salonAdminDeplacement).emit('deplacercolonne', donneesColonneDeplacee)
				const donneesDeplacementReduite = { ...donneesColonneDeplacee, colonnes: reduireColonnesMasquees(colonnes, affichageColonnes) }
				if (colonneMasquee) {
					donneesDeplacementReduite.titre = ''
					donneesDeplacementReduite.identifiant = ''
					donneesDeplacementReduite.nom = ''
					delete donneesDeplacementReduite.activiteId
				}
				io.to('pad-' + pad).except(salonAdminDeplacement).emit('deplacercolonne', donneesDeplacementReduite)
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
