import v from 'voca'
import dayjs from 'dayjs'
import bcrypt from 'bcrypt'
import { renderPage } from 'vike/server'
import { randomBytes } from 'crypto'
import { etat } from './etat.js'
import {
	nettoyerPads,
	supprimerDoublons,
	supprimerSession,
	genererMotDePasse,
	verifierEmail,
	verifierFormatEmail,
	verifierDomaineEmail,
	comparerHash
} from './fonctions.js'

// Comptes utilisateurs : inscription, activation, connexion, profil, préférences et dossiers
export default function enregistrerRoutesComptes ({
	app,
	hote,
	langues,
	langueParDefaut,
	db,
	dureeSession,
	earlyHints103,
	creationCompte,
	validationInscription,
	limiteEchecsConnexionParIdentifiant,
	limiteAuth,
	limiteInscription,
	limiteInscriptionEmail,
	limiteConnexion,
	fonctions
}) {
	const {
		enregistrerTentativeConnexion,
		reinitialiserEchecsConnexion,
		recupererDonneesAuteur,
		recupererDonneesPadProtege,
		verifierAdmin,
		envoyerEmail
	} = fonctions

	app.post('/api/inscription', limiteInscription, limiteInscriptionEmail, async (req, res) => {
		if (creationCompte !== 1) return res.status(403).send('non_autorise')
		try {
			const identifiant = req.body.identifiant
			if (typeof identifiant !== 'string' || !identifiant.match(/^[\w-]+$/)) return res.status(400).send('identifiant_invalide')
			const motdepasse = typeof req.body.motdepasse === 'string' ? req.body.motdepasse.trim() : ''
			const emailBrut = req.body.email
			if (typeof emailBrut !== 'string' || !verifierFormatEmail(emailBrut)) return res.status(400).send('erreur')
			const email = emailBrut.trim().toLowerCase()
			const domaineEmail = email.slice(email.lastIndexOf('@') + 1)
			if (!(await verifierDomaineEmail(domaineEmail))) return res.status(400).send('email_invalide')
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 1) return res.status(409).send('utilisateur_existe_deja')
			if (utilisateurExiste !== 0) return res.status(500).send('erreur')
			const emailExiste = await db.EXISTS('emails:' + email)
			if (emailExiste === 1) return res.status(409).send('email_existe_deja')
			if (emailExiste === 0 && validationInscription === 1) {
				let codeActivation = randomBytes(18)
				codeActivation = codeActivation.toString('hex')
				const hash = await bcrypt.hash(motdepasse, 10)
				const date = dayjs().format()
				let langue = langueParDefaut
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
					langue = req.session.langue
				}
				await db.multi()
					.HSET('activations:' + codeActivation, ['id', identifiant, 'motdepasse', hash, 'date', date, 'email', email, 'langue', langue])
					.EXPIRE('activations:' + codeActivation, 43200)
					.exec()
				const message = {
					from: process.env.EMAIL_ADDRESS,
					to: email,
					subject: 'Activation de votre compte Digipad',
					html: '<p>Vous avez créé un compte Digipad ayant pour identifiant : <strong>' + v.escapeHtml(identifiant) + '</strong></p><p>Cliquez sur ce lien pour activer votre compte : <a href="' + hote + '/activation/' + codeActivation + '" target="_blank">' + hote + '/activation/' + codeActivation + '</a>.</p><p>Veuillez ignorer ce message si vous n\'êtes pas à l\'origine de cette création de compte.</p><p>La Digitale</p>'
				}
				try {
					await envoyerEmail(message, { adresseValidee: true })
					res.status(200).send('activation_demandee')
				} catch (err) {
					console.error(err.stack || err)
					return res.status(500).send('erreur_email')
				}
			} else if (emailExiste === 0 && validationInscription === 0) {
				const hash = await bcrypt.hash(motdepasse, 10)
				const date = dayjs().format()
				let langue = langueParDefaut
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
					langue = req.session.langue
				}
				await db.multi()
					.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'motdepasse', hash, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc', 'dossiers', JSON.stringify([])])
					.HSET('emails:' + email, 'identifiant', identifiant)
					.exec()
				req.session.identifiant = identifiant
				req.session.motdepasse = hash
				req.session.nom = ''
				req.session.email = email
				req.session.langue = langue
				req.session.statut = 'utilisateur'
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				const message = {
					from: process.env.EMAIL_ADDRESS,
					to: email,
					subject: 'Nouveau compte Digipad',
					html: '<p>Vous avez créé un compte Digipad ayant pour identifiant : <strong>' + v.escapeHtml(identifiant) + '</strong></p><p>Conservez bien cet identifiant, il est nécessaire pour vous connecter à votre compte.</p><p>La Digitale</p>'
				}
				try {
					await envoyerEmail(message, { adresseValidee: true })
				} catch (err) {
					console.error(err.stack || err)
				}
				res.status(200).send('compte_cree')
			} else {
				res.status(500).send('erreur')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.get('/activation/:code', async (req, res, next) => {
		if (etat.maintenance === true) return res.redirect(302, '/maintenance')
		if (validationInscription === 0) return res.redirect(302, '/')
		try {
			const codeActivation = req.params.code
			const codeActivationExiste = await db.EXISTS('activations:' + codeActivation)
			if (codeActivationExiste !== 1) return res.redirect(302, '/')
			let donneesActivation = await db.HGETALL('activations:' + codeActivation)
			donneesActivation = donneesActivation ? { ...donneesActivation } : {}
			if (Object.keys(donneesActivation).length === 0) return res.redirect(302, '/')
			const identifiant = donneesActivation.id
			const email = donneesActivation.email
			const motdepasse = donneesActivation.motdepasse
			const date = donneesActivation.date
			const langue = donneesActivation.langue
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste !== 0) return res.redirect(302, '/')
			const emailExiste = await db.EXISTS('emails:' + email)
			if (emailExiste !== 0) return res.redirect(302, '/')
			await db.multi()
				.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'motdepasse', motdepasse, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc', 'dossiers', JSON.stringify([])])
				.HSET('emails:' + email, 'identifiant', identifiant)
				.UNLINK('activations:' + codeActivation)
				.exec()
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
		} catch (err) {
			console.error(err.stack)
			res.redirect(302, '/')
		}
	})

	app.post('/api/connexion', limiteConnexion, async (req, res) => {
		try {
			const identifiant = typeof req.body.identifiant === 'string' ? req.body.identifiant.trim() : ''
			const motdepasse = typeof req.body.motdepasse === 'string' ? req.body.motdepasse.trim() : ''
			const ipConnexion = req.ip
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste !== 1) return res.status(401).send('erreur_connexion')
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (Object.keys(donneesUtilisateur).length === 0) return res.status(401).send('erreur_connexion')
			const tentativesConnexion = await enregistrerTentativeConnexion(identifiant, ipConnexion)
			if (tentativesConnexion > limiteEchecsConnexionParIdentifiant) return res.status(429).send('erreur_tentatives_identifiant')
			let comparaison = false
			if (motdepasse.trim() !== '' && donneesUtilisateur.hasOwnProperty('motdepasse') && donneesUtilisateur.motdepasse.trim() !== '') {
				comparaison = await bcrypt.compare(motdepasse, donneesUtilisateur.motdepasse)
			}
			let comparaisonTemp = false
			if (donneesUtilisateur.hasOwnProperty('motdepassetemp') && donneesUtilisateur.motdepassetemp.trim() !== '' && motdepasse.trim() !== '') {
				comparaisonTemp = await bcrypt.compare(motdepasse, donneesUtilisateur.motdepassetemp)
			}
			if (comparaison === false && comparaisonTemp === false) return res.status(401).send('erreur_connexion')
			await reinitialiserEchecsConnexion(identifiant, ipConnexion)
			let hashSession = donneesUtilisateur.motdepasse
			if (comparaisonTemp === true) {
				hashSession = await bcrypt.hash(motdepasse, 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hashSession)
				await db.HDEL('utilisateurs:' + identifiant, 'motdepassetemp')
			}
			const nom = donneesUtilisateur.nom
			const langue = donneesUtilisateur.langue
			let email = ''
			if (donneesUtilisateur.hasOwnProperty('email')) {
				email = donneesUtilisateur.email.toLowerCase()
			}
			await new Promise((resolve, reject) => {
				req.session.regenerate((err) => { if (err) reject(err); else resolve() })
			})
			req.session.identifiant = identifiant
			req.session.motdepasse = hashSession
			req.session.nom = nom
			req.session.email = email
			req.session.langue = langue
			req.session.statut = 'utilisateur'
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			res.status(200).json({ identifiant })
		} catch (err) {
			console.error(err.stack)
			res.status(401).send('erreur_connexion')
		}
	})

	app.post('/api/mot-de-passe-oublie', limiteAuth, async (req, res) => {
		try {
			if (typeof req.body.identifiant !== 'string' || typeof req.body.email !== 'string') return res.status(400).send('erreur')
			const identifiant = req.body.identifiant.trim()
			let email = req.body.email.toLowerCase().trim()
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 1) {
				let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
				if ((donneesUtilisateur.hasOwnProperty('email') && donneesUtilisateur.email.toLowerCase() === email) || (verifierEmail(identifiant) === true)) {
					if (!donneesUtilisateur.hasOwnProperty('email') || (donneesUtilisateur.hasOwnProperty('email') && donneesUtilisateur.email === '')) {
						email = identifiant
					}
					const motdepasse = genererMotDePasse(12)
					const message = {
						from: process.env.EMAIL_ADDRESS,
						to: email,
						subject: 'Mot de passe Digipad',
						html: '<p>Votre nouveau mot de passe :<br>' + motdepasse + '</p><p>Identifiant :<br>' + identifiant + '</p>'
					}
					try {
						const hash = await bcrypt.hash(motdepasse, 10)
						await db.HSET('utilisateurs:' + identifiant, 'motdepassetemp', hash)
						try {
							await envoyerEmail(message)
						} catch (err) {
							await db.HDEL('utilisateurs:' + identifiant, 'motdepassetemp')
							throw err
						}
					} catch (err) {
						console.error(err.stack || err)
					}
				}
			}
			res.status(200).send('message_envoye')
		} catch (err) {
			console.error(err.stack)
			res.status(200).send('message_envoye')
		}
	})

	app.post('/api/identifiant-oublie', limiteAuth, async (req, res) => {
		try {
			if (typeof req.body.email !== 'string') return res.status(400).send('erreur')
			const email = req.body.email.toLowerCase().trim()
			if (verifierEmail(email) === false) return res.status(400).send('erreur')
			const emailExiste = await db.EXISTS('emails:' + email)
			if (emailExiste === 1) {
				let donneesEmail = await db.HGETALL('emails:' + email)
				donneesEmail = donneesEmail ? { ...donneesEmail } : {}
				if (donneesEmail.hasOwnProperty('identifiant')) {
					const message = {
						from: process.env.EMAIL_ADDRESS,
						to: email,
						subject: 'Identifiant Digipad',
						html: '<p>Voici l\'identifiant associé à votre compte Digipad : <strong>' + v.escapeHtml(donneesEmail.identifiant) + '</strong></p>'
					}
					try {
						await envoyerEmail(message)
					} catch (err) {
						console.error(err.stack || err)
					}
				}
			}
			res.status(200).send('message_envoye')
		} catch (err) {
			console.error(err.stack)
			res.status(200).send('message_envoye')
		}
	})

	app.post('/api/deconnexion', (req, res) => {
		supprimerSession(req)
		res.status(200).send('deconnecte')
	})

	app.post('/api/recuperer-donnees-auteur', async (req, res) => {
		const identifiant = req.body.identifiant
		const pad = req.body.pad
		try {
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('identifiant')) return res.status(500).send('erreur')
			const autorisation = (req.session.identifiant === identifiant && await verifierAdmin(pad, donneesPad, req.session) === true)
			if (!autorisation) return res.status(403).send('non_autorise')
			const pads = await recupererDonneesAuteur(identifiant)
			if (!pads.hasOwnProperty('padsCrees') || !pads.hasOwnProperty('padsAdmins')) return res.status(500).send('erreur')
			let padsCrees = nettoyerPads(pads.padsCrees)
			let padsAdmins = nettoyerPads(pads.padsAdmins)
			padsCrees = supprimerDoublons(padsCrees)
			padsAdmins = supprimerDoublons(padsAdmins)
			res.status(200).json({ padsCrees, padsAdmins })
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/modifier-informations', async (req, res) => {
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
			const nom = req.body.nom
			let ancienemail = ''
			if (donneesUtilisateur.hasOwnProperty('email')) {
				ancienemail = donneesUtilisateur.email
			}
			if (typeof req.body.email !== 'string') return res.status(400).send('erreur')
			const email = req.body.email.toLowerCase().trim()
			if (ancienemail !== '' && email === '') return res.status(400).send('erreur')
			if (email !== '' && verifierEmail(email) === false) return res.status(400).send('erreur')
			if (email !== '' && email !== ancienemail) {
				const emailExiste = await db.EXISTS('emails:' + email)
				if (emailExiste === 1) return res.status(409).send('email_existe_deja')
			}
			if (email !== ancienemail) {
				const transaction = db.multi().HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
				if (email !== '') {
					transaction.HSET('emails:' + email, 'identifiant', identifiant)
				}
				if (ancienemail !== '') {
					transaction.DEL('emails:' + ancienemail)
				}
				await transaction.exec()
			} else {
				await db.HSET('utilisateurs:' + identifiant, 'nom', nom)
			}
			req.session.nom = nom
			req.session.email = email
			res.status(200).send('utilisateur_modifie')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/modifier-mot-de-passe', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur') return res.status(401).send('non_connecte')
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donneesUtilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse.trim(), donneesUtilisateur.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse.trim(), 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
				req.session.motdepasse = hash
				res.status(200).send('motdepasse_modifie')
			} else {
				res.status(401).send('motdepasse_incorrect')
			}
		} catch (err) {
			console.error(err.stack)
			return res.status(500).send('erreur')
		}
	})

	app.post('/api/verifier-identifiant', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		try {
			const identifiant = req.body.identifiant
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 0) return res.status(400).send('identifiant_non_valide')
			if (utilisateurExiste !== 1) return res.status(500).send('erreur')
			res.status(200).send('identifiant_valide')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/verifier-mot-de-passe', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		try {
			const pad = req.body.pad
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('motdepasse')) return res.status(500).json({ message: 'erreur' })
			const motdepasse = req.body.motdepasse
			const motdepasseCorrect = (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse))
			if (!motdepasseCorrect) return res.status(401).json({ message: 'motdepasse_incorrect' })
			const identifiant = req.body.identifiant
			const acces = req.body.acces
			let langue = langueParDefaut
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
				langue = req.session.langue
			}
			let nom = ''
			if (req.session.hasOwnProperty('nom') && req.session.nom !== '' && req.session.nom !== undefined) {
				nom = req.session.nom
			}
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 1) {
				let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
				nom = donneesUtilisateur.nom
				langue = donneesUtilisateur.langue
			} else {
				const date = dayjs().format()
				await db.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
			}
			req.session.identifiant = identifiant
			req.session.motdepasse = ''
			req.session.nom = nom
			req.session.statut = 'auteur'
			req.session.langue = langue
			if (!req.session.hasOwnProperty('acces')) {
				req.session.acces = []
			}
			if (!req.session.hasOwnProperty('pads')) {
				req.session.pads = []
			}
			if (!req.session.pads.includes(parseInt(pad, 10))) {
				req.session.pads.push(parseInt(pad, 10))
			}
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			if (acces === true) {
				res.status(200).json({ message: 'motdepasse_correct', identifiant, nom, langue })
			} else {
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant, true)
				if (donneesPadProtege === 'erreur') return res.status(500).json({ message: 'erreur' })
				res.status(200).json({ message: 'motdepasse_correct', identifiant, nom, langue, pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite })
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).json({ message: 'erreur' })
		}
	})

	app.post('/api/modifier-langue', async (req, res) => {
		const identifiant = req.body.identifiant
		const langue = req.body.langue
		if (!langues.includes(langue)) return res.status(400).send('non_autorise')
		try {
			if (req.session.identifiant && req.session.identifiant === identifiant) {
				await db.HSET('utilisateurs:' + identifiant, 'langue', langue)
				req.session.langue = langue
			} else {
				req.session.langue = langue
			}
			req.session.save(() => {
				res.status(200).send('langue_modifiee')
			})
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/modifier-affichage', async (req, res) => {
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
			const affichage = req.body.affichage
			await db.HSET('utilisateurs:' + identifiant, 'affichage', affichage)
			res.status(200).send('affichage_modifie')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/modifier-classement', async (req, res) => {
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
			const classement = req.body.classement
			await db.HSET('utilisateurs:' + identifiant, 'classement', classement)
			req.session.classement = classement
			res.status(200).send('classement_modifie')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/ajouter-dossier', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur_ajout_dossier')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const nom = req.body.dossier
			let dossiers = []
			if (donneesUtilisateur.hasOwnProperty('dossiers')) {
				dossiers = JSON.parse(donneesUtilisateur.dossiers)
			}
			const id = Math.random().toString(36).substring(2)
			dossiers.push({ id: id, nom: nom, pads: [] })
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.status(200).json({ id, nom, pads: [] })
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_ajout_dossier')
		}
	})

	app.post('/api/modifier-dossier', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur_modification_dossier')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const nom = req.body.dossier
			const dossierId = req.body.dossierId
			const dossiers = JSON.parse(donneesUtilisateur.dossiers)
			dossiers.forEach((dossier, index) => {
				if (dossier.id === dossierId) {
					dossiers[index].nom = nom
				}
			})
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.status(200).send('dossier_modifie')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_modification_dossier')
		}
	})

	app.post('/api/supprimer-dossier', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur_suppression_dossier')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) return res.status(401).send('non_connecte')
			const dossierId = req.body.dossierId
			const dossiers = JSON.parse(donneesUtilisateur.dossiers).filter(d => d.id !== dossierId)
			await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
			res.status(200).send('dossier_supprime')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_suppression_dossier')
		}
	})
}
