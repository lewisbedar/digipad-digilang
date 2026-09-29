import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import multer from 'multer'
import { createDevMiddleware } from 'vike/server'
import { etat } from './etat.js'
import { definirNomFichier, verifierIdentifiantPad, verifierJetonFichier } from './fonctions.js'
import enregistrerRoutesPages from './routes-pages.js'
import enregistrerRoutesComptes from './routes-comptes.js'
import enregistrerRoutesPads from './routes-pads.js'
import enregistrerRoutesAdmin from './routes-admin.js'
import enregistrerRoutesFichiers from './routes-fichiers.js'
import enregistrerRoutesLadigitale from './routes-ladigitale.js'

const production = process.env.NODE_ENV === 'production'
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = `${__dirname}/..`

// Orchestrateur des routes : installe les middlewares communs, délègue les routes à un module par domaine, puis referme avec le repli 404 et le gestionnaire d'erreurs
export default async function initialiserRoutes ({
	app,
	hote,
	hoteTeleversement,
	langues,
	langueParDefaut,
	db,
	dureeSession,
	earlyHints103,
	secretJetonTeleversement,
	secretJetonFichier,
	creationCompte,
	validationInscription,
	limiteEchecsConnexionParIdentifiant,
	limiteAuth,
	limiteInscription,
	limiteInscriptionEmail,
	limiteConnexion,
	stockage,
	s3Client,
	bucket,
	etherpad,
	etherpadApi,
	creationPadSansCompte,
	limitePadsParCompte,
	limitePadSansCompte,
	limiteAuthAdmin,
	limiteActionsSensibles,
	limiteTeleversement,
	limiteArchive,
	extensionsAutorisees,
	httpServer,
	trustProxy,
	scriptSrc,
	hoteWs,
	hoteVite,
	domaineUmami,
	domaineMatomo,
	originesS3,
	sessionMiddleware,
	nomCookieSession,
	domainesAutorises,
	limiteApi,
	limiteLienFichier,
	limiteImportApi,
	cheminLienFichier,
	fonctions
}) {
	const { verifierEspaceDisque, verifierAccesLectureDonnees } = fonctions

	app.set('trust proxy', trustProxy)
	app.use(cors({ 'origin': domainesAutorises }))

	const politiqueSecuriteApplication = helmet.contentSecurityPolicy({
		directives: {
			'default-src': ['\'self\'', 'https:'],
			'connect-src': ['\'self\'', hoteWs, hoteVite, hoteTeleversement, 'https://pixabay.com', 'https://noembed.com', ...(etherpad ? [etherpad] : []), ...(domaineUmami ? [domaineUmami] : []), ...(domaineMatomo ? [domaineMatomo] : []), ...(Array.isArray(originesS3) ? originesS3 : [])],
			'script-src': scriptSrc,
			'media-src': ['\'self\'', 'https:', 'data:', 'blob:'],
			'worker-src': ['\'self\'', 'https:', 'data:', 'blob:'],
			'img-src': ['\'self\'', 'https:', 'data:'],
			'frame-ancestors': ['*'],
			'frame-src': ['*', 'blob:']
		}
	})

	const dureeCacheAccesFichier = 5000
	const tailleMaxCacheAccesFichier = 10000
	const cacheAccesFichier = new Map()
	const decisionsEnCours = new Map()
	const dureeCacheNavigateurPublic = parseInt(process.env.FILE_CACHE_PUBLIC) || 86400
	const dureeCacheNavigateurProtege = parseInt(process.env.FILE_CACHE_PROTECTED) || 300
	const delegationFichiersNginx = parseInt(process.env.X_ACCEL_REDIRECT) === 1 && stockage === 'fs'
	const cheminInterneFichiers = '/fichiers-internes/'

	function lireCacheAccesFichier (cle) {
		const entree = cacheAccesFichier.get(cle)
		if (!entree) return null
		if (entree.expire <= Date.now()) {
			cacheAccesFichier.delete(cle)
			return null
		}
		return entree
	}

	function ecrireCacheAccesFichier (cle, decision) {
		if (cacheAccesFichier.size >= tailleMaxCacheAccesFichier) {
			const premiere = cacheAccesFichier.keys().next()
			if (!premiere.done) cacheAccesFichier.delete(premiere.value)
		}
		cacheAccesFichier.set(cle, { ...decision, expire: Date.now() + dureeCacheAccesFichier })
		return decision
	}

	function mutualiserDecision (cle, produire) {
		const enCours = decisionsEnCours.get(cle)
		if (enCours) return enCours
		const promesse = produire().finally(() => decisionsEnCours.delete(cle))
		decisionsEnCours.set(cle, promesse)
		return promesse
	}

	function definirAccesPad (pad) {
		const cle = 'pad:' + pad
		const decision = lireCacheAccesFichier(cle)
		if (decision) return Promise.resolve(decision)
		return mutualiserDecision(cle, async () => {
			const acces = await db.HGET('pads:' + pad, 'acces')
			if (!acces) return ecrireCacheAccesFichier(cle, { existe: false })
			return ecrireCacheAccesFichier(cle, { existe: true, public: acces === 'public' })
		})
	}

	function definirAccesProtege (pad, session, cle) {
		const decision = lireCacheAccesFichier(cle)
		if (decision) return Promise.resolve(decision)
		return mutualiserDecision(cle, async () => {
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.acces) return { existe: false }
			if (donneesPad.acces === 'public') return { existe: true, public: true, autorise: true }
			const autorise = await verifierAccesLectureDonnees(pad, donneesPad, session)
			const decisionProtegee = { existe: true, public: false, autorise }
			return autorise ? ecrireCacheAccesFichier(cle, decisionProtegee) : decisionProtegee
		})
	}

	function appliquerSession (req, res) {
		return new Promise((resoudre, rejeter) => {
			sessionMiddleware(req, res, (err) => err ? rejeter(err) : resoudre())
		})
	}

	function definirCleCookieSession (req) {
		const entete = req.headers.cookie
		if (!entete) return ''
		const prefixe = nomCookieSession + '='
		for (const morceau of entete.split(';')) {
			const valeur = morceau.trim()
			if (valeur.startsWith(prefixe)) return valeur.substring(prefixe.length)
		}
		return ''
	}

	async function verifierAccesFichier (req, res, next) {
		try {
			const segments = req.path.split('/').filter((segment) => segment !== '')
			if (segments.length !== 2 || !verifierIdentifiantPad(segments[0])) return res.status(404).send('introuvable')
			let fichier
			try { fichier = decodeURIComponent(segments[1]) } catch { return res.status(404).send('introuvable') }
			if (fichier === '' || /[/\\]/.test(fichier) || fichier.includes('..')) return res.status(404).send('introuvable')
			const pad = segments[0]
			const accesPad = await definirAccesPad(pad)
			if (!accesPad.existe) return res.status(404).send('introuvable')
			if (accesPad.public === true) return servirFichier(res, next, pad, fichier, false)
			const cookie = definirCleCookieSession(req)
			const cle = cookie !== '' ? 'cookie:' + cookie + ':' + pad : ''
			if (cle !== '') {
				const decisionCachee = lireCacheAccesFichier(cle)
				if (decisionCachee && decisionCachee.autorise === true) return servirFichier(res, next, pad, fichier, true)
			}
			await appliquerSession(req, res)
			const decision = await definirAccesProtege(pad, req.session, cle !== '' ? cle : 'session:' + req.sessionID + ':' + pad)
			if (!decision.existe) return res.status(404).send('introuvable')
			if (decision.public === true) return servirFichier(res, next, pad, fichier, false)
			if (decision.autorise !== true && !verifierJetonFichier(secretJetonFichier, req.query.jeton, pad, fichier)) {
				return res.status(403).send('non_autorise')
			}
			servirFichier(res, next, pad, fichier, true)
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	}

	function definirCacheFichier (res, protege) {
		if (protege) {
			res.setHeader('Cache-Control', 'private, max-age=' + dureeCacheNavigateurProtege)
		} else {
			res.setHeader('Cache-Control', 'public, max-age=' + dureeCacheNavigateurPublic + ', immutable')
		}
	}

	function definirEnTetesFichier (res) {
		definirCacheFichier(res, res.locals.fichierProtege === true)
	}

	function servirFichier (res, next, pad, fichier, protege) {
		if (protege) res.locals.fichierProtege = true
		if (!delegationFichiersNginx) return next()
		definirCacheFichier(res, protege)
		const extension = path.extname(fichier)
		res.type(extension !== '' ? extension : 'application/octet-stream')
		res.setHeader('X-Accel-Redirect', cheminInterneFichiers + pad + '/' + encodeURIComponent(fichier))
		res.end()
	}

	function definirEnTetesSecuriteFichier (req, res, next) {
		res.setHeader('Content-Security-Policy', 'default-src \'none\'; sandbox')
		res.setHeader('X-Content-Type-Options', 'nosniff')
		next()
	}

	app.use('/fichiers', definirEnTetesSecuriteFichier, verifierAccesFichier)
	app.use('/fichiers', express.static('static/fichiers', { setHeaders: definirEnTetesFichier }))

	app.use(politiqueSecuriteApplication)

	if (parseInt(process.env.REVERSE_PROXY) !== 1 || !production) {
		app.use('/pdfjs', express.static('static/pdfjs'))
		app.use('/temp', express.static('static/temp'))
	}
	if (production && parseInt(process.env.REVERSE_PROXY) !== 1) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
	}

	app.use(express.json({ limit: '10mb' }))
	app.use(sessionMiddleware)
	app.use('/api' + cheminLienFichier, limiteLienFichier)
	app.use('/api/', limiteApi)

	if (!production) {
		const { devMiddleware } = await createDevMiddleware({ root, viteConfig: { server: { ws: { server: httpServer } } } })
		app.use(devMiddleware)
	}

	const televerserTemp = multer({
		limits: { fileSize: limiteArchive, files: 1 },
		storage: multer.diskStorage({
			destination: (req, fichier, callback) => {
				const dossier = path.join(__dirname, '..', '/static/temp/')
				callback(null, dossier)
			},
			filename: (req, fichier, callback) => {
				const nom = definirNomFichier(fichier.originalname)
				callback(null, nom)
			}
		}),
		fileFilter: (req, fichier, callback) => {
			if (req.body.pad) {
				verifierEspaceDisque('temp').then((espaceSuffisant) => {
					if (!espaceSuffisant) {
						callback('erreur_espace_disque')
					} else {
						callback(null, true)
					}
				}).catch((err) => callback(err))
			} else {
				callback(null, true)
			}
		}
	}).single('fichier')


	enregistrerRoutesPages({
		app,
		hote,
		hoteTeleversement,
		langues,
		langueParDefaut,
		db,
		dureeSession,
		earlyHints103,
		fonctions
	})

	enregistrerRoutesComptes({
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
	})

	enregistrerRoutesPads({
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
	})

	enregistrerRoutesAdmin({
		app,
		stockage,
		s3Client,
		bucket,
		db,
		limitePadsParCompte,
		limiteAuthAdmin,
		limiteActionsSensibles,
		fonctions
	})

	enregistrerRoutesFichiers({
		app,
		stockage,
		s3Client,
		db,
		etherpad,
		etherpadApi,
		limiteTeleversement,
		extensionsAutorisees,
		secretJetonTeleversement,
		secretJetonFichier,
		fonctions
	})

	enregistrerRoutesLadigitale({
		app,
		langueParDefaut,
		stockage,
		db,
		etherpad,
		etherpadApi,
		televerserTemp,
		limiteImportApi,
		fonctions
	})

	app.use((req, res) => {
		if (etat.maintenance === true) {
			res.redirect(302, '/maintenance')
		} else {
			res.redirect(302, '/')
		}
	})

	app.use((err, req, res, next) => {
		console.error(err.stack)
		if (res.headersSent) return next(err)
		if (req.path.startsWith('/api/')) {
			res.status(500).send('erreur')
		} else {
			res.redirect(302, '/')
		}
	})
}
