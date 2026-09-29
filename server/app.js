import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import eiows from 'eiows'
import compression from 'compression'
import { createClient } from 'redis'
import cron from 'node-cron'
import nodemailer from 'nodemailer'
import { URL } from 'url'
import { RedisStore } from 'connect-redis'
import session from 'express-session'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import { RedisStore as RateLimitRedisStore } from 'rate-limit-redis'
import { EventEmitter } from 'events'
import { Agent } from 'https'
import { createHmac } from 'crypto'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { S3Client } from '@aws-sdk/client-s3'
import { verifierMotDePasseAdmin, definirExtensionsAutorisees } from './fonctions.js'
import creerFonctions from './fonctions-db.js'
import initialiserRoutes from './routes.js'
import initialiserSocket from './socket.js'

const production = process.env.NODE_ENV === 'production'
let cluster = false
if (production) {
	cluster = parseInt(process.env.NODE_CLUSTER) === 1
}

demarrerServeur().catch((err) => {
	console.error('Démarrage du serveur impossible :', err && err.stack ? err.stack : err)
	process.exit(1)
})

async function demarrerServeur () {
	const app = express()
	app.use(compression())
	const httpServer = createServer(app)

	let hote = 'http://localhost:3000'
	if (production) {
		hote = process.env.DOMAIN
	} else if (process.env.PORT) {
		hote = 'http://localhost:' + process.env.PORT
	}
	let origineAutorisee
	try {
		origineAutorisee = new URL(hote).origin
	} catch {
		throw new Error('DOMAIN manquante ou invalide dans les variables d\'environnement (ex. : https://digipad.app). Arrêt du serveur.')
	}
	const hoteWs = hote.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
	const hoteTeleversement = process.env.UPLOAD_HOST || hote
	const langues = ['fr', 'es', 'it', 'de', 'en', 'hr']
	let langueParDefaut = 'fr'
	if (process.env.VITE_DEFAULT_LANGUAGE && langues.includes(process.env.VITE_DEFAULT_LANGUAGE)) {
		langueParDefaut = process.env.VITE_DEFAULT_LANGUAGE
	}
	let stockage = 'fs'
	const lienPublicS3 = process.env.VITE_S3_PUBLIC_LINK
	let s3Client = ''
	let bucket = ''
	if (process.env.VITE_STORAGE && process.env.VITE_STORAGE === 's3' && lienPublicS3 && lienPublicS3 !== '') {
		stockage = 's3'
		bucket = process.env.S3_BUCKET
	}
	if (stockage === 's3') {
		const s3ServerType = process.env.S3_SERVER_TYPE || 'aws'
		const maxSockets = parseInt(process.env.S3_MAX_SOCKETS) || 500
		const agent = new Agent({
			keepAlive: true,
			maxSockets: maxSockets
		})
		s3Client = new S3Client({
			endpoint: process.env.S3_ENDPOINT,
			region: process.env.S3_REGION,
			credentials: {
				accessKeyId: process.env.S3_ACCESS_KEY,
				secretAccessKey: process.env.S3_SECRET_KEY
			},
			forcePathStyle: s3ServerType === 'minio' ? true : false,
			requestHandler: new NodeHttpHandler({ httpsAgent: agent })
		})
	}
	let db
	const db_port = parseInt(process.env.DB_PORT) || 6379
	if (production) {
		db = await createClient({
			url: 'redis://default:' + process.env.DB_PWD  + '@' + process.env.DB_HOST + ':' + db_port
		}).on('error', (err) => {
			console.error('Erreur Redis : ' + err)
		}).on('ready', () => {
			console.log('Redis prêt')
		}).connect()
	} else {
		db = await createClient({
			url: 'redis://localhost:' + db_port
		}).on('error', (err) => {
			console.error('Erreur Redis : ' + err)
		}).on('ready', () => {
			console.log('Redis prêt')
		}).connect()
	}
	const cookieSecurise = parseInt(process.env.COOKIE_SECURE) !== 0
	let storeOptions, cookie, domainesAutorises
	if (production) {
		storeOptions = {
			host: process.env.DB_HOST,
			port: db_port,
			pass: process.env.DB_PWD,
			client: db,
			prefix: 'sessions:'
		}
		cookie = cookieSecurise ? { sameSite: 'None', secure: true } : { sameSite: 'Lax', secure: false }
	} else {
		storeOptions = {
			host: 'localhost',
			port: db_port,
			client: db,
			prefix: 'sessions:'
		}
		cookie = {
			secure: false
		}
	}
	if (production && !process.env.SESSION_KEY) {
		throw new Error('SESSION_KEY manquante dans les variables d\'environnement. Arrêt du serveur.')
	}
	const redisStore = new RedisStore(storeOptions)
	const nomCookieSession = 'digipad'
	const sessionOptions = {
		secret: process.env.SESSION_KEY || 'cle-par-defaut-dev',
		store: redisStore,
		name: nomCookieSession,
		resave: false,
		rolling: true,
		saveUninitialized: false,
		cookie: cookie
	}
	const dureeSession = parseInt(process.env.SESSION_DURATION) || 864000000 //3600 * 24 * 10 * 1000
	const dureeTransfertPropriete = 3600000 //1 heure
	const sessionMiddleware = session(sessionOptions)

	if (production && process.env.AUTHORIZED_DOMAINS && process.env.AUTHORIZED_DOMAINS !== null && process.env.AUTHORIZED_DOMAINS !== '') {
		domainesAutorises = process.env.AUTHORIZED_DOMAINS.split(',').map(d => d.trim()).filter(d => d !== '')
	} else {
		domainesAutorises = '*'
	}

	let earlyHints103 = false
	if (process.env.EARLY_HINTS && parseInt(process.env.EARLY_HINTS) === 1) {
		earlyHints103 = true
	}

	const transporter = nodemailer.createTransport({
		host: process.env.SMTP_HOST,
		port: parseInt(process.env.SMTP_PORT),
		secure: parseInt(process.env.SMTP_SECURE) === 1,
		auth: {
			user: process.env.SMTP_USER,
			pass: process.env.SMTP_PASSWORD
		}
	})
	transporter.verify((err) => {
		if (err) console.error('Erreur SMTP : ', err)
		else console.log('SMTP prêt')
	})

	const dateCron = process.env.CRON_TASK_DATE || '0 1 */2 * *' // tous les 2 jours à 1h du matin

	const minimumEspaceDisque = parseInt(process.env.ALERT_AVAILABLE_SPACE) || 10

	const etherpad = process.env.VITE_ETHERPAD || null
	const etherpadApi = process.env.ETHERPAD_API_KEY
	// Ancien domaine Etherpad encore stocké dans les blocs créés avant le changement de domaine
	const ancienDomaineEtherpad = 'https://env-7747481.jcloud-ver-jpe.ik-server.com'

	const creationCompte = parseInt(process.env.VITE_CREATE_ACCOUNT) || 1
	const creationPadSansCompte = parseInt(process.env.VITE_PAD_WITHOUT_ACCOUNT) || 1


	if (production && process.env.UPLOAD_HOST && !process.env.UPLOAD_TOKEN_SECRET) {
		throw new Error('UPLOAD_TOKEN_SECRET manquante dans les variables d\'environnement alors qu\'UPLOAD_HOST est configuré. Arrêt du serveur.')
	}
	const secretJetonTeleversement = process.env.UPLOAD_TOKEN_SECRET || 'cle-par-defaut-dev'

	const secretJetonFichier = createHmac('sha256', process.env.SESSION_KEY || 'cle-par-defaut-dev').update('jeton-fichier').digest()

	if (stockage === 'fs' && parseInt(process.env.REVERSE_PROXY) === 1) {
		console.warn('REVERSE_PROXY=1 avec un stockage disque : « /fichiers » doit être transmis à Express (proxy_pass) et non servi directement par le reverse proxy, sinon les fichiers des pads privés et en accès protégé ne bénéficient pas du contrôle d\'accès. Voir la section « Fichiers (stockage disque) » du README.')
	}

	if (stockage === 'fs' && parseInt(process.env.X_ACCEL_REDIRECT) === 1) {
		console.log('X_ACCEL_REDIRECT=1 : après contrôle par Express, les fichiers sont servis par nginx depuis « /fichiers-internes/ ». Cette location doit exister et être déclarée « internal », sans quoi les réponses partiront vides. Voir la section « Fichiers (stockage disque) » du README.')
	} else if (stockage !== 'fs' && parseInt(process.env.X_ACCEL_REDIRECT) === 1) {
		console.warn('X_ACCEL_REDIRECT=1 est sans effet avec un stockage S3 : « /fichiers » n\'est plus utilisé par l\'application.')
	}

	const validationInscription = parseInt(process.env.ACCOUNT_VALIDATION) || 0

	const limiteRequetesAuth = parseInt(process.env.RATE_LIMIT_AUTH) || 10
	const limiteRequetesInscription = parseInt(process.env.RATE_LIMIT_SIGNUP) || 50
	const limiteRequetesInscriptionEmail = parseInt(process.env.RATE_LIMIT_SIGNUP_EMAIL) || 4
	const limiteRequetesConnexion = parseInt(process.env.RATE_LIMIT_LOGIN) || 30
	const limiteEchecsConnexionParIdentifiant = parseInt(process.env.RATE_LIMIT_LOGIN_USERNAME) || 10
	const limiteRequetesActionsSensibles = parseInt(process.env.RATE_LIMIT_SENSITIVE) || 10
	const limiteEchecsCodeAdresse = parseInt(process.env.RATE_LIMIT_CODE) || 100
	const limiteEchecsMotDePasseAdresse = parseInt(process.env.RATE_LIMIT_PASSWORD) || 10
	const limiteRequetesApi = parseInt(process.env.RATE_LIMIT_API) || 100
	const limiteRequetesLienFichier = parseInt(process.env.RATE_LIMIT_FILE_LINK) || 300
	const limiteRequetesImportApi = parseInt(process.env.RATE_LIMIT_API_IMPORT) || 10
	const fenetreEchecsConnexionParIdentifiant = 15 * 60

	let trustProxy = process.env.TRUST_PROXY
	if (trustProxy === undefined || trustProxy.trim() === '') {
		trustProxy = 1
	} else if (trustProxy.trim() === 'true') {
		trustProxy = true
	} else if (trustProxy.trim() === 'false') {
		trustProxy = false
	} else if (/^\d+$/.test(trustProxy.trim())) {
		trustProxy = parseInt(trustProxy.trim())
	} else {
		trustProxy = trustProxy.trim()
	}

	// Augmenter nombre de tâches asynchrones par défaut
	EventEmitter.defaultMaxListeners = 20
	
	const salonMaintenance = 'admin-maintenance'

	const limiteTeleversement = (parseFloat(process.env.VITE_UPLOAD_LIMIT) || 20) * 1024 * 1024
	const limiteArchive = (parseFloat(process.env.ARCHIVE_UPLOAD_LIMIT) || 200) * 1024 * 1024
	const extensionsAutorisees = definirExtensionsAutorisees(process.env.VITE_UPLOAD_FILE_TYPES)

	const limitePadsParCompte = parseInt(process.env.VITE_PAD_LIMIT, 10) || 100

	const cheminLienFichier = '/generer-lien-fichier'

	const limiteApi = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesApi,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-api:'
		}),
		skipSuccessfulRequests: true,
		skip: (req) => req.path === cheminLienFichier,
		validate: { trustProxy: false }
	})

	const limiteLienFichier = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesLienFichier,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-lien-fichier:'
		}),
		skipSuccessfulRequests: true,
		validate: { trustProxy: false }
	})

	const limiteImportApi = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesImportApi,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-import-api:'
		}),
		validate: { trustProxy: false }
	})

	const limiteAuth = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesAuth,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-auth:'
		}),
		skipSuccessfulRequests: true,
		validate: { trustProxy: false }
	})

	const limiteInscription = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesInscription,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-inscription:'
		}),
		skipSuccessfulRequests: true,
		validate: { trustProxy: false }
	})

	const limiteInscriptionEmail = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesInscriptionEmail,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-inscription-email:'
		}),
		skipSuccessfulRequests: true,
		requestWasSuccessful: (req, res) => res.statusCode === 403 || res.statusCode === 409 || res.statusCode === 500,
		keyGenerator: (req) => {
			const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : ''
			return email || ipKeyGenerator(req.ip)
		},
		validate: { trustProxy: false }
	})

	const limitePadSansCompte = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesInscription,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-pad-sans-compte:'
		}),
		skipSuccessfulRequests: true,
		validate: { trustProxy: false }
	})

	const limiteConnexion = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesConnexion,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-connexion:'
		}),
		skipSuccessfulRequests: true,
		requestWasSuccessful: (req, res) => res.statusCode !== 401 && res.statusCode !== 429,
		validate: { trustProxy: false }
	})

	const limiteAuthAdmin = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 3,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-admin:'
		}),
		skipSuccessfulRequests: true,
		skip: (req) => !req.body?.admin || verifierMotDePasseAdmin(req.body.admin),
		validate: { trustProxy: false }
	})

	const limiteActionsSensibles = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: limiteRequetesActionsSensibles,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-actions-sensibles:'
		}),
		skipSuccessfulRequests: true,
		skip: (req) => Boolean(req.body?.admin),
		keyGenerator: (req) => {
			const identifiant = typeof req.body?.identifiant === 'string' ? req.body.identifiant.trim().toLowerCase() : ''
			return ipKeyGenerator(req.ip) + ':' + identifiant
		},
		validate: { trustProxy: false }
	})

	let scriptSrc
	let domaineMatomo = null
	let domaineUmami = null
	if (process.env.VITE_MATOMO && process.env.VITE_MATOMO !== '') {
		domaineMatomo = process.env.VITE_MATOMO
		scriptSrc = ['\'self\'', domaineMatomo]
	} else if (process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_SCRIPT_URL !== '') {
		const umamiScriptUrl = new URL(process.env.UMAMI_SCRIPT_URL)
		domaineUmami = umamiScriptUrl.protocol + '//' + umamiScriptUrl.hostname
		scriptSrc = ['\'self\'', domaineUmami]
	} else {
		scriptSrc = ['\'self\'']
	}
	if (!production) {
		scriptSrc.push('\'unsafe-inline\'')
	}

	const originesS3 = []
	if (stockage === 's3') {
		const ajouterOrigineS3 = (lien, prefixe = '') => {
			if (!lien || lien === '') return
			try {
				const url = new URL(lien)
				const origine = url.protocol + '//' + (prefixe !== '' ? prefixe + '.' : '') + url.host
				if (!originesS3.includes(origine)) originesS3.push(origine)
			} catch {}
		}
		ajouterOrigineS3(lienPublicS3)
		ajouterOrigineS3(process.env.S3_ENDPOINT)
		if (bucket && bucket !== '' && (process.env.S3_SERVER_TYPE || 'aws') !== 'minio') {
			ajouterOrigineS3(process.env.S3_ENDPOINT, bucket)
		}
	}

	let hoteVite = 'ws://localhost:24678'
	if (production) {
		hoteVite = ''
	}

	const port = process.env.PORT || 3000

	const io = new Server(httpServer, {
		wsEngine: eiows.Server,
		cors: {
			origin: origineAutorisee
		},
		pingInterval: 120000,
		pingTimeout: 100000,
		maxHttpBufferSize: 1e7,
		allowRequest: (req, callback) => {
			const origine = req.headers.origin
			callback(null, !origine || origine === origineAutorisee)
		},
		cookie: false,
		perMessageDeflate: false
	})

	const fonctions = creerFonctions({
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
	})

	const dureeVerrouPurge = 14400
	cron.schedule(dateCron, async () => {
		try {
			const verrou = await db.SET('verrou-purge-temp', '1', { NX: true, EX: dureeVerrouPurge })
			if (!verrou) return
			const purgeLocale = await fonctions.purgerFichiersTemporairesLocaux()
			if (purgeLocale.supprimes > 0 || purgeLocale.echecs > 0) {
				console.log('Purge des fichiers temporaires locaux : ' + purgeLocale.supprimes + ' supprimé(s), ' + purgeLocale.echecs + ' échec(s)')
			}
			const purge = await fonctions.purgerFichiersTemporairesS3()
			if (purge.supprimes > 0 || purge.echecs > 0) {
				console.log('Purge des fichiers temporaires S3 : ' + purge.supprimes + ' supprimé(s), ' + purge.echecs + ' échec(s)')
			}
		} catch (err) {
			console.error('Purge des fichiers temporaires : ' + err.stack)
		}
	})

	const dureeVerrouACL = 840
	if (stockage === 's3') {
		cron.schedule('*/15 * * * *', async () => {
			try {
				const verrou = await db.SET('verrou-acl', '1', { NX: true, EX: dureeVerrouACL })
				if (!verrou) return
				const acl = await fonctions.resynchroniserACLEnAttente()
				if (acl.pads > 0) {
					console.log('Reprise des resynchronisations ACL : ' + acl.resolus + ' pad(s) sur ' + acl.pads)
				}
			} catch (err) {
				console.error('Reprise des resynchronisations ACL : ' + err.stack)
			}
		})
	}

	await initialiserRoutes({
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
	})
	if (cluster === true) {
		if (typeof process.send !== 'function') {
			console.error('NODE_CLUSTER=1 mais le processus n\'a pas de canal IPC : adaptateur cluster ignoré.')
		} else {
			try {
				io.adapter(createAdapter())
			} catch (err) {
				console.error('Adaptateur cluster non installé : ' + err.message)
			}
		}
	}
	io.on('maintenance', (valeur) => {
		fonctions.definirMaintenance(valeur, false)
	})
	const wrap = middleware => (socket, next) => middleware(socket.request, {}, next)
	io.use(wrap(sessionMiddleware))
	// Rate limit pour les sockets : 100 actions par seconde par worker
	const compteurSocket = new Map()
	io.use((socket, next) => {
		const identifiant = socket.request.session?.identifiant || socket.handshake.address
		if (!compteurSocket.has(identifiant)) {
			compteurSocket.set(identifiant, { n: 0, intervalle: setInterval(() => {
				compteurSocket.get(identifiant).n = 0
			}, 1000) })
		}
		socket.use((paquet, suivant) => {
			let compteur = compteurSocket.get(identifiant)
			if (!compteur) {
				compteur = { n: 0, intervalle: setInterval(() => {
					const e = compteurSocket.get(identifiant)
					if (e) e.n = 0
				}, 1000) }
				compteurSocket.set(identifiant, compteur)
			}
			compteur.n++
			if (compteur.n > 100) {
				return suivant(new Error('connexions_trop_nombreuses'))
			}
			suivant()
		})
		socket.on('disconnect', () => {
			const io_sockets = [...io.sockets.sockets.values()]
			const autreSockets = io_sockets.filter((s)  => {
				return s.id !== socket.id && (s.request.session?.identifiant || s.handshake.address) === identifiant
			})
			if (autreSockets.length === 0) {
				const compteur = compteurSocket.get(identifiant)
				if (compteur) {
					clearInterval(compteur.intervalle)
					compteurSocket.delete(identifiant)
				}
			}
		})
		next()
	})

	initialiserSocket({
		io,
		db,
		langues,
		dureeSession,
		dureeTransfertPropriete,
		salonMaintenance,
		trustProxy,
		fonctions
	})

	httpServer.listen(port)
}
