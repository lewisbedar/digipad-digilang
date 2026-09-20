import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import dayjs from 'dayjs'
import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'
import { URL } from 'url'
import { fileURLToPath } from 'url'
import {
	tailleLotTransaction,
	verifierIdentifiantPad,
	definirParametresModeration,
	definirCheminFichiers,
	extraireArchive,
	supprimerArchives,
	verifierURL,
	assainirTexteAlternatif,
	executerTransactions
} from './fonctions.js'
const production = process.env.NODE_ENV === 'production'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Interopérabilité avec Digidrive
export default function enregistrerRoutesLadigitale ({
	app,
	langueParDefaut,
	stockage,
	db,
	etherpad,
	etherpadApi,
	televerserTemp,
	fonctions
}) {
	const {
		creerPadSansCompte,
		recupererDonneesPadJSON,
		exporterPad,
		supprimerPad,
		verifierAutorisationApi,
		definirVignettePersonnalisee,
		copierFichiersPad,
		televerserFichierArchive,
		verifierEspaceDisque,
		extraireIdentifiantEtherpad,
		verifierHoteBloque
	} = fonctions

	app.post('/api/ladigitale', async (req, res) => {
		const tokenApi = req.body.token
		const domaine = req.headers.host
		const lienCible = req.body.lien
		const actionRequise = req.body.action
		if (production && !verifierURL(lienCible, ['https'])) return res.status(500).send('erreur')
		const urlCible = new URL(lienCible)
		const hoteCible = urlCible.hostname.toLowerCase()
		if (verifierHoteBloque(hoteCible)) return res.status(500).send('erreur')
		const params = new URLSearchParams()
		params.append('token', tokenApi)
		params.append('domaine', domaine)
		try {
			const reponseExterne = await axios.post(lienCible, params, { timeout: 5000 })
			const statutExterne = reponseExterne.data
			if (statutExterne === 'non_autorise' || statutExterne === 'erreur') return res.status(401).send('erreur_token')
			if (statutExterne !== 'token_autorise') return res.status(500).send('erreur')
			if (actionRequise !== 'creer' && !verifierIdentifiantPad(req.body.id)) return res.status(404).send('contenu_inexistant')
			// ACTION : CRÉER
			if (actionRequise === 'creer') {
				const identifiant = req.body.identifiant
				let nom = req.body.nomUtilisateur
				if (nom === '') {
					nom = identifiant.toUpperCase()
				}
				const titre = req.body.nom
				const motdepasse = req.body.motdepasse
				const hash = await bcrypt.hash(motdepasse, 10)
				const token = Math.random().toString(16).slice(10)
				const date = dayjs().format()
				let langue = langueParDefaut
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
					langue = req.session.langue
				}
				const padId = await db.INCR('pad')
				const lienPad = await creerPadSansCompte(padId, token, titre, hash, date, identifiant, nom, langue, 'api')
				if (!lienPad) return res.status(500).send('erreur')
				return res.status(200).send(lienPad)
			}
			// ACTION : MODIFIER TITRE
			else if (actionRequise === 'modifier-titre') {
				const pad = req.body.id
				const titre = req.body.titre
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					await recupererDonneesPadJSON(pad)
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				await db.HSET('pads:' + pad, 'titre', titre)
				return res.status(200).send('contenu_modifie')
			}
			// ACTION : MODIFIER (mot de passe + titre)
			else if (actionRequise === 'modifier') {
				const pad = req.body.id
				const titre = req.body.titre
				const identifiant = req.body.identifiant
				const ancienmotdepasse = req.body.ancienmotdepasse
				const nouveaumotdepasse = req.body.motdepasse
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(pad)
				} else if (padExiste === 1) {
				    donneesPad = await db.HGETALL('pads:' + pad)
				    donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur')
				const autorisation = (ancienmotdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(ancienmotdepasse, donneesPad.motdepasse))
				if (!autorisation) return res.status(403).send('non_autorise')
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('pads:' + pad, ['titre', titre, 'motdepasse', hash])
				return res.status(200).send('contenu_modifie')
			}
			// ACTION : AJOUTER (Lier au compte)
			else if (actionRequise === 'ajouter') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const token = req.body.tokenContenu
				const motdepasse = req.body.motdepasse
				const nom = req.body.nomUtilisateur
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(pad)
				} else if (padExiste === 1) {
				    donneesPad = await db.HGETALL('pads:' + pad)
				    donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur')
				let autorisation = false
				let identifiantFinal = identifiant
				let typePad = 'sans-compte'
				if (donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && motdepasse.trim() !== '' && await bcrypt.compare(motdepasse.trim(), donneesPad.motdepasse) && token === donneesPad.token) {
					autorisation = true
				} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
					const utilisateurExiste = await db.EXISTS('utilisateurs:' + donneesPad.identifiant)
					if (utilisateurExiste === 1) {
						let donneesUtilisateur = await db.HGETALL('utilisateurs:' + donneesPad.identifiant)
						donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
						if (donneesUtilisateur && donneesUtilisateur.hasOwnProperty('motdepasse') && donneesUtilisateur.motdepasse.trim() !== '' && motdepasse.trim() !== '' && await bcrypt.compare(motdepasse.trim(), donneesUtilisateur.motdepasse)) {
							autorisation = true
							identifiantFinal = donneesPad.identifiant
							typePad = 'utilisateur'
						}
					}
				}
				if (!autorisation) return res.status(403).send('non_autorise')
				const date = dayjs().format()
				let langue = langueParDefaut
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
					langue = req.session.langue
				}
				if (typePad === 'sans-compte') {
				    await db.multi()
				    .HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
				    .HSET('pads:' + pad, ['identifiant', identifiant, 'digidrive', 1])
				    .exec()
				} else {
				    await db.HSET('pads:' + pad, 'digidrive', 1)
				}
				return res.status(200).json({ titre: donneesPad.titre, identifiant: identifiantFinal })
			}
			// ACTION : DUPLIQUER
			else if (actionRequise === 'dupliquer') {
				const identifiant = req.body.identifiant
				const motdepasse = req.body.motdepasse
				const padSource = req.body.id
				const nouveaumotdepasse = req.body.nouveaumotdepasse
				if (!await verifierEspaceDisque()) return res.status(500).send('erreur')
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + padSource)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + padSource + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(padSource)
				} else if (padExiste === 1) {
			        donneesPad = await db.HGETALL('pads:' + padSource)
				    donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				if (!donneesPad.hasOwnProperty('identifiant')) return res.status(500).send('erreur')
				const autorisation = await verifierAutorisationApi(donneesPad, identifiant, motdepasse)
				if (!autorisation) return res.status(403).send('non_autorise')
				let compteUtilisateur = false
				if (!donneesPad.hasOwnProperty('motdepasse') && autorisation) {
					compteUtilisateur = true
				}
				const padId = await db.INCR('pad')
				const token = Math.random().toString(16).slice(10)
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				const date = dayjs().format()
				const code = Math.floor(100000 + Math.random() * 900000)
				let affichageColonnes = []
				if (donneesPad.hasOwnProperty('affichageColonnes')) {
	                affichageColonnes = JSON.parse(donneesPad.affichageColonnes)
				} else {
	                JSON.parse(donneesPad.colonnes).forEach(() => {
		                affichageColonnes.push(true)
	                })
				}
				if (typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
	                donneesPad.fond = path.basename(donneesPad.fond)
				}
				const champsPad = ['id', padId, 'token', token, 'titre', 'Copie de ' + donneesPad.titre, 'identifiant', identifiant, 'fond', donneesPad.fond, 'acces', donneesPad.acces, 'contributions', donneesPad.contributions, 'affichage', donneesPad.affichage, 'registreActivite', donneesPad.registreActivite || 'active', 'conversation', donneesPad.conversation || 'desactivee', 'listeUtilisateurs', donneesPad.listeUtilisateurs || 'activee', 'editionNom', donneesPad.editionNom || 'desactivee', 'fichiers', donneesPad.fichiers, 'enregistrements', donneesPad.enregistrements || 'desactives', 'liens', donneesPad.liens, 'documents', donneesPad.documents, 'commentaires', donneesPad.commentaires, 'evaluations', donneesPad.evaluations, 'copieBloc', donneesPad.copieBloc || 'desactivee', 'ordre', donneesPad.ordre || 'croissant', 'largeur', donneesPad.largeur || 'normale', 'date', date, 'colonnes', donneesPad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donneesPad.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1, ...definirParametresModeration(donneesPad)]
				if (donneesPad.hasOwnProperty('code')) {
					champsPad.push('code', code)
				}
				if (!compteUtilisateur) {
				    champsPad.push('motdepasse', hash)
				}
				const pipelineCreation = db.multi()
					.HSET('pads:' + padId, champsPad)
					.SADD('pads-crees:' + identifiant, padId.toString())
				if (compteUtilisateur) {
					pipelineCreation.SADD('utilisateurs-pads:' + padId, identifiant)
				}
				await pipelineCreation.exec()
				// Duplication des blocs et fichiers
				const blocsSource = await db.ZRANGE('blocs:' + padSource, 0, -1)
				if (blocsSource === null) return res.status(500).send('erreur')
				const blocsTraites = await executerTransactions(blocsSource, async (blocId, index) => {
					let blocSource = await db.HGETALL('pad-' + padSource + ':' + blocId)
					blocSource = blocSource ? { ...blocSource } : {}
					if (Object.keys(blocSource).length === 0) return null
					const nouveauBlocId = 'bloc-id-' + Date.now() + randomBytes(8).toString('hex')
					const date = dayjs().format()
					let vignette = blocSource.hasOwnProperty('vignette') ? blocSource.vignette : ''
					if (blocSource.hasOwnProperty('vignette') && definirVignettePersonnalisee(blocSource.vignette)) {
						vignette = path.basename(blocSource.vignette)
					}
					let iframe = blocSource.hasOwnProperty('iframe') ? blocSource.iframe : ''
					let media = blocSource.hasOwnProperty('media') ? blocSource.media : ''
					const etherpadId = extraireIdentifiantEtherpad(blocSource.iframe)
					if (etherpadId !== '') {
						const destinationId = 'pad-' + padId + '-' + randomBytes(8).toString('hex')
						const urlCopie = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
						const copieEtherpadReussie = await axios.get(urlCopie, { timeout: 5000 }).then(() => true).catch(() => false)
						if (copieEtherpadReussie) {
							iframe = etherpad + '/p/' + destinationId
							media = etherpad + '/p/' + destinationId
						}
					}
					const champsBloc = ['id', blocSource.id, 'bloc', nouveauBlocId, 'titre', blocSource.titre, 'texte', blocSource.texte, 'media', media, 'alt', assainirTexteAlternatif(blocSource.alt), 'iframe', iframe, 'type', blocSource.type, 'source', blocSource.source, 'vignette', vignette, 'date', date, 'identifiant', blocSource.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', blocSource.colonne, 'visibilite', blocSource.visibilite]
					return { index, nouveauBlocId, champsBloc }
				}, tailleLotTransaction)
				const pipelineBlocs = db.multi()
				for (const bloc of blocsTraites.filter(Boolean)) {
					pipelineBlocs.HSET('pad-' + padId + ':' + bloc.nouveauBlocId, bloc.champsBloc)
					pipelineBlocs.ZADD('blocs:' + padId, { score: bloc.index, value: bloc.nouveauBlocId })
				}
				await pipelineBlocs.exec()
				// Copie des fichiers
				await copierFichiersPad(padSource, padId, donneesPad.acces)
				return res.status(200).send(padId + '/' + token)
			}
			// ACTION : EXPORTER
			else if (actionRequise === 'exporter') {
				const identifiant = req.body.identifiant
				const motdepasse = req.body.motdepasse
				const pad = req.body.id
				const langue = req.body.langue
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(pad)
				} else if (padExiste === 1) {
			        donneesPad = await db.HGETALL('pads:' + pad)
				    donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur')
				const autorisation = await verifierAutorisationApi(donneesPad, identifiant, motdepasse)
				if (!autorisation) return res.status(403).send('non_autorise')
				const padExporte = await exporterPad(pad, 'erreur_export', langue)
				return res.status(200).send(padExporte)
			}
			// ACTION : SUPPRIMER
			else if (actionRequise === 'supprimer') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const motdepasse = req.body.motdepasse
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(pad)
				} else if (padExiste === 1) {
			        donneesPad = await db.HGETALL('pads:' + pad)
				    donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('contenu_inexistant')
				if (Object.keys(donneesPad).length === 0) return res.status(500).send('erreur')
				const autorisation = await verifierAutorisationApi(donneesPad, identifiant, motdepasse)
				if (!autorisation) return res.status(403).send('non_autorise')
				const resultat = await supprimerPad(pad, identifiant, true)
				if (!resultat) return res.status(500).send('erreur')
				return res.status(200).send('contenu_supprime')
			}
			// Action non reconnue
			return res.status(500).send('erreur')
		} catch (err) {
			console.error(err.stack)
			return res.status(500).send('erreur')
		}
	})

	app.post('/api/ladigitale/importer', (req, res) => {
		televerserTemp(req, res, async (err) => {
			if (err) return res.status(500).send('erreur')
			if (!req.file) return res.status(500).send('erreur')
			try {
				const tokenApi = req.body.token
				const domaine = req.headers.host
				const lienCible = req.body.lien
				if (production && !verifierURL(lienCible, ['https'])) return res.status(500).send('erreur')
				const urlCible = new URL(lienCible)
				const hoteCible = urlCible.hostname.toLowerCase()
				if (verifierHoteBloque(hoteCible)) return res.status(500).send('erreur')
				const params = new URLSearchParams()
				params.append('token', tokenApi)
				params.append('domaine', domaine)
				const reponseApi = await axios.post(lienCible, params, { timeout: 5000 })
				if (reponseApi.data === 'non_autorise' || reponseApi.data === 'erreur') return res.status(401).send('erreur_token')
				if (reponseApi.data !== 'token_autorise' || !req.body.action || req.body.action !== 'importer') return res.status(500).send('erreur')
				const identifiant = req.body.identifiant
				let nom = req.body.nomUtilisateur
				if (nom === '') {
					nom = identifiant.toUpperCase()
				}
				const titre = req.body.titre
				const motdepasse = req.body.motdepasse
				const hash = await bcrypt.hash(motdepasse, 10)
				let langue = langueParDefaut
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
					langue = req.session.langue
				}
				const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
				const dossierTemporaire = path.join(__dirname, '..', '/static/temp/archive-' + Math.floor((Math.random() * 100000) + 1))
				await extraireArchive(source, dossierTemporaire)
				const donnees = await fs.readJson(path.normalize(dossierTemporaire + '/donnees.json'))
				const parametres = JSON.parse(req.body.parametres)
				const clesRequisesPad = ['id', 'token', 'titre', 'identifiant', 'fond', 'acces', 'contributions', 'affichage', 'fichiers', 'liens', 'documents', 'commentaires', 'evaluations', 'date', 'colonnes', 'bloc', 'activite']
				const clesRequisesBlocs = ['id', 'bloc', 'titre', 'texte', 'media', 'iframe', 'type', 'source', 'vignette', 'identifiant', 'commentaires', 'evaluations', 'colonne', 'listeCommentaires', 'listeEvaluations']
				const structureValide = donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && clesRequisesPad.every(cle => donnees.pad.hasOwnProperty(cle))
				if (!structureValide) {
					await supprimerArchives(source, dossierTemporaire)
					return res.status(400).send('donnees_corrompues')
				}
				const id = await db.INCR('pad')
				if (!await verifierEspaceDisque()) {
					await supprimerArchives(source, dossierTemporaire)
					return res.status(500).send('erreur')
				}
				const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
				if (stockage === 'fs') {
					await fs.mkdirp(dossierDestination)
				}
				// Traitement des blocs par lots
				const blocs = await executerTransactions(donnees.blocs, async (bloc, indexBloc) => {
					const blocValide = clesRequisesBlocs.every(cle => bloc.hasOwnProperty(cle))
					if (!blocValide) return { bloc: 0, blocId: 0 }
					const date = dayjs().format()
					let commentaires = parametres.commentaires === true ? bloc.commentaires : 0
					let evaluations = parametres.evaluations === true ? bloc.evaluations : 0
					let vignette = bloc.vignette
					if (definirVignettePersonnalisee(bloc.vignette)) {
						vignette = path.basename(bloc.vignette)
					}
					const visibilite = bloc.hasOwnProperty('visibilite') ? bloc.visibilite : 'visible'
					const blocId = 'bloc-id-' + Date.now() + randomBytes(8).toString('hex')
					await db.multi()
						.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'alt', assainirTexteAlternatif(bloc.alt), 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
						.exec()
					// Gestion des commentaires
					if (parametres.commentaires === true && Array.isArray(bloc.listeCommentaires)) {
						for (const commentaire of bloc.listeCommentaires) {
							if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
								await db.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
								if (commentaire.visibilite === 'masquee') {
									await db.ZADD('commentaires-masques:' + blocId, [{ score: commentaire.id, value: commentaire.id + ':' + commentaire.identifiant }])
								}
							}
						}
					}
					// Gestion des évaluations
					if (parametres.evaluations === true && Array.isArray(bloc.listeEvaluations)) {
						for (const evaluation of bloc.listeEvaluations) {
							if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
								await db.ZADD('evaluations:' + blocId, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
							}
						}
					}
					if (bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
						await televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.media, id, donnees.pad.acces)
					}
					if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette)) {
						await televerserFichierArchive(dossierTemporaire, dossierDestination, vignette, id, donnees.pad.acces)
					}
					return { bloc: bloc.bloc, blocId: blocId }
				}, tailleLotTransaction)
				const token = Math.random().toString(16).slice(2)
				const date = dayjs().format()
				const code = Math.floor(100000 + Math.random() * 900000)
				const affichageColonnes = donnees.pad.affichageColonnes ? JSON.parse(donnees.pad.affichageColonnes) : JSON.parse(donnees.pad.colonnes).map(() => true)
				const activiteId = parametres.activite === true ? donnees.pad.activite : 0
				const fond = donnees.pad.fond
				if (fond && !fond.includes('/img/') && fond.substring(0, 1) !== '#') {
					await televerserFichierArchive(dossierTemporaire, dossierDestination, path.basename(fond), id, donnees.pad.acces)
				}
				await db.multi()
					.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', donnees.pad.registreActivite ?? 'active', 'conversation', donnees.pad.conversation ?? 'desactivee', 'listeUtilisateurs', donnees.pad.listeUtilisateurs ?? 'activee', 'editionNom', donnees.pad.editionNom ?? 'desactivee', 'fichiers', donnees.pad.fichiers, 'enregistrements', donnees.pad.enregistrements ?? 'desactives', 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', donnees.pad.copieBloc ?? 'desactivee', 'ordre', donnees.pad.ordre ?? 'croissant', 'largeur', donnees.pad.largeur ?? 'normale', 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'vues', 0, 'digidrive', 1, ...definirParametresModeration(donnees.pad)])
					.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
					.SADD('pads-crees:' + identifiant, id.toString())
					.exec()

				// Gestion de l'activité
				if (parametres.activite && Array.isArray(donnees.activite)) {
					let activiteFiltree = donnees.activite
					if (!parametres.commentaires) {
						activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-commente' && el.type !== 'commentaire-valide')
					}
					if (!parametres.evaluations) {
						activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-evalue')
					}
					for (const activite of activiteFiltree) {
						if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
							// Mise à jour de l'ID du bloc
							const bloc = blocs.find(item => item.bloc === activite.bloc)
							if (bloc) {
								activite.bloc = bloc.blocId
							}
							await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
						}
					}
				}
				await supprimerArchives(source, dossierTemporaire)
				res.status(200).send(id + '/' + token)
			} catch (err) {
				console.error(err.stack)
				try {
					if (req.file && req.file.filename) {
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + req.file.filename))
					}
				} catch {}
				res.status(500).send('erreur')
			}
		})
	})
}
