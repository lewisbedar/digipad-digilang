import path from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import multer from 'multer'
import { createDevMiddleware } from 'vike/server'
import { etat } from './etat.js'
import { definirNomFichier } from './fonctions.js'
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
	cleCrypto,
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
	httpServer,
	trustProxy,
	scriptSrc,
	hoteWs,
	hoteVite,
	domaineUmami,
	domaineMatomo,
	sessionMiddleware,
	domainesAutorises,
	limiteApi,
	fonctions
}) {
	const { verifierEspaceDisque } = fonctions

	app.set('trust proxy', trustProxy)
	app.use(
		helmet.contentSecurityPolicy({
			directives: {
				"default-src": ["'self'", "https:"],
				"connect-src": ["'self'", hoteWs, hoteVite, hoteTeleversement, "https://pixabay.com", "https://noembed.com", ...(etherpad ? [etherpad] : []), ...(domaineUmami ? [domaineUmami] : []), ...(domaineMatomo ? [domaineMatomo] : [])],
				"script-src": scriptSrc,
				"media-src": ["'self'", "https:", "data:", "blob:"],
				"worker-src": ["'self'", "https:", "data:", "blob:"],
				"img-src": ["'self'", "https:", "data:"],
				"frame-ancestors": ["*"],
				"frame-src": ["*", "blob:"]
			}
		})
	)
	app.use(express.json({ limit: '10mb' }))
	app.use(sessionMiddleware)
	app.use(cors({ 'origin': domainesAutorises }))
	app.use('/api/', limiteApi)
	if (parseInt(process.env.REVERSE_PROXY) !== 1 || !production) {
		app.use('/fichiers', express.static('static/fichiers'))
		app.use('/pdfjs', express.static('static/pdfjs'))
		app.use('/temp', express.static('static/temp'))
	}

	if (!production) {
    	const { devMiddleware } = await createDevMiddleware({ root, viteConfig: { server: { ws: { server: httpServer } } } })
    	app.use(devMiddleware)
  	} else if (production && parseInt(process.env.REVERSE_PROXY) !== 1) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
	}

	const televerserTemp = multer({
		limits: { fileSize: 200 * 1024 * 1024 },
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
		cleCrypto,
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
		fonctions
	})

	enregistrerRoutesLadigitale({
		app,
		langueParDefaut,
		stockage,
		s3Client,
		bucket,
		db,
		etherpad,
		etherpadApi,
		televerserTemp,
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
