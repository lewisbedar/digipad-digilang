import path from 'path'
import fs from 'fs-extra'
import Rabbit from 'crypto-js/rabbit.js'
import Utf8 from 'crypto-js/enc-utf8.js'
import genererXML from './genererXML.js'
import { renderPage } from 'vike/server'
import { fileURLToPath } from 'url'
import { etat } from './etat.js'
import {
	tailleLotTransaction,
	verifierIdentifiantPad,
	nettoyerPads,
	supprimerDoublons,
	supprimerSession,
	executerTransactions,
	comparerHash
} from './fonctions.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Pages rendues par Vike : accueil, page utilisateur, pad, flux RSS, maintenance, admin
export default function enregistrerRoutesPages ({
	app,
	hote,
	hoteTeleversement,
	langues,
	langueParDefaut,
	db,
	dureeSession,
	earlyHints103,
	cleCrypto,
	fonctions
}) {
	const {
		recupererDonneesUtilisateur,
		recupererDonneesPad,
		recupererDonneesBlocs,
		recupererDonneesPadJSON,
		verifierAcces
	} = fonctions

	app.get('/', async (req, res, next) => {
		if (etat.maintenance === true) return res.redirect(302, '/maintenance')
		if (req.session.identifiant && req.session.statut === 'utilisateur') return res.redirect(302, '/u/' + req.session.identifiant)
		let langue = langueParDefaut
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			params: req.query,
			hote: hote,
			langues: langues,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) throw pageContext.errorWhileRendering
		}
		const { httpResponse } = pageContext
		if (!httpResponse) return next()
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map(e => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.get('/u/:utilisateur', async (req, res, next) => {
		if (etat.maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const identifiant = req.params.utilisateur
			const sessionValide = (
				identifiant === req.session.identifiant &&
				req.session.statut === 'utilisateur' &&
				req.session.hasOwnProperty('motdepasse') &&
				req.session.motdepasse !== ''
			)
			if (!sessionValide) {
				supprimerSession(req)
				return res.redirect(302, '/')
			}
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.motdepasse) {
				supprimerSession(req)
				return res.redirect(302, '/')
			}
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) {
				supprimerSession(req)
				return res.redirect(302, '/')
			}
			const [padsCreesBrut, padsCorbeilleBrut, padsRejointsBrut, padsAdminsBrut, padsFavorisBrut] = await recupererDonneesUtilisateur(identifiant, req.session)
			let padsCrees = nettoyerPads(padsCreesBrut, identifiant)
			let padsCorbeille = nettoyerPads(padsCorbeilleBrut, identifiant)
			let padsRejoints = nettoyerPads(padsRejointsBrut, identifiant)
			let padsAdmins = nettoyerPads(padsAdminsBrut, identifiant)
			let padsFavoris = nettoyerPads(padsFavorisBrut, identifiant)
			const idsCorbeille = new Set(padsCorbeille.map(p => p.id))
			const idsAdmins = new Set(padsAdmins.map(p => p.id))
			// Filtrer les favoris supprimés
			const favorisSupprimes = padsFavoris.filter(p => idsCorbeille.has(p.id)).map(p => p.id)
			padsFavoris = padsFavoris.filter(p => !idsCorbeille.has(p.id))
			// Retirer les admins des pads rejoints
			padsRejoints = padsRejoints.filter(p => !idsAdmins.has(p.id))
			// Supprimer les doublons
			padsCrees = supprimerDoublons(padsCrees)
			padsCorbeille = supprimerDoublons(padsCorbeille)
			padsRejoints = supprimerDoublons(padsRejoints)
			padsAdmins = supprimerDoublons(padsAdmins)
			padsFavoris = supprimerDoublons(padsFavoris)
			// Gestion des dossiers
			let dossiers = []
			if (donneesUtilisateur.dossiers) {
				try {
					dossiers = JSON.parse(donneesUtilisateur.dossiers)
					dossiers.forEach(d => { d.pads = (d.pads || []).map(id => parseInt(id, 10)) })
				} catch {
					dossiers = []
				}
			}
			// Collecter les pads présents dans les dossiers
			const listePadsDossiers = new Set()
			const mapContenusSupprimesDossiers = new Map()
			dossiers.forEach(dossier => {
				dossier.pads.forEach(padId => {
					if (!listePadsDossiers.has(padId)) {
						listePadsDossiers.add(padId)
					}
					if (idsCorbeille.has(padId)) {
						mapContenusSupprimesDossiers.set(padId, dossier.id)
					}
				})
			})
			// Vérification par lots de l'existence des pads dans les dossiers
			const padsSupprimesDossiers = (await executerTransactions(Array.from(listePadsDossiers), async (padId) => {
				const padExiste = await db.EXISTS('pads:' + padId)
				if (!padExiste || padExiste === 0) {
					// Vérifier aussi le fichier JSON
					if (verifierIdentifiantPad(padId) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))) {
						return null
					}
					return padId
				}
				return null
			}, tailleLotTransaction)).filter(id => id !== null)
			// Nettoyage des dossiers : retirer les pads supprimés et doublons
			dossiers.forEach(dossier => {
				dossier.pads = dossier.pads.filter(id => !padsSupprimesDossiers.includes(id))
				dossier.pads = [...new Set(dossier.pads)]
			})
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			// Préparer contenus corbeille avec favoris et dossiers
			padsCorbeille.forEach(pad => {
				pad.favori = favorisSupprimes.includes(pad.id)
				pad.dossier = mapContenusSupprimesDossiers.has(pad.id) ? mapContenusSupprimesDossiers.get(pad.id) : ''
			})
			// Supprimer les pads corbeille des dossiers pour l'affichage
			dossiers.forEach(dossier => {
				dossier.pads = dossier.pads.filter(id => !idsCorbeille.has(id))
			})
			const pageContextInit = {
				urlOriginal: req.originalUrl,
				params: req.query,
				hote: hote,
				langues: langues,
				identifiant: req.session.identifiant,
				nom: req.session.nom,
				email: req.session.email,
				langue: req.session.langue,
				statut: req.session.statut,
				affichage: donneesUtilisateur.affichage,
				classement: donneesUtilisateur.classement,
				padsCrees,
				padsCorbeille,
				padsRejoints,
				padsAdmins,
				padsFavoris,
				dossiers
			}
			const pageContext = await renderPage(pageContextInit)
			if (pageContext.errorWhileRendering) {
				if (!pageContext.httpResponse) throw pageContext.errorWhileRendering
			}
			const { httpResponse } = pageContext
			if (!httpResponse) return next()
			const { body, statusCode, headers, earlyHints } = httpResponse
			if (earlyHints103 === true && res.writeEarlyHints) {
				res.writeEarlyHints({ link: earlyHints.map(e => e.earlyHintLink) })
			}
			if (headers) {
				headers.forEach(([name, value]) => res.setHeader(name, value))
			}
			res.status(statusCode).send(body)
		} catch (err) {
			console.error(err.stack)
			supprimerSession(req)
			res.redirect(302, '/')
		}
  	})

	app.get('/p/:id/:token', async (req, res, next) => {
		if (etat.maintenance === true) return res.redirect(302, '/maintenance')
		try {
			if (req.session.identifiant === '' || req.session.identifiant === undefined) {
				const identifiant = 'u' + Math.random().toString(16).slice(3)
				req.session.identifiant = identifiant
				req.session.motdepasse = ''
				req.session.nom = identifiant.slice(0, 8).toUpperCase()
				req.session.email = ''
				req.session.langue = langueParDefaut
				req.session.statut = 'invite'
				req.session.acces = []
				req.session.pads = []
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
			}
			if (!req.session.hasOwnProperty('acces')) {
				req.session.acces = []
			}
			if (!req.session.hasOwnProperty('pads')) {
				req.session.pads = []
			}
			if (req.query.id && req.query.id !== '' && req.query.mdp && req.query.mdp !== '') {
				try {
					const id = decodeURIComponent(req.query.id)
					const mdpB = Rabbit.decrypt(decodeURIComponent(req.query.mdp), cleCrypto)
					const mdp = mdpB.toString(Utf8)
					const pad = req.params.id
					const { acces, utilisateur } = await verifierAcces(pad, id, mdp)
					if (acces === 'pad_debloque') {
						req.session.identifiant = utilisateur.id
						req.session.motdepasse = ''
						req.session.nom = utilisateur.nom
						req.session.statut = 'auteur'
						req.session.langue = utilisateur.langue
						if (!req.session.pads.includes(parseInt(pad, 10))) {
							req.session.pads.push(parseInt(pad, 10))
						}
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
					}
				} catch {}
			}
			const userAgent = req.headers['user-agent']
			const id = req.params.id
			const token = req.params.token
			let donneesPad
			try {
				if (!verifierIdentifiantPad(id)) return next()
				const padExiste = await db.EXISTS('pads:' + id)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					await recupererDonneesPadJSON(id)
				} else if (padExiste === 0) {
					donneesPad = 'pad_inexistant'
				}
				if (donneesPad !== 'pad_inexistant') {
					donneesPad = await recupererDonneesPad(id, token, req.session.identifiant, req.session.statut, req.session.pads)
				}
			} catch (err) {
				donneesPad = 'erreur'
				console.error(err.stack)
			}
			const pageContextInit = {
				urlOriginal: req.originalUrl,
				params: req.query,
				hote: hote,
				hoteTeleversement: hoteTeleversement,
				userAgent: userAgent,
				langues: langues,
				identifiant: req.session.identifiant,
				nom: req.session.nom,
				email: req.session.email,
				langue: req.session.langue,
				statut: req.session.statut,
				pads: req.session.pads,
				donneesPad: donneesPad
			}
			const pageContext = await renderPage(pageContextInit)
			if (pageContext.errorWhileRendering) {
				if (!pageContext.httpResponse) throw pageContext.errorWhileRendering
			}
			const { httpResponse } = pageContext
			if (!httpResponse) return next()
			const { body, statusCode, headers, earlyHints } = httpResponse
			if (earlyHints103 === true && res.writeEarlyHints) {
				res.writeEarlyHints({ link: earlyHints.map(e => e.earlyHintLink) })
			}
			if (headers) {
				headers.forEach(([name, value]) => res.setHeader(name, value))
			}
			res.status(statusCode).send(body)
		} catch (err) {
			console.error(err.stack)
			supprimerSession(req)
			res.redirect(302, '/')
		}
  	})

	app.get('/p/:id/:token/rss', async (req, res) => {
		if (etat.maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const id = req.params.id
			const token = req.params.token
			const identifiant = req.session.identifiant
			const statut = req.session.statut
			const pads = req.session.pads
			if (!verifierIdentifiantPad(id)) return res.redirect(302, '/')
			const padExiste = await db.EXISTS('pads:' + id)
			if (padExiste !== 1) return res.redirect(302, '/')
			let donneesPad = await db.HGETALL('pads:' + id)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			const donneesBlocs = await recupererDonneesBlocs(id, token, identifiant, statut, pads)
			if (typeof donneesBlocs !== 'object' || !donneesBlocs) return res.redirect(302, '/')
			if (!donneesBlocs.accesLecture) return res.redirect(302, '/p/' + id + '/' + token)
			const titre = donneesPad.titre
			const lien = hote + '/p/' + id + '/' + token
			const langue = req.session.langue || langueParDefaut
			const xml = genererXML(hote, titre, lien, donneesBlocs.blocs, donneesBlocs.admin, langue)
			if (xml === null || xml === '') {
				res.redirect(302, '/p/' + id + '/' + token)
			} else {
				res.type('application/rss+xml; charset=utf-8')
				res.status(200).send(xml)
			}
		} catch (err) {
			console.error(err.stack)
			res.redirect(302, '/p/' + req.params.id + '/' + req.params.token)
		}
  	})

	app.get('/maintenance', async (req, res, next) => {
		if (etat.maintenance === false) return res.redirect(302, '/')
		let langue = langueParDefaut
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			params: req.query,
			hote: hote,
			langues: langues,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) throw pageContext.errorWhileRendering
		}
		const { httpResponse } = pageContext
		if (!httpResponse) return next()
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map(e => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.get('/admin', async (req, res, next) => {
		let langue = langueParDefaut
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			params: req.query,
			hote: hote,
			langues: langues,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) throw pageContext.errorWhileRendering
		}
		const { httpResponse } = pageContext
		if (!httpResponse) return next()
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map(e => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})
}
