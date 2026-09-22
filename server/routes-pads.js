import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import dayjs from 'dayjs'
import bcrypt from 'bcrypt'
import { randomBytes, timingSafeEqual } from 'crypto'
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { fileURLToPath } from 'url'
import { etat } from './etat.js'
import {
	tailleLotTransaction,
	verifierIdentifiantPad,
	definirModeration,
	definirParametresModeration,
	champsPadsClient,
	filtrerChamps,
	supprimerSession,
	genererPseudo,
	definirCheminFichiers,
	extraireArchive,
	supprimerArchives,
	assainirTexteAlternatif,
	executerTransactions,
	parseJSON,
	normaliserAffichageColonnes,
	normaliserTitresColonnes,
	comparerHash,
	verifierMotDePasseAdmin
} from './fonctions.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Cycle de vie des pads : création, duplication, import/export, transfert, corbeille et suppression
export default function enregistrerRoutesPads ({
	app,
	langueParDefaut,
	stockage,
	s3Client,
	bucket,
	db,
	dureeSession,
	etherpad,
	etherpadApi,
	creationPadSansCompte,
	limitePadsParCompte,
	limitePadSansCompte,
	limiteAuthAdmin,
	limiteActionsSensibles,
	televerserTemp,
	fonctions
}) {
	const {
		creerPad,
		creerPadSansCompte,
		recupererDonneesPad,
		recupererDonneesPadProtege,
		recupererDonneesPadJSON,
		exporterPad,
		supprimerPad,
		verifierAdmin,
		verifierAdminUtilisateur,
		definirVignettePersonnalisee,
		definirUrlFond,
		copierFichiersPad,
		definirParametresSupprimerS3,
		televerserFichierArchive,
		verifierEspaceDisque,
		extraireIdentifiantEtherpad,
		supprimerEtherpadBlocs,
		verifierLimiteEchecsCode,
		compterEchecsCode,
		oublierEchecsCode,
		definirAdministrateursPad
	} = fonctions

	app.post('/api/recuperer-donnees-pad', async (req, res) => {
		const id = req.body.id
		const token = req.body.token
		const identifiant = req.session.identifiant || ''
		const statut = req.session.statut || 'invite'
		const pads = req.session.pads || []
		try {
			if (!verifierIdentifiantPad(id)) return res.status(404).send('pad_inexistant')
			const padExiste = await db.EXISTS('pads:' + id)
			if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
				await recupererDonneesPadJSON(id)
			}
			let donneesPadBrut = await db.HGETALL('pads:' + id)
			donneesPadBrut = donneesPadBrut ? { ...donneesPadBrut } : {}
			if (donneesPadBrut.acces === 'prive' && !await verifierAdmin(id, donneesPadBrut, req.session)) return res.status(403).send('non_autorise')
			const donneesPad = await recupererDonneesPad(id, token, identifiant, statut, pads, donneesPadBrut)
			if (typeof donneesPad === 'object' && donneesPad && donneesPad.hasOwnProperty('pad') && donneesPad.hasOwnProperty('blocs') && donneesPad.hasOwnProperty('activite')) {
				res.status(200).json(donneesPad)
			} else {
				res.status(500).send('erreur')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/creer-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur_creation')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const nombrePads = await db.SCARD('pads-crees:' + identifiant)
			if (!Number.isInteger(nombrePads)) return res.status(500).send('erreur_creation')
			if (nombrePads >= limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
			const titre = req.body.titre
			const token = Math.random().toString(16).slice(2)
			const date = dayjs().format()
			const destination = req.body.dossier
			const id = await db.INCR('pad')
			const donneesPad = await creerPad(id, token, titre, date, identifiant, destination, donneesUtilisateur)
			if (!donneesPad) return res.status(500).send('erreur_creation')
			res.status(200).json(filtrerChamps(donneesPad, champsPadsClient))
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_creation')
		}
	})

	app.post('/api/creer-pad-sans-compte', limitePadSansCompte, async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		if (creationPadSansCompte !== 1) return res.status(401).send('non_connecte')
		let identifiant, nom
		if (!req.session.identifiant || !/^u[0-9a-f]{8,13}$/.test(req.session.identifiant)) {
			identifiant = 'u' + Math.random().toString(16).slice(3)
			nom = genererPseudo()
			req.session.identifiant = identifiant
			req.session.nom = nom
		} else {
			identifiant = req.session.identifiant
			nom = req.session.nom
		}
		req.session.motdepasse = ''
		if (!req.session.hasOwnProperty('acces')) {
			req.session.acces = []
		}
		if (!req.session.hasOwnProperty('pads')) {
			req.session.pads = []
		}
		try {
			const titre = req.body.titre
			const motdepasse = req.body.motdepasse
			const hash = await bcrypt.hash(motdepasse, 10)
			const token = Math.random().toString(16).slice(2)
			const date = dayjs().format()
			const id = await db.INCR('pad')
			let langue = langueParDefaut
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
				langue = req.session.langue
			}
			const donneesPad = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, '')
			if (!donneesPad) return res.status(500).send('erreur_creation')
			req.session.langue = langue
			req.session.statut = 'auteur'
			if (!req.session.pads.includes(parseInt(id, 10))) {
				req.session.pads.push(parseInt(id, 10))
			}
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			res.status(200).json(filtrerChamps(donneesPad, champsPadsClient))
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_creation')
		}
	})

	app.post('/api/rattacher-pad', limiteAuthAdmin, limiteActionsSensibles, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!admin && etat.maintenance === true) return res.status(503).send('maintenance')
		if (!admin && creationPadSansCompte !== 1) return res.status(401).send('non_autorise')
		if ((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || admin) {
			try {
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
				if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
				if (utilisateurExiste !== 1) return res.status(500).send('erreur')
				if (!admin) {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
					const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
					if (!motdepasseCorrect) return res.status(401).send('non_connecte')
					const nombrePads = await db.SCARD('pads-crees:' + identifiant)
					if (!Number.isInteger(nombrePads)) return res.status(500).send('erreur')
					if (nombrePads >= limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
				}
				const pad = req.body.padId
				if (!verifierIdentifiantPad(pad)) return res.status(404).send('pad_inexistant')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(pad)
				} else if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
				if (Object.keys(donneesPad).length === 0) return res.status(404).send('pad_inexistant')
				if (!admin) {
					const token = req.body.token
					if (typeof token !== 'string' || token === '' || !donneesPad.hasOwnProperty('token') || donneesPad.token !== token) return res.status(404).send('pad_inexistant')
				}
				if (!donneesPad.hasOwnProperty('motdepasse') || donneesPad.motdepasse.trim() === '') return res.status(409).send('pad_cree_avec_compte')
				if (!admin) {
					const motdepasse = req.body.motdepasse
					const motdepassePadCorrect = (typeof motdepasse === 'string' && motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse))
					if (!motdepassePadCorrect) return res.status(401).send('motdepasse_incorrect')
				}
				await db.multi()
					.SADD('pads-crees:' + identifiant, pad.toString())
					.SADD('utilisateurs-pads:' + pad, identifiant)
					.HSET('pads:' + pad, 'identifiant', identifiant)
					.HDEL('pads:' + pad, 'motdepasse')
					.SREM('pads-rejoints:' + identifiant, pad.toString())
					.SREM('pads-utilisateurs:' + identifiant, pad.toString())
					.exec()
				res.status(200).json({ id: parseInt(pad, 10), token: donneesPad.token })
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur')
			}
		} else if (motdepasseAdmin) {
			res.status(403).send('non_autorise')
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/deconnecter-pad', (req, res) => {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			req.session.identifiant = ''
			req.session.motdepasse = ''
			req.session.statut = ''
			res.status(200).send('deconnecte')
		} else {
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/modifier-mot-de-passe-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant) return res.status(401).send('non_connecte')
		try {
			const pad = req.body.pad
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('identifiant') || donneesPad.identifiant !== req.session.identifiant) {
				return res.status(403).send('non_autorise')
			}
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('pads:' + pad, 'motdepasse', hash)
				res.status(200).send('motdepasse_modifie')
			} else {
				res.status(401).send('motdepasse_incorrect')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/ajouter-pad-favoris', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const pad = req.body.padId
			await db.SADD('pads-favoris:' + identifiant, pad.toString())
			res.status(200).send('pad_ajoute_favoris')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/supprimer-pad-favoris', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const pad = req.body.padId
			await db.SREM('pads-favoris:' + identifiant, pad.toString())
			res.status(200).send('pad_supprime_favoris')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/deplacer-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const padId = parseInt(req.body.padId, 10)
			const destination = req.body.destination
			const dossiers = JSON.parse(donneesUtilisateur.dossiers)
			for (const dossier of dossiers) {
				if (dossier.id === destination) {
					if (!dossier.pads.includes(padId)) dossier.pads.push(padId)
				} else {
					dossier.pads = dossier.pads.filter(id => id !== padId)
				}
			}
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.status(200).send('pad_deplace')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/dupliquer-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		const padSource = req.body.padId
		const dossierDestination = req.body.dossier || ''
		try {
			if (!verifierIdentifiantPad(padSource)) return res.status(500).send('erreur_duplication')
			const admin = await verifierAdminUtilisateur(padSource, identifiant, req.session.motdepasse)
			if (!admin) return res.status(401).send('non_connecte')
			const nombrePads = await db.SCARD('pads-crees:' + identifiant)
			if (!Number.isInteger(nombrePads)) return res.status(500).send('erreur_duplication')
			if (nombrePads >= limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
			if (!await verifierEspaceDisque()) return res.status(507).send('erreur_espace_disque')
			// Récupération des données source (Redis ou JSON)
			let donneesPadSource = {}
			const padExiste = await db.EXISTS('pads:' + padSource)
			if (padExiste === 1) {
				donneesPadSource = await db.HGETALL('pads:' + padSource)
				donneesPadSource = donneesPadSource ? { ...donneesPadSource } : {}
				if (!donneesPadSource.hasOwnProperty('identifiant')) return res.status(500).send('erreur_duplication')
			} else if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + padSource + '.json'))) {
				donneesPadSource = await recupererDonneesPadJSON(padSource)
			}
			const nId = await db.INCR('pad')
			const date = dayjs().format()
			const token = Math.random().toString(16).slice(2)
			const code = Math.floor(100000 + Math.random() * 900000)
			if (donneesPadSource.hasOwnProperty('fond') && typeof donneesPadSource.fond === 'string' && donneesPadSource.fond !== '' && !donneesPadSource.fond.includes('/img/') && donneesPadSource.fond.substring(0, 1) !== '#') {
				donneesPadSource.fond = path.basename(donneesPadSource.fond)
			}
			const colonnesDupliquees = JSON.stringify(normaliserTitresColonnes(parseJSON(donneesPadSource.colonnes, [])))
			const affichageColonnes = normaliserAffichageColonnes(parseJSON(donneesPadSource.colonnes, []), parseJSON(donneesPadSource.affichageColonnes, null))
			// Duplication des blocs par lots
			const listeBlocs = await db.ZRANGE('blocs:' + padSource, 0, -1)
			if (listeBlocs === null) return res.status(500).send('erreur_duplication')
			const blocsTraites = await executerTransactions(listeBlocs, async (blocSource, index) => {
				let infosBloc = await db.HGETALL('pad-' + padSource + ':' + blocSource)
				infosBloc = infosBloc ? { ...infosBloc } : {}
				if (!infosBloc || Object.keys(infosBloc).length === 0) return null
				// Traitement spécifique Etherpad
				const etherpadIdSource = extraireIdentifiantEtherpad(infosBloc.iframe)
				if (etherpadIdSource !== '') {
					const etherpadIdDestination = 'pad-' + nId + '-' + randomBytes(8).toString('hex')
					const urlCopie = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadIdSource + '&destinationID=' + etherpadIdDestination
					const copieEtherpadReussie = await axios.get(urlCopie, { timeout: 5000 }).then(() => true).catch(() => false)
					if (copieEtherpadReussie) {
						infosBloc.iframe = etherpad + '/p/' + etherpadIdDestination
						infosBloc.media = etherpad + '/p/' + etherpadIdDestination
					}
				}
				if (infosBloc.vignette && definirVignettePersonnalisee(infosBloc.vignette) === true) {
					infosBloc.vignette = path.basename(infosBloc.vignette)
				}
				const blocId = 'bloc-id-' + Date.now() + randomBytes(8).toString('hex')
				const champsBloc = ['id', infosBloc.id, 'bloc', blocId, 'titre', infosBloc.titre, 'texte', infosBloc.texte, 'media', infosBloc.media, 'alt', assainirTexteAlternatif(infosBloc.alt), 'iframe', infosBloc.iframe, 'type', infosBloc.type, 'source', infosBloc.source, 'vignette', infosBloc.vignette || '', 'date', date, 'identifiant', infosBloc.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infosBloc.colonne, 'visibilite', infosBloc.visibilite || 'visible', 'couleur', infosBloc.couleur || '#242f3d']
				return { index, blocId, champsBloc }
			}, tailleLotTransaction)
			const pipelineBlocsDupliques = db.multi()
			for (const bloc of blocsTraites.filter(Boolean)) {
				pipelineBlocsDupliques
					.HSET('pad-' + nId + ':' + bloc.blocId, bloc.champsBloc)
					.ZADD('blocs:' + nId, { score: bloc.index, value: bloc.blocId })
			}
			await pipelineBlocsDupliques.exec()
			// Création des métadonnées du pad
			const champsPad = ['id', nId, 'token', token, 'titre', 'Copie de ' + donneesPadSource.titre, 'identifiant', identifiant, 'fond', donneesPadSource.fond, 'acces', donneesPadSource.acces, 'contributions', donneesPadSource.contributions, 'affichage', donneesPadSource.affichage, 'registreActivite', donneesPadSource.registreActivite || 'active', 'conversation', donneesPadSource.conversation || 'desactivee', 'listeUtilisateurs', donneesPadSource.listeUtilisateurs || 'activee', 'editionNom', donneesPadSource.editionNom || 'desactivee', 'fichiers', donneesPadSource.fichiers, 'enregistrements', donneesPadSource.enregistrements || 'desactives', 'liens', donneesPadSource.liens, 'documents', donneesPadSource.documents, 'commentaires', donneesPadSource.commentaires, 'evaluations', donneesPadSource.evaluations, 'copieBloc', donneesPadSource.copieBloc || 'desactivee', 'ordre', donneesPadSource.ordre || 'croissant', 'largeur', donneesPadSource.largeur || 'normale', 'date', date, 'colonnes', colonnesDupliquees, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donneesPadSource.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0, ...definirParametresModeration(donneesPadSource)]
			// Ajout du code d'accès seulement s'il existait dans l'original
			if (donneesPadSource.hasOwnProperty('code')) {
				champsPad.push('code', code)
			}
			await db.multi()
				.HSET('pads:' + nId, champsPad)
				.SADD('pads-crees:' + identifiant, nId.toString())
				.SADD('utilisateurs-pads:' + nId, identifiant)
				.exec()
			// Copie des fichiers
			await copierFichiersPad(padSource, nId, donneesPadSource.acces)
			if (dossierDestination !== '') {
				let infosUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				infosUtilisateur = infosUtilisateur ? { ...infosUtilisateur } : {}
				if (infosUtilisateur.dossiers) {
					const dossiers = JSON.parse(infosUtilisateur.dossiers)
					const dossierCible = dossiers.find(d => d.id === dossierDestination)
					if (dossierCible) {
						dossierCible.pads.push(nId)
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
					}
				}
			}
			return res.status(200).json(filtrerChamps({ id: nId, token, titre: 'Copie de ' + donneesPadSource.titre, identifiant, fond: donneesPadSource.fond, fondUrl: await definirUrlFond(nId, donneesPadSource.fond, donneesPadSource.acces), acces: donneesPadSource.acces, code: donneesPadSource.hasOwnProperty('code') ? code : undefined, contributions: donneesPadSource.contributions, affichage: donneesPadSource.affichage, registreActivite: donneesPadSource.registreActivite || 'active', conversation: donneesPadSource.conversation || 'desactivee', listeUtilisateurs: donneesPadSource.listeUtilisateurs || 'activee', editionNom: donneesPadSource.editionNom || 'desactivee', fichiers: donneesPadSource.fichiers, enregistrements: donneesPadSource.enregistrements || 'desactives', liens: donneesPadSource.liens, documents: donneesPadSource.documents, commentaires: donneesPadSource.commentaires, evaluations: donneesPadSource.evaluations, copieBloc: donneesPadSource.copieBloc || 'desactivee', ordre: donneesPadSource.ordre || 'croissant', largeur: donneesPadSource.largeur || 'normale', date, bloc: donneesPadSource.bloc, activite: 0, vues: 0, ...definirModeration(donneesPadSource) }, champsPadsClient))
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_duplication')
		}
	})

	app.post('/api/exporter-pad', limiteAuthAdmin, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			try {
				const id = req.body.padId
				if (!verifierIdentifiantPad(id)) return res.status(404).send('pad_inexistant')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + id)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(id)
				} else if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + id)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
				if (!admin && await verifierAdmin(id, donneesPad, req.session) === false) return res.status(403).send('non_autorise')
				const format = req.body.format === 'web' ? 'web' : 'archive'
				const padExporte = await exporterPad(id, 'erreur_export', req.session.langue, format)
				res.status(200).send(padExporte)
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_export')
			}
		} else if (motdepasseAdmin) {
			res.status(403).send('non_autorise')
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/importer-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		try {
			const identifiant = req.session.identifiant
			if (!req.session.identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
				supprimerSession(req)
				return res.status(401).send('non_connecte')
			}
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse') || !comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)) return res.status(401).send('non_connecte')
			const nombrePads = await db.SCARD('pads-crees:' + identifiant)
			if (!Number.isInteger(nombrePads)) return res.status(500).send('erreur_import')
			if (nombrePads >= limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
			televerserTemp(req, res, async (err) => {
				if (err) return res.status(500).send('erreur_import')
				if (!req.file) return res.status(500).send('erreur_import')
				const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
				const dossierTemporaire = path.join(__dirname, '..', '/static/temp/archive-' + randomBytes(16).toString('hex'))
				try {
					await extraireArchive(source, dossierTemporaire)
					const donnees = await fs.readJson(path.normalize(dossierTemporaire + '/donnees.json'))
					const parametres = JSON.parse(req.body.parametres)
					// Validation de la structure
					const clesRequisesPad = ['id', 'token', 'titre', 'identifiant', 'fond', 'acces', 'contributions', 'affichage', 'fichiers', 'liens', 'documents', 'commentaires', 'evaluations', 'date', 'colonnes', 'bloc', 'activite']
					const clesRequisesBloc = ['id', 'bloc', 'titre', 'texte', 'media', 'iframe', 'type', 'source', 'vignette', 'identifiant', 'commentaires', 'evaluations', 'colonne', 'listeCommentaires', 'listeEvaluations']
					const structureValide = donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && clesRequisesPad.every(cle => donnees.pad.hasOwnProperty(cle))
					if (!structureValide) throw new Error('structure_invalide')
					const id = await db.INCR('pad')
					const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
					if (!await verifierEspaceDisque()) throw new Error('espace_disque_insuffisant')
					if (stockage === 'fs') {
						await fs.mkdirp(dossierDestination)
					}
					// Traitement des blocs par lots
					const blocsCrees = await executerTransactions(donnees.blocs, async (bloc, indexBloc) => {
						if (!clesRequisesBloc.every(cle => bloc.hasOwnProperty(cle))) {
							return { bloc: 0, blocId: 0 }
						}
						const date = dayjs().format()
						const nombreCommentaires = (parametres.commentaires === true) ? bloc.commentaires : 0
						const nombreEvaluations = (parametres.evaluations === true) ? bloc.evaluations : 0
						if (definirVignettePersonnalisee(bloc.vignette) === true) {
							bloc.vignette = path.basename(bloc.vignette)
						}
						const visibilite = bloc.visibilite || 'visible'
						const blocId = 'bloc-id-' + Date.now() + randomBytes(8).toString('hex')
						const pipelineBloc = db.multi()
						pipelineBloc.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'alt', assainirTexteAlternatif(bloc.alt), 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', nombreCommentaires, 'evaluations', nombreEvaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						pipelineBloc.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
						if (parametres.commentaires === true && Array.isArray(bloc.listeCommentaires)) {
							bloc.listeCommentaires.forEach(commentaire => {
								if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
									pipelineBloc.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
									if (commentaire.visibilite === 'masquee') {
										pipelineBloc.ZADD('commentaires-masques:' + blocId, [{ score: commentaire.id, value: commentaire.id + ':' + commentaire.identifiant }])
									}
								}
							})
						}
						if (parametres.evaluations === true && Array.isArray(bloc.listeEvaluations)) {
							bloc.listeEvaluations.forEach(evaluation => {
								if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
									pipelineBloc.ZADD('evaluations:' + blocId, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
								}
							})
						}
						const promessesFichiers = []
						if (bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
							promessesFichiers.push(televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.media, id, donnees.pad.acces))
						}
						if (definirVignettePersonnalisee(bloc.vignette) === true) {
							promessesFichiers.push(televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.vignette, id, donnees.pad.acces))
						}
						await Promise.all([pipelineBloc.exec(), ...promessesFichiers])
						return { bloc: bloc.bloc, blocId: blocId }
					}, tailleLotTransaction)
					// Métadonnées du pad
					const token = Math.random().toString(16).slice(2)
					const date = dayjs().format()
					const code = Math.floor(100000 + Math.random() * 900000)
					const registreActivite = donnees.pad.registreActivite || 'active'
					const conversation = donnees.pad.conversation || 'desactivee'
					const listeUtilisateurs = donnees.pad.listeUtilisateurs || 'activee'
					const editionNom = donnees.pad.editionNom || 'desactivee'
					const ordre = donnees.pad.ordre || 'croissant'
					const largeur = donnees.pad.largeur || 'normale'
					const enregistrements = donnees.pad.enregistrements || 'desactives'
					const copieBloc = donnees.pad.copieBloc || 'desactivee'
					const colonnesImportees = JSON.stringify(normaliserTitresColonnes(parseJSON(donnees.pad.colonnes, [])))
					const affichageColonnes = normaliserAffichageColonnes(parseJSON(donnees.pad.colonnes, []), parseJSON(donnees.pad.affichageColonnes, null))
					const activiteId = (parametres.activite === true) ? donnees.pad.activite : 0
					// Copie du fond personnalisé + métadonnées pad en parallèle
					const fondPad = donnees.pad.fond
					const promesseFond = (fondPad && !fondPad.includes('/img/') && fondPad.substring(0, 1) !== '#' && fondPad !== '') ? televerserFichierArchive(dossierTemporaire, dossierDestination, path.basename(fondPad), id, donnees.pad.acces) : Promise.resolve()
					await Promise.all([
						promesseFond,
						db.multi()
							.HSET('pads:' + id, ['id', id, 'token', token, 'titre', donnees.pad.titre, 'identifiant', identifiant, 'fond', fondPad, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', colonnesImportees, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'admins', JSON.stringify([]), 'activiteColonne', 0, 'vues', 0, 'digidrive', 0, ...definirParametresModeration(donnees.pad)])
							.SADD('pads-crees:' + identifiant, id.toString())
							.SADD('utilisateurs-pads:' + id, identifiant)
							.exec()
					])
					// Gestion de l'activité
					if (parametres.activite === true && Array.isArray(donnees.activite)) {
						let activiteFiltree = donnees.activite
						if (parametres.commentaires === false) {
							activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-commente' && el.type !== 'commentaire-valide')
						}
						if (parametres.evaluations === false) {
							activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-evalue')
						}
						const pipelineActivite = db.multi()
						for (const activite of activiteFiltree) {
							if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
								const blocCorrespondant = blocsCrees.find(item => item.bloc === activite.bloc)
								if (blocCorrespondant) activite.bloc = blocCorrespondant.blocId
								pipelineActivite.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
							}
						}
						await pipelineActivite.exec()
					}
					await supprimerArchives(source, dossierTemporaire)
					res.status(200).json(filtrerChamps({ id, token, titre: donnees.pad.titre, identifiant, fond: fondPad, fondUrl: await definirUrlFond(id, fondPad, donnees.pad.acces), acces: donnees.pad.acces, code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite, conversation, listeUtilisateurs, editionNom, fichiers: donnees.pad.fichiers, enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc, ordre, largeur, date, bloc: donnees.pad.bloc, activite: activiteId, admins: [], vues: 0, ...definirModeration(donnees.pad) }, champsPadsClient))
				} catch (err) {
					console.error(err.stack)
					// Nettoyage en cas d'erreur pendant le traitement
					await supprimerArchives(source, dossierTemporaire)
					if (err.message === 'espace_disque_insuffisant') {
						return res.status(507).send('erreur_espace_disque')
					}
					if (err.message === 'structure_invalide') {
						return res.status(400).send('donnees_corrompues')
					}
					return res.status(500).send('erreur_import')
				}
			})
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_import')
		}
	})

	app.post('/api/mettre-pad-corbeille', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') return res.status(401).send('non_connecte')
		try {
			const padId = req.body.padId
			if (!verifierIdentifiantPad(padId)) return res.status(403).send('non_autorise')
			const admin = await verifierAdminUtilisateur(padId, identifiant, req.session.motdepasse)
			if (!admin) return res.status(403).send('non_autorise')
			await db.multi()
				.SADD('pads-supprimes:' + identifiant, padId.toString())
				.SREM('pads-crees:' + identifiant, padId.toString())
				.exec()
			res.status(200).send('pad_supprime')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/restaurer-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') return res.status(401).send('non_connecte')
		try {
			const padId = req.body.padId
			if (!verifierIdentifiantPad(padId)) return res.status(403).send('non_autorise')
			const admin = await verifierAdminUtilisateur(padId, identifiant, req.session.motdepasse)
			if (!admin) return res.status(403).send('non_autorise')
			await db.multi()
				.SREM('pads-supprimes:' + identifiant, padId.toString())
				.SADD('pads-crees:' + identifiant, padId.toString())
				.exec()
			res.status(200).send('pad_restaure')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/transferer-pad', limiteAuthAdmin, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const padId = req.body.padId
		const nouvelIdentifiant = typeof req.body.nouvelIdentifiant === 'string' ? req.body.nouvelIdentifiant.trim() : ''
		const admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!admin && etat.maintenance === true) return res.status(503).send('maintenance')
		if ((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || admin) {
			try {
				if (nouvelIdentifiant === '') return res.status(403).send('non_autorise')
				if (!verifierIdentifiantPad(padId)) return res.status(404).send('pad_inexistant')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + padId)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + padId + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(padId)
				} else if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + padId)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
				if (!donneesPad.hasOwnProperty('identifiant')) return res.status(404).send('pad_inexistant')
				const proprietaire = donneesPad.identifiant
				if (nouvelIdentifiant === proprietaire) return res.status(403).send('non_autorise')
				if (!admin) {
					if (proprietaire !== identifiant) return res.status(403).send('non_autorise')
					const transfertExpire = Number(donneesPad.transfertProprieteExpire) || 0
					if (donneesPad.transfertPropriete !== 'active') return res.status(403).send('non_autorise')
					if (transfertExpire <= Date.now()) return res.status(403).send('transfert_expire')
					const adminPad = await verifierAdminUtilisateur(padId, identifiant, req.session.motdepasse)
					if (!adminPad) return res.status(403).send('non_autorise')
				}
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
				if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
				if (utilisateurExiste !== 1) return res.status(500).send('erreur')
				if (!admin) {
					const padsDestination = await db.SCARD('pads-crees:' + nouvelIdentifiant)
					if (!Number.isInteger(padsDestination)) return res.status(500).send('erreur')
					if (padsDestination + 1 > limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
				}
				await db.multi()
					.SADD('pads-crees:' + nouvelIdentifiant, padId.toString())
					.SREM('pads-crees:' + proprietaire, padId.toString())
					.SREM('pads-supprimes:' + proprietaire, padId.toString())
					.SREM('pads-favoris:' + proprietaire, padId.toString())
					.SADD('utilisateurs-pads:' + padId, nouvelIdentifiant)
					.SREM('utilisateurs-pads:' + padId, proprietaire)
					.HSET('pads:' + padId, ['identifiant', nouvelIdentifiant, 'transfertPropriete', 'desactive'])
					.HDEL('pads:' + padId, 'transfertProprieteExpire')
					.SREM('pads-admins:' + nouvelIdentifiant, padId.toString())
					.SREM('pads-rejoints:' + nouvelIdentifiant, padId.toString())
					.SREM('pads-utilisateurs:' + nouvelIdentifiant, padId.toString())
					.exec()
				// Purge de l'id du pad dans les dossiers du compte source
				const donneesUtilisateurSource = await db.HGET('utilisateurs:' + proprietaire, 'dossiers')
				if (donneesUtilisateurSource) {
					const dossiers = parseJSON(donneesUtilisateurSource, [])
					let dossiersModifies = false
					dossiers.forEach((dossier) => {
						const indexPad = (dossier.pads || []).indexOf(parseInt(padId, 10))
						if (indexPad !== -1) {
							dossier.pads.splice(indexPad, 1)
							dossiersModifies = true
						}
					})
					if (dossiersModifies) {
						await db.HSET('utilisateurs:' + proprietaire, 'dossiers', JSON.stringify(dossiers))
					}
				}
				res.status(200).send('pad_transfere')
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur')
			}
		} else if (motdepasseAdmin) {
			res.status(403).send('non_autorise')
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/vider-pad', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		const pad = req.body.padId
		const suppressionColonnes = req.body.suppressionColonnes === true
		const titreColonne = req.body.titreColonne
		if (req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) {
			try {
				if (!verifierIdentifiantPad(pad)) return res.status(500).send('erreur_vidage')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (typeof donneesPad !== 'object' || !donneesPad) return res.status(500).send('erreur_vidage')
				} else if (padExiste === 0) return res.status(500).send('erreur_vidage')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur_vidage')
				const adminPad = await verifierAdmin(pad, donneesPad, req.session)
				if (!adminPad) return res.status(403).send('non_autorise')
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs) {
					await supprimerEtherpadBlocs(pad, blocs)
					const pipelineBlocs = db.multi()
					for (const blocId of blocs) {
						pipelineBlocs
							.UNLINK('commentaires:' + blocId)
							.UNLINK('commentaires-masques:' + blocId)
							.UNLINK('evaluations:' + blocId)
							.UNLINK('pad-' + pad + ':' + blocId)
					}
					await pipelineBlocs.exec()
				}
				await db.multi()
					.UNLINK('blocs:' + pad)
					.UNLINK('activite:' + pad)
					.exec()
				let colonnes = null
				let affichageColonnes = null
				const champsReinitialises = ['bloc', 0, 'activite', 0, 'activiteColonne', 0, 'vues', 0, 'notification', JSON.stringify([])]
				if (donneesPad.affichage === 'colonnes' && !suppressionColonnes) {
					colonnes = donneesPad.hasOwnProperty('colonnes') ? JSON.parse(donneesPad.colonnes) : []
					affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(donneesPad.affichageColonnes, null))
				} else {
					colonnes = donneesPad.affichage === 'colonnes' ? [titreColonne || ''] : []
					affichageColonnes = donneesPad.affichage === 'colonnes' ? [true] : []
					champsReinitialises.push('colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes))
				}
				await db.HSET('pads:' + pad, champsReinitialises)
				// Suppression des fichiers
				if (stockage === 'fs') {
					const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
					await fs.remove(dossier)
				} else if (stockage === 's3') {
					try {
						let jetonPagination
						do {
							const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/', ContinuationToken: jetonPagination }))
							if (liste && liste.hasOwnProperty('Contents') && Array.isArray(liste.Contents)) {
								await executerTransactions(liste.Contents, (objet) => s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key))), tailleLotTransaction)
							}
							jetonPagination = liste && liste.IsTruncated ? liste.NextContinuationToken : undefined
						} while (jetonPagination)
					} catch (err) {
						console.error(err.stack)
					}
				}
				res.status(200).json({ colonnes, affichageColonnes })
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_vidage')
			}
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/supprimer-pad', limiteAuthAdmin, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const pad = req.body.padId
		const type = req.body.type
		let suppressionFichiers = true
		if (req.body.hasOwnProperty('suppressionFichiers')) {
			suppressionFichiers = req.body.suppressionFichiers
		}
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!admin && etat.maintenance === true) return res.status(503).send('maintenance')
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			try {
				if (!verifierIdentifiantPad(pad)) return res.status(500).send('erreur_suppression')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (typeof donneesPad !== 'object' || !donneesPad) return res.status(500).send('erreur_suppression')
				} else if (padExiste === 0) return res.status(500).send('erreur_suppression')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur_suppression')
				if (donneesPad.identifiant === identifiant) { // pad créé
					const adminPad = admin || (await verifierAdmin(pad, donneesPad, req.session) === true)
					if (!adminPad) return res.status(403).send('non_autorise')
					const resultat = await supprimerPad(pad, identifiant, suppressionFichiers)
					if (!resultat) return res.status(500).send('erreur_suppression')
				} else { // pad rejoint
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (donneesUtilisateur.hasOwnProperty('dossiers')) {
						const dossiers = JSON.parse(donneesUtilisateur.dossiers)
						let dossiersModifies = false
						dossiers.forEach((dossier) => {
							const indexPad = dossier.pads.indexOf(parseInt(pad, 10))
							if (indexPad !== -1) {
								dossier.pads.splice(indexPad, 1)
								dossiersModifies = true
							}
						})
						if (dossiersModifies) {
							await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						}
					}
					// Retrait des listes selon le type d'action
					if (type === 'pad-rejoint' || type === 'pad-admin') {
						await db.SREM('pads-rejoints:' + identifiant, pad.toString())
					}
					if (type === 'pad-admin') {
						await db.SREM('pads-admins:' + identifiant, pad.toString())
						const listeAdmins = definirAdministrateursPad(donneesPad).filter((admin) => admin !== donneesPad.identifiant)
						if (listeAdmins.includes(identifiant)) {
							listeAdmins.splice(listeAdmins.indexOf(identifiant), 1)
							await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
						}
					}
					await db.SREM('pads-favoris:' + identifiant, pad.toString())
				}
				return res.status(200).send('pad_supprime')
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_suppression')
			}
		} else if (motdepasseAdmin) {
			res.status(403).send('non_autorise')
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/vider-corbeille', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		const pads = req.body.pads
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') return res.status(401).send('non_connecte')
		if (!Array.isArray(pads) || pads.length === 0) return res.status(400).send('erreur_suppression')
		try {
			const padsSupprimes = await db.SMEMBERS('pads-supprimes:' + identifiant)
			const padsASupprimer = pads.filter((pad) => padsSupprimes.includes(pad.toString()))
			if (padsASupprimer.length === 0) return res.status(403).send('non_autorise')
			for (const pad of padsASupprimer) {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (Object.keys(donneesPad).length === 0 || donneesPad.identifiant !== identifiant) continue
				await supprimerPad(pad, identifiant, true)
			}
			res.status(200).send('corbeille_videe')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_suppression')
		}
	})

	app.post('/api/verifier-code-acces', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		try {
			const pad = req.body.pad
			const identifiant = req.session.identifiant || ''
			const code = req.body.code
			if (!verifierIdentifiantPad(pad)) return res.status(401).json({ message: 'code_incorrect' })
			if (await verifierLimiteEchecsCode(req.ip, pad)) return res.status(401).json({ message: 'code_incorrect' })
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('code') || donneesPad.acces !== 'code') return res.status(401).json({ message: 'code_incorrect' })
			const codeBuffer = Buffer.from(String(code))
			const codeBufferDb = Buffer.from(String(donneesPad.code))
			if (codeBuffer.length !== codeBufferDb.length || !timingSafeEqual(codeBuffer, codeBufferDb)) {
				await compterEchecsCode(req.ip, pad)
				return res.status(401).json({ message: 'code_incorrect' })
			}
			const admin = await verifierAdmin(pad, donneesPad, req.session)
			const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant, admin)
			if (donneesPadProtege === 'erreur') return res.status(500).json({ message: 'erreur' })
			if (!req.session.hasOwnProperty('acces')) {
				req.session.acces = []
			}
			let padAcces = false
			req.session.acces.forEach((acces) => {
				if (parseInt(acces.pad, 10) === parseInt(pad, 10)) {
					padAcces = true
				}
			})
			if (padAcces) {
				req.session.acces.forEach((acces, index) => {
					if (parseInt(acces.pad, 10) === parseInt(pad, 10)) {
						req.session.acces[index].code = code
					}
				})
			} else {
				req.session.acces.push({ code: code, pad: parseInt(pad, 10) })
			}
			// Le compteur d'échecs ne doit pas pénaliser un visiteur qui a fini par saisir le bon code
			await oublierEchecsCode(req.ip, pad)
			res.status(200).json({ message: 'code_correct', pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite })
		} catch (err) {
			console.error(err.stack)
			res.status(500).json({ message: 'erreur' })
		}
	})
}
