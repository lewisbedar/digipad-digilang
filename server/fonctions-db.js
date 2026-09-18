import path from 'path'
import fs from 'fs-extra'
import { fileURLToPath } from 'url'
import axios from 'axios'
import v from 'voca'
import bcrypt from 'bcrypt'
import archiver from 'archiver'
import checkDiskSpace from 'check-disk-space'
import { randomBytes } from 'crypto'
import { pipeline } from 'stream/promises'
import { CopyObjectCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import genererHTML from './genererHTML.js'
import { etat } from './etat.js'
import {
	assainirTexteAlternatif,
	comparerHash,
	definirAccesLecture,
	definirBlocsDeplaces,
	definirBlocsExport,
	definirCheminFichiers,
	definirDonneesPadExport,
	definirModeration,
	definirNomFichier,
	definirParametresModeration,
	definirSalonAdmin,
	definirSalonUtilisateur,
	executerTransactions,
	extraireIdentifiantMasque,
	formaterDate,
	genererPseudo,
	obtenirCleEchecConnexion,
	parseJSON,
	recupererNombreCommentaires,
	tailleLotTransaction,
	verifierActiviteVisible,
	verifierBlocVisible,
	verifierDomaineEmail,
	verifierFormatEmail,
	verifierIdentifiantPad,
	verifierURL
} from './fonctions.js'

const production = process.env.NODE_ENV === 'production'
let cluster = false
if (production) {
	cluster = parseInt(process.env.NODE_CLUSTER) === 1
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Ces fonctions dépendent de ressources créées au démarrage (Redis, socket.io, stockage S3/disque, SMTP, Etherpad)
export default function creerFonctions ({
	db,
	io,
	stockage,
	bucket,
	s3Client,
	lienPublicS3,
	etherpad,
	etherpadApi,
	ancienDomaineEtherpad,
	transporter,
	langues,
	langueParDefaut,
	minimumEspaceDisque,
	fenetreEchecsConnexionParIdentifiant,
	salonMaintenance
}) {
	async function enregistrerTentativeConnexion (identifiant, ip) {
		const cle = obtenirCleEchecConnexion(identifiant, ip)
		if (cle === null) return 0
		try {
			const [tentatives] = await db.multi()
				.INCR(cle)
				.EXPIRE(cle, fenetreEchecsConnexionParIdentifiant, 'NX')
				.exec()
			return parseInt(tentatives)
		} catch (err) {
			console.error(err.stack)
			return 0
		}
	}

	async function reinitialiserEchecsConnexion (identifiant, ip) {
		const cle = obtenirCleEchecConnexion(identifiant, ip)
		if (cle === null) return
		try {
			await db.UNLINK(cle)
		} catch (err) {
			console.error(err.stack)
		}
	}

	async function creerPad (id, token, titre, date, identifiant, destination, donneesUtilisateur) {
		await db.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0, ...definirParametresModeration()])
			.SADD('pads-crees:' + identifiant, id.toString())
			.SADD('utilisateurs-pads:' + id, identifiant)
			.HSET('dates-pads:' + id, 'date', date)
			.exec()
		if (stockage === 'fs') {
			const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
			await fs.mkdirp(dossier)
		}
		if (destination !== '') {
			try {
				const dossiers = JSON.parse(donneesUtilisateur.dossiers)
				dossiers.forEach((dossier, indexDossier) => {
					if (dossier.id === destination) {
						dossiers[indexDossier].pads.push(id)
					}
				})
				await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			} catch {}
		}
		return { id, token, titre, identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [], vues: 0, ...definirModeration() }
	}

	async function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		let digidrive = 0
		if (type === 'api') {
			digidrive = 1
		}
		await db.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'vues', 0, 'digidrive', digidrive, ...definirParametresModeration()])
			.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
			.exec()
		if (type === 'api') {
			await db.SADD('pads-crees:' + identifiant, id.toString())
		}
		if (stockage === 'fs') {
			const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
			await fs.mkdirp(dossier)
		}
		if (type === 'api') {
			return id + '/' + token
		} else {
			return { id, token }
		}
	}

	async function ajouterPadDansDb (id, donnees) {
		const clesRequisesBloc = ['id', 'bloc', 'titre', 'texte', 'media', 'iframe', 'type', 'source', 'vignette', 'identifiant', 'commentaires', 'evaluations', 'colonne', 'listeCommentaires', 'listeEvaluations']
		const pipeline = db.multi()
		for (let indexBloc = 0; indexBloc < donnees.blocs.length; indexBloc++) {
			const bloc = donnees.blocs[indexBloc]
			if (!clesRequisesBloc.every(cle => bloc.hasOwnProperty(cle))) continue
			const visibilite = bloc.visibilite ?? 'visible'
			const cleRedisBloc = 'pad-' + id + ':' + bloc.bloc
			const donneesBloc = ['id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'alt', assainirTexteAlternatif(bloc.alt), 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite]
			pipeline.HSET(cleRedisBloc, donneesBloc)
			pipeline.ZADD('blocs:' + id, [{ score: indexBloc, value: bloc.bloc }])
			if (Array.isArray(bloc.listeCommentaires)) {
				for (const commentaire of bloc.listeCommentaires) {
					if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
						pipeline.ZADD('commentaires:' + bloc.bloc, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
						if (commentaire.visibilite === 'masquee') {
							pipeline.ZADD('commentaires-masques:' + bloc.bloc, [{ score: commentaire.id, value: commentaire.id + ':' + commentaire.identifiant }])
						}
					}
				}
			}
			if (Array.isArray(bloc.listeEvaluations)) {
				for (const evaluation of bloc.listeEvaluations) {
					if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
						pipeline.ZADD('evaluations:' + bloc.bloc, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
					}
				}
			}
		}
		const registreActivite = donnees.pad.registreActivite ?? 'active'
		const conversation = donnees.pad.conversation ?? 'desactivee'
		const listeUtilisateurs = donnees.pad.listeUtilisateurs ?? 'activee'
		const editionNom = donnees.pad.editionNom ?? 'desactivee'
		const ordre = donnees.pad.ordre ?? 'croissant'
		const largeur = donnees.pad.largeur ?? 'normale'
		const enregistrements = donnees.pad.enregistrements ?? 'desactives'
		const copieBloc = donnees.pad.copieBloc ?? 'desactivee'
		const vues = donnees.pad.vues ?? 0
		const digidrive = donnees.pad.digidrive ?? 0
		// Correction bug update 0.9.0 : admins corrompus
		let admins
		if (donnees.pad.hasOwnProperty('admins') && donnees.pad.admins.substring(0, 2) !== '"\\') {
			admins = donnees.pad.admins
		} else {
			admins = JSON.stringify([])
		}
		// Gestion de l'affichage des colonnes
		let affichageColonnes
		if (donnees.pad.hasOwnProperty('affichageColonnes')) {
			affichageColonnes = donnees.pad.affichageColonnes
		} else if (donnees.pad.colonnes && donnees.pad.colonnes.length > 0) {
			try {
				const colonnesParsees = JSON.parse(donnees.pad.colonnes)
				affichageColonnes = JSON.stringify(colonnesParsees.map(() => true))
			} catch {
				affichageColonnes = JSON.stringify([])
			}
		} else {
			affichageColonnes = JSON.stringify([])
		}
		const champsPad = ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive, ...definirParametresModeration(donnees.pad)]
		if (donnees.pad.hasOwnProperty('motdepasse')) {
			champsPad.push('motdepasse', donnees.pad.motdepasse)
		}
		if (donnees.pad.hasOwnProperty('code')) {
			champsPad.push('code', donnees.pad.code)
		}
		pipeline.HSET('pads:' + id, champsPad)
		if (Array.isArray(donnees.activite)) {
			for (const activite of donnees.activite) {
				if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
					pipeline.ZADD(`activite:${id}`, [{ score: activite.id, value: JSON.stringify(activite) }])
				}
			}
		}
		await pipeline.exec()
		await Promise.all([
			fs.remove(path.join(__dirname, '..', '/static/pads/' + id + '.json')),
			fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + id + '.json'))
		])
		return 'pad_ajoute_dans_db'
	}

	async function recupererDonneesUtilisateur (identifiant) {
		const nomsUtilisateurs = new Map()
		const recupererDonnees = async (cleRedis) => {
			const pads = await db.SMEMBERS(cleRedis)
			if (!pads || pads.length === 0) return []
			const donnees = await Promise.all(pads.map(async (padId) => {
				let donneesPad = null
				const padExiste = await db.EXISTS('pads:' + padId)
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + padId)
					if (!donneesPad) return null
					donneesPad = { ...donneesPad }
					if (!donneesPad.hasOwnProperty('identifiant')) return null
				} else if (padExiste === 0 && verifierIdentifiantPad(padId) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))
					if (typeof donneesPad !== 'object' || !donneesPad || !donneesPad.hasOwnProperty('identifiant')) return null
				}
				if (!donneesPad) return null
				// Compatibilité anciens chemins pour le fond
				if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
					donneesPad.fond = path.basename(donneesPad.fond)
				}
				if (donneesPad.transfertPropriete === 'active' && (Number(donneesPad.transfertProprieteExpire) || 0) <= Date.now()) {
					donneesPad.transfertPropriete = 'desactive'
				}
				const nomAuteur = await recupererNomUtilisateur(donneesPad.identifiant, nomsUtilisateurs)
				donneesPad.nom = nomAuteur || donneesPad.identifiant
				return donneesPad
			}))
			return donnees.filter(item => item !== null && Object.keys(item).length > 0)
		}
		const [padsCrees, padsSupprimes, padsRejoints, padsAdmins, padsFavoris] = await Promise.all([
			recupererDonnees('pads-crees:' + identifiant),
			recupererDonnees('pads-supprimes:' + identifiant),
			recupererDonnees('pads-rejoints:' + identifiant),
			recupererDonnees('pads-admins:' + identifiant),
			recupererDonnees('pads-favoris:' + identifiant)
		])
		return [padsCrees, padsSupprimes, padsRejoints, padsAdmins, padsFavoris]
	}

	async function recupererDonneesAuteur (identifiant) {
		const recupererDonnees = async (cleRedis) => {
			const pads = await db.SMEMBERS(cleRedis)
			if (!pads || pads.length === 0) return []
			const donneesPads = await Promise.all(pads.map(async (pad) => {
				const padExiste = await db.EXISTS('pads:' + pad)
				let donneesPad = null
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + pad)
					return donneesPad ? { ...donneesPad } : null
				} else if (padExiste === 0 && verifierIdentifiantPad(pad) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (donneesPad && typeof donneesPad === 'object') {
						return donneesPad
					}
				}
				return null
			}))
			return donneesPads.filter(item => item !== null)
		}
		const [padsCrees, padsAdmins] = await Promise.all([
			recupererDonnees('pads-crees:' + identifiant),
			recupererDonnees('pads-admins:' + identifiant)
		])
		return { padsCrees, padsAdmins }
	}

	async function recupererDonneesPad (id, token, identifiant, statut, pads) {
		const nomsUtilisateurs = new Map()
		const commentairesMasquesParBloc = new Map()
		let pad = await db.HGETALL('pads:' + id)
		pad = pad ? { ...pad } : {}
		if (!pad.id || pad.id !== id || !pad.token || pad.token !== token) return 'erreur'
		try {
			// Fix bug update 0.9.0 admins
			if (!pad.hasOwnProperty('admins') || pad.admins.substring(0, 2) === '"\\') {
				pad.admins = []
			} else if (pad.admins.substring(0, 1) === '"') {
				pad.admins = JSON.parse(JSON.parse(pad.admins))
			} else {
				pad.admins = JSON.parse(pad.admins)
			}
			pad.colonnes = JSON.parse(pad.colonnes)
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
		} catch {
			return 'erreur'
		}
		const nombreColonnes = pad.colonnes.length
		const admin = (statut === 'utilisateur' && (pad.admins.includes(identifiant) || pad.identifiant === identifiant)) || (statut === 'auteur' && pads && pads.includes(parseInt(id, 10)))
		const accesCode = pad.hasOwnProperty('code') && pad.acces === 'code'
		const accesPrive = pad.acces === 'prive'
		const accesLecture = admin || (!accesCode && !accesPrive)
		// Valeurs par défaut et compatibilité
		if (!pad.hasOwnProperty('digidrive')) pad.digidrive = 0
		if (!pad.hasOwnProperty('fondRepete')) pad.fondRepete = 'desactive'
		if (!pad.hasOwnProperty('ordre')) pad.ordre = 'croissant'
		if (!pad.hasOwnProperty('largeur')) pad.largeur = 'normale'
		if (!pad.hasOwnProperty('enregistrements')) pad.enregistrements = 'desactives'
		if (!pad.hasOwnProperty('visionneuse')) pad.visionneuse = 'viewer'
		if (pad.transfertPropriete === 'active' && (Number(pad.transfertProprieteExpire) || 0) <= Date.now()) {
			pad.transfertPropriete = 'desactive'
		}
		if (accesLecture) {
			if (pad.hasOwnProperty('affichageColonnes')) {
				try {
					pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
					if (pad.affichageColonnes.length === 0 || pad.affichageColonnes.length !== pad.colonnes.length) {
						pad.affichageColonnes = pad.colonnes.map(() => true)
					}
				} catch {
					pad.affichageColonnes = pad.colonnes.map(() => true)
				}
			} else {
				pad.affichageColonnes = pad.colonnes.map(() => true)
			}
		}
		if (pad.hasOwnProperty('fond') && typeof pad.fond === 'string' && pad.fond !== '' && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#') {
			pad.fond = path.basename(pad.fond)
		}
		// Masquage des données sensibles
		if (pad.hasOwnProperty('motdepasse')) pad.motdepasse = ''
		if (!admin) {
			if (pad.hasOwnProperty('code')) pad.code = ''
			if (accesCode || accesPrive) {
				pad.colonnes = []
				pad.affichageColonnes = []
			}
			pad.admins = []
		}
		let donneesBlocs = []
		let listeBlocsValides = []
		if (accesLecture) {
			const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
			if (listeBlocs && listeBlocs.length > 0) {
				const resultatsBlocs = await Promise.all(listeBlocs.map(async (blocId) => {
					let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
					if (!bloc || Object.keys(bloc).length === 0) return null
					bloc = { ...bloc }
					if (!bloc.hasOwnProperty('visibilite')) bloc.visibilite = 'visible'
					const blocVisible = !((pad.contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
					const colonneMasquee = (pad.affichage === 'colonnes' && pad.affichageColonnes[bloc.colonne] === false)
					if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
					// Correction colonne inexistante
					if (parseInt(bloc.colonne, 10) >= nombreColonnes) {
						bloc.colonne = nombreColonnes - 1
					}
					if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
						bloc.vignette = path.basename(bloc.vignette)
					}
					// Compatibilité changement domaine doc.digipad
					if (bloc.hasOwnProperty('iframe') && bloc.iframe.includes(ancienDomaineEtherpad)) {
						bloc.iframe = bloc.iframe.replace(ancienDomaineEtherpad, etherpad)
					}
					if (bloc.hasOwnProperty('media') && bloc.media.includes(ancienDomaineEtherpad)) {
						bloc.media = bloc.media.replace(ancienDomaineEtherpad, etherpad)
					}
					if (!bloc.hasOwnProperty('couleur') || bloc.couleur === null || typeof bloc.couleur !== 'string') {
						bloc.couleur = '#242f3d'
					}
					let html = bloc.texte || ''
					html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
					html = html.replace(/style=".*?"/mg, '').replace(/class=".*?"/mg, '')
					bloc.texte = html
					let [commentairesMasques, evaluations, nomAuteur] = await Promise.all([
						recupererCommentairesMasques(blocId),
						db.ZRANGE('evaluations:' + blocId, 0, -1),
						recupererNomUtilisateur(bloc.identifiant, nomsUtilisateurs)
					])
					if (commentairesMasques === null) {
						commentairesMasques = { totalCommentaires: 0, identifiantsMasques: [] }
					}
					commentairesMasquesParBloc.set(blocId, commentairesMasques.identifiantsMasques)
					const nombreCommentaires = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, admin, identifiant, pad.visibiliteCommentaires !== 'admin')
					bloc.commentaires = nombreCommentaires.commentaires
					bloc.commentairesEnAttente = nombreCommentaires.commentairesEnAttente
					bloc.evaluations = []
					if (evaluations && (admin || pad.visibiliteEvaluations !== 'admin')) {
						bloc.evaluations = evaluations.map(ev => {
							return parseJSON(ev, null)
						}).filter(e => e !== null)
					}
					bloc.nom = nomAuteur
					listeBlocsValides.push(blocId)
					return bloc
				}))
				donneesBlocs = resultatsBlocs.filter(b => b !== null)
			}
		}
		if (pad.ordre === 'decroissant') {
			donneesBlocs.reverse()
		}
		// Registre d'activité
		let donneesEntrees = []
		if (accesLecture) {
			const activite = await db.ZRANGE('activite:' + id, 0, -1)
			if (activite) {
				const resultatsActivite = await Promise.all(activite.map(async (entreeStr) => {
					const entree = parseJSON(entreeStr, null)
					if (!entree) return null
					entree.nom = await recupererNomUtilisateur(entree.identifiant, nomsUtilisateurs)
					if (!verifierActiviteVisible(entree, pad, admin, identifiant, commentairesMasquesParBloc)) return null
					return entree
				}))
				// Filtrage : seuls les événements liés aux blocs ou aux colonnes visibles sont gardés
				donneesEntrees = resultatsActivite.filter(e => {
					if (!e) return
					const colonne = e.hasOwnProperty('type') && e.type.includes('colonne')
					const blocVisible = e.hasOwnProperty('bloc') && listeBlocsValides.includes(e.bloc)
					return colonne || blocVisible
				})
			}
		}
		donneesEntrees.reverse()
		const multi = db.multi()
		if (!admin && !accesPrive) {
			multi.HINCRBY('pads:' + id, 'vues', 1)
		}
		if (pad.identifiant !== identifiant && statut === 'utilisateur' && !accesPrive) {
			multi.SADD('pads-rejoints:' + identifiant, id.toString())
			multi.SADD('pads-utilisateurs:' + identifiant, id.toString())
			multi.SADD('utilisateurs-pads:' + id, identifiant)
		}
		// Vérifier notification mise à jour pad
		if (pad.hasOwnProperty('notification') && Array.isArray(pad.notification) && pad.notification.includes(identifiant)) {
			pad.notification.splice(pad.notification.indexOf(identifiant), 1)
			multi.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
		}
		await multi.exec()
		return { pad, blocs: donneesBlocs, activite: donneesEntrees }
	}

	async function recupererDonneesPadProtege (pad, id, identifiant, admin) {
		const nomsUtilisateurs = new Map()
		const commentairesMasquesParBloc = new Map()
		try {
			pad.colonnes = JSON.parse(pad.colonnes)
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
		} catch {
			return 'erreur'
		}
		const nombreColonnes = pad.colonnes.length
		if (pad.hasOwnProperty('affichageColonnes')) {
			try {
				pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
				if (pad.affichageColonnes.length === 0 || pad.affichageColonnes.length !== pad.colonnes.length) {
					pad.affichageColonnes = pad.colonnes.map(() => true)
				}
			} catch {
				pad.affichageColonnes = pad.colonnes.map(() => true)
			}
		} else {
			pad.affichageColonnes = pad.colonnes.map(() => true)
		}
		// Valeurs par défaut et compatibilité
		if (!pad.hasOwnProperty('digidrive')) pad.digidrive = 0
		if (!pad.hasOwnProperty('fondRepete')) pad.fondRepete = 'desactive'
		if (!pad.hasOwnProperty('ordre')) pad.ordre = 'croissant'
		if (!pad.hasOwnProperty('largeur')) pad.largeur = 'normale'
		if (!pad.hasOwnProperty('enregistrements')) pad.enregistrements = 'desactives'
		if (!pad.hasOwnProperty('visionneuse')) pad.visionneuse = 'viewer'
		if (pad.hasOwnProperty('fond') && typeof pad.fond === 'string' && pad.fond !== '' && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#') {
			pad.fond = path.basename(pad.fond)
		}
		// Masquage des données sensibles
		if (pad.hasOwnProperty('motdepasse')) pad.motdepasse = ''
		if (!admin && pad.hasOwnProperty('code')) pad.code = ''
		pad.admins = []
		const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
		let donneesBlocs = []
		let listeBlocsValides = []
		if (listeBlocs && listeBlocs.length > 0) {
			const resultatsBlocs = await Promise.all(listeBlocs.map(async (blocId) => {
				let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
				if (!bloc || Object.keys(bloc).length === 0) return null
				bloc = { ...bloc }
				if (!bloc.hasOwnProperty('visibilite')) bloc.visibilite = 'visible'
				// Filtres de visibilité
				const blocVisible = !((pad.contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
				const colonneMasquee = (pad.affichage === 'colonnes' && pad.affichageColonnes[bloc.colonne] === false)
				if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
				// Correction colonne inexistante
				if (parseInt(bloc.colonne, 10) >= nombreColonnes) {
					bloc.colonne = nombreColonnes - 1
				}
				if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
					bloc.vignette = path.basename(bloc.vignette)
				}
				if (bloc.hasOwnProperty('iframe') && bloc.iframe.includes(ancienDomaineEtherpad)) {
					bloc.iframe = bloc.iframe.replace(ancienDomaineEtherpad, etherpad)
				}
				if (bloc.hasOwnProperty('media') && bloc.media.includes(ancienDomaineEtherpad)) {
					bloc.media = bloc.media.replace(ancienDomaineEtherpad, etherpad)
				}
				if (!bloc.hasOwnProperty('couleur') || bloc.couleur === null || typeof bloc.couleur !== 'string') {
					bloc.couleur = '#242f3d'
				}
				let html = bloc.texte || ''
				html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
				html = html.replace(/style=".*?"/mg, '').replace(/class=".*?"/mg, '')
				bloc.texte = html
				let [commentairesMasques, evaluations, nomAuteur] = await Promise.all([
					recupererCommentairesMasques(blocId),
					db.ZRANGE('evaluations:' + blocId, 0, -1),
					recupererNomUtilisateur(bloc.identifiant, nomsUtilisateurs)
				])
				if (commentairesMasques === null) {
					console.error('recupererCommentairesMasques a échoué pour le bloc ' + blocId)
					commentairesMasques = { totalCommentaires: 0, identifiantsMasques: [] }
				}
				commentairesMasquesParBloc.set(blocId, commentairesMasques.identifiantsMasques)
				const nombreCommentaires = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, admin, identifiant, pad.visibiliteCommentaires !== 'admin')
				bloc.commentaires = nombreCommentaires.commentaires
				bloc.commentairesEnAttente = nombreCommentaires.commentairesEnAttente
				bloc.evaluations = []
				if (evaluations && (admin || pad.visibiliteEvaluations !== 'admin')) {
					bloc.evaluations = evaluations.map(ev => {
						return parseJSON(ev, null)
					}).filter(e => e !== null)
				}
				bloc.nom = nomAuteur
				listeBlocsValides.push(blocId)
				return bloc
			}))
			donneesBlocs = resultatsBlocs.filter(b => b !== null)
		}
		if (pad.ordre === 'decroissant') {
			donneesBlocs.reverse()
		}
		let donneesEntrees = []
		const activite = await db.ZRANGE('activite:' + id, 0, -1)
		if (activite) {
			const resultatsActivite = await Promise.all(activite.map(async (entreeStr) => {
				const entree = parseJSON(entreeStr, null)
				if (!entree) return null
				entree.nom = await recupererNomUtilisateur(entree.identifiant, nomsUtilisateurs)
				if (!verifierActiviteVisible(entree, pad, admin, identifiant, commentairesMasquesParBloc)) return null
				return entree
			}))
			donneesEntrees = resultatsActivite.filter(e => {
				if (!e) return
				const colonne = e.hasOwnProperty('type') && e.type.includes('colonne')
				const blocVisible = e.hasOwnProperty('bloc') && listeBlocsValides.includes(e.bloc)
				return colonne || blocVisible
			})
		}
		donneesEntrees.reverse()
		// Vérifier notification mise à jour pad
		if (pad.hasOwnProperty('notification') && Array.isArray(pad.notification) && pad.notification.includes(identifiant)) {
			pad.notification.splice(pad.notification.indexOf(identifiant), 1)
			await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
		}
		return { pad, blocs: donneesBlocs, activite: donneesEntrees }
	}

	function recupererNomUtilisateur (id, cache) {
		if (!cache) return chargerNomUtilisateur(id)
		if (!cache.has(id)) cache.set(id, chargerNomUtilisateur(id))
		return cache.get(id)
	}

	async function chargerNomUtilisateur (id) {
		let donneesUtilisateur = await db.HGETALL('utilisateurs:' + id)
		donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		if (donneesUtilisateur.hasOwnProperty('nom') && donneesUtilisateur.nom !== '') {
			return donneesUtilisateur.nom
		}
		const nom = await db.HGET('noms:' + id, 'nom')
		return nom || ''
	}

	function diffuserAdmin (pad, evenement, donneesCompletes, donneesReduites) {
		const salonAdmin = definirSalonAdmin(pad)
		io.to(salonAdmin).emit(evenement, donneesCompletes)
		if (donneesReduites !== null) {
			io.to('pad-' + pad).except(salonAdmin).emit(evenement, donneesReduites)
		}
	}

	function diffuserBloc (pad, evenement, blocDiffuse, identifiantAuteur, diffusionRestreinte = false) {
		const salonAdmin = definirSalonAdmin(pad)
		const salonPad = 'pad-' + pad
		if (!diffusionRestreinte && blocDiffuse.complet === blocDiffuse.reduit) {
			return io.to(salonPad).emit(evenement, blocDiffuse.complet)
		}
		io.to(salonAdmin).emit(evenement, blocDiffuse.complet)
		const exclusions = [salonAdmin]
		if (identifiantAuteur) {
			const salonAuteur = definirSalonUtilisateur(pad, identifiantAuteur)
			io.to(salonAuteur).except(salonAdmin).emit(evenement, blocDiffuse.complet)
			exclusions.push(salonAuteur)
		}
		if (diffusionRestreinte) return
		io.to(salonPad).except(exclusions).emit(evenement, blocDiffuse.reduit)
	}

	function diffuserBlocsDeplaces (pad, listeItems, blocs, contributions, identifiantAdmin) {
		const salonAdmin = definirSalonAdmin(pad)
		const salonPad = 'pad-' + pad
		io.to(salonAdmin).emit('deplacerbloc', { blocs: listeItems, identifiant: identifiantAdmin })
		const blocsDeplaces = definirBlocsDeplaces(listeItems, blocs, contributions, null)
		if (blocsDeplaces.length === listeItems.length) {
			return io.to(salonPad).except(salonAdmin).emit('deplacerbloc', { blocs: blocsDeplaces, identifiant: identifiantAdmin })
		}
		const auteurs = new Set(blocs.filter((bloc) => !verifierBlocVisible(bloc, contributions) && bloc.identifiant).map((bloc) => bloc.identifiant))
		const exclusions = [salonAdmin]
		auteurs.forEach((auteur) => {
			const salonAuteur = definirSalonUtilisateur(pad, auteur)
			io.to(salonAuteur).except(salonAdmin).emit('deplacerbloc', { blocs: definirBlocsDeplaces(listeItems, blocs, contributions, auteur), identifiant: identifiantAdmin })
			exclusions.push(salonAuteur)
		})
		io.to(salonPad).except(exclusions).emit('deplacerbloc', { blocs: blocsDeplaces, identifiant: identifiantAdmin })
	}

	async function recupererCommentairesMasques (bloc) {
		const [totalCommentaires, identifiantsMasques] = await Promise.all([
			db.ZCARD('commentaires:' + bloc),
			db.ZRANGE('commentaires-masques:' + bloc, 0, -1)
		])
		if (totalCommentaires === null || identifiantsMasques === null) return null
		return { totalCommentaires, identifiantsMasques }
	}

	function diffuserCommentaires (pad, evenement, donneesCommunes, commentairesMasques, identifiantAuteur, donneesAdmin, commentairesVisibles = true, donneesAuteur = null) {
		const salonAdmin = definirSalonAdmin(pad)
		const salonPad = 'pad-' + pad
		const commentairesAdmin = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, true, null)
		const commentaires = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, false, null, commentairesVisibles)
		if (commentairesVisibles === true && !donneesAdmin && commentairesMasques.identifiantsMasques.length === 0) {
			return io.to(salonPad).emit(evenement, { ...donneesCommunes, ...commentairesAdmin })
		}
		io.to(salonAdmin).emit(evenement, { ...(donneesAdmin || donneesCommunes), ...commentairesAdmin })
		const donneesReduites = commentairesVisibles ? donneesCommunes : { id: donneesCommunes.id, bloc: donneesCommunes.bloc }
		const identifiantsConcernes = new Set(commentairesMasques.identifiantsMasques.map(extraireIdentifiantMasque))
		if (identifiantAuteur) {
			identifiantsConcernes.add(identifiantAuteur)
		}
		const exclusions = [salonAdmin]
		identifiantsConcernes.forEach((identifiantConcerne) => {
			const salonUtilisateur = definirSalonUtilisateur(pad, identifiantConcerne)
			const commentairesUtilisateur = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, false, identifiantConcerne, commentairesVisibles)
			const donneesUtilisateur = (donneesAuteur && identifiantConcerne === identifiantAuteur) ? donneesAuteur : donneesReduites
			io.to(salonUtilisateur).except(salonAdmin).emit(evenement, { ...donneesUtilisateur, ...commentairesUtilisateur })
			exclusions.push(salonUtilisateur)
		})
		io.to(salonPad).except(exclusions).emit(evenement, { ...donneesReduites, ...commentaires })
	}

	async function recupererDonneesBlocs (id, token, identifiant, statut, pads) {
		let pad = await db.HGETALL('pads:' + id)
		pad = pad ? { ...pad } : {}
		if (!pad.id || pad.id !== id || !pad.token || pad.token !== token) return 'erreur'
		// Fix bug update 0.9.0 admins
		if (!pad.hasOwnProperty('admins') || pad.admins.substring(0, 2) === '"\\') {
			pad.admins = []
		} else if (pad.admins.substring(0, 1) === '"') {
			pad.admins = JSON.parse(JSON.parse(pad.admins))
		} else {
			pad.admins = JSON.parse(pad.admins)
		}
		const admin = (statut === 'utilisateur' && (pad.admins.includes(identifiant) || pad.identifiant === identifiant)) || (statut === 'auteur' && pads && pads.includes(parseInt(id, 10)))
		const accesCode = pad.hasOwnProperty('code') && pad.acces === 'code'
		const accesPrive = pad.acces === 'prive'
		let affichageColonnes = []
		if (pad.hasOwnProperty('affichageColonnes')) {
			try { affichageColonnes = JSON.parse(pad.affichageColonnes) } catch {}
		}
		let donneesBlocs = []
		const nomsUtilisateurs = new Map()
		if (admin || (!accesCode && !accesPrive)) {
			const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
			if (listeBlocs && listeBlocs.length > 0) {
				const resultatsBlocs = await Promise.all(listeBlocs.map(async (blocId) => {
					let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
					if (!bloc || Object.keys(bloc).length === 0) return null
					bloc = { ...bloc }
					const blocVisible = !((pad.contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
					const colonneMasquee = (pad.affichage === 'colonnes' && affichageColonnes[bloc.colonne] === false)
					if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
					if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
						bloc.vignette = path.basename(bloc.vignette)
					}
					if (!bloc.hasOwnProperty('visibilite')) bloc.visibilite = 'visible'
					bloc.nom = await recupererNomUtilisateur(bloc.identifiant, nomsUtilisateurs)
					return bloc
				}))
				donneesBlocs = resultatsBlocs.filter(b => b !== null)
			}
		}
		return { blocs: donneesBlocs, admin }
	}

	async function recupererDonneesPadJSON (pad) {
		if (!verifierIdentifiantPad(pad)) return {}
		const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
		if (typeof donneesPad !== 'object' || !donneesPad || !donneesPad.hasOwnProperty('pad') || !donneesPad.hasOwnProperty('blocs') || !donneesPad.hasOwnProperty('activite')) return {}
		await ajouterPadDansDb(pad, donneesPad)
		return donneesPad.pad
	}

	async function verifierAcces (pad, identifiant, motdepasse) {
		const reponseErreur = { acces: 'erreur', utilisateur: {} }
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		if (!donneesPad.identifiant) return reponseErreur
		const proprietaire = (identifiant === donneesPad.identifiant)
		let motdepasseCorrect = false
		let hashAComparer = null
		let donneesUtilisateur = {}
		// Cas A : Le pad a un mot de passe spécifique et l'utilisateur est le propriétaire
		if (proprietaire && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '') {
			hashAComparer = donneesPad.motdepasse
		}
		// Cas B : Le pad n'a pas de mot de passe, vérification du MDP compte
		else if (proprietaire && !donneesPad.hasOwnProperty('motdepasse')) {
			donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.motdepasse) return reponseErreur
			hashAComparer = donneesUtilisateur.motdepasse
		}
		if (hashAComparer && motdepasse && motdepasse.trim() !== '') {
			try {
				motdepasseCorrect = await bcrypt.compare(motdepasse.trim(), hashAComparer)
			} catch {
				return reponseErreur
			}
		}
		if (!motdepasseCorrect) return reponseErreur
		if (Object.keys(donneesUtilisateur).length === 0) {
			donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		}
		if (!donneesUtilisateur.hasOwnProperty('id') || !donneesUtilisateur.hasOwnProperty('nom') || !donneesUtilisateur.hasOwnProperty('langue')) return reponseErreur
		const digidrive = parseInt(donneesPad.digidrive, 10) || 0
		if (digidrive === 0) {
			await db.HSET('pads:' + pad, 'digidrive', 1).catch(() => {})
		}
		return { acces: 'pad_debloque', utilisateur: donneesUtilisateur }
	}

	async function exporterPad (id, erreur, langue) {
		if (!langues.includes(langue)) {
			langue = langueParDefaut
		}
		try {
			let [donneesPad, listeBlocs, activite] = await Promise.all([
				db.HGETALL('pads:' + id),
				db.ZRANGE('blocs:' + id, 0, -1),
				db.ZRANGE('activite:' + id, 0, -1)
			])
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('id')) return erreur
			let donneesBlocs = []
			const nomsUtilisateurs = new Map()
			if (listeBlocs && listeBlocs.length > 0) {
				const resultatsBlocs = await Promise.all(listeBlocs.map(async (blocId) => {
					let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
					bloc = bloc ? { ...bloc } : {}
					if (Object.keys(bloc).length === 0) return null
					const [commentaires, evaluations] = await Promise.all([
						db.ZRANGE('commentaires:' + blocId, 0, -1),
						db.ZRANGE('evaluations:' + blocId, 0, -1)
					])
					let listeCommentaires = []
					if (commentaires) {
						listeCommentaires = commentaires.map(c => {
							return parseJSON(c, null)
						}).filter(c => c !== null)
					}
					bloc.commentaires = listeCommentaires.length
					bloc.listeCommentaires = listeCommentaires
					let listeEvaluations = []
					if (evaluations) {
						listeEvaluations = evaluations.map(e => {
							return parseJSON(e, null)
						}).filter(e => e !== null)
					}
					bloc.evaluations = listeEvaluations.length
					bloc.listeEvaluations = listeEvaluations
					const nomUtilisateur = await recupererNomUtilisateur(bloc.identifiant, nomsUtilisateurs)
					bloc.nom = nomUtilisateur || genererPseudo()
					bloc.info = formaterDate(bloc, langue)
					return bloc
				}))
				donneesBlocs = resultatsBlocs.filter(b => b !== null && Object.keys(b).length > 0)
			}
			let donneesEntrees = []
			if (activite) {
				donneesEntrees = activite.map(entreeStr => parseJSON(entreeStr, null)).filter(e => e !== null)
			}
			const parametres = { pad: donneesPad, blocs: donneesBlocs, activite: donneesEntrees }
			const html = genererHTML(definirDonneesPadExport(donneesPad), definirBlocsExport(donneesBlocs, donneesPad), langue)
			const dossierPad = path.join(__dirname, '..', '/static/temp', id.toString())
			const dossierFichiers = path.join(dossierPad, 'fichiers')
			const dossierStatic = path.join(dossierPad, 'static')
			await fs.mkdirp(dossierFichiers)
			await fs.mkdirp(path.join(dossierStatic, 'css'))
			await fs.mkdirp(path.join(dossierStatic, 'js'))
			await fs.mkdirp(path.join(dossierStatic, 'fonts'))
			await fs.mkdirp(path.join(dossierStatic, 'img'))
			await fs.writeFile(path.join(dossierPad, 'donnees.json'), JSON.stringify(parametres, '', 4), 'utf8')
			await fs.writeFile(path.join(dossierPad, 'index.html'), html, 'utf8')
			const transactionsFichiers = []
			if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
				const fichierFond = path.basename(donneesPad.fond)
				transactionsFichiers.push(() =>
					copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond), cleS3: id + '/' + fichierFond }, path.join(dossierFichiers, fichierFond))
				)
			} else if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && donneesPad.fond.includes('/img/')) {
				transactionsFichiers.push(() =>
					fs.copy(path.join(__dirname, '..', '/public' + donneesPad.fond), path.join(dossierStatic, donneesPad.fond), { overwrite: true }).catch(() => {})
				)
			}
			transactionsFichiers.push(
				() => fs.copy(path.join(__dirname, '..', '/static/export/css'), path.join(dossierStatic, 'css')).catch(() => {}),
				() => fs.copy(path.join(__dirname, '..', '/static/export/js'), path.join(dossierStatic, 'js')).catch(() => {}),
				() => fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.join(dossierStatic, 'fonts/MaterialIcons-Regular.woff2')).catch(() => {}),
				() => fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.join(dossierStatic, 'fonts/Roboto-Slab-Medium.woff2')).catch(() => {}),
				() => fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.join(dossierStatic, 'img/favicon.png')).catch(() => {})
			)
			for (const bloc of parametres.blocs) {
				if (!bloc || Object.keys(bloc).length === 0) continue
				if (bloc.media && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
					transactionsFichiers.push(() =>
						copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media), cleS3: id + '/' + bloc.media }, path.join(dossierFichiers, bloc.media))
					)
				}
				if (bloc.vignette && bloc.vignette !== '' && typeof bloc.vignette === 'string') {
					if (!verifierURL(bloc.vignette, ['https', 'http'])) {
						if (bloc.vignette.includes('/img/')) {
							transactionsFichiers.push(() =>
								fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.join(dossierStatic, bloc.vignette), { overwrite: true }).catch(() => {})
							)
						} else {
							const fichierVignette = path.basename(bloc.vignette)
							transactionsFichiers.push(() =>
								copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette), cleS3: id + '/' + fichierVignette }, path.join(dossierFichiers, fichierVignette))
							)
						}
					}
				}
			}
			// Exécution des transferts de fichiers par lots
			await executerTransactions(transactionsFichiers, (tache) => tache(), tailleLotTransaction)
			// Création de l'archive ZIP
			const archiveId = Math.floor((Math.random() * 100000) + 1)
			const nomArchive = 'pad-' + id + '_' + archiveId + '.zip'
			const cheminArchive = path.join(path.dirname(dossierPad), nomArchive)
			return new Promise((resolve, reject) => {
				const sortie = fs.createWriteStream(cheminArchive)
				const archive = archiver('zip', { zlib: { level: 9 } })
				sortie.on('finish', async () => {
					await fs.remove(dossierPad)
					resolve(nomArchive)
				})
				sortie.on('error', async (err) => {
					try { await fs.remove(dossierPad) } catch {}
					reject(err)
				})
				archive.pipe(sortie)
				archive.directory(dossierPad, false)
				archive.on('error', async (err) => {
					try { await fs.remove(dossierPad) } catch {}
					reject(err)
				})
				archive.finalize()
			})
		} catch (err) {
			console.error(err.stack)
			await fs.remove(path.join(__dirname, '..', '/static/temp', id.toString()))
			return erreur
		}
	}

	async function supprimerPad (pad, identifiant, suppressionFichiers) {
		const [blocs, utilisateurs] = await Promise.all([db.ZRANGE('blocs:' + pad, 0, -1), db.SMEMBERS('utilisateurs-pads:' + pad)])
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
			.UNLINK('pads:' + pad)
			.UNLINK('activite:' + pad)
			.UNLINK('dates-pads:' + pad)
			.SREM('pads-crees:' + identifiant, pad.toString())
			.SREM('pads-supprimes:' + identifiant, pad.toString())
			.exec()
		if (utilisateurs && utilisateurs.length > 0) {
			const pipelineUtilisateurs = db.multi()
			for (const utilisateur of utilisateurs) {
				pipelineUtilisateurs
					.SREM('pads-rejoints:' + utilisateur, pad.toString())
					.SREM('pads-utilisateurs:' + utilisateur, pad.toString())
					.SREM('pads-admins:' + utilisateur, pad.toString())
					.SREM('pads-favoris:' + utilisateur, pad.toString())
			}
			await pipelineUtilisateurs.exec()
		}
		await db.UNLINK('utilisateurs-pads:' + pad)
		// Suppression des fichiers
		if (suppressionFichiers === true && stockage === 'fs') {
			const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
			await fs.remove(dossier)
		} else if (suppressionFichiers === true && stockage === 's3') {
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
		return true
	}

	async function fetchSockets (salon) {
		for (let i = 0; i < 2; i++) {
			try {
				return await io.in(salon).timeout(2000).fetchSockets()
			} catch (err) {
				if (i === 1) console.error('Erreur fetchSockets :', err.message)
			}
		}
		return []
	}

	async function verifierAdmin (pad, donnees, session) {
		if (!pad || !donnees || !donnees.hasOwnProperty('identifiant') || !session.hasOwnProperty('statut')) return false
		if (session.hasOwnProperty('identifiant') && session.statut === 'utilisateur' && session.hasOwnProperty('motdepasse')) {
			const proprietaire = donnees.identifiant
			let listeAdmins = []
			if (donnees.hasOwnProperty('admins')) {
				listeAdmins = JSON.parse(donnees.admins)
			}
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + session.identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return false
			if ((proprietaire === session.identifiant || listeAdmins.includes(session.identifiant)) && comparerHash(session.motdepasse, donneesUtilisateur.motdepasse)) {
				return true
			} else {
				return false
			}
		} else if (session.statut === 'auteur' && session.hasOwnProperty('pads') && session.pads.includes(parseInt(pad, 10))) {
			return true
		} else {
			return false
		}
	}

	async function verifierAccesLecturePad (pad, session) {
		if (!verifierIdentifiantPad(pad)) return false
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		if (!donneesPad.hasOwnProperty('identifiant')) return false
		const admin = await verifierAdmin(pad, donneesPad, session)
		return definirAccesLecture(pad, donneesPad, admin, session)
	}

	async function verifierAdminUtilisateur (pad, identifiant, motdepasse) {
		if (!pad || !identifiant || !motdepasse) return false
		let [donneesPad, donneesUtilisateur] = await Promise.all([db.HGETALL('pads:' + pad), db.HGETALL('utilisateurs:' + identifiant)])
		donneesPad = donneesPad ? { ...donneesPad } : {}
		let listeAdmins = []
		if (donneesPad.hasOwnProperty('admins')) {
			listeAdmins = JSON.parse(donneesPad.admins)
		}
		donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return false
		if ((donneesPad.identifiant === identifiant || listeAdmins.includes(identifiant)) && comparerHash(motdepasse, donneesUtilisateur.motdepasse)) {
			return true
		} else {
			return false
		}
	}

	async function verifierAutorisationApi (donneesPad, identifiant, motdepasse) {
		if (!donneesPad || !motdepasse) return false
		if (donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '') {
			if (donneesPad.identifiant === identifiant) {
				return await bcrypt.compare(motdepasse.trim(), donneesPad.motdepasse)
			}
			return false
		} else if (donneesPad.identifiant === identifiant) {
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 1) {
				let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
				if (donneesUtilisateur && donneesUtilisateur.hasOwnProperty('motdepasse') && donneesUtilisateur.motdepasse.trim() !== '') {
					return await bcrypt.compare(motdepasse, donneesUtilisateur.motdepasse)
				}
			}
		}
		return false
	}

	// Point d'entrée unique pour tous les e-mails transactionnels : valide l'adresse avant l'envoi SMTP
	async function envoyerEmail (message, options = {}) {
		const destinataire = typeof message.to === 'string' ? message.to.trim().toLowerCase() : ''
		if (!options.adresseValidee) {
			if (!verifierFormatEmail(destinataire)) {
				console.error('E-mail non envoyé, adresse mal formée : ' + JSON.stringify(message.to))
				const err = new Error('email_invalide')
				err.code = 'EMAIL_FORMAT_INVALIDE'
				throw err
			}
			const domaine = destinataire.slice(destinataire.lastIndexOf('@') + 1)
			if (!(await verifierDomaineEmail(domaine))) {
				console.error('E-mail non envoyé, domaine inexistant ou sans serveur de messagerie : ' + destinataire)
				const err = new Error('domaine_email_invalide')
				err.code = 'EMAIL_DOMAINE_INVALIDE'
				throw err
			}
		}
		return new Promise((resolve, reject) => {
			transporter.sendMail({ ...message, to: destinataire }, (err, info) => {
				if (err) reject(err)
				else resolve(info)
			})
		})
	}

	function definirVignettePersonnalisee (vignette) {
		if (vignette !== '' && typeof vignette === 'string' && !vignette.includes('/img/') && (!verifierURL(vignette, ['https', 'http']) || (verifierURL(vignette, ['https', 'http']) && vignette.includes(lienPublicS3)))) {
			return true
		} else {
			return false
		}
	}

	function definirParametresTeleverserS3 (cle, buffer) {
		return { Bucket: bucket, Key: cle, Body: buffer, ACL: 'public-read' }
	}

	function definirParametresCopierS3 (cle, source) {
		return { Bucket: bucket, Key: cle, CopySource: source, ACL: 'public-read' }
	}

	function definirParametresSupprimerS3 (cle) {
		return { Bucket: bucket, Key: cle }
	}

	async function telechargerFichierS3 (cle, fichier) {
		try {
			const donnees = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: cle }))
			const writeStream = fs.createWriteStream(fichier)
			await pipeline(donnees.Body, writeStream)
		} catch {
			await fs.remove(fichier)
		}
	}

	async function supprimerFichierSansEchec (pad, fichier) {
		try {
			await supprimerFichier(pad, fichier)
		} catch (err) {
			console.error('Suppression du fichier ' + fichier + ' du pad ' + pad + ' : ' + err.stack)
		}
	}

	async function supprimerFichier (pad, fichier) {
		if (!fichier || typeof fichier !== 'string' || fichier === '' || /[/\\]/.test(fichier) || fichier.includes('..')) return
		if (stockage === 'fs') {
			const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + fichier)
			await fs.remove(chemin)
		} else if (stockage === 's3') {
			await s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(pad + '/' + fichier)))
		}
	}

	const dureeVerrouColonnes = 2000

	const scriptProlongerVerrou = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("pexpire", KEYS[1], ARGV[2]) else return 0 end'

	const scriptLibererVerrou = 'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end'

	async function acquerirVerrouColonnes (pad) {
		const cle = 'verrou-colonnes:' + pad
		const jeton = randomBytes(16).toString('hex')
		for (let tentative = 0; tentative < 40; tentative++) {
			const verrouAcquis = await db.SET(cle, jeton, { NX: true, PX: dureeVerrouColonnes })
			if (verrouAcquis) {
				const minuteur = setInterval(() => {
					db.EVAL(scriptProlongerVerrou, { keys: [cle], arguments: [jeton, String(dureeVerrouColonnes)] }).catch(() => {})
				}, Math.round(dureeVerrouColonnes / 2))
				minuteur.unref()
				return { jeton, minuteur }
			}
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		return null
	}

	async function libererVerrouColonnes (pad, verrou) {
		if (!verrou) return
		clearInterval(verrou.minuteur)
		try {
			await db.EVAL(scriptLibererVerrou, { keys: ['verrou-colonnes:' + pad], arguments: [verrou.jeton] })
		} catch (err) {
			console.error(err.stack)
		}
	}

	async function supprimerBlocs (pad, blocsASupprimer) {
		const resultats = await executerTransactions(blocsASupprimer, async (blocSupprime) => {
			const blocId = blocSupprime.bloc
			try {
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== blocId) return blocId // Bloc déjà supprimé ou inexistant : rien à faire, pas un échec
				if (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
					await supprimerFichierSansEchec(pad, donneesBloc.media)
				}
				if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
					await supprimerFichierSansEchec(pad, path.basename(donneesBloc.vignette))
				}
				await supprimerEtherpad([donneesBloc.iframe, donneesBloc.media])
				await db.multi()
					.UNLINK('pad-' + pad + ':' + blocId)
					.ZREM('blocs:' + pad, blocId)
					.UNLINK('commentaires:' + blocId)
					.UNLINK('commentaires-masques:' + blocId)
					.UNLINK('evaluations:' + blocId)
					.exec()
				return blocId
			} catch (err) {
				console.error('Suppression bloc ' + blocId + ' : ' + err.stack)
				return null
			}
		}, tailleLotTransaction)
		// Blocs traités (supprimés ou déjà absents), les échecs sont écartés
		return resultats.filter(blocId => blocId !== null)
	}

	async function televerserFichierArchive (dossierTemporaire, dossierDestination, nomFichier, pad) {
		if (!nomFichier || nomFichier === '') return
		const cheminSource = path.normalize(dossierTemporaire + '/fichiers/' + nomFichier)
		if (!await fs.pathExists(cheminSource)) return
		if (stockage === 'fs') {
			await fs.copy(cheminSource, path.normalize(dossierDestination + '/' + nomFichier), { overwrite: true })
		} else if (stockage === 's3') {
			const buffer = await fs.readFile(cheminSource)
			await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3(pad + '/' + nomFichier, buffer)))
		}
	}

	async function televerserFichierTemp (nomFichier, pad) {
		if (!nomFichier || nomFichier === '') return
		if (stockage === 'fs') {
			const source = path.join(__dirname, '..', '/static/temp/' + nomFichier)
			const destination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + nomFichier)
			if (await fs.pathExists(source)) {
				await fs.copy(source, destination)
				await fs.remove(source)
			}
		} else if (stockage === 's3') {
			try {
				const meta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'temp/' + nomFichier }))
				if (meta.hasOwnProperty('ContentLength')) {
					await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(pad + '/' + nomFichier, '/' + bucket + '/temp/' + nomFichier)))
					await s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3('temp/' + nomFichier)))
				}
			} catch {}
		}
	}

	async function copierFichier (padOrigine, pad, nomFichier, typeFichier) {
		if (!nomFichier || nomFichier === '') return
		if (typeFichier === 'vignette') {
			if (String(nomFichier).includes('/img/') || verifierURL(nomFichier, ['https', 'http'])) return
		}
		if (!verifierIdentifiantPad(padOrigine) || !verifierIdentifiantPad(pad)) return
		if (typeof nomFichier !== 'string' || /[/\\]/.test(nomFichier) || nomFichier.includes('..')) return
		if (stockage === 'fs') {
			const source = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padOrigine + '/' + nomFichier)
			const destination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + nomFichier)
			if (await fs.pathExists(source)) {
				await fs.copy(source, destination)
			}
		} else if (stockage === 's3') {
			try {
				const cleSource = padOrigine + '/' + nomFichier
				const cleDestination = pad + '/' + nomFichier
				const meta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: cleSource }))
				if (meta.hasOwnProperty('ContentLength')) {
					await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(cleDestination, '/' + bucket + '/' + cleSource)))
				}
			} catch {}
		}
	}

	async function verifierEspaceDisque (emplacement = 'fichiers') {
		if (emplacement !== 'temp' && stockage !== 'fs') return true
		const dossier = (emplacement === 'temp') ? path.join(__dirname, '..', '/static/temp') : path.join(__dirname, '..', '/static' + definirCheminFichiers())
		const espaceDisque = await checkDiskSpace(dossier)
		const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
		return pourcentageLibre >= minimumEspaceDisque
	}

	async function dupliquerFichier (pad, nomFichier) {
		if (!nomFichier || typeof nomFichier !== 'string' || nomFichier === '' || /[/\\]/.test(nomFichier) || nomFichier.includes('..')) return nomFichier
		const nouveauNom = definirNomFichier(nomFichier)
		if (stockage === 'fs') {
			const source = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + nomFichier)
			const destination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + nouveauNom)
			if (!await fs.pathExists(source)) return ''
			try {
				await fs.copy(source, destination)
				return nouveauNom
			} catch {
				return null
			}
		} else if (stockage === 's3') {
			try {
				const cleSource = pad + '/' + nomFichier
				const meta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: cleSource }))
				if (!meta.hasOwnProperty('ContentLength')) return ''
				await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(pad + '/' + nouveauNom, '/' + bucket + '/' + cleSource)))
				return nouveauNom
			} catch (err) {
				if (err && (err.name === 'NotFound' || err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404))) return ''
				return null
			}
		}
		return nomFichier
	}

	async function annulerDupliquerBloc (pad, contenus) {
		for (const contenu of contenus) {
			if (!contenu) continue
			if (Array.isArray(contenu.fichiersCrees) && contenu.fichiersCrees.length > 0) {
				await Promise.all(contenu.fichiersCrees.map((fichier) => supprimerFichier(pad, fichier).catch(() => {})))
			}
			if (contenu.padCree && etherpad && etherpadApi) {
				await axios.get(etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + contenu.padCree, { timeout: 5000 }).catch(() => {})
			}
		}
	}

	function extraireIdentifiantEtherpad (url) {
		if (!etherpad || etherpad === '' || !url || typeof url !== 'string') return ''
		for (const domaine of [etherpad, ancienDomaineEtherpad]) {
			if (!domaine || domaine === '') continue
			const prefixe = domaine + '/p/'
			if (!url.startsWith(prefixe)) continue
			const etherpadId = url.slice(prefixe.length).split(/[?#]/)[0]
			if (/^[\w-]+$/.test(etherpadId)) return etherpadId
		}
		return ''
	}

	async function supprimerEtherpadBlocs (pad, blocIds) {
		if (!etherpad || etherpad === '' || !etherpadApi || etherpadApi === '' || !Array.isArray(blocIds) || blocIds.length === 0) return
		const urls = await executerTransactions(blocIds, async (blocId) => {
			try {
				const champs = await db.HMGET('pad-' + pad + ':' + blocId, ['iframe', 'media'])
				return Array.isArray(champs) ? champs : []
			} catch (err) {
				console.error('Lecture bloc ' + blocId + ' pour suppression Etherpad : ' + err.stack)
				return []
			}
		}, tailleLotTransaction)
		await supprimerEtherpad(urls.flat())
	}

	async function supprimerEtherpad (urls) {
		if (!etherpad || etherpad === '' || !etherpadApi || etherpadApi === '') return
		const identifiants = [...new Set(urls.map((url) => extraireIdentifiantEtherpad(url)).filter((etherpadId) => etherpadId !== ''))]
		for (const etherpadId of identifiants) {
			try {
				const reponse = await axios.get(etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId, { timeout: 5000 })
				const code = (reponse && reponse.data && reponse.data.hasOwnProperty('code')) ? parseInt(reponse.data.code, 10) : 0
				if (code !== 0 && reponse.data.message !== 'padID does not exist') {
					console.error('Suppression Etherpad ' + etherpadId + ' : ' + reponse.data.message)
				}
			} catch (err) {
				console.error('Suppression Etherpad ' + etherpadId + ' : ' + err.message)
			}
		}
	}

	async function dupliquerEtherpad (pad, etherpadId) {
		if (!etherpadApi || etherpadApi === '') return { statut: 'echec' }
		const destinationId = 'pad-' + pad + '-' + randomBytes(8).toString('hex')
		const urlCopie = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
		try {
			const reponse = await axios.get(urlCopie, { timeout: 5000 })
			const code = (reponse && reponse.data && reponse.data.hasOwnProperty('code')) ? parseInt(reponse.data.code, 10) : 0
			if (code === 0) return { statut: 'copie', destinationId }
			return { statut: 'echec' }
		} catch {
			return { statut: 'echec' }
		}
	}

	async function dupliquerBloc (pad, donneesBloc, contenusANettoyer) {
		const type = donneesBloc.type || ''
		const contenu = { texte: donneesBloc.texte || '', media: donneesBloc.media || '', alt: donneesBloc.alt || '', iframe: donneesBloc.iframe || '', vignette: donneesBloc.vignette || '', echec: false, fichiersCrees: [], padCree: '' }
		contenusANettoyer.push(contenu)
		const dupliquerFichierSuivi = async (nomFichier) => {
			const nouveauNom = await dupliquerFichier(pad, nomFichier)
			if (nouveauNom === null) {
				contenu.echec = true
				return nomFichier
			}
			if (nouveauNom !== '' && nouveauNom !== nomFichier) {
				contenu.fichiersCrees.push(nouveauNom)
			}
			return nouveauNom
		}
		const etherpadIdSource = extraireIdentifiantEtherpad(contenu.iframe)
		if (etherpadIdSource !== '') {
			const copie = await dupliquerEtherpad(pad, etherpadIdSource)
			if (copie.statut === 'copie') {
				contenu.padCree = copie.destinationId
				contenu.iframe = etherpad + '/p/' + copie.destinationId
				contenu.media = etherpad + '/p/' + copie.destinationId
			} else {
				contenu.iframe = ''
				contenu.media = ''
			}
		} else if (contenu.media !== '' && type !== 'embed' && type !== 'lien') {
			contenu.media = await dupliquerFichierSuivi(contenu.media)
		}
		if (definirVignettePersonnalisee(contenu.vignette) === true) {
			contenu.vignette = await dupliquerFichierSuivi(path.basename(contenu.vignette))
		}
		return contenu
	}

	async function definirScoreDuplication (pad, blocOrigine, scoreDefaut) {
		const rang = await db.ZRANK('blocs:' + pad, blocOrigine)
		if (rang === null || rang === undefined) return scoreDefaut
		const entrees = await db.ZRANGE_WITHSCORES('blocs:' + pad, rang, rang + 1)
		if (!Array.isArray(entrees) || entrees.length === 0) return scoreDefaut
		const scoreOrigine = Number(entrees[0].score)
		if (!Number.isFinite(scoreOrigine)) return scoreDefaut
		if (entrees.length === 1) return Math.max(scoreDefaut, scoreOrigine + 1)
		const scoreSuivant = Number(entrees[1].score)
		if (!Number.isFinite(scoreSuivant) || scoreSuivant <= scoreOrigine) return scoreDefaut
		const score = (scoreOrigine + scoreSuivant) / 2
		if (score <= scoreOrigine || score >= scoreSuivant) return scoreDefaut
		return score
	}

	async function definirScoreMaximum (pad) {
		const entrees = await db.ZRANGE_WITHSCORES('blocs:' + pad, -1, -1)
		if (!Array.isArray(entrees) || entrees.length === 0) return 0
		const score = Number(entrees[0].score)
		return Number.isFinite(score) ? score : 0
	}

	async function copierFichierExport (sourceInfo, destination) {
		try {
			if (stockage === 'fs') {
				const fichierExiste = await fs.pathExists(sourceInfo.chemin)
				if (fichierExiste) {
					await fs.copy(sourceInfo.chemin, destination, { overwrite: true })
					return true
				}
			} else if (stockage === 's3') {
				try {
					const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: sourceInfo.cleS3 }))
					if (fichierMeta && fichierMeta.hasOwnProperty('ContentLength')) {
						await telechargerFichierS3(sourceInfo.cleS3, destination)
						return true
					}
				} catch {}
			}
		} catch (err) {
			console.error(err.stack)
		}
		return false
	}

	function verifierHoteBloque (hote) {
		let h = hote.toLowerCase().trim()
		if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
		const bloques = ['0.0.0.0', '::', '::1', '::ffff:127.0.0.1', '0:0:0:0:0:0:0:1', '169.254.169.254']
		if (production) {
			bloques.push('localhost', '127.0.0.1')
		}
		if (bloques.includes(h)) return true
		// Plages IPv4 privées
		if (/^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true
		// IPv4-mapped IPv6 vers plages privées, notation décimale pointée (::ffff:10.x, ::ffff:127.x, ::ffff:169.254.x, ::ffff:192.168.x, ::ffff:172.16-31.x)
		if (/^::ffff:(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)) return true
		// IPv4-mapped IPv6 vers plages privées, notation hexadécimale compressée (ex : ::ffff:7f00:1 pour 127.0.0.1)
		const correspondanceHex = h.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/)
		if (correspondanceHex) {
			const valeur = (parseInt(correspondanceHex[1], 16) << 16) + parseInt(correspondanceHex[2], 16)
			const octet1 = (valeur >>> 24) & 0xff
			const octet2 = (valeur >>> 16) & 0xff
			if (octet1 === 127 || octet1 === 10 || octet1 === 169 && octet2 === 254 || octet1 === 192 && octet2 === 168 || (octet1 === 172 && octet2 >= 16 && octet2 <= 31)) return true
		}
		// IPv6 link-local (fe80::/10) et unique-local (fc00::/7)
		if (/^(fe[89ab][0-9a-f]|f[cd][0-9a-f]{2}):/i.test(h)) return true
		return false
	}

	function definirMaintenance (valeur, propager) {
		etat.maintenance = valeur === true
		io.local.to(salonMaintenance).emit('verifiermaintenance', etat.maintenance)
		if (propager !== true || cluster !== true) return
		try {
			io.serverSideEmit('maintenance', etat.maintenance)
		} catch (err) {
			console.error('Propagation de la maintenance impossible : ' + err.message)
		}
	}

	return {
		enregistrerTentativeConnexion,
		reinitialiserEchecsConnexion,
		creerPad,
		creerPadSansCompte,
		ajouterPadDansDb,
		recupererDonneesUtilisateur,
		recupererDonneesAuteur,
		recupererDonneesPad,
		recupererDonneesPadProtege,
		recupererNomUtilisateur,
		chargerNomUtilisateur,
		diffuserAdmin,
		diffuserBloc,
		diffuserBlocsDeplaces,
		recupererCommentairesMasques,
		diffuserCommentaires,
		recupererDonneesBlocs,
		recupererDonneesPadJSON,
		verifierAcces,
		exporterPad,
		supprimerPad,
		fetchSockets,
		verifierAdmin,
		verifierAccesLecturePad,
		verifierAdminUtilisateur,
		verifierAutorisationApi,
		envoyerEmail,
		definirVignettePersonnalisee,
		definirParametresTeleverserS3,
		definirParametresCopierS3,
		definirParametresSupprimerS3,
		telechargerFichierS3,
		supprimerFichierSansEchec,
		supprimerFichier,
		acquerirVerrouColonnes,
		libererVerrouColonnes,
		supprimerBlocs,
		televerserFichierArchive,
		televerserFichierTemp,
		copierFichier,
		verifierEspaceDisque,
		dupliquerFichier,
		annulerDupliquerBloc,
		extraireIdentifiantEtherpad,
		supprimerEtherpadBlocs,
		supprimerEtherpad,
		dupliquerEtherpad,
		dupliquerBloc,
		definirScoreDuplication,
		definirScoreMaximum,
		copierFichierExport,
		verifierHoteBloque,
		definirMaintenance
	}
}
