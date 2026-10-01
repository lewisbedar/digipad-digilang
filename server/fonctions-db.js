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
import { CopyObjectCommand, PutObjectCommand, PutObjectAclCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import genererHTML from './generer-html.js'
import { etat } from './etat.js'
import {
	assainirTexteAlternatif,
	assainirEtiquettes,
	comparerHash,
	definirAccesLecture,
	definirBlocsDeplaces,
	definirBlocsExport,
	definirFichiersExport,
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
	definirColonneBloc,
	definirAdministrateursPad,
	verifierAdministrateurListe,
	normaliserAffichageColonnes,
	normaliserTitresColonnes,
	reduireColonnesMasquees,
	creerFiltreActiviteColonnes,
	creerFiltreColonneMasquee,
	verifierColonneMasquee,
	verifierDomaineEmail,
	verifierFormatEmail,
	verifierIdentifiantBlocExistant,
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
	limiteEchecsCodeAdresse,
	limiteEchecsMotDePasseAdresse,
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
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'etiquettes', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0, ...definirParametresModeration()])
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
		return { id, token, titre, identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', etiquettes: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [], vues: 0, ...definirModeration() }
	}

	async function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		let digidrive = 0
		if (type === 'api') {
			digidrive = 1
		}
		await db.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'etiquettes', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'vues', 0, 'digidrive', digidrive, ...definirParametresModeration()])
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
			const donneesBloc = ['id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'alt', assainirTexteAlternatif(bloc.alt), 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'etiquettes', JSON.stringify(assainirEtiquettes(bloc.etiquettes)), 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite]
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
		const etiquettes = donnees.pad.etiquettes ?? 'desactivees'
		const vues = donnees.pad.vues ?? 0
		const digidrive = donnees.pad.digidrive ?? 0
		// Correction bug update 0.9.0 : admins corrompus
		let admins
		if (donnees.pad.hasOwnProperty('admins') && donnees.pad.admins.substring(0, 2) !== '"\\') {
			admins = donnees.pad.admins
		} else {
			admins = JSON.stringify([])
		}
		const colonnesImportees = JSON.stringify(normaliserTitresColonnes(parseJSON(donnees.pad.colonnes, [])))
		const affichageColonnes = JSON.stringify(normaliserAffichageColonnes(parseJSON(donnees.pad.colonnes, []), parseJSON(donnees.pad.affichageColonnes, null)))
		const champsPad = ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'etiquettes', etiquettes, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', colonnesImportees, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'activiteColonne', 0, 'vues', vues, 'digidrive', digidrive, ...definirParametresModeration(donnees.pad)]
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

	async function recupererDonneesUtilisateur (identifiant, session = null) {
		const nomsUtilisateurs = new Map()
		const fondsAResoudre = []
		const recupererDonnees = async (cleRedis, masquerPrives = false) => {
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
				const admin = verifierAdministrateurListe(identifiant, donneesPad)
				if (masquerPrives && donneesPad.acces === 'prive' && !admin) return null
				donneesPad.fondUrl = ''
				if (definirAccesLecture(padId, donneesPad, admin, session)) {
					fondsAResoudre.push({ padId, donneesPad })
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
			recupererDonnees('pads-rejoints:' + identifiant, true),
			recupererDonnees('pads-admins:' + identifiant),
			recupererDonnees('pads-favoris:' + identifiant, true)
		])
		await resoudreFonds(fondsAResoudre)
		return [padsCrees, padsSupprimes, padsRejoints, padsAdmins, padsFavoris]
	}

	async function resoudreFonds (entrees, options = {}) {
		if (!Array.isArray(entrees) || entrees.length === 0) return
		const cles = entrees.map((entree) => definirCleFond(entree.padId, entree.donneesPad.fond, entree.donneesPad.acces))
		const urls = await prechargerUrlsCles(cles, options)
		await Promise.all(entrees.map(async (entree, index) => {
			if (cles[index] !== '' && !urls.has(cles[index])) {
				entree.donneesPad.fondUrl = ''
				return
			}
			entree.donneesPad.fondUrl = await definirUrlFond(entree.padId, entree.donneesPad.fond, entree.donneesPad.acces, { ...options, urls }).catch(() => '')
		}))
	}

	async function recupererDonneesAuteur (identifiant) {
		const recupererDonnees = async (cleRedis) => {
			const pads = await db.SMEMBERS(cleRedis)
			if (!pads || pads.length === 0) return []
			const donneesPads = await Promise.all(pads.map(async (pad) => {
				const padExiste = await db.EXISTS('pads:' + pad)
				let donneesPad
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

	async function recupererDonneesPad (id, token, identifiant, statut, pads, donneesPad = null) {
		const nomsUtilisateurs = new Map()
		const commentairesMasquesParBloc = new Map()
		let pad = donneesPad || await db.HGETALL('pads:' + id)
		pad = pad ? { ...pad } : {}
		if (!pad.id || pad.id !== id || !pad.token || pad.token !== token) return 'erreur'
		const administrateurs = definirAdministrateursPad(pad)
		try {
			pad.admins = administrateurs.filter((admin) => admin !== pad.identifiant)
			pad.colonnes = JSON.parse(pad.colonnes)
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
		} catch {
			return 'erreur'
		}
		const notificationEnregistree = Array.isArray(pad.notification) ? pad.notification : []
		const nombreColonnes = pad.colonnes.length
		const admin = (statut === 'utilisateur' && administrateurs.includes(identifiant)) || (statut === 'auteur' && pads && pads.includes(parseInt(id, 10)))
		const accesCode = pad.hasOwnProperty('code') && pad.acces === 'code'
		const accesPrive = pad.acces === 'prive'
		const accesLecture = admin || (!accesCode && !accesPrive)
		// Valeurs par défaut et compatibilité
		if (!pad.hasOwnProperty('digidrive')) pad.digidrive = 0
		if (!pad.hasOwnProperty('fondRepete')) pad.fondRepete = 'desactive'
		if (!pad.hasOwnProperty('etiquettes')) pad.etiquettes = 'desactivees'
		if (!pad.hasOwnProperty('ordre')) pad.ordre = 'croissant'
		if (!pad.hasOwnProperty('largeur')) pad.largeur = 'normale'
		if (!pad.hasOwnProperty('enregistrements')) pad.enregistrements = 'desactives'
		if (!pad.hasOwnProperty('visionneuse')) pad.visionneuse = 'viewer'
		if (pad.transfertPropriete === 'active' && (Number(pad.transfertProprieteExpire) || 0) <= Date.now()) {
			pad.transfertPropriete = 'desactive'
		}
		pad.affichageColonnes = normaliserAffichageColonnes(pad.colonnes, pad.affichageColonnes)
		if (pad.hasOwnProperty('fond') && typeof pad.fond === 'string' && pad.fond !== '' && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#') {
			pad.fond = path.basename(pad.fond)
		}
		pad.fondUrl = accesLecture ? await definirUrlFond(id, pad.fond, pad.acces) : ''
		// Masquage des données sensibles
		if (pad.hasOwnProperty('motdepasse')) pad.motdepasse = ''
		const activiteColonneLisible = admin ? () => true : creerFiltreActiviteColonnes(pad.colonnes, pad.affichageColonnes)
		const filtreColonneMasquee = creerFiltreColonneMasquee(pad, pad.affichageColonnes)
		if (!admin) {
			if (pad.hasOwnProperty('code')) pad.code = ''
			if (accesCode || accesPrive) {
				pad.colonnes = []
				pad.affichageColonnes = []
			}
			pad.admins = []
			pad.notification = []
			pad.colonnes = reduireColonnesMasquees(pad.colonnes, pad.affichageColonnes)
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
					bloc.colonne = definirColonneBloc(bloc.colonne, nombreColonnes)
					const colonneMasquee = filtreColonneMasquee(bloc.colonne)
					if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
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
					bloc.etiquettes = (pad.etiquettes === 'activees') ? parseJSON(bloc.etiquettes, []) : []
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
				await appliquerUrlsFichiers(id, donneesBlocs, pad.acces, { differerMedia: true })
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
					if (colonne && !activiteColonneLisible(e)) return false
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
		if (notificationEnregistree.includes(identifiant)) {
			notificationEnregistree.splice(notificationEnregistree.indexOf(identifiant), 1)
			multi.HSET('pads:' + id, 'notification', JSON.stringify(notificationEnregistree))
		}
		await multi.exec()
		return { pad, blocs: donneesBlocs, activite: donneesEntrees }
	}

	async function recupererDonneesPadProtege (pad, id, identifiant, admin) {
		const nomsUtilisateurs = new Map()
		const commentairesMasquesParBloc = new Map()
		try {
			pad.admins = definirAdministrateursPad(pad).filter((el) => el !== pad.identifiant)
			pad.colonnes = JSON.parse(pad.colonnes)
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
		} catch {
			return 'erreur'
		}
		const notificationEnregistree = Array.isArray(pad.notification) ? pad.notification : []
		const nombreColonnes = pad.colonnes.length
		pad.affichageColonnes = normaliserAffichageColonnes(pad.colonnes, pad.affichageColonnes)
		// Valeurs par défaut et compatibilité
		if (!pad.hasOwnProperty('digidrive')) pad.digidrive = 0
		if (!pad.hasOwnProperty('fondRepete')) pad.fondRepete = 'desactive'
		if (!pad.hasOwnProperty('etiquettes')) pad.etiquettes = 'desactivees'
		if (!pad.hasOwnProperty('ordre')) pad.ordre = 'croissant'
		if (!pad.hasOwnProperty('largeur')) pad.largeur = 'normale'
		if (!pad.hasOwnProperty('enregistrements')) pad.enregistrements = 'desactives'
		if (!pad.hasOwnProperty('visionneuse')) pad.visionneuse = 'viewer'
		if (pad.hasOwnProperty('fond') && typeof pad.fond === 'string' && pad.fond !== '' && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#') {
			pad.fond = path.basename(pad.fond)
		}
		pad.fondUrl = await definirUrlFond(id, pad.fond, pad.acces)
		// Masquage des données sensibles
		if (pad.hasOwnProperty('motdepasse')) pad.motdepasse = ''
		if (!admin && pad.hasOwnProperty('code')) pad.code = ''
		const activiteColonneLisible = admin ? () => true : creerFiltreActiviteColonnes(pad.colonnes, pad.affichageColonnes)
		const filtreColonneMasquee = creerFiltreColonneMasquee(pad, pad.affichageColonnes)
		if (!admin) {
			pad.colonnes = reduireColonnesMasquees(pad.colonnes, pad.affichageColonnes)
			pad.admins = []
			pad.notification = []
		}
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
				bloc.colonne = definirColonneBloc(bloc.colonne, nombreColonnes)
				const colonneMasquee = filtreColonneMasquee(bloc.colonne)
				if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
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
				bloc.etiquettes = (pad.etiquettes === 'activees') ? parseJSON(bloc.etiquettes, []) : []
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
			await appliquerUrlsFichiers(id, donneesBlocs, pad.acces, { differerMedia: true })
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
				if (colonne && !activiteColonneLisible(e)) return false
				const blocVisible = e.hasOwnProperty('bloc') && listeBlocsValides.includes(e.bloc)
				return colonne || blocVisible
			})
		}
		donneesEntrees.reverse()
		// Vérifier notification mise à jour pad
		if (notificationEnregistree.includes(identifiant)) {
			notificationEnregistree.splice(notificationEnregistree.indexOf(identifiant), 1)
			await db.HSET('pads:' + id, 'notification', JSON.stringify(notificationEnregistree))
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

	function diffuserAdmin (pad, evenement, donneesCompletes, donneesReduites, options = {}) {
		const { identifiantAuteur = null, identifiantCapsule = null, diffusionRestreinte = false } = options
		const salonAdmin = definirSalonAdmin(pad)
		io.to(salonAdmin).emit(evenement, donneesCompletes)
		const exclusions = [salonAdmin]
		if (donneesReduites !== null) {
			const identifiantsConcernes = new Set()
			if (identifiantAuteur) identifiantsConcernes.add(identifiantAuteur)
			if (diffusionRestreinte && identifiantCapsule) identifiantsConcernes.add(identifiantCapsule)
			identifiantsConcernes.forEach((identifiantConcerne) => {
				const salonConcerne = definirSalonUtilisateur(pad, identifiantConcerne)
				io.to(salonConcerne).except(salonAdmin).emit(evenement, donneesReduites)
				exclusions.push(salonConcerne)
			})
		}
		if (diffusionRestreinte) return
		if (donneesReduites !== null) {
			io.to('pad-' + pad).except(exclusions).emit(evenement, donneesReduites)
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

	function diffuserBlocsDeplaces (pad, listeItems, blocs, donneesPad, identifiantAdmin) {
		const salonAdmin = definirSalonAdmin(pad)
		const salonPad = 'pad-' + pad
		io.to(salonAdmin).emit('deplacerbloc', { blocs: listeItems, identifiant: identifiantAdmin })
		const blocsDeplaces = definirBlocsDeplaces(listeItems, blocs, donneesPad, null)
		if (blocsDeplaces.length === listeItems.length) {
			return io.to(salonPad).except(salonAdmin).emit('deplacerbloc', { blocs: blocsDeplaces, identifiant: identifiantAdmin })
		}
		// Auteurs des capsules retirées de la liste générale : masquées, privées ou en colonne masquée
		const blocsDiffuses = new Set(blocsDeplaces.map((item) => item.bloc))
		const auteurs = new Set(blocs.filter((bloc, index) => bloc && bloc.identifiant && !blocsDiffuses.has(listeItems[index].bloc)).map((bloc) => bloc.identifiant))
		const exclusions = [salonAdmin]
		auteurs.forEach((auteur) => {
			const salonAuteur = definirSalonUtilisateur(pad, auteur)
			io.to(salonAuteur).except(salonAdmin).emit('deplacerbloc', { blocs: definirBlocsDeplaces(listeItems, blocs, donneesPad, auteur), identifiant: identifiantAdmin })
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

	function diffuserCommentaires (pad, evenement, donneesCommunes, commentairesMasques, identifiantAuteur, donneesAdmin, commentairesVisibles = true, donneesAuteur = null, diffusionRestreinte = false, identifiantCapsule = null) {
		const salonAdmin = definirSalonAdmin(pad)
		const salonPad = 'pad-' + pad
		const commentairesAdmin = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, true, null)
		const commentaires = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, false, null, commentairesVisibles)
		if (!diffusionRestreinte && commentairesVisibles === true && !donneesAdmin && commentairesMasques.identifiantsMasques.length === 0) {
			return io.to(salonPad).emit(evenement, { ...donneesCommunes, ...commentairesAdmin })
		}
		io.to(salonAdmin).emit(evenement, { ...(donneesAdmin || donneesCommunes), ...commentairesAdmin })
		const donneesReduites = commentairesVisibles ? donneesCommunes : { id: donneesCommunes.id, bloc: donneesCommunes.bloc }
		const identifiantsConcernes = new Set(commentairesMasques.identifiantsMasques.map(extraireIdentifiantMasque))
		if (identifiantAuteur) {
			identifiantsConcernes.add(identifiantAuteur)
		}
		if (diffusionRestreinte && identifiantCapsule) {
			identifiantsConcernes.add(identifiantCapsule)
		}
		const exclusions = [salonAdmin]
		identifiantsConcernes.forEach((identifiantConcerne) => {
			const salonUtilisateur = definirSalonUtilisateur(pad, identifiantConcerne)
			const commentairesUtilisateur = recupererNombreCommentaires(commentairesMasques.totalCommentaires, commentairesMasques.identifiantsMasques, false, identifiantConcerne, commentairesVisibles)
			const donneesUtilisateur = (donneesAuteur && identifiantConcerne === identifiantAuteur) ? donneesAuteur : donneesReduites
			io.to(salonUtilisateur).except(salonAdmin).emit(evenement, { ...donneesUtilisateur, ...commentairesUtilisateur })
			exclusions.push(salonUtilisateur)
		})
		if (diffusionRestreinte) return
		io.to(salonPad).except(exclusions).emit(evenement, { ...donneesReduites, ...commentaires })
	}

	async function recupererDonneesBlocs (id, token, identifiant, statut, pads) {
		let pad = await db.HGETALL('pads:' + id)
		pad = pad ? { ...pad } : {}
		if (!pad.id || pad.id !== id || !pad.token || pad.token !== token) return 'erreur'
		const administrateurs = definirAdministrateursPad(pad)
		pad.admins = administrateurs.filter((admin) => admin !== pad.identifiant)
		const admin = (statut === 'utilisateur' && administrateurs.includes(identifiant)) || (statut === 'auteur' && pads && pads.includes(parseInt(id, 10)))
		const accesCode = pad.hasOwnProperty('code') && pad.acces === 'code'
		const accesPrive = pad.acces === 'prive'
		const accesLecture = admin || (!accesCode && !accesPrive)
		const affichageColonnes = normaliserAffichageColonnes(pad.colonnes, pad.affichageColonnes)
		const filtreColonneMasquee = creerFiltreColonneMasquee(pad, affichageColonnes)
		const nombreColonnes = parseJSON(pad.colonnes, []).length
		let donneesBlocs = []
		const nomsUtilisateurs = new Map()
		if (accesLecture) {
			const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
			if (listeBlocs && listeBlocs.length > 0) {
				const resultatsBlocs = await Promise.all(listeBlocs.map(async (blocId) => {
					let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
					if (!bloc || Object.keys(bloc).length === 0) return null
					bloc = { ...bloc }
					const blocVisible = !((pad.contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
					const colonneMasquee = filtreColonneMasquee(definirColonneBloc(bloc.colonne, nombreColonnes))
					if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant && !admin) return null
					if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
						bloc.vignette = path.basename(bloc.vignette)
					}
					if (!bloc.hasOwnProperty('visibilite')) bloc.visibilite = 'visible'
					bloc.nom = await recupererNomUtilisateur(bloc.identifiant, nomsUtilisateurs)
					bloc.medias = parseJSON(bloc.medias, [])
					if (!Array.isArray(bloc.medias)) bloc.medias = []
					// Fonction uniquement pour le flux RSS (pas de vignettes pour pad en accès protégé ou privé)
					if (pad.acces === 'public') await ajouterUrlsFichiers(id, bloc, pad.acces)
					return bloc
				}))
				donneesBlocs = resultatsBlocs.filter(b => b !== null)
			}
		}
		return { blocs: donneesBlocs, admin, accesLecture }
	}

	async function recupererDonneesPadJSON (pad) {
		if (!verifierIdentifiantPad(pad)) return {}
		const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
		if (typeof donneesPad !== 'object' || !donneesPad || !donneesPad.hasOwnProperty('pad') || !donneesPad.hasOwnProperty('blocs') || !donneesPad.hasOwnProperty('activite')) return {}
		await ajouterPadDansDb(pad, donneesPad)
		return donneesPad.pad
	}

	// Accès par ticket Digidrive
	async function verifierAccesTicket (pad, identifiant) {
		const reponseErreur = { acces: 'erreur', utilisateur: {} }
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		if (!donneesPad.identifiant) return reponseErreur
		if (identifiant !== donneesPad.identifiant) return reponseErreur
		let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
		donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		if (!donneesUtilisateur.hasOwnProperty('id') || !donneesUtilisateur.hasOwnProperty('nom') || !donneesUtilisateur.hasOwnProperty('langue')) return reponseErreur
		const digidrive = parseInt(donneesPad.digidrive, 10) || 0
		if (digidrive === 0) {
			await db.HSET('pads:' + pad, 'digidrive', 1).catch(() => {})
		}
		return { acces: 'pad_debloque', utilisateur: donneesUtilisateur }
	}

	async function exporterPad (id, erreur, langue, format = 'archive') {
		if (!langues.includes(langue)) {
			langue = langueParDefaut
		}
		if (format !== 'web') format = 'archive'
		const dossierPad = path.join(__dirname, '..', '/static/temp', 'export-' + id + '_' + randomBytes(16).toString('hex'))
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
					bloc.etiquettes = parseJSON(bloc.etiquettes, [])
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
			const dossierFichiers = path.join(dossierPad, 'fichiers')
			await fs.mkdirp(dossierFichiers)
			const transactionsFichiers = []
			const copierFichierPad = (fichier) => {
				transactionsFichiers.push(() =>
					copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichier), cleS3: id + '/' + fichier }, path.join(dossierFichiers, fichier))
				)
			}
			if (typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
				copierFichierPad(path.basename(donneesPad.fond))
			}
			let fichiersBlocs
			if (format === 'archive') {
				const padExport = { ...donneesPad }
				if (padExport.hasOwnProperty('motdepasse')) padExport.motdepasse = ''
				if (padExport.hasOwnProperty('motdepasseAdmin')) padExport.motdepasseAdmin = ''
				if (padExport.hasOwnProperty('code')) padExport.code = ''
				const parametres = { pad: padExport, blocs: donneesBlocs, activite: donneesEntrees }
				await fs.writeFile(path.join(dossierPad, 'donnees.json'), JSON.stringify(parametres, '', 4), 'utf8')
				fichiersBlocs = definirFichiersExport(donneesBlocs)
			} else {
				const blocsExport = definirBlocsExport(donneesBlocs, donneesPad)
				const html = genererHTML(definirDonneesPadExport(donneesPad), blocsExport, langue)
				const dossierStatic = path.join(dossierPad, 'static')
				await fs.mkdirp(path.join(dossierStatic, 'css'))
				await fs.mkdirp(path.join(dossierStatic, 'js'))
				await fs.mkdirp(path.join(dossierStatic, 'fonts'))
				await fs.mkdirp(path.join(dossierStatic, 'img'))
				await fs.writeFile(path.join(dossierPad, 'index.html'), html, 'utf8')
				const copierImagePublique = (chemin) => {
					transactionsFichiers.push(() =>
						fs.copy(path.join(__dirname, '..', '/public' + chemin), path.join(dossierStatic, chemin), { overwrite: true }).catch(() => {})
					)
				}
				if (typeof donneesPad.fond === 'string' && donneesPad.fond.includes('/img/')) copierImagePublique(donneesPad.fond)
				transactionsFichiers.push(
					() => fs.copy(path.join(__dirname, '..', '/static/export/css'), path.join(dossierStatic, 'css')).catch(() => {}),
					() => fs.copy(path.join(__dirname, '..', '/static/export/js'), path.join(dossierStatic, 'js')).catch(() => {}),
					() => fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.join(dossierStatic, 'fonts/MaterialIcons-Regular.woff2')).catch(() => {}),
					() => fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.join(dossierStatic, 'fonts/Roboto-Slab-Medium.woff2')).catch(() => {}),
					() => fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.join(dossierStatic, 'img/favicon.png')).catch(() => {})
				)
				// Vignettes par défaut de l'application, pour les seules capsules exportées
				const vignettesPubliques = new Set(blocsExport.filter((bloc) => typeof bloc.vignette === 'string' && bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])).map((bloc) => bloc.vignette))
				vignettesPubliques.forEach(copierImagePublique)
				fichiersBlocs = definirFichiersExport(blocsExport)
			}
			fichiersBlocs.forEach(copierFichierPad)
			// Exécution des transferts de fichiers par lots
			await executerTransactions(transactionsFichiers, (tache) => tache(), tailleLotTransaction)
			// Création de l'archive ZIP
			const nomArchive = 'pad-' + id + (format === 'web' ? '-web' : '') + '_' + randomBytes(16).toString('hex') + '.zip'
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
			await fs.remove(dossierPad)
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

	async function notifierAdminsAbsents (pad, donneesPad, identifiantActeur = null) {
		try {
			const administrateurs = definirAdministrateursPad(donneesPad)
			if (administrateurs.length === 0) return
			const listeEnregistree = parseJSON(donneesPad.notification, [])
			const listeActuelle = Array.isArray(listeEnregistree) ? listeEnregistree.filter((admin) => administrateurs.includes(admin)) : []
			const candidatsNotification = administrateurs.filter((admin) => admin !== identifiantActeur && !listeActuelle.includes(admin))
			if (candidatsNotification.length === 0) return
			const adminsConnectes = await recupererPresenceAdmins(pad)
			if (adminsConnectes === null) return
			const adminsAbsents = candidatsNotification.filter((admin) => !adminsConnectes.has(admin))
			const notification = [...new Set([...listeActuelle, ...adminsAbsents])]
			const listeInchangee = Array.isArray(listeEnregistree) && notification.length === listeEnregistree.length && notification.every((admin, index) => admin === listeEnregistree[index])
			if (listeInchangee) return
			await db.HSET('pads:' + pad, 'notification', JSON.stringify(notification))
			// La liste ne contient que des identifiants d'administrateurs : diffusion restreinte au salon admin
			io.to(definirSalonAdmin(pad)).emit('modifiernotification', notification)
		} catch (err) {
			console.error(err.stack)
		}
	}

	const cacheAdminsPad = new Map()
	const dureeCacheAdmins = 60000
	const tailleMaxCacheAdmins = 500

	function viderCacheAdmins (pad) {
		cacheAdminsPad.delete(String(pad))
	}

	async function recupererPresenceAdmins (pad) {
		const cle = String(pad)
		const enCache = cacheAdminsPad.get(cle)
		if (enCache && enCache.expiration > Date.now()) return enCache.adminsConnectes
		const clients = await fetchSockets(definirSalonAdmin(pad), { strict: true })
		if (clients === null) return null
		const adminsConnectes = new Set(clients.map((client) => client.data && client.data.identifiantSession).filter((el) => el))
		if (cacheAdminsPad.size >= tailleMaxCacheAdmins) {
			const maintenant = Date.now()
			cacheAdminsPad.forEach((valeur, padEnCache) => {
				if (valeur.expiration <= maintenant) cacheAdminsPad.delete(padEnCache)
			})
		}
		cacheAdminsPad.set(cle, { adminsConnectes, expiration: Date.now() + dureeCacheAdmins })
		return adminsConnectes
	}

	async function fetchSockets (salon, options = {}) {
		for (let i = 0; i < 2; i++) {
			try {
				return await io.in(salon).timeout(2000).fetchSockets()
			} catch (err) {
				if (i === 1) console.error('Erreur fetchSockets :', err.message)
			}
		}
		return options.strict === true ? null : []
	}

	async function verifierAdmin (pad, donnees, session) {
		if (!pad || !donnees || !donnees.hasOwnProperty('identifiant') || !session.hasOwnProperty('statut')) return false
		if (session.hasOwnProperty('identifiant') && session.statut === 'utilisateur' && session.hasOwnProperty('motdepasse')) {
			const administrateurs = definirAdministrateursPad(donnees)
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + session.identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return false
			if (administrateurs.includes(session.identifiant) && comparerHash(session.motdepasse, donneesUtilisateur.motdepasse)) {
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

	async function verifierAccesLectureDonnees (pad, donneesPad, session) {
		if (!donneesPad || !donneesPad.hasOwnProperty('identifiant')) return false
		const admin = await verifierAdmin(pad, donneesPad, session)
		return definirAccesLecture(pad, donneesPad, admin, session)
	}

	async function verifierAccesLecturePad (pad, session) {
		if (!verifierIdentifiantPad(pad)) return false
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		return await verifierAccesLectureDonnees(pad, donneesPad, session)
	}

	const dureeLimiteEchecsCode = 15 * 60

	function definirCleEchecsCode (adresse, pad) {
		return 'rl-code-ip:' + adresse + ':' + parseInt(pad, 10)
	}

	async function compterEchecs (cle) {
		await db.multi().INCR(cle).EXPIRE(cle, dureeLimiteEchecsCode, 'NX').exec()
	}

	async function verifierLimiteEchecsCode (adresse, pad) {
		return Number(await db.GET(definirCleEchecsCode(adresse, pad))) >= limiteEchecsCodeAdresse
	}

	async function compterEchecsCode (adresse, pad) {
		await compterEchecs(definirCleEchecsCode(adresse, pad))
	}

	async function oublierEchecsCode (adresse, pad) {
		await db.UNLINK(definirCleEchecsCode(adresse, pad))
	}

	function definirCleEchecsMotDePasse (adresse, pad) {
		return 'rl-mdp-ip:' + adresse + ':' + parseInt(pad, 10)
	}

	async function verifierLimiteEchecsMotDePasse (adresse, pad) {
		return Number(await db.GET(definirCleEchecsMotDePasse(adresse, pad))) >= limiteEchecsMotDePasseAdresse
	}

	async function compterEchecsMotDePasse (adresse, pad) {
		await compterEchecs(definirCleEchecsMotDePasse(adresse, pad))
	}

	async function oublierEchecsMotDePasse (adresse, pad) {
		await db.UNLINK(definirCleEchecsMotDePasse(adresse, pad))
	}

	async function verifierAdminUtilisateur (pad, identifiant, motdepasse) {
		if (!pad || !identifiant || !motdepasse) return false
		let [donneesPad, donneesUtilisateur] = await Promise.all([db.HGETALL('pads:' + pad), db.HGETALL('utilisateurs:' + identifiant)])
		donneesPad = donneesPad ? { ...donneesPad } : {}
		const administrateurs = definirAdministrateursPad(donneesPad)
		donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return false
		if (administrateurs.includes(identifiant) && comparerHash(motdepasse, donneesUtilisateur.motdepasse)) {
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

	const dureeUrlAffichage = { validite: 3600, cache: 2400 }
	const variationCacheUrl = 300
	const typesSansFichier = ['embed', 'lien', 'lien-image']
	const typesMediaDiffere = ['pdf', 'office', 'document']
	const tailleLotSignature = 50

	function definirCleCacheUrl (cle, { telechargement = false, duree = dureeUrlAffichage } = {}) {
		return 'url-signee-s3:' + (telechargement ? 'telechargement:' : '') + duree.validite + ':' + cle
	}

	function definirExpirationCacheUrl (duree = dureeUrlAffichage) {
		return Math.max(1, duree.cache - Math.floor(Math.random() * variationCacheUrl))
	}

	async function signerUrlS3 (cle, { telechargement = false, duree = dureeUrlAffichage } = {}) {
		const parametres = { Bucket: bucket, Key: cle }
		if (telechargement) parametres.ResponseContentDisposition = 'attachment; filename="' + path.basename(cle).replace(/[^\w.-]/g, '_') + '"'
		return getSignedUrl(s3Client, new GetObjectCommand(parametres), { expiresIn: duree.validite })
	}

	const signaturesEnCours = new Map()

	function mutualiserSignature (cleCache, produire) {
		const enCours = signaturesEnCours.get(cleCache)
		if (enCours) return enCours
		const promesse = produire().finally(() => signaturesEnCours.delete(cleCache))
		signaturesEnCours.set(cleCache, promesse)
		return promesse
	}

	async function obtenirUrlSigneeS3 (cle, options = {}) {
		const { duree = dureeUrlAffichage, sansCache = false } = options
		const cleCache = definirCleCacheUrl(cle, options)
		if (!sansCache) {
			const urlCachee = await db.GET(cleCache).catch(() => null)
			if (urlCachee) return urlCachee
		}
		return mutualiserSignature(cleCache, async () => {
			const url = await signerUrlS3(cle, options)
			await db.SET(cleCache, url, { EX: definirExpirationCacheUrl(duree) }).catch(() => {})
			return url
		})
	}

	async function purgerCacheUrlsFichier (pad, fichier) {
		if (stockage !== 's3') return
		const cle = pad + '/' + fichier
		await db.UNLINK(definirClesCacheUrl(cle)).catch(() => {})
	}

	function definirClesCacheUrl (cle) {
		return [definirCleCacheUrl(cle), definirCleCacheUrl(cle, { telechargement: true })]
	}

	async function definirUrlFichier (pad, fichier, acces, options = {}) {
		if (!fichier || typeof fichier !== 'string' || fichier === '') return ''
		if (stockage === 'fs') {
			return definirCheminFichiers() + '/' + pad + '/' + fichier
		}
		// Mur public -> liens permanents
		if (acces === 'public') {
			return lienPublicS3 + '/' + pad + '/' + fichier
		}
		const cle = pad + '/' + fichier
		if (options.urls instanceof Map && options.urls.has(cle)) return options.urls.get(cle)
		return obtenirUrlSigneeS3(cle, options)
	}

	function verifierMediaDiffere (bloc, options) {
		return options.differerMedia === true && typesMediaDiffere.includes(bloc.type)
	}

	function definirFichiersBloc (bloc, options = {}) {
		const fichiers = []
		if (!bloc) return fichiers
		if (bloc.hasOwnProperty('media') && bloc.media && !typesSansFichier.includes(bloc.type) && !verifierMediaDiffere(bloc, options)) {
			fichiers.push(bloc.media)
		}
		if (bloc.hasOwnProperty('vignette') && bloc.vignette && definirVignettePersonnalisee(bloc.vignette) === true) {
			fichiers.push(path.basename(bloc.vignette))
		}
		return fichiers
	}

	async function prechargerUrlsCles (cles, options = {}) {
		const urls = new Map()
		if (stockage !== 's3' || !Array.isArray(cles)) return urls
		const liste = Array.from(new Set(cles.filter((cle) => typeof cle === 'string' && cle !== '')))
		if (liste.length === 0) return urls
		let clesASigner = liste
		if (options.sansCache !== true) {
			const valeurs = await db.MGET(liste.map((cle) => definirCleCacheUrl(cle))).catch(() => [])
			clesASigner = []
			liste.forEach((cle, index) => {
				const url = valeurs[index]
				if (url) urls.set(cle, url)
				else clesASigner.push(cle)
			})
			if (clesASigner.length === 0) return urls
		}
		const clesSignees = await executerTransactions(clesASigner, (cle) => {
			return mutualiserSignature(definirCleCacheUrl(cle), () => signerUrlS3(cle)).catch((err) => {
				console.error('Signature de ' + cle + ' : ' + err.message)
				return null
			})
		}, tailleLotSignature)
		const ecritures = db.multi()
		let compteurEcritures = 0
		clesASigner.forEach((cle, index) => {
			if (!clesSignees[index]) return
			urls.set(cle, clesSignees[index])
			ecritures.SET(definirCleCacheUrl(cle), clesSignees[index], { EX: definirExpirationCacheUrl() })
			compteurEcritures++
		})
		if (compteurEcritures > 0) await ecritures.exec().catch(() => {})
		return urls
	}

	async function prechargerUrlsFichiers (pad, blocs, acces, options = {}) {
		if (stockage !== 's3' || acces === 'public' || !Array.isArray(blocs) || blocs.length === 0) return null
		const cles = new Set()
		blocs.forEach((bloc) => {
			definirFichiersBloc(bloc, options).forEach((fichier) => cles.add(pad + '/' + fichier))
		})
		return prechargerUrlsCles(Array.from(cles))
	}

	function definirCleFond (pad, fond, acces) {
		if (stockage !== 's3' || acces === 'public') return ''
		if (!fond || typeof fond !== 'string' || fond === '' || fond.includes('/img/') || fond.substring(0, 1) === '#') return ''
		return pad + '/' + path.basename(fond)
	}

	async function appliquerUrlsFichiers (pad, blocs, acces, options = {}) {
		if (!Array.isArray(blocs) || blocs.length === 0) return
		const urls = await prechargerUrlsFichiers(pad, blocs, acces, options)
		await Promise.all(blocs.map((bloc) => ajouterUrlsFichiers(pad, bloc, acces, { ...options, urls })))
	}

	async function ajouterUrlsFichiers (pad, bloc, acces, options = {}) {
		if (!bloc) return bloc
		if (bloc.hasOwnProperty('media') && bloc.media && !typesSansFichier.includes(bloc.type) && !verifierMediaDiffere(bloc, options)) {
			bloc.mediaUrl = await definirUrlFichier(pad, bloc.media, acces, options)
		}
		if (bloc.hasOwnProperty('vignette') && bloc.vignette && definirVignettePersonnalisee(bloc.vignette) === true) {
			bloc.vignetteUrl = await definirUrlFichier(pad, path.basename(bloc.vignette), acces, options)
		}
		return bloc
	}

	async function verifierFichierAutorise (pad, donneesPad, bloc, fichier, session) {
		if (typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && path.basename(donneesPad.fond) === fichier) return true
		if (!verifierIdentifiantBlocExistant(bloc)) return false
		let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
		donneesBloc = donneesBloc ? { ...donneesBloc } : {}
		if (!donneesBloc.hasOwnProperty('bloc')) return false
		const media = donneesBloc.media === fichier
		const vignette = typeof donneesBloc.vignette === 'string' && donneesBloc.vignette !== '' && path.basename(donneesBloc.vignette) === fichier
		if (!media && !vignette) return false
		const blocVisible = verifierBlocVisible(donneesBloc, donneesPad.contributions)
		const colonneMasquee = verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), donneesBloc.colonne)
		if (blocVisible && !colonneMasquee) return true
		if (donneesBloc.identifiant && donneesBloc.identifiant === session.identifiant) return true
		return await verifierAdmin(pad, donneesPad, session)
	}

	async function definirUrlFond (pad, fond, acces, options = {}) {
		if (!fond || typeof fond !== 'string' || fond === '' || fond.includes('/img/') || fond.substring(0, 1) === '#') return ''
		return definirUrlFichier(pad, path.basename(fond), acces, options)
	}

	function definirVignettePersonnalisee (vignette) {
		if (typeof vignette !== 'string' || vignette === '' || vignette.includes('/img/')) return false
		if (!verifierURL(vignette, ['https', 'http'])) return true
		return typeof lienPublicS3 === 'string' && lienPublicS3 !== '' && vignette.startsWith(lienPublicS3)
	}

	// ACL posée à l'écriture : public-read pour les fichiers temp et pour les pads publics (privé pour les pads privés et en accès protégé)
	function definirParametresTeleverserS3 (cle, buffer, acces) {
		const parametres = { Bucket: bucket, Key: cle, Body: buffer }
		if (cle.startsWith('temp/') || acces === 'public') parametres.ACL = 'public-read'
		return parametres
	}

	function definirParametresCopierS3 (cle, source, acces) {
		const parametres = { Bucket: bucket, Key: cle, CopySource: source }
		if (acces === 'public') parametres.ACL = 'public-read'
		return parametres
	}

	const tailleLotACL = 100

	const cleFileACL = 'acl-a-resynchroniser'

	// Repasse tous les fichiers d'un pad en public-read ou private après un changement d'accès (modifieracces)
	async function modifierACLFichiers (pad, acces) {
		if (stockage !== 's3') return { traites: 0, echecs: 0, interrompue: false }
		const cible = acces === 'public' ? 'public-read' : 'private'
		let jetonPagination
		let traites = 0
		let echecs = 0
		const terminer = async (resultat) => {
			if (resultat.echecs > 0 || resultat.interrompue === true) {
				await db.SADD(cleFileACL, String(pad)).catch(() => {})
			} else {
				await db.SREM(cleFileACL, String(pad)).catch(() => {})
			}
			return resultat
		}
		do {
			let page
			try {
				page = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/', ContinuationToken: jetonPagination }))
			} catch (err) {
				console.error('Resynchronisation ACL du pad ' + pad + ' (listage) : ' + err.message)
				return terminer({ traites, echecs, interrompue: true })
			}
			const objets = page.Contents || []
			const resultats = await executerTransactions(objets, (objet) => {
				return s3Client.send(new PutObjectAclCommand({ Bucket: bucket, Key: objet.Key, ACL: cible })).then(() => true).catch((err) => {
					console.error('Resynchronisation ACL ' + objet.Key + ' : ' + err.message)
					return false
				})
			}, tailleLotACL)
			traites += resultats.filter((resultat) => resultat === true).length
			echecs += resultats.filter((resultat) => resultat === false).length
			const clesCache = objets.flatMap((objet) => definirClesCacheUrl(objet.Key))
			if (clesCache.length > 0) await db.UNLINK(clesCache).catch(() => {})
			jetonPagination = page.IsTruncated ? page.NextContinuationToken : undefined
		} while (jetonPagination)
		return terminer({ traites, echecs, interrompue: false })
	}

	async function realignerACLFichiers (pad, acces, fichiers = null) {
		if (stockage !== 's3') return
		const noms = Array.isArray(fichiers) ? [...new Set(fichiers.filter((fichier) => typeof fichier === 'string' && fichier !== '' && !/[/\\]/.test(fichier) && !fichier.includes('..')))] : null
		if (noms !== null && noms.length === 0) return
		const accesActuel = await db.HGET('pads:' + pad, 'acces').catch(() => null)
		if (!accesActuel || accesActuel === acces) return
		if (noms === null) {
			await modifierACLFichiers(pad, accesActuel)
			return
		}
		const cible = accesActuel === 'public' ? 'public-read' : 'private'
		const resultats = await executerTransactions(noms, (fichier) => {
			return s3Client.send(new PutObjectAclCommand({ Bucket: bucket, Key: pad + '/' + fichier, ACL: cible })).then(() => true).catch((err) => {
				console.error('Realignement ACL ' + pad + '/' + fichier + ' : ' + err.message)
				return false
			})
		}, tailleLotACL)
		const clesCache = noms.flatMap((fichier) => definirClesCacheUrl(pad + '/' + fichier))
		if (clesCache.length > 0) await db.UNLINK(clesCache).catch(() => {})
		if (resultats.some((resultat) => resultat === false)) await db.SADD(cleFileACL, String(pad)).catch(() => {})
	}

	async function resynchroniserACLEnAttente () {
		if (stockage !== 's3') return { pads: 0, resolus: 0 }
		const pads = await db.SMEMBERS(cleFileACL)
		if (!pads || pads.length === 0) return { pads: 0, resolus: 0 }
		let resolus = 0
		for (const pad of pads) {
			const acces = await db.HGET('pads:' + pad, 'acces')
			if (!acces) {
				await db.SREM(cleFileACL, pad).catch(() => {})
				resolus++
				continue
			}
			const resultat = await modifierACLFichiers(pad, acces)
			if (resultat.echecs === 0 && resultat.interrompue !== true) resolus++
		}
		return { pads: pads.length, resolus }
	}

	function definirParametresSupprimerS3 (cle) {
		return { Bucket: bucket, Key: cle }
	}

	const dureeMaxFichiersTemp = 6 * 60 * 60 * 1000

	async function purgerFichiersTemporairesS3 () {
		if (stockage !== 's3') return { supprimes: 0, echecs: 0 }
		const limite = Date.now() - dureeMaxFichiersTemp
		let jetonPagination
		let supprimes = 0
		let echecs = 0
		do {
			const page = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: 'temp/', ContinuationToken: jetonPagination }))
			const objets = (page.Contents || []).filter((objet) => objet.LastModified && objet.LastModified.getTime() < limite)
			const resultats = await executerTransactions(objets, (objet) => {
				return s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key))).then(() => true).catch((err) => {
					console.error('Purge du fichier temporaire ' + objet.Key + ' : ' + err.message)
					return false
				})
			}, tailleLotTransaction)
			supprimes += resultats.filter((resultat) => resultat === true).length
			echecs += resultats.filter((resultat) => resultat === false).length
			jetonPagination = page.IsTruncated ? page.NextContinuationToken : undefined
		} while (jetonPagination)
		return { supprimes, echecs }
	}

	async function purgerFichiersTemporairesLocaux () {
		const dossier = path.join(__dirname, '..', '/static/temp')
		const limite = Date.now() - dureeMaxFichiersTemp
		let entrees
		try {
			entrees = await fs.readdir(dossier)
		} catch (err) {
			if (err.code === 'ENOENT') return { supprimes: 0, echecs: 0 }
			console.error('Purge du dossier temporaire local : ' + err.message)
			return { supprimes: 0, echecs: 1 }
		}
		const etats = await executerTransactions(entrees.filter((entree) => entree !== '.gitignore'), (entree) => {
			return fs.stat(path.join(dossier, entree)).then((infos) => infos.mtimeMs < limite ? entree : null).catch((err) => {
				if (err.code === 'ENOENT') return null
				console.error('Purge de l\'élément temporaire ' + entree + ' : ' + err.message)
				return false
			})
		}, tailleLotTransaction)
		const perimees = etats.filter((etat) => typeof etat === 'string')
		const echecs = etats.filter((etat) => etat === false).length
		const resultats = await executerTransactions(perimees, (entree) => {
			return fs.remove(path.join(dossier, entree)).then(() => true).catch((err) => {
				console.error('Purge de l\'élément temporaire ' + entree + ' : ' + err.message)
				return false
			})
		}, tailleLotTransaction)
		return {
			supprimes: resultats.filter((resultat) => resultat === true).length,
			echecs: echecs + resultats.filter((resultat) => resultat === false).length
		}
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
			await purgerCacheUrlsFichier(pad, fichier)
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

	async function televerserFichierArchive (dossierTemporaire, dossierDestination, nomFichier, pad, acces) {
		if (!nomFichier || nomFichier === '') return
		if (typeof nomFichier !== 'string' || /[/\\]/.test(nomFichier) || nomFichier.includes('..')) return
		const cheminSource = path.normalize(dossierTemporaire + '/fichiers/' + nomFichier)
		if (!await fs.pathExists(cheminSource)) return
		if (stockage === 'fs') {
			await fs.copy(cheminSource, path.normalize(dossierDestination + '/' + nomFichier), { overwrite: true })
		} else if (stockage === 's3') {
			const buffer = await fs.readFile(cheminSource)
			await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3(pad + '/' + nomFichier, buffer, acces)))
		}
	}

	async function televerserFichierTemp (nomFichier, pad, acces) {
		if (!nomFichier || nomFichier === '') return
		if (!verifierIdentifiantPad(pad)) return
		if (typeof nomFichier !== 'string' || /[/\\]/.test(nomFichier) || nomFichier.includes('..')) return
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
					await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(pad + '/' + nomFichier, '/' + bucket + '/temp/' + nomFichier, acces)))
					await s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3('temp/' + nomFichier)))
				}
			} catch {}
		}
	}

	async function copierFichier (padOrigine, pad, nomFichier, typeFichier, acces) {
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
					await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(cleDestination, '/' + bucket + '/' + cleSource, acces)))
				}
			} catch {}
		}
	}

	async function copierFichiersPad (padSource, padDestination, acces) {
		if (!verifierIdentifiantPad(padSource) || !verifierIdentifiantPad(padDestination)) return
		if (stockage === 'fs') {
			const dossierSource = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padSource)
			const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padDestination)
			if (await fs.pathExists(dossierSource)) {
				await fs.copy(dossierSource, dossierDestination)
			}
		} else if (stockage === 's3') {
			const prefixe = padSource + '/'
			let jetonPagination
			do {
				const page = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: prefixe, ContinuationToken: jetonPagination }))
				const objets = (page.Contents || []).filter((objet) => objet.Key.length > prefixe.length)
				await executerTransactions(objets, (objet) => {
					const cleDestination = padDestination + '/' + objet.Key.substring(prefixe.length)
					return s3Client.send(new CopyObjectCommand(definirParametresCopierS3(cleDestination, '/' + bucket + '/' + objet.Key, acces)))
				}, tailleLotTransaction)
				jetonPagination = page.IsTruncated ? page.NextContinuationToken : undefined
			} while (jetonPagination)
		}
	}

	async function verifierEspaceDisque (emplacement = 'fichiers') {
		if (emplacement !== 'temp' && stockage !== 'fs') return true
		const dossier = (emplacement === 'temp') ? path.join(__dirname, '..', '/static/temp') : path.join(__dirname, '..', '/static' + definirCheminFichiers())
		const espaceDisque = await checkDiskSpace(dossier)
		const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
		return pourcentageLibre >= minimumEspaceDisque
	}

	async function dupliquerFichier (pad, nomFichier, acces) {
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
				await s3Client.send(new CopyObjectCommand(definirParametresCopierS3(pad + '/' + nouveauNom, '/' + bucket + '/' + cleSource, acces)))
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

	async function dupliquerBloc (pad, donneesBloc, contenusANettoyer, acces) {
		const type = donneesBloc.type || ''
		const contenu = { texte: donneesBloc.texte || '', media: donneesBloc.media || '', alt: donneesBloc.alt || '', iframe: donneesBloc.iframe || '', vignette: donneesBloc.vignette || '', echec: false, fichiersCrees: [], padCree: '' }
		contenusANettoyer.push(contenu)
		const dupliquerFichierSuivi = async (nomFichier) => {
			const nouveauNom = await dupliquerFichier(pad, nomFichier, acces)
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
		verifierAccesTicket,
		exporterPad,
		supprimerPad,
		fetchSockets,
		viderCacheAdmins,
		notifierAdminsAbsents,
		verifierAdmin,
		verifierAccesLecturePad,
		verifierAccesLectureDonnees,
		verifierLimiteEchecsCode,
		compterEchecsCode,
		oublierEchecsCode,
		verifierLimiteEchecsMotDePasse,
		compterEchecsMotDePasse,
		oublierEchecsMotDePasse,
		definirAdministrateursPad,
		verifierAdminUtilisateur,
		verifierAutorisationApi,
		envoyerEmail,
		definirVignettePersonnalisee,
		obtenirUrlSigneeS3,
		purgerCacheUrlsFichier,
		definirUrlFichier,
		ajouterUrlsFichiers,
		prechargerUrlsFichiers,
		prechargerUrlsCles,
		appliquerUrlsFichiers,
		definirCleFond,
		resoudreFonds,
		verifierFichierAutorise,
		definirUrlFond,
		modifierACLFichiers,
		realignerACLFichiers,
		resynchroniserACLEnAttente,
		purgerFichiersTemporairesS3,
		purgerFichiersTemporairesLocaux,
		copierFichiersPad,
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
