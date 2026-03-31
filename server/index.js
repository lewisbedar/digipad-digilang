import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'
import { createAdapter } from '@socket.io/cluster-adapter'
import eiows from 'eiows'
import compression from 'compression'
import axios from 'axios'
import cors from 'cors'
import { createClient } from 'redis'
import bodyParser from 'body-parser'
import helmet from 'helmet'
import v from 'voca'
import multer from 'multer'
import Busboy from 'busboy'
import sharp from 'sharp'
import gm from 'gm'
import archiver from 'archiver'
import extract from 'extract-zip'
import dayjs from 'dayjs'
import 'dayjs/locale/es.js'
import 'dayjs/locale/fr.js'
import 'dayjs/locale/de.js'
import 'dayjs/locale/hr.js'
import 'dayjs/locale/it.js'
import localizedFormat from 'dayjs/plugin/localizedFormat.js'
import bcrypt from 'bcrypt'
import cron from 'node-cron'
import nodemailer from 'nodemailer'
import { URL, fileURLToPath } from 'url'
import * as cheerio from 'cheerio'
import libre from 'libreoffice-convert'
import util from 'util'
libre.convertAsync = util.promisify(libre.convert)
import { RedisStore } from 'connect-redis'
import session from 'express-session'
import { EventEmitter } from 'events'
import { randomBytes } from 'crypto'
import Rabbit from 'crypto-js/rabbit.js'
import Utf8 from 'crypto-js/enc-utf8.js'
import checkDiskSpace from 'check-disk-space'
import { Agent } from 'https'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { S3Client, CopyObjectCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { renderPage, createDevMiddleware } from 'vike/server'

const production = process.env.NODE_ENV === 'production'
let cluster = false
if (production) {
	cluster = parseInt(process.env.NODE_CLUSTER) === 1
}
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = `${__dirname}/..`

demarrerServeur()

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
	const hoteTeleversement = process.env.UPLOAD_HOST || hote
	let stockage = 'fs'
	const lienPublicS3 = process.env.VITE_S3_PUBLIC_LINK
	let s3Client = ''
	let bucket = ''
	if (process.env.VITE_STORAGE && process.env.VITE_STORAGE === 's3' && lienPublicS3 !== null && lienPublicS3 !== '') {
		stockage = 's3'
		bucket = process.env.S3_BUCKET
	}
	if (stockage === 's3') {
		const s3ServerType = process.env.S3_SERVER_TYPE || 'aws'
		const maxSockets = process.env.S3_MAX_SOCKETS || 500
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
	const db_port = process.env.DB_PORT || 6379
	if (production) {
		db = await createClient({
			url: 'redis://default:' + process.env.DB_PWD  + '@' + process.env.DB_HOST + ':' + db_port
		}).on('error', function (err) {
			console.log('redis: ', err)
		}).connect()
	} else {
		db = await createClient({
			url: 'redis://localhost:' + db_port
		}).on('error', function (err) {
			console.log('redis: ' + err)
		}).connect()
	}
	let storeOptions, cookie, domainesAutorises
	let maintenance = false
	if (production) {
		storeOptions = {
			host: process.env.DB_HOST,
			port: db_port,
			pass: process.env.DB_PWD,
			client: db,
			prefix: 'sessions:'
		}
		cookie = {
			sameSite: 'None',
			secure: true
		}
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
	const redisStore = new RedisStore(storeOptions)
	const sessionOptions = {
		secret: process.env.SESSION_KEY,
		store: redisStore,
		name: 'digipad',
		resave: false,
		rolling: true,
		saveUninitialized: false,
		cookie: cookie
	}
	const dureeSession = parseInt(process.env.SESSION_DURATION) || 864000000 //3600 * 24 * 10 * 1000
	const sessionMiddleware = session(sessionOptions)

	if (production && process.env.AUTHORIZED_DOMAINS && process.env.AUTHORIZED_DOMAINS !== null && process.env.AUTHORIZED_DOMAINS !== '') {
		domainesAutorises = process.env.AUTHORIZED_DOMAINS.split(',')
	} else {
		domainesAutorises = '*'
	}

	let earlyHints103 = false
	if (process.env.EARLY_HINTS && parseInt(process.env.EARLY_HINTS) === 1) {
		earlyHints103 = true
	}

	const transporter = nodemailer.createTransport({
		host: process.env.EMAIL_HOST,
		port: process.env.EMAIL_PORT,
		secure: process.env.EMAIL_SECURE,
		auth: {
			user: process.env.EMAIL_ADDRESS,
			pass: process.env.EMAIL_PASSWORD
		}
	})

	const dateCron = process.env.CRON_TASK_DATE || '59 23 * * Saturday' // tous les samedis à 23h59
	cron.schedule(dateCron, async function () {
		await fs.emptyDir(path.join(__dirname, '..', '/static/temp'))
	})

	const minimumEspaceDisque = parseInt(process.env.ALERT_AVAILABLE_SPACE) || 10

	// Charger plugin dayjs
	dayjs.extend(localizedFormat)

	const etherpad = process.env.VITE_ETHERPAD
	const etherpadApi = process.env.VITE_ETHERPAD_API_KEY

	const creationCompte = parseInt(process.env.VITE_CREATE_ACCOUNT) || 1
	const creationPadSansCompte = parseInt(process.env.VITE_PAD_WITHOUT_ACCOUNT) || 1

	const cleCrypto = process.env.ENCRYPTION_KEY || ''

	const validationInscription = parseInt(process.env.ACCOUNT_VALIDATION) || 0

	// Augmenter nombre de tâches asynchrones par défaut
	EventEmitter.defaultMaxListeners = 20

	let scriptSrc
	if (process.env.MATOMO && process.env.MATOMO !== '') {
		scriptSrc = ["'self'", process.env.MATOMO, "'unsafe-inline'"]
	} else if (process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_SCRIPT_URL !== '') {
		const umamiScriptUrl = new URL(process.env.UMAMI_SCRIPT_URL)
		scriptSrc = ["'self'", umamiScriptUrl.protocol + '//' + umamiScriptUrl.hostname, "'unsafe-inline'"]
	} else {
		scriptSrc = ["'self'", "'unsafe-inline'"]
	}
	app.set('trust proxy', true)
	app.use(
		helmet.contentSecurityPolicy({
			directives: {
				"default-src": ["'self'", "https:", "ws:"],
				"script-src": scriptSrc,
				"media-src": ["'self'", "https:", "data:", "blob:"],
				"worker-src": ["'self'", "https:", "data:", "blob:"],
				"img-src": ["'self'", "https:", "data:"],
				"frame-ancestors": ["*"],
				"frame-src": ["*", "blob:"]
			}
		})
	)
	app.use(bodyParser.json({ limit: '500mb' }))
	app.use(sessionMiddleware)
	app.use(cors({ 'origin': domainesAutorises }))
	if (parseInt(process.env.REVERSE_PROXY) !== 1 || !production) {
		app.use('/fichiers', express.static('static/fichiers'))
		app.use('/pdfjs', express.static('static/pdfjs'))
		app.use('/temp', express.static('static/temp'))
	}

	if (!production) {
    	const { devMiddleware } = (
      		await createDevMiddleware({ root })
    	)
    	app.use(devMiddleware)
  	} else if (production && parseInt(process.env.REVERSE_PROXY) !== 1) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
	}

	app.get('/', async function (req, res, next) {
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else if (req.session.identifiant && req.session.statut === 'utilisateur') {
			res.redirect('/u/' + req.session.identifiant)
		} else {
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
				langue = req.session.langue
			}
			const pageContextInit = {
				urlOriginal: req.originalUrl,
				params: req.query,
				hote: hote,
				langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
				langue: langue
			}
			const pageContext = await renderPage(pageContextInit)
			if (pageContext.errorWhileRendering) {
				if (!pageContext.httpResponse) {
					throw pageContext.errorWhileRendering
				}
			}
			const { httpResponse } = pageContext
			if (!httpResponse) {
				return next()
			}
			const { body, statusCode, headers, earlyHints } = httpResponse
			if (earlyHints103 === true && res.writeEarlyHints) {
				res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
			}
			if (headers) {
				headers.forEach(([name, value]) => res.setHeader(name, value))
			}
			res.status(statusCode).send(body)
		}
  	})

	app.get('/u/:utilisateur', async function (req, res, next) {
		const identifiant = req.params.utilisateur
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else if (identifiant === req.session.identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.redirect('/'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				recupererDonneesUtilisateur(identifiant).then(async function (pads) {
					// Vérification des données des pads
					let contenusSupprimes = []
					let favorisSupprimes = []
					let padsCrees = pads[0].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0 && element.hasOwnProperty('id') && element.hasOwnProperty('token') && element.hasOwnProperty('identifiant') && element.hasOwnProperty('titre') && element.hasOwnProperty('fond') && element.hasOwnProperty('date')
					})
					let padsCorbeille = pads[1].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0 && element.hasOwnProperty('id') && element.hasOwnProperty('token') && element.hasOwnProperty('identifiant') && element.hasOwnProperty('titre') && element.hasOwnProperty('fond') && element.hasOwnProperty('date')
					})
					let padsRejoints = pads[2].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0 && element.hasOwnProperty('id') && element.hasOwnProperty('token') && element.hasOwnProperty('identifiant') && element.hasOwnProperty('titre') && element.hasOwnProperty('fond') && element.hasOwnProperty('date')
					})
					let padsAdmins = pads[3].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0 && element.hasOwnProperty('id') && element.hasOwnProperty('token') && element.hasOwnProperty('identifiant') && element.hasOwnProperty('titre') && element.hasOwnProperty('fond') && element.hasOwnProperty('date')
					})
					let padsFavoris = pads[4].filter(function (element) {
						return element !== '' && Object.keys(element).length > 0 && element.hasOwnProperty('id') && element.hasOwnProperty('token') && element.hasOwnProperty('identifiant') && element.hasOwnProperty('titre') && element.hasOwnProperty('fond') && element.hasOwnProperty('date')
					})
					padsCrees.forEach(function (pad, indexPad) {
						padsCrees[indexPad].id = parseInt(pad.id)
					})
					padsCorbeille.forEach(function (pad, indexPad) {
						contenusSupprimes.push(parseInt(pad.id))
						padsCorbeille[indexPad].id = parseInt(pad.id)
					})
					padsRejoints.forEach(function (pad, indexPad) {
						padsRejoints[indexPad].id = parseInt(pad.id)
					})
					padsAdmins.forEach(function (pad, indexPad) {
						padsAdmins[indexPad].id = parseInt(pad.id)
					})
					padsFavoris.forEach(function (pad, indexPad) {
						padsFavoris[indexPad].id = parseInt(pad.id)
						if (contenusSupprimes.includes(parseInt(pad.id))) {
							favorisSupprimes.push(parseInt(pad.id))
						}
					})
					// Supprimer pads corbeille des favoris
					padsFavoris = padsFavoris.filter(function (element) {
						return !contenusSupprimes.includes(element.id)
					})
					// Suppresion redondances pads rejoints et pads administrés
					padsRejoints.forEach(function (pad, indexPad) {
						padsAdmins.forEach(function (padAdmin) {
							if (pad.id === padAdmin.id) {
								padsRejoints.splice(indexPad, 1)
							}
						})
					})
					// Supprimer doublons
					padsCrees = padsCrees.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					padsCorbeille = padsCorbeille.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					padsRejoints = padsRejoints.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					padsAdmins = padsAdmins.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					padsFavoris = padsFavoris.filter((valeur, index, self) =>
						index === self.findIndex((t) => (
							t.id === valeur.id && t.token === valeur.token
						))
					)
					// Dossiers
					let contenusSupprimesDansDossiers = []
					let dossiers = []
					if (donneesUtilisateur.hasOwnProperty('dossiers')) {
						try {
							dossiers = JSON.parse(donneesUtilisateur.dossiers)
						} catch (err) {
							dossiers = []
						}
					}
					const listePadsDossiers = []
					dossiers.forEach(function (dossier, indexDossier) {
						dossier.pads.forEach(function (pad, indexPad) {
							dossiers[indexDossier].pads[indexPad] = parseInt(pad)
							if (contenusSupprimes.includes(parseInt(pad))) {
								contenusSupprimesDansDossiers.push({ pad: parseInt(pad), dossier: dossier.id })
							}
							if (!listePadsDossiers.includes(parseInt(pad))) {
								listePadsDossiers.push(parseInt(pad))
							}
						})
					})
					const donneesPadsDossiers = []
					for (const pad of listePadsDossiers) {
						const donneePadsDossiers = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pads:' + pad)
							if (resultat === null || resultat === 1) {
								resolve()
							} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
								resolve()
							} else {
								resolve(parseInt(pad))
							}
						})
						donneesPadsDossiers.push(donneePadsDossiers)
					}
					Promise.all(donneesPadsDossiers).then(async function (padsSupprimes) {
						padsSupprimes.forEach(function (padSupprime) {
							if (padSupprime !== '' || padSupprime !== null) {
								dossiers.forEach(function (dossier, indexDossier) {
									if (dossier.pads.includes(padSupprime)) {
										const indexPad = dossier.pads.indexOf(padSupprime)
										dossiers[indexDossier].pads.splice(indexPad, 1)
									}
								})
							}
						})
						// Préparer contenus corbeille avec favoris et dossiers
						padsCorbeille.forEach(function (pad, indexPad) {
							if (favorisSupprimes.includes(pad.id)) {
								padsCorbeille[indexPad].favori = true
							} else {
								padsCorbeille[indexPad].favori = false
							}
							if (contenusSupprimesDansDossiers.map(function (e) { return e.pad }).includes(pad.id)) {
								const index = contenusSupprimesDansDossiers.map(function (e) { return e.pad }).indexOf(pad.id)
								padsCorbeille[indexPad].dossier = contenusSupprimesDansDossiers[index].dossier
							} else {
								padsCorbeille[indexPad].dossier = ''
							}
						})
						// Supprimer doublons dans dossiers
						dossiers.forEach(function (dossier, indexDossier) {
							const pads = []
							dossier.pads.forEach(function (pad, indexPad) {
								if (!pads.includes(pad)) {
									pads.push(pad)
								} else {
									dossiers[indexDossier].pads.splice(indexPad, 1)
								}
							})
						})
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						// Supprimer contenus corbeille dans dossiers
						dossiers.forEach(function (dossier, indexDossier) {
							dossier.pads.forEach(function () {
								dossiers[indexDossier].pads = dossiers[indexDossier].pads.filter(function (element) {
									return !contenusSupprimes.includes(element)
								})
							})
						})
						const pageContextInit = {
							urlOriginal: req.originalUrl,
							params: req.query,
							hote: hote,
							langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
							identifiant: req.session.identifiant,
							nom: req.session.nom,
							email: req.session.email,
							langue: req.session.langue,
							statut: req.session.statut,
							affichage: donneesUtilisateur.affichage,
							classement: donneesUtilisateur.classement,
							padsCrees: padsCrees,
							padsCorbeille: padsCorbeille,
							padsRejoints: padsRejoints,
							padsAdmins: padsAdmins,
							padsFavoris: padsFavoris,
							dossiers: dossiers
						}
						const pageContext = await renderPage(pageContextInit)
						if (pageContext.errorWhileRendering) {
							if (!pageContext.httpResponse) {
								throw pageContext.errorWhileRendering
							}
						}
						const { httpResponse } = pageContext
						if (!httpResponse) {
							return next()
						}
						const { body, statusCode, headers, earlyHints } = httpResponse
						if (earlyHints103 === true && res.writeEarlyHints) {
							res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
						}
						if (headers) {
							headers.forEach(([name, value]) => res.setHeader(name, value))
						}
						res.status(statusCode).send(body)
					})
				})
			} else {
				res.redirect('/')
			}
		} else {
			supprimerSession(req)
			res.redirect('/')
		}
  	})

	app.get('/p/:id/:token', async function (req, res, next) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		if (req.session.identifiant === '' || req.session.identifiant === undefined) {
			const identifiant = 'u' + Math.random().toString(16).slice(3)
			req.session.identifiant = identifiant
			req.session.motdepasse = ''
			req.session.nom = identifiant.slice(0, 8).toUpperCase()
			req.session.email = ''
			req.session.langue = 'fr'
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
					if (!req.session.pads.includes(parseInt(pad))) {
						req.session.pads.push(parseInt(pad))
					}
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
				}
			} catch (e) {}
		}
		const userAgent = req.headers['user-agent']
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			params: req.query,
			hote: hote,
			hoteTeleversement: hoteTeleversement,
			userAgent: userAgent,
			langues: ['fr', 'es', 'it', 'de', 'en', 'hr'],
			identifiant: req.session.identifiant,
			nom: req.session.nom,
			email: req.session.email,
			langue: req.session.langue,
			statut: req.session.statut,
			pads: req.session.pads
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.get('/maintenance', async function (req, res, next) {
		if (maintenance === false) {
			res.redirect('/')
			return false
		}
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			hote: hote,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})
	
	app.get('/admin', async function (req, res, next) {
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
			hote: hote,
			langue: langue
		}
		const pageContext = await renderPage(pageContextInit)
		if (pageContext.errorWhileRendering) {
			if (!pageContext.httpResponse) {
				throw pageContext.errorWhileRendering
			}
		}
		const { httpResponse } = pageContext
		if (!httpResponse) {
			return next()
		}
		const { body, statusCode, headers, earlyHints } = httpResponse
		if (earlyHints103 === true && res.writeEarlyHints) {
			res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
		}
		if (headers) {
			headers.forEach(([name, value]) => res.setHeader(name, value))
		}
		res.status(statusCode).send(body)
  	})

	app.post('/api/inscription', async function (req, res) {
		if (creationCompte === 1) {
			const identifiant = req.body.identifiant
			if (identifiant.match(/^[\w-]+$/)) {
				const motdepasse = req.body.motdepasse
				const email = req.body.email.toLowerCase()
				let reponse = await db.EXISTS('utilisateurs:' + identifiant)
				if (reponse === null) {
					res.send('erreur'); return false
				} else if (reponse === 0) {
					reponse = await db.EXISTS('emails:' + email)
					if (reponse === null) {
						res.send('erreur'); return false
					} else if (reponse === 0 && validationInscription === 1) {
						let codeActivation = randomBytes(18)
						codeActivation = codeActivation.toString('hex')
						const hash = await bcrypt.hash(motdepasse, 10)
						const date = dayjs().format()
						let langue = 'fr'
						if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
							langue = req.session.langue
						}
						await db
						.multi()
						.HSET('activations:' + codeActivation, ['id', identifiant, 'motdepasse', hash, 'date', date, 'email', email, 'langue', langue])
						.EXPIRE('activations:' + codeActivation, 43200)
						.exec()
						const message = {
							from: '"La Digitale" <' + process.env.EMAIL_ADDRESS + '>',
							to: '"Moi" <' + email + '>',
							subject: 'Activation de votre compte Digipad',
							html: '<p>Vous avez créé un compte Digipad ayant pour identifiant : <strong>' + identifiant + '</strong></p><p>Cliquez sur ce lien pour activer votre compte : <a href="' + hote + '/activation/' + codeActivation + '" target="_blank">' + hote + '/activation/' + codeActivation + '</a>.</p><p>Veuillez ignorer ce message si vous n\'êtes pas à l\'origine de cette création de compte.</p><p>La Digitale</p>'
						}
						transporter.sendMail(message, async function (err) {
							if (err) {
								res.send('erreur_email')
							} else {
								res.send('activation_demandee')
							}
						})
					} else if (reponse === 0 && validationInscription === 0) {
						const hash = await bcrypt.hash(motdepasse, 10)
						const date = dayjs().format()
						let langue = 'fr'
						if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
							langue = req.session.langue
						}
						await db
						.multi()
						.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'motdepasse', hash, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc'])
						.HSET('emails:' + email, 'identifiant', identifiant)
						.exec()
						req.session.identifiant = identifiant
						req.session.motdepasse = motdepasse
						req.session.nom = ''
						req.session.email = email
						req.session.langue = langue
						req.session.statut = 'utilisateur'
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
						const message = {
							from: '"La Digitale" <' + process.env.EMAIL_ADDRESS + '>',
							to: '"Moi" <' + email + '>',
							subject: 'Nouveau compte Digipad',
							html: '<p>Vous avez créé un compte Digipad ayant pour identifiant : <strong>' + identifiant + '</strong></p><p>Conservez bien cet identifiant, il est nécessaire pour vous connecter à votre compte.</p><p>La Digitale</p>'
						}
						transporter.sendMail(message, async function (err) {
							if (err) {
								res.send('erreur_email')
							} else {
								res.send('compte_cree')
							}
						})
					} else {
						res.send('email_existe_deja')
					}
				} else {
					res.send('utilisateur_existe_deja')
				}
			} else {
				res.send('identifiant_invalide')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.get('/activation/:code', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		} else if (validationInscription === 0) {
			res.redirect('/')
			return false
		}
		const codeActivation = req.params.code
		let reponse = await db.EXISTS('activations:' + codeActivation)
		if (reponse === null) {
			res.redirect('/')
		} else if (reponse === 1) {
			let donnees = await db.HGETALL('activations:' + codeActivation)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.redirect('/'); return false }
			const identifiant = donnees.id
			const email = donnees.email
			const motdepasse = donnees.motdepasse
			const date = donnees.date
			const langue = donnees.langue
			let reponse = await db.EXISTS('utilisateurs:' + identifiant)
			if (reponse === 0) {
				reponse = await db.EXISTS('emails:' + email)
				if (reponse === 0) {
					await db
					.multi()
					.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'motdepasse', motdepasse, 'date', date, 'nom', '', 'email', email, 'langue', langue, 'affichage', 'liste', 'classement', 'date-asc'])
					.HSET('emails:' + email, 'identifiant', identifiant)
					.UNLINK('activations:' + codeActivation)
					.exec()
					const pageContextInit = {
						urlOriginal: req.originalUrl,
						hote: hote,
						langue: langue
					}
					const pageContext = await renderPage(pageContextInit)
					if (pageContext.errorWhileRendering) {
						if (!pageContext.httpResponse) {
							throw pageContext.errorWhileRendering
						}
					}
					const { httpResponse } = pageContext
					if (!httpResponse) {
						return next()
					}
					const { body, statusCode, headers, earlyHints } = httpResponse
					if (earlyHints103 === true && res.writeEarlyHints) {
						res.writeEarlyHints({ link: earlyHints.map((e) => e.earlyHintLink) })
					}
					if (headers) {
						headers.forEach(([name, value]) => res.setHeader(name, value))
					}
					res.status(statusCode).send(body)
				} else {
					res.redirect('/')
				}
			} else {
				res.redirect('/')
			}
		} else {
			res.redirect('/')
		}
	})

	app.post('/api/connexion', async function (req, res) {
		const identifiant = req.body.identifiant
		const motdepasse = req.body.motdepasse
		const reponse = await db.EXISTS('utilisateurs:' + identifiant)
		if (reponse === null) { 
			res.send('erreur_connexion')
		} else if (reponse === 1) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur_connexion'); return false }
			let comparaison = false
			if (motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '') {
				comparaison = await bcrypt.compare(motdepasse, donnees.motdepasse)
			}
			let comparaisonTemp = false
			if (donnees.hasOwnProperty('motdepassetemp') && donnees.motdepassetemp.trim() !== '' && motdepasse.trim() !== '') {
				comparaisonTemp = await bcrypt.compare(motdepasse, donnees.motdepassetemp)
			}
			if (comparaison === true || comparaisonTemp === true) {
				if (comparaisonTemp === true) {
					const hash = await bcrypt.hash(motdepasse, 10)
					await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
					await db.HDEL('utilisateurs:' + identifiant, 'motdepassetemp')
				}
				const nom = donnees.nom
				const langue = donnees.langue
				req.session.identifiant = identifiant
				req.session.motdepasse = motdepasse
				req.session.nom = nom
				req.session.langue = langue
				req.session.statut = 'utilisateur'
				let email = ''
				if (donnees.hasOwnProperty('email')) {
					email = donnees.email.toLowerCase()
				}
				req.session.email = email
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				res.json({ identifiant: identifiant })
			} else {
				res.send('erreur_connexion')
			}
		} else {
			res.send('erreur_connexion')
		}
	})

	app.post('/api/mot-de-passe-oublie', async function (req, res) {
		const identifiant = req.body.identifiant
		let email = req.body.email.toLowerCase().trim()
		const reponse = await db.EXISTS('utilisateurs:' + identifiant)
		if (reponse === null) { res.send('erreur'); return false }
		if (reponse === 1) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
			if ((donnees.hasOwnProperty('email') && donnees.email.toLowerCase() === email) || (verifierEmail(identifiant) === true)) {
				if (!donnees.hasOwnProperty('email') || (donnees.hasOwnProperty('email') && donnees.email === '')) {
					email = identifiant
				}
				const motdepasse = genererMotDePasse(8)
				const message = {
					from: '"La Digitale" <' + process.env.EMAIL_ADDRESS + '>',
					to: '"Moi" <' + email + '>',
					subject: 'Mot de passe Digipad',
					html: '<p>Votre nouveau mot de passe : ' + motdepasse + '</p>'
				}
				transporter.sendMail(message, async function (err) {
					if (err) {
						res.send('erreur_email')
					} else {
						const hash = await bcrypt.hash(motdepasse, 10)
						await db.HSET('utilisateurs:' + identifiant, 'motdepassetemp', hash)
						res.send('message_envoye')
					}
				})
			} else {
				res.send('email_invalide')
			}
		} else {
			res.send('identifiant_invalide')
		}
	})

	app.post('/api/deconnexion', function (req, res) {
		supprimerSession(req)
		res.send('deconnecte')
	})

	app.post('/api/recuperer-donnees-auteur', async function (req, res) {
		const identifiant = req.body.identifiant
		const pad = req.body.pad
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur'); return false }
		if (req.session.identifiant === identifiant && await verifierAdmin(pad, donnees, req.session) === true) {
			recupererDonneesAuteur(identifiant).then(function (pads) {
				let padsCrees = pads[0].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				let padsAdmins = pads[1].filter(function (element) {
					return element !== '' && Object.keys(element).length > 0
				})
				// Vérification des données des pads
				padsCrees.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsCrees.splice(indexPad, 1)
					} else {
						padsCrees[indexPad].id = parseInt(pad.id)
					}
				})
				padsAdmins.forEach(function (pad, indexPad) {
					if (!pad.hasOwnProperty('id') || !pad.hasOwnProperty('token') || !pad.hasOwnProperty('identifiant') || !pad.hasOwnProperty('titre') || !pad.hasOwnProperty('fond') || !pad.hasOwnProperty('date')) {
						padsAdmins.splice(indexPad, 1)
					} else {
						padsAdmins[indexPad].id = parseInt(pad.id)
					}
				})
				// Supprimer doublons
				padsCrees = padsCrees.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				padsAdmins = padsAdmins.filter((valeur, index, self) =>
					index === self.findIndex((t) => (
						t.id === valeur.id && t.token === valeur.token
					))
				)
				res.json({ padsCrees: padsCrees, padsAdmins: padsAdmins })
			})
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/recuperer-donnees-pad', async function (req, res) {
		const id = req.body.id
		const token = req.body.token
		const identifiant = req.body.identifiant
		const statut = req.body.statut
		const pads = req.body.pads
		const resultat = await db.EXISTS('pads:' + id)
		if (resultat === null) { res.send('erreur'); return false }
		let pad = await db.HGETALL('pads:' + id)
		pad = Object.assign({}, pad)
		if (resultat === 1 && pad !== null) {
			recupererDonneesPad(id, token, identifiant, statut, pads, res)
		} else if ((resultat !== 1 || pad === null) && isNaN(parseInt(id)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
			const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
			if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
				await ajouterPadDansDb(id, donnees)
				recupererDonneesPad(id, token, identifiant, statut, pads, res)
			} else {
				res.send('erreur')
			}
		} else {
			res.send('erreur')
		}
	})

	app.post('/api/creer-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur_creation'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const titre = req.body.titre
				const token = Math.random().toString(16).slice(2)
				const date = dayjs().format()
				let id = 1
				const resultat = await db.EXISTS('pad')
				if (resultat === null) { res.send('erreur_creation'); return false }
				if (resultat === 1) {
					const reponse = await db.GET('pad')
					if (reponse === null) { res.send('erreur_creation'); return false }
					id = parseInt(reponse) + 1
				}
				const creation = await creerPad(id, token, titre, date, identifiant)
				if (creation === true) {
					if (stockage === 'fs') {
						const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
						await fs.mkdirp(chemin)
					}
					const destination = req.body.dossier
					if (destination !== '') {
						const dossiers = JSON.parse(donneesUtilisateur.dossiers)
						dossiers.forEach(function (dossier, indexDossier) {
							if (dossier.id === destination) {
								dossiers[indexDossier].pads.push(id)
							}
						})
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
					}
					res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [] })
				} else {
					res.send('erreur_creation')
				}
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/creer-pad-sans-compte', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		if (creationPadSansCompte === 1) {
			let identifiant, nom
			if (req.session.identifiant === '' || req.session.identifiant === undefined || (req.session.identifiant.length !== 13 && req.session.identifiant.substring(0, 1) !== 'u')) {
				identifiant = 'u' + Math.random().toString(16).slice(3)
				nom = genererPseudo()
				req.session.identifiant = identifiant
				req.session.nom = nom
			} else {
				identifiant = req.session.identifiant
				nom = req.session.nom
			}
			if (!req.session.hasOwnProperty('acces')) {
				req.session.acces = []
			}
			if (!req.session.hasOwnProperty('pads')) {
				req.session.pads = []
			}
			const titre = req.body.titre
			const motdepasse = req.body.motdepasse
			const hash = await bcrypt.hash(motdepasse, 10)
			const token = Math.random().toString(16).slice(2)
			const date = dayjs().format()
			let id = 1
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
				langue = req.session.langue
			}
			const resultat = await db.EXISTS('pad')
			if (resultat === null) { res.send('erreur_creation'); return false }
			if (resultat === 1) {
				const reponse = await db.GET('pad')
				if (reponse === null) { res.send('erreur_creation'); return false }
				id = parseInt(reponse) + 1
			}
			const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, '')
			if (creation === true) {
				if (stockage === 'fs') {
					const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
					await fs.mkdirp(chemin)
				}
				req.session.motdepasse = ''
				req.session.langue = langue
				req.session.statut = 'auteur'
				req.session.pads.push(id)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				res.json({ id: id, token: token, titre: titre, identifiant: identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date: date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0 })
			} else {
				res.send('erreur_creation')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/deconnecter-pad', function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			req.session.identifiant = ''
			req.session.motdepasse = ''
			req.session.statut = ''
			res.send('deconnecte')
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-mot-de-passe-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			const pad = req.body.pad
			let donnees = await db.HGETALL('pads:' + pad)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('pads:' + pad, 'motdepasse', hash)
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-pad-favoris', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const pad = req.body.padId
				await db.SADD('pads-favoris:' + identifiant, pad.toString())
				res.send('pad_ajoute_favoris')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-pad-favoris', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const pad = req.body.padId
				await db.SREM('pads-favoris:' + identifiant, pad.toString())
				res.send('pad_supprime_favoris')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/deplacer-pad', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const padId = req.body.padId
				const destination = req.body.destination
				const dossiers = JSON.parse(donneesUtilisateur.dossiers)
				dossiers.forEach(function (dossier, indexDossier) {
					if (dossier.pads.includes(padId)) {
						const indexPad = dossier.pads.indexOf(padId)
						dossiers[indexDossier].pads.splice(indexPad, 1)
					}
					if (dossier.id === destination) {
						dossiers[indexDossier].pads.push(padId)
					}
				})
				await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
				res.send('pad_deplace')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/dupliquer-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			const pad = req.body.padId
			if (await verifierAdminUtilisateur(pad, identifiant, req.session.motdepasse) === true) {
				const num = await db.GET('pad')
				if (num === null) { res.send('erreur_duplication'); return false }
				const id = parseInt(num) + 1
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				checkDiskSpace(dossier).then(async function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (stockage === 'fs' && espace < minimumEspaceDisque) {
						res.send('erreur_espace_disque')
					} else {
						const resultat = await db.EXISTS('pads:' + pad)
						if (resultat === null) { res.send('erreur_duplication'); return false }
						if (resultat === 1) {
							let donnees = await db.HGETALL('pads:' + pad)
							donnees = Object.assign({}, donnees)
							if (donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur_duplication'); return false }
							const donneesBlocs = []
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { res.send('erreur_duplication'); return false }
							for (const [indexBloc, bloc] of blocs.entries()) {
								const donneesBloc = new Promise(async function (resolve) {
									let infos = await db.HGETALL('pad-' + pad + ':' + bloc)
									infos = Object.assign({}, infos)
									if (infos === null) { resolve({}); return false }
									const date = dayjs().format()
									if (infos.hasOwnProperty('vignette') && definirVignettePersonnalisee(infos.vignette) === true) {
										infos.vignette = path.basename(infos.vignette)
									}
									let visibilite = 'visible'
									if (infos.hasOwnProperty('visibilite')) {
										visibilite = infos.visibilite
									}
									if (infos.hasOwnProperty('iframe') && infos.iframe !== '' && infos.iframe.includes(etherpad)) {
										const etherpadId = infos.iframe.replace(etherpad + '/p/', '')
										const destinationId = 'pad-' + id + '-' + Math.random().toString(16).slice(2)
										const url = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
										axios.get(url)
										infos.iframe = etherpad + '/p/' + destinationId
										infos.media = etherpad + '/p/' + destinationId
									}
									const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
									await db
									.multi()
									.HSET('pad-' + id + ':' + blocId, ['id', infos.id, 'bloc', blocId, 'titre', infos.titre, 'texte', infos.texte, 'media', infos.media, 'iframe', infos.iframe, 'type', infos.type, 'source', infos.source, 'vignette', infos.vignette, 'date', date, 'identifiant', infos.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infos.colonne, 'visibilite', visibilite])
									.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
									.exec()
									resolve(blocId)
								})
								donneesBlocs.push(donneesBloc)
							}
							Promise.all(donneesBlocs).then(async function () {
								const token = Math.random().toString(16).slice(2)
								const date = dayjs().format()
								const code = Math.floor(100000 + Math.random() * 900000)
								let registreActivite = 'active'
								let conversation = 'desactivee'
								let listeUtilisateurs = 'activee'
								let editionNom = 'desactivee'
								let ordre = 'croissant'
								let largeur = 'normale'
								let enregistrements = 'desactives'
								let copieBloc = 'desactivee'
								let affichageColonnes = []
								if (donnees.hasOwnProperty('registreActivite')) {
									registreActivite = donnees.registreActivite
								}
								if (donnees.hasOwnProperty('conversation')) {
									conversation = donnees.conversation
								}
								if (donnees.hasOwnProperty('listeUtilisateurs')) {
									listeUtilisateurs = donnees.listeUtilisateurs
								}
								if (donnees.hasOwnProperty('editionNom')) {
									editionNom = donnees.editionNom
								}
								if (donnees.hasOwnProperty('ordre')) {
									ordre = donnees.ordre
								}
								if (donnees.hasOwnProperty('largeur')) {
									largeur = donnees.largeur
								}
								if (donnees.hasOwnProperty('enregistrements')) {
									enregistrements = donnees.enregistrements
								}
								if (donnees.hasOwnProperty('copieBloc')) {
									copieBloc = donnees.copieBloc
								}
								if (donnees.hasOwnProperty('affichageColonnes')) {
									affichageColonnes = JSON.parse(donnees.affichageColonnes)
								} else {
									JSON.parse(donnees.colonnes).forEach(function () {
										affichageColonnes.push(true)
									})
								}
								if (!donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
									donnees.fond = path.basename(donnees.fond)
								}
								if (donnees.hasOwnProperty('code')) {
									await db
									.multi()
									.INCR('pad')
									.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'code', code, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0])
									.SADD('pads-crees:' + identifiant, id.toString())
									.SADD('utilisateurs-pads:' + id, identifiant)
									.exec()
								} else {
									await db
									.multi()
									.INCR('pad')
									.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0])
									.SADD('pads-crees:' + identifiant, id.toString())
									.SADD('utilisateurs-pads:' + id, identifiant)
									.exec()
								}
								if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))) {
									await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id))
								} else if (stockage === 's3') {
									const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
									if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
										for (let i = 0; i < liste.Contents.length; i++) {
											await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: id + '/' + liste.Contents[i].Key.replace(pad + '/', ''), CopySource: '/' + bucket + '/' + liste.Contents[i].Key, ACL: 'public-read' }))
										}
									}
								}
								const destination = req.body.dossier
								if (destination !== '') {
									let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
									donneesUtilisateur = Object.assign({}, donneesUtilisateur)
									if (donneesUtilisateur !== null) {
										const dossiers = JSON.parse(donneesUtilisateur.dossiers)
										dossiers.forEach(function (dossier, indexDossier) {
											if (dossier.id === destination) {
												dossiers[indexDossier].pads.push(id)
											}
										})
										await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
									}
								}
								res.json({ id: id, token: token, titre: 'Copie de ' + donnees.titre, identifiant: identifiant, fond: donnees.fond, acces: donnees.acces, code: code, contributions: donnees.contributions, affichage: donnees.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.fichiers, enregistrements: enregistrements, liens: donnees.liens, documents: donnees.documents, commentaires: donnees.commentaires, evaluations: donnees.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.bloc, activite: 0 })
							})
						} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
							const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
							if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
								if (donnees.pad.identifiant === identifiant) {
									const date = dayjs().format()
									const donneesBlocs = []
									for (const [indexBloc, bloc] of donnees.blocs.entries()) {
										const donneesBloc = new Promise(async function (resolve) {
											if (Object.keys(bloc).length > 0) {
												if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
													bloc.vignette = path.basename(bloc.vignette)
												}
												let visibilite = 'visible'
												if (bloc.hasOwnProperty('visibilite')) {
													visibilite = bloc.visibilite
												}
												if (bloc.hasOwnProperty('iframe') && bloc.iframe !== '' && bloc.iframe.includes(etherpad)) {
													const etherpadId = bloc.iframe.replace(etherpad + '/p/', '')
													const destinationId = 'pad-' + id + '-' + Math.random().toString(16).slice(2)
													const url = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
													axios.get(url)
													bloc.iframe = etherpad + '/p/' + destinationId
													bloc.media = etherpad + '/p/' + destinationId
												}
												const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
												await db
												.multi()
												.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', bloc.colonne, 'visibilite', visibilite])
												.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
												.exec()
												resolve(blocId)
											} else {
												resolve({})
											}
										})
										donneesBlocs.push(donneesBloc)
									}
									Promise.all(donneesBlocs).then(async function () {
										const token = Math.random().toString(16).slice(2)
										const code = Math.floor(100000 + Math.random() * 900000)
										let registreActivite = 'active'
										let conversation = 'desactivee'
										let listeUtilisateurs = 'activee'
										let editionNom = 'desactivee'
										let ordre = 'croissant'
										let largeur = 'normale'
										let enregistrements = 'desactives'
										let copieBloc = 'desactivee'
										let affichageColonnes = []
										if (donnees.pad.hasOwnProperty('registreActivite')) {
											registreActivite = donnees.pad.registreActivite
										}
										if (donnees.pad.hasOwnProperty('conversation')) {
											conversation = donnees.pad.conversation
										}
										if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
											listeUtilisateurs = donnees.pad.listeUtilisateurs
										}
										if (donnees.pad.hasOwnProperty('editionNom')) {
											editionNom = donnees.pad.editionNom
										}
										if (donnees.pad.hasOwnProperty('ordre')) {
											ordre = donnees.pad.ordre
										}
										if (donnees.pad.hasOwnProperty('largeur')) {
											largeur = donnees.pad.largeur
										}
										if (donnees.pad.hasOwnProperty('enregistrements')) {
											enregistrements = donnees.pad.enregistrements
										}
										if (donnees.pad.hasOwnProperty('copieBloc')) {
											copieBloc = donnees.pad.copieBloc
										}
										if (donnees.pad.hasOwnProperty('affichageColonnes')) {
											affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
										} else {
											JSON.parse(donnees.pad.colonnes).forEach(function () {
												affichageColonnes.push(true)
											})
										}
										if (!donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string') {
											donnees.pad.fond = path.basename(donnees.pad.fond)
										}
										if (donnees.pad.hasOwnProperty('code')) {
											await db
											.multi()
											.INCR('pad')
											.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0])
											.SADD('pads-crees:' + identifiant, id.toString())
											.SADD('utilisateurs-pads:' + id, identifiant)
											.exec()
										} else {
											await db
											.multi()
											.INCR('pad')
											.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0])
											.SADD('pads-crees:' + identifiant, id.toString())
											.SADD('utilisateurs-pads:' + id, identifiant)
											.exec()
										}
										if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))) {
											await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id))
										} else if (stockage === 's3') {
											const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
											if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
												for (let i = 0; i < liste.Contents.length; i++) {
													await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: id + '/' + liste.Contents[i].Key.replace(pad + '/', ''), CopySource: '/' + bucket + '/' + liste.Contents[i].Key, ACL: 'public-read' }))
												}
											}
										}
										const destination = req.body.dossier
										if (destination !== '') {
											let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
											donneesUtilisateur = Object.assign({}, donneesUtilisateur)
											if (donneesUtilisateur !== null) {
												const dossiers = JSON.parse(donneesUtilisateur.dossiers)
												dossiers.forEach(function (dossier, indexDossier) {
													if (dossier.id === destination) {
														dossiers[indexDossier].pads.push(id)
													}
												})
												await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
											}
										}
										res.json({ id: id, token: token, titre: 'Copie de ' + donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: 0 })
									})
								} else {
									res.send('non_autorise')
								}
							} else {
								res.send('erreur_duplication')
							}
						}
					}
				})
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/exporter-pad', async function (req, res) {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const motdepasseEnvAdmin = process.env.ADMIN_PASSWORD
		let admin = false
		if (motdepasseAdmin !== '' && motdepasseAdmin === motdepasseEnvAdmin) {
			admin = true
		}
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			const id = req.body.padId
			const resultat = await db.EXISTS('pads:' + id)
			if (resultat === null) { res.send('erreur_export'); return false }
			if (resultat === 1) {
				let donneesPad = await db.HGETALL('pads:' + id)
				donneesPad = Object.assign({}, donneesPad)
				if (donneesPad === null) { res.send('erreur_export'); return false }
				if (admin || await verifierAdmin(id, donneesPad, req.session) === true) {
					exporterPad(req, res, id, 'erreur_export')
				} else {
					res.send('non_autorise')
				}
			} else if (resultat !== 1 && isNaN(parseInt(id)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
				const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
				if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
					if (donnees.pad.identifiant === identifiant || (admin !== '' && admin === motdepasseAdmin)) {
						exporterPadJson(res, id, donnees)
					} else {
						res.send('non_autorise')
					}
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('pad_inexistant')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/importer-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.session.identifiant
		if (identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur_import'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				televerserTemp(req, res, async function (err) {
					if (err) { res.send('erreur_import'); return false }
					try {
						const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
						const cible = path.join(__dirname, '..', '/static/temp/archive-' + Math.floor((Math.random() * 100000) + 1))
						await extract(source, { dir: cible })
						const donnees = await fs.readJson(path.normalize(cible + '/donnees.json'))
						const parametres = JSON.parse(req.body.parametres)
						// Vérification des clés des données
						if (donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && donnees.pad.hasOwnProperty('id') && donnees.pad.hasOwnProperty('token') && donnees.pad.hasOwnProperty('titre') && donnees.pad.hasOwnProperty('identifiant') && donnees.pad.hasOwnProperty('fond') && donnees.pad.hasOwnProperty('acces') && donnees.pad.hasOwnProperty('contributions') && donnees.pad.hasOwnProperty('affichage') && donnees.pad.hasOwnProperty('fichiers') && donnees.pad.hasOwnProperty('liens') && donnees.pad.hasOwnProperty('documents') && donnees.pad.hasOwnProperty('commentaires') && donnees.pad.hasOwnProperty('evaluations') && donnees.pad.hasOwnProperty('date') && donnees.pad.hasOwnProperty('colonnes') && donnees.pad.hasOwnProperty('bloc') && donnees.pad.hasOwnProperty('activite')) {
							const resultat = await db.GET('pad')
							if (resultat === null) { res.send('erreur_import'); return false }
							const id = parseInt(resultat) + 1
							const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
							checkDiskSpace(dossier).then(async function (diskSpace) {
								const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
								if (stockage === 'fs' && espace < minimumEspaceDisque) {
									res.send('erreur_espace_disque')
								} else {
									const donneesBlocs = []
									const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
									if (stockage === 'fs') {
										await fs.mkdirp(chemin)
									}
									for (const [indexBloc, bloc] of donnees.blocs.entries()) {
										const donneesBloc = new Promise(async function (resolve) {
											if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
												const date = dayjs().format()
												let commentaires = 0
												let evaluations = 0
												if (parametres.commentaires === true) {
													commentaires = bloc.commentaires
												}
												if (parametres.evaluations === true) {
													evaluations = bloc.evaluations
												}
												if (definirVignettePersonnalisee(bloc.vignette) === true) {
													bloc.vignette = path.basename(bloc.vignette)
												}
												let visibilite = 'visible'
												if (bloc.hasOwnProperty('visibilite')) {
													visibilite = bloc.visibilite
												}
												const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
												await db
												.multi()
												.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
												.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
												.exec()
												if (parametres.commentaires === true) {
													for (const commentaire of bloc.listeCommentaires) {
														if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
															await db.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
														}
													}
												}
												if (parametres.evaluations === true) {
													for (const evaluation of bloc.listeEvaluations) {
														if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
															await db.ZADD('evaluations:' + blocId, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
														}
													}
												}
												if (stockage === 'fs' && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
													await fs.copy(path.normalize(cible + '/fichiers/' + bloc.media), path.normalize(chemin + '/' + bloc.media, { overwrite: true }))
												} else if (stockage === 's3' && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
													const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + bloc.media))
													await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.media, Body: buffer, ACL: 'public-read' }))
												}
												if (stockage === 'fs' && bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.vignette))) {
													await fs.copy(path.normalize(cible + '/fichiers/' + bloc.vignette), path.normalize(chemin + '/' + bloc.vignette, { overwrite: true }))
												} else if (stockage === 's3' && bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.vignette))) {
													const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + bloc.vignette))
													await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.vignette, Body: buffer, ACL: 'public-read' }))
												}
												resolve({ bloc: bloc.bloc, blocId: blocId })
											} else {
												resolve({ bloc: 0, blocId: 0 })
											}
										})
										donneesBlocs.push(donneesBloc)
									}
									Promise.all(donneesBlocs).then(async function (blocs) {
										const token = Math.random().toString(16).slice(2)
										const date = dayjs().format()
										const code = Math.floor(100000 + Math.random() * 900000)
										let registreActivite = 'active'
										let conversation = 'desactivee'
										let listeUtilisateurs = 'activee'
										let editionNom = 'desactivee'
										let ordre = 'croissant'
										let largeur = 'normale'
										let enregistrements = 'desactives'
										let copieBloc = 'desactivee'
										let affichageColonnes = []
										let activiteId = 0
										if (donnees.pad.hasOwnProperty('registreActivite')) {
											registreActivite = donnees.pad.registreActivite
										}
										if (donnees.pad.hasOwnProperty('conversation')) {
											conversation = donnees.pad.conversation
										}
										if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
											listeUtilisateurs = donnees.pad.listeUtilisateurs
										}
										if (donnees.pad.hasOwnProperty('editionNom')) {
											editionNom = donnees.pad.editionNom
										}
										if (donnees.pad.hasOwnProperty('ordre')) {
											ordre = donnees.pad.ordre
										}
										if (donnees.pad.hasOwnProperty('largeur')) {
											largeur = donnees.pad.largeur
										}
										if (donnees.pad.hasOwnProperty('enregistrements')) {
											enregistrements = donnees.pad.enregistrements
										}
										if (donnees.pad.hasOwnProperty('copieBloc')) {
											copieBloc = donnees.pad.copieBloc
										}
										if (donnees.pad.hasOwnProperty('affichageColonnes')) {
											affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
										} else {
											JSON.parse(donnees.pad.colonnes).forEach(function () {
												affichageColonnes.push(true)
											})
										}
										if (parametres.activite === true) {
											activiteId = donnees.pad.activite
										}
										if (stockage === 'fs' && !donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string' && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))) {
											await fs.copy(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)), path.normalize(chemin + '/' + path.basename(donnees.pad.fond), { overwrite: true }))
										} else if (stockage === 's3' && !donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string' && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))) {
											const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))
											await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + path.basename(donnees.pad.fond), Body: buffer, ACL: 'public-read' }))
										}
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', donnees.pad.titre, 'identifiant', identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0])
										.SADD('pads-crees:' + identifiant, id.toString())
										.SADD('utilisateurs-pads:' + id, identifiant)
										.exec()
										if (parametres.activite === true) {
											if (parametres.commentaires === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-commente'
												})
											}
											if (parametres.evaluations === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-evalue'
												})
											}
											for (const activite of donnees.activite) {
												if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
													blocs.forEach(function (item) {
														if (activite.bloc === item.bloc) {
															activite.bloc = item.blocId
														}
													})
													await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
												}
											}
										}
										await fs.remove(source)
										await fs.remove(cible)
										res.json({ id: id, token: token, titre: donnees.pad.titre, identifiant: identifiant, fond: donnees.pad.fond, acces: donnees.pad.acces, code: code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite: registreActivite, conversation: conversation, listeUtilisateurs: listeUtilisateurs, editionNom: editionNom, fichiers: donnees.pad.fichiers, enregistrements: enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc: copieBloc, ordre: ordre, largeur: largeur, date: date, colonnes: donnees.pad.colonnes, affichageColonnes: affichageColonnes, bloc: donnees.pad.bloc, activite: activiteId, admins: [] })
									})
								}
							})
						} else {
							await fs.remove(source)
							await fs.remove(cible)
							res.send('donnees_corrompues')
						}
					} catch (err) {
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + req.file.filename))
						res.send('erreur_import')
					}
				})
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/mettre-pad-corbeille', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			const padId = req.body.padId
			if (await verifierAdminUtilisateur(padId, identifiant, req.session.motdepasse) === true) {
				await db
				.multi()
				.SADD('pads-supprimes:' + identifiant, padId.toString())
				.SREM('pads-crees:' + identifiant, padId.toString())
				.exec()
				res.send('pad_supprime')
			} else {
				res.send('non_autorise')
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/restaurer-pad', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			const padId = req.body.padId
			if (await verifierAdminUtilisateur(padId, identifiant, req.session.motdepasse) === true) {
				await db
				.multi()
				.SREM('pads-supprimes:' + identifiant, padId.toString())
				.SADD('pads-crees:' + identifiant, padId.toString())
				.exec()
				res.send('pad_restaure')
			} else {
				res.send('non_autorise')
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-pad', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const motdepasseEnvAdmin = process.env.ADMIN_PASSWORD
		const pad = req.body.padId
		const type = req.body.type
		let admin = false
		if (motdepasseAdmin !== '' && motdepasseAdmin === motdepasseEnvAdmin) {
			admin = true
		}
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			let suppressionFichiers = true
			if (req.body.hasOwnProperty('suppressionFichiers')) {
				suppressionFichiers = req.body.suppressionFichiers
			}
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur_suppression'); return false }
			if (resultat === 1) {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = Object.assign({}, donneesPad)
				if (donneesPad === null) { res.send('erreur_suppression'); return false }
				if (donneesPad.identifiant === identifiant) { // pad créé
					if (admin || await verifierAdmin(pad, donneesPad, req.session) === true) {
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs === null) { res.send('erreur_suppression'); return false }
						for (let i = 0; i < blocs.length; i++) {
							await db
							.multi()
							.UNLINK('commentaires:' + blocs[i])
							.UNLINK('evaluations:' + blocs[i])
							.UNLINK('pad-' + pad + ':' + blocs[i])
							.exec()
						}
						await db
						.multi()
						.UNLINK('blocs:' + pad)
						.UNLINK('pads:' + pad)
						.UNLINK('activite:' + pad)
						.UNLINK('dates-pads:' + pad)
						.SREM('pads-crees:' + identifiant, pad.toString())
						.SREM('pads-supprimes:' + identifiant, pad.toString())
						.exec()
						const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
						if (utilisateurs === null) { res.send('erreur_suppression'); return false }
						for (let j = 0; j < utilisateurs.length; j++) {
							await db
							.multi()
							.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
							.SREM('pads-admins:' + utilisateurs[j], pad.toString())
							.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
							.exec()
						}
						await db.UNLINK('utilisateurs-pads:' + pad)
						if (stockage === 'fs' && suppressionFichiers === true) {
							const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
							await fs.remove(chemin)
						} else if (stockage === 's3' && suppressionFichiers === true) {
							const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
							if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
								for (let i = 0; i < liste.Contents.length; i++) {
									await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
								}
							}
						}
						res.send('pad_supprime')
					} else {
						res.send('non_autorise')
					}
				} else { // pad rejoint
					let donnees = await db.HGETALL('utilisateurs:' + identifiant)
					donnees = Object.assign({}, donnees)
					if (donnees === null) { res.send('erreur_suppression'); return false }
					if (donnees.hasOwnProperty('dossiers')) {
						const dossiers = JSON.parse(donnees.dossiers)
						dossiers.forEach(function (dossier, indexDossier) {
							if (dossier.pads.includes(pad)) {
								const indexPad = dossier.pads.indexOf(pad)
								dossiers[indexDossier].pads.splice(indexPad, 1)
							}
						})
						await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
					}
					if (type === 'pad-rejoint') {
						await db.SREM('pads-rejoints:' + identifiant, pad.toString())
					}
					if (type === 'pad-admin') {
						await db.SREM('pads-rejoints:' + identifiant, pad.toString())
						await db.SREM('pads-admins:' + identifiant, pad.toString())
					}
					await db.SREM('pads-favoris:' + identifiant, pad.toString())
					// Suppression de l'utilisateur dans la liste des admins du pad
					if (type === 'pad-admin') {
						let d = await db.HGETALL('pads:' + pad)
						d = Object.assign({}, d)
						if (d === null) { res.send('erreur_suppression'); return false }
						let listeAdmins = []
						if (d.hasOwnProperty('admins')) {
							listeAdmins = JSON.parse(d.admins)
						}
						const index = listeAdmins.indexOf(identifiant)
						if (index > -1) {
							listeAdmins.splice(index, 1)
						}
						await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
						res.send('pad_supprime')
					} else {
						res.send('pad_supprime')
					}
				}
			} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
				const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
				if (typeof donneesPad === 'object' && donneesPad !== null) {
					if (donneesPad.identifiant === identifiant) { // pad créé
						if (admin || await verifierAdmin(pad, donneesPad, req.session) === true) {
							await db
							.multi()
							.SREM('pads-crees:' + identifiant, pad.toString())
							.SREM('pads-supprimes:' + identifiant, pad.toString())
							.exec()
							const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
							if (utilisateurs === null) { res.send('erreur_suppression'); return false }
							for (let j = 0; j < utilisateurs.length; j++) {
								await db
								.multi()
								.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
								.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
								.SREM('pads-admins:' + utilisateurs[j], pad.toString())
								.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
								.exec()
							}
							await db.UNLINK('utilisateurs-pads:' + pad)
							if (stockage === 'fs' && suppressionFichiers === true) {
								await fs.remove(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))
							} else if (stockage === 's3' && suppressionFichiers === true) {
								const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
								if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
									for (let i = 0; i < liste.Contents.length; i++) {
										await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
									}
								}
							}
							await fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
							await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
							res.send('pad_supprime')
						} else {
							res.send('non_autorise')
						}
					} else { // pad rejoint
						let donnees = await db.HGETALL('utilisateurs:' + identifiant)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { res.send('erreur_suppression'); return false }
						if (donnees.hasOwnProperty('dossiers')) {
							const dossiers = JSON.parse(donnees.dossiers)
							dossiers.forEach(function (dossier, indexDossier) {
								if (dossier.pads.includes(pad)) {
									const indexPad = dossier.pads.indexOf(pad)
									dossiers[indexDossier].pads.splice(indexPad, 1)
								}
							})
							await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						}
						if (type === 'pad-rejoint') {
							await db.SREM('pads-rejoints:' + identifiant, pad.toString())
						}
						if (type === 'pad-admin') {
							await db.SREM('pads-rejoints:' + identifiant, pad.toString())
							await db.SREM('pads-admins:' + identifiant, pad.toString())
						}
						await db.SREM('pads-favoris:' + identifiant, pad.toString())
						// Suppression de l'utilisateur dans la liste des admins du pad
						if (type === 'pad-admin') {
							let donnees = await db.HGETALL('pads:' + pad)
							donnees = Object.assign({}, donnees)
							if (donnees !== null) {
								let listeAdmins = []
								if (donnees.hasOwnProperty('admins')) {
									listeAdmins = JSON.parse(donnees.admins)
								}
								const index = listeAdmins.indexOf(identifiant)
								if (index > -1) {
									listeAdmins.splice(index, 1)
								}
								await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
								res.send('pad_supprime')
							} else {
								res.send('pad_supprime')
							}
						} else {
							res.send('pad_supprime')
						}
					}
				} else {
					res.send('erreur_suppression')
				}
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-informations', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const nom = req.body.nom
				let ancienemail = ''
				if (donneesUtilisateur.hasOwnProperty('email')) {
					ancienemail = donneesUtilisateur.email
				}
				const email = req.body.email.toLowerCase()
				const reponse = await db.EXISTS('emails:' + email)
				if (reponse === null) {
					res.send('erreur'); return false
				} else if (reponse === 0) {
					if (ancienemail !== '') {
						await db
						.multi()
						.HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
						.HSET('emails:' + email, 'identifiant', identifiant)
						.DEL('emails:' + ancienemail)
						.exec()
						req.session.nom = nom
						req.session.email = email
						res.send('utilisateur_modifie')
					} else {
						await db
						.multi()
						.HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
						.HSET('emails:' + email, 'identifiant', identifiant)
						.exec()
						req.session.nom = nom
						req.session.email = email
						res.send('utilisateur_modifie')
					}
				} else {
					res.send('email_existe_deja')
				}
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-mot-de-passe', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			let donnees = await db.HGETALL('utilisateurs:' + identifiant)
			donnees = Object.assign({}, donnees)
			if (donnees === null) { res.send('erreur'); return false }
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
				req.session.motdepasse = nouveaumotdepasse
				res.send('motdepasse_modifie')
			} else {
				res.send('motdepasse_incorrect')
			}
		} else {
			res.send('non_connecte')
		}
	})

	app.post('/api/verifier-mot-de-passe-admin', function (req, res) {
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			res.send('acces_verifie')
		} else {
			res.send('acces_invalide')
		}
	})

	app.post('/api/modifier-mot-de-passe-admin', async function (req, res) {
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const identifiant = req.body.identifiant
			const email = req.body.email.toLowerCase()
			if (identifiant !== '') {
				const resultat = await db.EXISTS('utilisateurs:' + identifiant)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					const hash = await bcrypt.hash(req.body.motdepasse, 10)
					await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
					res.send('motdepasse_modifie')
				} else {
					res.send('identifiant_non_valide')
				}
			} else if (email !== '') {
				const utilisateurs = await db.KEYS('utilisateurs:*')
				if (utilisateurs) {
					const donneesUtilisateurs = []
					utilisateurs.forEach(function (utilisateur) {
						const donneesUtilisateur = new Promise(async function (resolve) {
							let donnees = await db.HGETALL('utilisateurs:' + utilisateur.substring(13))
							donnees = Object.assign({}, donnees)
							if (donnees === null) { resolve({}); return false }
							if (donnees.hasOwnProperty('email')) {
								resolve({ identifiant: utilisateur.substring(13), email: donnees.email.toLowerCase() })
							} else {
								resolve({})
							}
						})
						donneesUtilisateurs.push(donneesUtilisateur)
					})
					Promise.all(donneesUtilisateurs).then(async function (donnees) {
						let utilisateurId = ''
						donnees.forEach(function (utilisateur) {
							if (utilisateur.hasOwnProperty('email') && utilisateur.email.toLowerCase() === email.toLowerCase()) {
								utilisateurId = utilisateur.identifiant
							}
						})
						if (utilisateurId !== '') {
							const hash = await bcrypt.hash(req.body.motdepasse, 10)
							await db.HSET('utilisateurs:' + utilisateurId, 'motdepasse', hash)
							res.send(utilisateurId)
						} else {
							res.send('email_non_valide')
						}
					})
				}
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/recuperer-donnees-pad-admin', async function (req, res) {
		const pad = req.body.padId
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur'); return false }
			if (resultat === 1) {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = Object.assign({}, donneesPad)
				if (donneesPad === null) { res.send('erreur'); return false }
				res.json(donneesPad)
			} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
				const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
				if (typeof donneesPad === 'object' && donneesPad !== null) {
					res.json(donneesPad)
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('pad_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/modifier-donnees-pad-admin', async function (req, res) {
		const pad = req.body.padId
		const champ = req.body.champ
		const valeur = req.body.valeur
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('pads:' + pad)
			if (resultat === null) { res.send('erreur'); return false }
			if (resultat === 1) {
				if (champ === 'motdepasse') {
					const hash = await bcrypt.hash(valeur, 10)
					await db.HSET('pads:' + pad, champ, hash)
				} else {
					await db.HSET('pads:' + pad, champ, valeur)
				}
				res.send('donnees_modifiees')
			} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
				const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
				if (typeof donnees === 'object' && donnees !== null) {
					await ajouterPadDansDb(pad, donnees)
					if (champ === 'motdepasse') {
						const hash = await bcrypt.hash(valeur, 10)
						await db.HSET('pads:' + pad, champ, hash)
					} else {
						await db.HSET('pads:' + pad, champ, valeur)
					}
					res.send('donnees_modifiees')
				} else {
					res.send('erreur')
				}
			} else {
				res.send('pad_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/rattacher-pad', async function (req, res) {
		const pad = req.body.padId
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const reponse = await db.EXISTS('utilisateurs:' + identifiant)
			if (reponse === null) { res.send('erreur'); return false  }
			if (reponse === 1) {
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false  }
				if (resultat === 1) {
					let donnees = await db.HGETALL('pads:' + pad)
					donnees = Object.assign({}, donnees)
					if (donnees === null) { res.send('erreur'); return false }
					if (donnees.hasOwnProperty('motdepasse')) {
						await db
						.multi()
						.SADD('pads-crees:' + identifiant, pad.toString())
						.SADD('utilisateurs-pads:' + pad, identifiant)
						.HSET('pads:' + pad, 'identifiant', identifiant)
						.HDEL('pads:' + pad, 'motdepasse')
						.SREM('pads-rejoints:' + identifiant, pad.toString())
						.SREM('pads-utilisateurs:' + identifiant, pad.toString())
						.exec()
						res.send('pad_transfere')
					} else {
						res.send('pad_cree_avec_compte')
					}
				} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
					if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
						if (donnees.pad.hasOwnProperty('motdepasse')) {
							await ajouterPadDansDb(pad, donnees)
							await db
							.multi()
							.SADD('pads-crees:' + identifiant, pad.toString())
							.SADD('utilisateurs-pads:' + pad, identifiant)
							.HSET('pads:' + pad, 'identifiant', identifiant)
							.HDEL('pads:' + pad, 'motdepasse')
							.SREM('pads-rejoints:' + identifiant, pad.toString())
							.SREM('pads-utilisateurs:' + identifiant, pad.toString())
							.exec()
							res.send('pad_transfere')
						} else {
							res.send('pad_cree_avec_compte')
						}
					} else {
						res.send('erreur')
					}
				} else {
					res.send('pad_inexistant')
				}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/transferer-pad', async function (req, res) {
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const pad = req.body.padId
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const resultat = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
			if (resultat === null) { res.send('erreur'); return false  }
			if (resultat === 1) {
				const reponse = await db.EXISTS('pads:' + pad)
					if (reponse === null) { res.send('erreur'); return false  }
					if (reponse === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { res.send('erreur'); return false }
						const identifiant = donnees.identifiant
						await db
						.multi()
						.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-crees:' + identifiant, pad.toString())
						.SREM('pads-supprimes:' + identifiant, pad.toString())
						.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
						.SREM('utilisateurs-pads:' + pad, identifiant)
						.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
						.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
						.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
						.exec()
						res.send('pad_transfere')
					} else if (reponse !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
							await ajouterPadDansDb(pad, donnees)
							const identifiant = donnees.pad.identifiant
							await db
							.multi()
							.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-crees:' + identifiant, pad.toString())
							.SREM('pads-supprimes:' + identifiant, pad.toString())
							.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
							.SREM('utilisateurs-pads:' + pad, identifiant)
							.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
							.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
							.exec()
							res.send('pad_transfere')
						} else {
							res.send('erreur')
						}
					} else {
						res.send('pad_inexistant')
					}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/transferer-compte', async function (req, res) {
		const identifiant = req.body.identifiant
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const admin = req.body.admin
		if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
			const reponse = await db.EXISTS('utilisateurs:' + identifiant)
			if (reponse === null) { res.send('erreur'); return false  }
			if (reponse === 1) {
				const r = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
				if (r === null) { res.send('erreur'); return false  }
				if (r === 1) {
					const pads = await db.SMEMBERS('pads-crees:' + identifiant)
					if (pads === null) { res.send('erreur'); return false }
					const donneesPads = []
					for (const pad of pads) {
						const donneesPad = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pads:' + pad)
							if (resultat === null) { resolve('erreur'); return false  }
							if (resultat === 1) {
								await db
								.multi()
								.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-crees:' + identifiant, pad.toString())
								.SREM('pads-supprimes:' + identifiant, pad.toString())
								.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
								.SREM('utilisateurs-pads:' + pad, identifiant)
								.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
								.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
								.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
								.exec()
								resolve('pad_transfere')
							} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
								const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
								if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
									await ajouterPadDansDb(pad, donnees)
									await db
									.multi()
									.SADD('pads-crees:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-crees:' + identifiant, pad.toString())
									.SREM('pads-supprimes:' + identifiant, pad.toString())
									.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
									.SREM('utilisateurs-pads:' + pad, identifiant)
									.HSET('pads:' + pad, 'identifiant', nouvelIdentifiant)
									.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
									.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
									.exec()
									resolve('pad_transfere')
								} else {
									resolve('erreur')
								}
							} else {
								resolve('pad_inexistant')
							}
						})
						donneesPads.push(donneesPad)
					}
					Promise.all(donneesPads).then(function () {
						res.send('compte_transfere')
					})
				} else {
					res.send('utilisateur_inexistant')
				}
			} else {
				res.send('utilisateur_inexistant')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/supprimer-compte', async function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
			return false
		}
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const motdepasseEnvAdmin = process.env.ADMIN_PASSWORD
		let admin = false
		if (motdepasseAdmin !== '' && motdepasseAdmin === motdepasseEnvAdmin) {
			admin = true
		}
		if ((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || admin) {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (admin || await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				let email = ''
				if (donneesUtilisateur.hasOwnProperty('email')) {
					email = donneesUtilisateur.email.toLowerCase()
				}
				const pads = await db.SMEMBERS('pads-crees:' + identifiant)
				if (pads === null) { res.send('erreur'); return false }
				const donneesPads = []
				for (const pad of pads) {
					const donneesPad = new Promise(async function (resolve) {
						const resultat = await db.EXISTS('pads:' + pad)
						if (resultat === null) { resolve(); return false }
						if (resultat === 1) {
							const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
							if (blocs === null) { resolve(); return false }
							for (let i = 0; i < blocs.length; i++) {
								await db
								.multi()
								.UNLINK('commentaires:' + blocs[i])
								.UNLINK('evaluations:' + blocs[i])
								.UNLINK('pad-' + pad + ':' + blocs[i])
								.exec()
							}
							await db
							.multi()
							.UNLINK('blocs:' + pad)
							.UNLINK('pads:' + pad)
							.UNLINK('activite:' + pad)
							.UNLINK('dates-pads:' + pad)
							.exec()
							const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
							if (utilisateurs === null) { resolve(); return false }
							for (let j = 0; j < utilisateurs.length; j++) {
								await db
								.multi()
								.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
								.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
								.SREM('pads-admins:' + utilisateurs[j], pad.toString())
								.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
								.exec()
							}
							await db.UNLINK('utilisateurs-pads:' + pad)
							if (stockage === 'fs') {
								const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
								await fs.remove(chemin)
							} else if (stockage === 's3') {
								const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
								if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
									for (let i = 0; i < liste.Contents.length; i++) {
										await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
									}
								}
							}
							resolve(pad)
						} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
							const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
							if (utilisateurs === null) { resolve(); return false }
							for (let j = 0; j < utilisateurs.length; j++) {
								await db
								.multi()
								.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
								.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
								.SREM('pads-admins:' + utilisateurs[j], pad.toString())
								.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
								.exec()
							}
							await db.UNLINK('utilisateurs-pads:' + pad)
							if (stockage === 'fs') {
								await fs.remove(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))
							} else if (stockage === 's3') {
								const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
								if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
									for (let i = 0; i < liste.Contents.length; i++) {
										await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
									}
								}
							}
							resolve(pad)
						} else {
							resolve()
						}
					})
					donneesPads.push(donneesPad)
				}
				Promise.all(donneesPads).then(async function () {
					const pads = await db.SMEMBERS('pads-utilisateurs:' + identifiant)
					if (pads === null) { res.send('erreur'); return false }
					const donneesBlocs = []
					const donneesActivites = []
					const donneesCommentaires = []
					const donneesEvaluations = []
					for (const pad of pads) {
						const resultat = await db.EXISTS('pads:' + pad)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							const donneesBloc = new Promise(async function (resolve) {
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { resolve(); return false }
								for (let i = 0; i < blocs.length; i++) {
									let donnees = await db.HGETALL('pad-' + pad + ':' + blocs[i])
									donnees = Object.assign({}, donnees)
									if (donnees === null) { resolve(); return false }
									if (donnees.hasOwnProperty('identifiant') && donnees.identifiant === identifiant) {
										if (donnees.hasOwnProperty('media') && donnees.media !== '' && donnees.type !== 'embed' && donnees.type !== 'lien') {
											await supprimerFichier(pad, donnees.media)
										}
										if (donnees.hasOwnProperty('vignette') && definirVignettePersonnalisee(donnees.vignette) === true) {
											await supprimerFichier(pad, path.basename(donnees.vignette))
										}
										await db
										.multi()
										.UNLINK('pad-' + pad + ':' + blocs[i])
										.ZREM('blocs:' + pad, blocs[i])
										.UNLINK('commentaires:' + blocs[i])
										.UNLINK('evaluations:' + blocs[i])
										.exec()
										resolve(blocs[i])
									} else {
										resolve(blocs[i])
									}
								}
							})
							donneesBlocs.push(donneesBloc)
							const donneesActivite = new Promise(async function (resolve) {
								const entrees = await db.ZRANGE('activite:' + pad, 0, -1)
								if (entrees === null) { resolve(); return false }
								for (let i = 0; i < entrees.length; i++) {
									const entree = JSON.parse(entrees[i])
									if (entree.identifiant === identifiant) {
										await db.ZREMRANGEBYSCORE('activite:' + pad, entree.id, entree.id)
										resolve(entree.id)
									} else {
										resolve(entree.id)
									}
								}
							})
							donneesActivites.push(donneesActivite)
							const donneesCommentaire = new Promise(async function (resolve) {
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { resolve() }
								for (let i = 0; i < blocs.length; i++) {
									const commentaires = await db.ZRANGE('commentaires:' + blocs[i], 0, -1)
									if (commentaires === null) { resolve(); return false }
									for (let j = 0; j < commentaires.length; j++) {
										const commentaire = JSON.parse(commentaires[j])
										if (commentaire.identifiant === identifiant) {
											await db.ZREMRANGEBYSCORE('commentaires:' + blocs[i], commentaire.id, commentaire.id)
											resolve(commentaire.id)
										} else {
											resolve(commentaire.id)
										}
									}
								}
							})
							donneesCommentaires.push(donneesCommentaire)
							const donneesEvaluation = new Promise(async function (resolve) {
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { resolve(); return false }
								for (let i = 0; i < blocs.length; i++) {
									const evaluations = await db.ZRANGE('evaluations:' + blocs[i], 0, -1)
									if (evaluations === null) { resolve(); return false }
									for (let j = 0; j < evaluations.length; j++) {
										const evaluation = JSON.parse(evaluations[j])
										if (evaluation.identifiant === identifiant) {
											await db.ZREMRANGEBYSCORE('evaluations:' + blocs[i], evaluation.id, evaluation.id)
											resolve(evaluation.id)
										} else {
											resolve(evaluation.id)
										}
									}
								}
							})
							donneesEvaluations.push(donneesEvaluation)
						} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
							const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
							if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite')) {
								const blocs = donnees.blocs
								const entrees = donnees.activite
								const donneesBloc = new Promise(async function (resolve) {
									for (let i = 0; i < blocs.length; i++) {
										if (blocs[i].identifiant === identifiant) {
											if (blocs[i].hasOwnProperty('media') && blocs[i].media !== '' && blocs[i].type !== 'embed' && blocs[i].type !== 'lien') {
												await supprimerFichier(pad, blocs[i].media)
											}
											if (blocs[i].hasOwnProperty('vignette') && definirVignettePersonnalisee(blocs[i].vignette) === true) {
												await supprimerFichier(pad, path.basename(blocs[i].vignette))
											}
											await db
											.multi()
											.UNLINK('pad-' + pad + ':' + blocs[i].bloc)
											.ZREM('blocs:' + pad, blocs[i].bloc)
											.UNLINK('commentaires:' + blocs[i].bloc)
											.UNLINK('evaluations:' + blocs[i].bloc)
											.exec()
											resolve(blocs[i].bloc)
										} else {
											resolve(blocs[i].bloc)
										}
									}
								})
								donneesBlocs.push(donneesBloc)
								const donneesActivite = new Promise(async function (resolve) {
									for (let i = 0; i < entrees.length; i++) {
										if (entrees[i].identifiant === identifiant) {
											await db.ZREMRANGEBYSCORE('activite:' + pad, entrees[i].id, entrees[i].id)
											resolve(entrees[i].id)
										} else {
											resolve(entrees[i].id)
										}
									}
								})
								donneesActivites.push(donneesActivite)
								const donneesCommentaire = new Promise(async function (resolve) {
									for (let i = 0; i < blocs.length; i++) {
										const commentaires = await db.ZRANGE('commentaires:' + blocs[i].bloc, 0, -1)
										if (commentaires === null) { resolve(); return false }
										for (let j = 0; j < commentaires.length; j++) {
											const commentaire = JSON.parse(commentaires[j])
											if (commentaire.identifiant === identifiant) {
												await db.ZREMRANGEBYSCORE('commentaires:' + blocs[i].bloc, commentaire.id, commentaire.id)
												resolve(commentaire.id)
											} else {
												resolve(commentaire.id)
											}
										}
									}
								})
								donneesCommentaires.push(donneesCommentaire)
								const donneesEvaluation = new Promise(async function (resolve) {
									for (let i = 0; i < blocs.length; i++) {
										const evaluations = await db.ZRANGE('evaluations:' + blocs[i].bloc, 0, -1)
										if (evaluations === null) { resolve(); return false }
										for (let j = 0; j < evaluations.length; j++) {
											const evaluation = JSON.parse(evaluations[j])
											if (evaluation.identifiant === identifiant) {
												await db.ZREMRANGEBYSCORE('evaluations:' + blocs[i].bloc, evaluation.id, evaluation.id)
												resolve(evaluation.id)
											} else {
												resolve(evaluation.id)
											}
										}
									}
								})
								donneesEvaluations.push(donneesEvaluation)
							}
						}
					}
					Promise.all([donneesBlocs, donneesActivites, donneesCommentaires, donneesEvaluations]).then(async function () {
						if (email !== '') {
							await db
							.multi()
							.UNLINK('pads-crees:' + identifiant)
							.UNLINK('pads-supprimes:' + identifiant)
							.UNLINK('pads-rejoints:' + identifiant)
							.UNLINK('pads-favoris:' + identifiant)
							.UNLINK('pads-admins:' + identifiant)
							.UNLINK('pads-utilisateurs:' + identifiant)
							.UNLINK('utilisateurs:' + identifiant)
							.UNLINK('emails:' + email)
							.UNLINK('noms:' + identifiant)
							.exec()
						} else {
							await db
							.multi()
							.UNLINK('pads-crees:' + identifiant)
							.UNLINK('pads-supprimes:' + identifiant)
							.UNLINK('pads-rejoints:' + identifiant)
							.UNLINK('pads-favoris:' + identifiant)
							.UNLINK('pads-admins:' + identifiant)
							.UNLINK('pads-utilisateurs:' + identifiant)
							.UNLINK('utilisateurs:' + identifiant)
							.UNLINK('noms:' + identifiant)
							.exec()
						}
						if (!admin) {
							supprimerSession(req)
							res.send('compte_supprime')
						} else {
							const sessions = await db.KEYS('sessions:*')
							if (sessions !== null) {
								const donneesSessions = []
								sessions.forEach(function (session) {
									const donneesSession = new Promise(async function (resolve) {
										const donnees = await db.GET('sessions:' + session.substring(9))
										if (donnees === null) { resolve({}); return false }
										donnees = JSON.parse(donnees)
										if (donnees.hasOwnProperty('identifiant')) {
											resolve({ session: session.substring(9), identifiant: donnees.identifiant })
										} else {
											resolve({})
										}
									})
									donneesSessions.push(donneesSession)
								})
								Promise.all(donneesSessions).then(async function (donnees) {
									let sessionId = ''
									donnees.forEach(function (item) {
										if (item.hasOwnProperty('identifiant') && item.identifiant === identifiant) {
											sessionId = item.session
										}
									})
									if (sessionId !== '') {
										await db.UNLINK('sessions:' + sessionId)
									}
									res.send('compte_supprime')
								})
							} else {
								res.send('erreur')
							}
						}
					})
				})
			} else {
				res.send('non_autorise')
			}
		} else {
			res.send('non_autorise')
		}
	})

	app.post('/api/verifier-identifiant', async function (req, res) {
		const identifiant = req.body.identifiant
		const resultat = await db.EXISTS('utilisateurs:' + identifiant)
		if (resultat === null) { res.send('erreur'); return false }
		if (resultat === 1) {
			res.send('identifiant_valide')
		} else {
			res.send('identifiant_non_valide')
		}
	})

	app.post('/api/verifier-mot-de-passe', async function (req, res) {
		const pad = req.body.pad
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('motdepasse')) { res.json({ message: 'erreur' }); return false }
		const motdepasse = req.body.motdepasse
		if (motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
			const identifiant = req.body.identifiant
			const acces = req.body.acces
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
				langue = req.session.langue
			}
			let nom = ''
			if (req.session.hasOwnProperty('nom') && req.session.nom !== '' && req.session.nom !== undefined) {
				nom = req.session.nom
			}
			const resultat = await db.EXISTS('utilisateurs:' + identifiant)
			if (resultat === 1) {
				let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				utilisateur = Object.assign({}, utilisateur)
				nom = utilisateur.nom
				langue = utilisateur.langue
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
			if (!req.session.pads.includes(parseInt(pad))) {
				req.session.pads.push(parseInt(pad))
			}
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			if (acces === true) {
				res.json({ message: 'motdepasse_correct', identifiant: identifiant, nom: nom, langue: langue })
			} else {
				const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
				res.json({ message: 'motdepasse_correct', identifiant: identifiant, nom: nom, langue: langue, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
			}
		} else {
			res.json({ message: 'motdepasse_incorrect' })
		}
	})

	app.post('/api/verifier-code-acces', async function (req, res) {
		const pad = req.body.pad
		const identifiant = req.body.identifiant
		const code = req.body.code
		let donnees = await db.HGETALL('pads:' + pad)
		donnees = Object.assign({}, donnees)
		if (donnees === null || !donnees.hasOwnProperty('code')) { res.send('erreur'); return false }
		if (code === donnees.code) {
			const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
			if (!req.session.hasOwnProperty('acces')) {
				req.session.acces = []
			}
			let padAcces = false
			req.session.acces.forEach(function (acces) {
				if (parseInt(acces.pad) === parseInt(pad)) {
					padAcces = true
				}
			})
			if (padAcces) {
				req.session.acces.forEach(function (acces, index) {
					if (parseInt(acces.pad) === parseInt(pad)) {
						req.session.acces[index].code = code
					}
				})
			} else {
				req.session.acces.push({ code: code, pad: parseInt(pad) })
			}
			res.send({ pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
		} else {
			res.send('code_incorrect')
		}
	})

	app.post('/api/modifier-langue', async function (req, res) {
		const identifiant = req.body.identifiant
		const langue = req.body.langue
		if (req.session.identifiant && req.session.identifiant === identifiant) {
			await db.HSET('utilisateurs:' + identifiant, 'langue', langue)
			req.session.langue = langue
		} else {
			req.session.langue = langue
		}
		res.send('langue_modifiee')
	})

	app.post('/api/modifier-affichage', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const affichage = req.body.affichage
				await db.HSET('utilisateurs:' + identifiant, 'affichage', affichage)
				res.send('affichage_modifie')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-classement', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const classement = req.body.classement
				await db.HSET('utilisateurs:' + identifiant, 'classement', classement)
				req.session.classement = classement
				res.send('classement_modifie')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/ajouter-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur_ajout_dossier'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const nom = req.body.dossier
				let dossiers = []
				if (donneesUtilisateur.hasOwnProperty('dossiers')) {
					dossiers = JSON.parse(donneesUtilisateur.dossiers)
				}
				const id = Math.random().toString(36).substring(2)
				dossiers.push({ id: id, nom: nom, pads: [] })
				await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
				res.json({ id: id, nom: nom, pads: [] })
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/modifier-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur_modification_dossier'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const nom = req.body.dossier
				const dossierId = req.body.dossierId
				const dossiers = JSON.parse(donneesUtilisateur.dossiers)
				dossiers.forEach(function (dossier, index) {
					if (dossier.id === dossierId) {
						dossiers[index].nom = nom
					}
				})
				await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
				res.send('dossier_modifie')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/supprimer-dossier', async function (req, res) {
		const identifiant = req.body.identifiant
		if (req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { res.send('erreur_suppression_dossier'); return false }
			if (await bcrypt.compare(req.session.motdepasse, donneesUtilisateur.motdepasse)) {
				const dossierId = req.body.dossierId
				const dossiers = JSON.parse(donneesUtilisateur.dossiers)
				dossiers.forEach(function (dossier, index) {
					if (dossier.id === dossierId) {
						dossiers.splice(index, 1)
					}
				})
				await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
				res.send('dossier_supprime')
			} else {
				res.send('non_connecte')
			}
		} else {
			supprimerSession(req)
			res.send('non_connecte')
		}
	})

	app.post('/api/televerser-fichier', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else if (stockage === 's3') {
			const buffers = []
			let nom
			let mimetype
			const busboy = Busboy({ headers: req.headers })
			busboy.on('file', function (champ, fichier, meta) {
				mimetype = meta.mimeType
				nom = definirNomFichier(meta.filename)
				fichier.on('data', function (donnees) {
					buffers.push(donnees)
				})
			})
			busboy.on('finish', async function () {
				const bufferFichier = Buffer.concat(buffers)
				if (bufferFichier !== null && nom !== null && mimetype !== null) {
					if (mimetype.split('/')[0] === 'image') {
						const extension = path.parse(nom).ext
						if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
							try {
								const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().rotate().jpeg().resize(1200, 1200, {
									fit: sharp.fit.inside,
									withoutEnlargement: true
								}).toBuffer()
								if (buffer !== null) {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: buffer, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype })
								} else {
									res.send('erreur_televersement')
								}
							} catch (e) {
								res.send('erreur_televersement')
							}
						} else if (extension.toLowerCase() !== '.gif') {
							try {
								const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().resize(1200, 1200, {
									fit: sharp.fit.inside,
									withoutEnlargement: true
								}).toBuffer()
								if (buffer !== null) {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: buffer, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype })
								} else {
									res.send('erreur_televersement')
								}
							} catch (e) {
								res.send('erreur_televersement')
							}
						} else {
							await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
							res.json({ fichier: nom, mimetype: mimetype })
						}
					} else if (mimetype === 'application/pdf') {
						gm(bufferFichier).setFormat('jpg').resize(450).quality(80).toBuffer(async function (erreur, buffer) {
							if (erreur) {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + path.parse(nom).name + '.pdf', Body: bufferFichier, ACL: 'public-read' }))
								res.json({ fichier: nom, mimetype: 'pdf', vignetteGeneree: false })
							} else {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + path.parse(nom).name + '.pdf', Body: bufferFichier, ACL: 'public-read' }))
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + path.parse(nom).name + '.jpg', Body: buffer, ACL: 'public-read' }))
								res.json({ fichier: nom, mimetype: 'pdf', vignetteGeneree: true })
							}
						})
					} else if (mimetype === 'application/vnd.oasis.opendocument.presentation' || mimetype === 'application/vnd.oasis.opendocument.text' || mimetype === 'application/vnd.oasis.opendocument.spreadsheet') {
						mimetype = 'document'
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(bufferFichier, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							gm(pdfBuffer).setFormat('jpg').resize(450).quality(80).toBuffer(async function (erreur, buffer) {
								if (erreur) {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: false })
								} else {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + path.parse(nom).name + '.jpg', Body: buffer, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: true })
								}
							})
						} else {
							await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
							res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: false })
						}
					} else if (mimetype === 'application/msword' || mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.ms-excel' || mimetype.includes('officedocument') === true) {
						mimetype = 'office'
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(bufferFichier, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							gm(pdfBuffer).setFormat('jpg').resize(450).quality(80).toBuffer(async function (erreur, buffer) {
								if (erreur) {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: false })
								} else {
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
									await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + path.parse(nom).name + '.jpg', Body: buffer, ACL: 'public-read' }))
									res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: true })
								}
							})
						} else {
							await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
							res.json({ fichier: nom, mimetype: mimetype, vignetteGeneree: false })
						}
					} else {
						await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: bufferFichier, ACL: 'public-read' }))
						res.json({ fichier: nom, mimetype: mimetype })
					}
				} else {
					res.send('erreur_televersement')
				}
			})
			req.pipe(busboy)
		} else {
			televerserTemp(req, res, async function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				if (fichier.hasOwnProperty('mimetype') && fichier.hasOwnProperty('filename')) {
					let mimetype = fichier.mimetype
					const chemin = path.join(__dirname, '..', '/static/temp/' + fichier.filename)
					const destination = path.join(__dirname, '..', '/static/temp/' + path.parse(fichier.filename).name + '.jpg')
					if (mimetype.split('/')[0] === 'image') {
						const extension = path.parse(fichier.filename).ext
						if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
							try {
								const buffer = await sharp(chemin, { failOnError: false }).withMetadata().rotate().jpeg().resize(1200, 1200, {
									fit: sharp.fit.inside,
									withoutEnlargement: true
								}).toBuffer()
								if (buffer !== null) {
									await fs.writeFile(chemin, buffer)
									res.json({ fichier: fichier.filename, mimetype: mimetype })
								} else {
									res.send('erreur_televersement')
								}
							} catch (e) {
								res.send('erreur_televersement')
							}
						} else if (extension.toLowerCase() !== '.gif') {
							try {
								const buffer = await sharp(chemin, { failOnError: false }).withMetadata().resize(1200, 1200, {
									fit: sharp.fit.inside,
									withoutEnlargement: true
								}).toBuffer()
								if (buffer !== null) {
									await fs.writeFile(chemin, buffer)
									res.json({ fichier: fichier.filename, mimetype: mimetype })
								} else {
									res.send('erreur_televersement')
								}
							} catch (e) {
								res.send('erreur_televersement')
							}
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype })
						}
					} else if (mimetype === 'application/pdf') {
						gm(chemin + '[0]').setFormat('jpg').resize(450).quality(80).write(destination, function (erreur) {
							if (erreur) {
								res.json({ fichier: fichier.filename, mimetype: 'pdf', vignetteGeneree: false })
							} else {
								res.json({ fichier: fichier.filename, mimetype: 'pdf', vignetteGeneree: true })
							}
						})
					} else if (mimetype === 'application/vnd.oasis.opendocument.presentation' || mimetype === 'application/vnd.oasis.opendocument.text' || mimetype === 'application/vnd.oasis.opendocument.spreadsheet') {
						mimetype = 'document'
						const docBuffer = await fs.readFile(chemin)
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(docBuffer, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							gm(pdfBuffer).setFormat('jpg').resize(450).quality(80).write(destination, function (erreur) {
								if (erreur) {
									res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
								} else {
									res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: true })
								}
							})
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
						}
					} else if (mimetype === 'application/msword' || mimetype === 'application/vnd.ms-powerpoint' || mimetype === 'application/vnd.ms-excel' || mimetype.includes('officedocument') === true) {
						mimetype = 'office'
						const docBuffer = await fs.readFile(chemin)
						let pdfBuffer
						try {
							pdfBuffer = await libre.convertAsync(docBuffer, '.pdf', undefined)
						} catch (err) {
							pdfBuffer = 'erreur'
						}
						if (pdfBuffer && pdfBuffer !== 'erreur') {
							gm(pdfBuffer).setFormat('jpg').resize(450).quality(80).write(destination, function (erreur) {
								if (erreur) {
									res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
								} else {
									res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: true })
								}
							})
						} else {
							res.json({ fichier: fichier.filename, mimetype: mimetype, vignetteGeneree: false })
						}
					} else {
						res.json({ fichier: fichier.filename, mimetype: mimetype })
					}
				} else {
					res.send('erreur_televersement')
				}
			})
		}
	})

	app.post('/api/televerser-audio', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else if (stockage === 's3') {
			const buffers = []
			let nom
			const formData = new Map()
			const busboy = Busboy({ headers: req.headers })
			busboy.on('field', function (champ, valeur) {
				formData.set(champ, valeur)
			})
			busboy.on('file', function (champ, fichier, meta) {
				nom = definirNomFichier(meta.filename)
				fichier.on('data', function (donnees) {
					buffers.push(donnees)
				})
			})
			busboy.on('finish', async function () {
				const bufferFichier = Buffer.concat(buffers)
				if (bufferFichier !== null && nom !== null) {
					const pad = formData.get('pad')
					await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: pad + '/' + nom, Body: bufferFichier, ACL: 'public-read' }))
					res.send(nom)
				} else {
					res.send('erreur_televersement')
				}
			})
			req.pipe(busboy)
		} else {
			televerser(req, res, function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				res.send(fichier.filename)
			})
		}
	})

	app.post('/api/televerser-vignette', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else if (stockage === 's3') {
			const buffers = []
			let nom
			const busboy = Busboy({ headers: req.headers })
			busboy.on('file', function (champ, fichier, meta) {
				nom = definirNomFichier(meta.filename)
				fichier.on('data', function (donnees) {
					buffers.push(donnees)
				})
			})
			busboy.on('finish', async function () {
				const bufferFichier = Buffer.concat(buffers)
				if (bufferFichier !== null && nom !== null) {
					const extension = path.parse(nom).ext
					if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
						try {
							const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().rotate().jpeg().resize(400, 400, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer()
							if (buffer !== null) {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: buffer, ACL: 'public-read' }))
								res.send(nom)
							} else {
								res.send('erreur_televersement')
							}
						} catch (e) {
							res.send('erreur_televersement')
						}
					} else {
						try {
							const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().resize(400, 400, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer()
							if (buffer !== null) {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: 'temp/' + nom, Body: buffer, ACL: 'public-read' }))
								res.send(nom)
							} else {
								res.send('erreur_televersement')
							}
						} catch (e) {
							res.send('erreur_televersement')
						}
					}
				} else {
					res.send('erreur_televersement')
				}
			})
			req.pipe(busboy)
		} else {
			televerserTemp(req, res, async function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				const chemin = path.join(__dirname, '..', '/static/temp/' + fichier.filename)
				const extension = path.parse(fichier.filename).ext
				if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
					try {
						const buffer = await sharp(chemin, { failOnError: false }).withMetadata().rotate().jpeg().resize(400, 400, {
							fit: sharp.fit.inside,
							withoutEnlargement: true
						}).toBuffer()
						if (buffer !== null) {
							await fs.writeFile(chemin, buffer)
							res.send(fichier.filename)
						} else {
							res.send('erreur_televersement')
						}
					} catch (e) {
						res.send('erreur_televersement')
					}
				} else {
					try {
						const buffer = await sharp(chemin, { failOnError: false }).withMetadata().resize(400, 400, {
							fit: sharp.fit.inside,
							withoutEnlargement: true
						}).toBuffer()
						if (buffer !== null) {
							await fs.writeFile(chemin, buffer)
							res.send(fichier.filename)
						} else {
							res.send('erreur_televersement')
						}
					} catch (e) {
						res.send('erreur_televersement')
					}
				}
			})
		}
	})

	app.post('/api/televerser-fond', function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('non_connecte')
		} else if (stockage === 's3') {
			const buffers = []
			let nom
			const formData = new Map()
			const busboy = Busboy({ headers: req.headers })
			busboy.on('field', function (champ, valeur) {
				formData.set(champ, valeur)
			})
			busboy.on('file', async function (champ, fichier, meta) {
				nom = definirNomFichier(meta.filename)
				fichier.on('data', function (donnees) {
					buffers.push(donnees)
				})
			})
			busboy.on('finish', async function () {
				const bufferFichier = Buffer.concat(buffers)
				if (bufferFichier !== null && nom !== null) {
					const pad = formData.get('pad')
					const extension = path.parse(nom).ext
					if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
						try {
							const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().rotate().jpeg().resize(1200, 1200, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer()
							if (buffer !== null) {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: pad + '/' + nom, Body: buffer, ACL: 'public-read' }))
								res.send(nom)
							} else {
								res.send('erreur_televersement')
							}
						} catch (e) {
							res.send('erreur_televersement')
						}
					} else {
						try {
							const buffer = await sharp(bufferFichier, { failOnError: false }).withMetadata().resize(1200, 1200, {
								fit: sharp.fit.inside,
								withoutEnlargement: true
							}).toBuffer()
							if (buffer !== null) {
								await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: pad + '/' + nom, Body: buffer, ACL: 'public-read' }))
								res.send(nom)
							} else {
								res.send('erreur_televersement')
							}
						} catch (e) {
							res.send('erreur_televersement')
						}
					}
				} else {
					res.send('erreur_televersement')
				}
			})
			req.pipe(busboy)	
		} else {
			televerser(req, res, async function (err) {
				if (err === 'erreur_espace_disque') { res.send('erreur_espace_disque'); return false }
				else if (err) { res.send('erreur_televersement'); return false }
				const fichier = req.file
				const pad = req.body.pad
				const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + fichier.filename)
				const extension = path.parse(fichier.filename).ext
				if (extension.toLowerCase() === '.jpg' || extension.toLowerCase() === '.jpeg') {
					try {
						const buffer = await sharp(chemin, { failOnError: false }).withMetadata().rotate().jpeg().resize(1200, 1200, {
							fit: sharp.fit.inside,
							withoutEnlargement: true
						}).toBuffer()
						if (buffer !== null) {
							await fs.writeFile(chemin, buffer)
							res.send(fichier.filename)
						} else {
							res.send('erreur_televersement')
						}
					} catch (e) {
						res.send('erreur_televersement')
					}
				} else {
					try {
						const buffer = await sharp(chemin, { failOnError: false }).withMetadata().resize(1200, 1200, {
							fit: sharp.fit.inside,
							withoutEnlargement: true
						}).toBuffer()
						if (buffer !== null) {
							await fs.writeFile(chemin, buffer)
							res.send(fichier.filename)
						} else {
							res.send('erreur_televersement')
						}
					} catch (e) {
						res.send('erreur_televersement')
					}
				}
			})
		}
	})

	app.post('/api/recuperer-icone', async function (req, res) {
		const identifiant = req.session.identifiant
		if (!identifiant) {
			res.send('erreur')
		} else {
			let favicon = ''
			const domaine = req.body.domaine
			const protocole = req.body.protocole
			axios.get(protocole + '//' + domaine, { 
				responseType: 'document'
			}).then(function (reponse) {
				if (reponse && reponse.hasOwnProperty('data')) {
					const $ = cheerio.load(reponse.data)
					const recupererTaille = function (el) {
						return (el.attribs.sizes && parseInt(el.attribs.sizes, 10)) || 0
					}
					let favicons = [
						...$('meta[property="og:image"]')
					]
					if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs')) {
						favicon = favicons[0].attribs.content
					} else {
						favicons = [
							...$('link[rel="shortcut icon"], link[rel="icon"], link[rel="apple-touch-icon"]')
						].sort((a, b) => {
							return recupererTaille(b) - recupererTaille(a)
						})
						if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs')) {
							favicon = favicons[0].attribs.href
						}
					}
					if (favicon !== '' && verifierURL(favicon, ['https', 'http']) === true) {
						res.send(favicon)
					} else if (favicon !== '' && favicon.substring(0, 2) === './') {
						res.send(protocole + '//' + domaine + favicon.substring(1))
					} else if (favicon !== '' && favicon.substring(0, 1) === '/') {
						res.send(protocole + '//' + domaine + favicon)
					} else if (favicon !== '') {
						res.send(protocole + '//' + domaine + '/' + favicon)
					} else {
						res.send(favicon)
					}
				} else {
					res.send(favicon)
				}
			}).catch(function () {
				res.send('erreur')
			})
		}
	})

	app.post('/api/ladigitale', function (req, res) {
		const tokenApi = req.body.token
		const domaine = req.headers.host
		const lien = req.body.lien
		const params = new URLSearchParams()
		params.append('token', tokenApi)
		params.append('domaine', domaine)
		axios.post(lien, params).then(async function (reponse) {
			if (reponse.data === 'non_autorise' || reponse.data === 'erreur') {
				res.send('erreur_token')
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'creer') {
				const identifiant = req.body.identifiant
				let nom = req.body.nomUtilisateur
				if (nom === '') {
					nom = genererPseudo()
				}
				const titre = req.body.nom
				const motdepasse = req.body.motdepasse
				const hash = await bcrypt.hash(motdepasse, 10)
				const token = Math.random().toString(16).slice(2)
				const date = dayjs().format()
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
					langue = req.session.langue
				}
				const resultat = await db.EXISTS('pad')
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					const reponse = await db.GET('pad')
					if (reponse === null) { res.send('erreur'); return false }
					const id = parseInt(reponse) + 1
					const creation = await creerPadSansCompte(id, token, titre, hash, date, identifiant, nom, langue, 'api')
					if (creation === true) {
						if (stockage === 'fs') {
							const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
							await fs.mkdirp(chemin)
						}
						res.send(id + '/' + token)
					} else {
						res.send('erreur_creation')
					}
				} else {
					const creation = await creerPadSansCompte(1, token, titre, hash, date, identifiant, nom, langue, 'api')
					if (creation === true) {
						if (stockage === 'fs') {
							const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/1')
							await fs.mkdirp(chemin)
						}
						res.send('1/' + token)
					} else {
						res.send('erreur_creation')
					}
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'modifier-titre') {
				const pad = req.body.id
				const titre = req.body.titre
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					await db.HSET('pads:' + pad, 'titre', titre)
					res.send('contenu_modifie')
				} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
					if (typeof donneesPad === 'object' && donneesPad !== null) {
						await ajouterPadDansDb(pad, donneesPad)
						await db.HSET('pads:' + pad, 'titre', titre)
						res.send('contenu_modifie')
					} else {
						res.send('erreur')
					}
				} else {
					res.send('contenu_inexistant')
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'modifier') {
				const pad = req.body.id
				const titre = req.body.titre
				const identifiant = req.body.identifiant
				const ancienmotdepasse = req.body.ancienmotdepasse
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					let donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					if (ancienmotdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(ancienmotdepasse, donneesPad.motdepasse)) {
						const motdepasse = req.body.motdepasse
						const hash = await bcrypt.hash(motdepasse, 10)
						await db.HSET('pads:' + pad, ['titre', titre, 'motdepasse', hash])
						res.send('contenu_modifie')
					} else {
						res.send('non_autorise')
					}
				} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
					if (typeof donneesPad === 'object' && donneesPad !== null) {
						if (ancienmotdepasse.trim() !== '' && donneesPad.pad.hasOwnProperty('motdepasse') && donneesPad.pad.motdepasse.trim() !== '' && donneesPad.pad.identifiant === identifiant && await bcrypt.compare(ancienmotdepasse, donneesPad.pad.motdepasse)) {
							await ajouterPadDansDb(donneesPad, donnees)
							const motdepasse = req.body.motdepasse
							const hash = await bcrypt.hash(motdepasse, 10)
							await db.HSET('pads:' + pad, ['titre', titre, 'motdepasse', hash])
							res.send('contenu_modifie')
						} else {
							res.send('non_autorise')
						}
					} else {
						res.send('erreur')
					}
				} else {
					res.send('contenu_inexistant')
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'ajouter') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const token = req.body.tokenContenu
				const motdepasse = req.body.motdepasse
				const nom = req.body.nomUtilisateur
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					let donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse) && token === donneesPad.token) {
						const date = dayjs().format()
						let langue = 'fr'
						if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
							langue = req.session.langue
						}
						await db
						.multi()
						.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
						.HSET('pads:' + pad, ['identifiant', identifiant, 'digidrive', 1])
						.exec()
						res.json({ titre: donneesPad.titre, identifiant: identifiant })
					} else if (!donneesPad.hasOwnProperty('motdepasse') && token === donneesPad.token) {
						const resultat = await db.EXISTS('utilisateurs:' + donneesPad.identifiant)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donneesPad.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
								await db.HSET('pads:' + pad, 'digidrive', 1)
								res.json({ titre: donneesPad.titre, identifiant: donneesPad.identifiant })
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('non_autorise')
					}
				} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
					const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
					if (typeof donneesPad === 'object' && donneesPad !== null) {
						if (motdepasse.trim() !== '' && donneesPad.pad.hasOwnProperty('motdepasse') && donneesPad.pad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.pad.motdepasse) && token === donneesPad.pad.token) {
							await ajouterPadDansDb(donneesPad, donnees)
							const date = dayjs().format()
							let langue = 'fr'
							if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
								langue = req.session.langue
							}
							await db
							.multi()
							.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
							.HSET('pads:' + pad, ['identifiant', identifiant, 'digidrive', 1])
							.exec()
							res.json({ titre: donneesPad.pad.titre, identifiant: identifiant })
						} else if (!donneesPad.pad.hasOwnProperty('motdepasse') && token === donneesPad.pad.token) {
							await ajouterPadDansDb(donneesPad, donnees)
							const resultat = await db.EXISTS('utilisateurs:' + donneesPad.pad.identifiant)
							if (resultat === null) { res.send('erreur'); return false }
							if (resultat === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donneesPad.pad.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) { res.send('erreur'); return false }
								if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
									await db.HSET('pads:' + pad, 'digidrive', 1)
									res.json({ titre: donneesPad.pad.titre, identifiant: donneesPad.pad.identifiant })
								} else {
									res.send('non_autorise')
								}
							} else {
								res.send('erreur')
							}
						} else {
							res.send('non_autorise')
						}
					} else {
						res.send('erreur')
					}
				} else {
					res.send('contenu_inexistant')
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'dupliquer') {
				const identifiant = req.body.identifiant
				const motdepasse = req.body.motdepasse
				const pad = req.body.id
				const num = await db.GET('pad')
				if (num === null) { res.send('erreur'); return false }
				const id = parseInt(num) + 1
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				checkDiskSpace(dossier).then(async function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (stockage === 'fs' && espace < minimumEspaceDisque) {
						res.send('erreur')
					} else {
						const resultat = await db.EXISTS('pads:' + pad)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1 || (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json')))) {
							if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
								const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
								if (typeof donneesPad === 'object' && donneesPad !== null) {
									await ajouterPadDansDb(pad, donneesPad)
								} else {
									res.send('erreur')
									return false
								}
							}
							let donnees = await db.HGETALL('pads:' + pad)
							donnees = Object.assign({}, donnees)
							if (donnees === null || !donnees.hasOwnProperty('identifiant')) { res.send('erreur'); return false }
							let autorisation = false
							let avecCompte = false
							const proprietaire = donnees.identifiant
							if (proprietaire === identifiant && motdepasse.trim() !== '' && donnees.hasOwnProperty('motdepasse') && donnees.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
								autorisation = true
							} else if (!donnees.hasOwnProperty('motdepasse') && proprietaire === identifiant) {
								const resultat = await db.EXISTS('utilisateurs:' + identifiant)
								if (resultat === null) { res.send('erreur'); return false }
								if (resultat === 1) {
									let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
									utilisateur = Object.assign({}, utilisateur)
									if (utilisateur === null) { res.send('erreur'); return false }
									if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
										autorisation = true
										avecCompte = true
									}
								}
							}
							if (autorisation === true) {
								const donneesBlocs = []
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { res.send('erreur'); return false }
								for (const [indexBloc, bloc] of blocs.entries()) {
									const donneesBloc = new Promise(async function (resolve) {
										let infos = await db.HGETALL('pad-' + pad + ':' + bloc)
										infos = Object.assign({}, infos)
										if (infos === null) { resolve({}); return false }
										const date = dayjs().format()
										if (infos.hasOwnProperty('vignette') && definirVignettePersonnalisee(infos.vignette) === true) {
											infos.vignette = path.basename(infos.vignette)
										}
										let visibilite = 'visible'
										if (infos.hasOwnProperty('visibilite')) {
											visibilite = infos.visibilite
										}
										if (infos.hasOwnProperty('iframe') && infos.iframe !== '' && infos.iframe.includes(etherpad)) {
											const etherpadId = infos.iframe.replace(etherpad + '/p/', '')
											const destinationId = 'pad-' + id + '-' + Math.random().toString(16).slice(2)
											const url = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
											axios.get(url)
											infos.iframe = etherpad + '/p/' + destinationId
											infos.media = etherpad + '/p/' + destinationId
										}
										const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
										await db
										.multi()
										.HSET('pad-' + id + ':' + blocId, ['id', infos.id, 'bloc', blocId, 'titre', infos.titre, 'texte', infos.texte, 'media', infos.media, 'iframe', infos.iframe, 'type', infos.type, 'source', infos.source, 'vignette', infos.vignette, 'date', date, 'identifiant', infos.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infos.colonne, 'visibilite', visibilite])
										.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
										.exec()
										resolve(blocId)
									})
									donneesBlocs.push(donneesBloc)
								}
								Promise.all(donneesBlocs).then(async function () {
									const token = Math.random().toString(16).slice(2)
									const nouveaumotdepasse = req.body.nouveaumotdepasse
									const hash = await bcrypt.hash(nouveaumotdepasse, 10)
									const date = dayjs().format()
									const code = Math.floor(100000 + Math.random() * 900000)
									let registreActivite = 'active'
									let conversation = 'desactivee'
									let listeUtilisateurs = 'activee'
									let editionNom = 'desactivee'
									let ordre = 'croissant'
									let largeur = 'normale'
									let enregistrements = 'desactives'
									let copieBloc = 'desactivee'
									let affichageColonnes = []
									if (donnees.hasOwnProperty('registreActivite')) {
										registreActivite = donnees.registreActivite
									}
									if (donnees.hasOwnProperty('conversation')) {
										conversation = donnees.conversation
									}
									if (donnees.hasOwnProperty('listeUtilisateurs')) {
										listeUtilisateurs = donnees.listeUtilisateurs
									}
									if (donnees.hasOwnProperty('editionNom')) {
										editionNom = donnees.editionNom
									}
									if (donnees.hasOwnProperty('ordre')) {
										ordre = donnees.ordre
									}
									if (donnees.hasOwnProperty('largeur')) {
										largeur = donnees.largeur
									}
									if (donnees.hasOwnProperty('enregistrements')) {
										enregistrements = donnees.enregistrements
									}
									if (donnees.hasOwnProperty('copieBloc')) {
										copieBloc = donnees.copieBloc
									}
									if (donnees.hasOwnProperty('affichageColonnes')) {
										affichageColonnes = JSON.parse(donnees.affichageColonnes)
									} else {
										JSON.parse(donnees.colonnes).forEach(function () {
											affichageColonnes.push(true)
										})
									}
									if (!donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
										donnees.fond = path.basename(donnees.fond)
									}
									if (donnees.hasOwnProperty('code') && avecCompte === false) {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', donnees.fond, 'acces', donnees.acces, 'code', code, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1])
										.SADD('pads-crees:' + identifiant, id.toString())
										.exec()
									} else if (donnees.hasOwnProperty('code') && avecCompte === true) {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'code', code, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1])
										.SADD('pads-crees:' + identifiant, id.toString())
										.SADD('utilisateurs-pads:' + id, identifiant)
										.exec()
									} else if (!donnees.hasOwnProperty('code') && avecCompte === false) {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1])
										.SADD('pads-crees:' + identifiant, id.toString())
										.exec()
									} else if (!donnees.hasOwnProperty('code') && avecCompte === true) {
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', 'Copie de ' + donnees.titre, 'identifiant', identifiant, 'fond', donnees.fond, 'acces', donnees.acces, 'contributions', donnees.contributions, 'affichage', donnees.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.fichiers, 'enregistrements', enregistrements, 'liens', donnees.liens, 'documents', donnees.documents, 'commentaires', donnees.commentaires, 'evaluations', donnees.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1])
										.SADD('pads-crees:' + identifiant, id.toString())
										.SADD('utilisateurs-pads:' + id, identifiant)
										.exec()
									}
									if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))) {
										await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id))
									} else if (stockage === 's3') {
										const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
										if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
											for (let i = 0; i < liste.Contents.length; i++) {
												await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: id + '/' + liste.Contents[i].Key.replace(pad + '/', ''), CopySource: '/' + bucket + '/' + liste.Contents[i].Key, ACL: 'public-read' }))
											}
										}
									}
									res.send(id + '/' + token)
								})
							} else {
								res.send('non_autorise')
							}
						}
					}
				})
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'exporter') {
				const identifiant = req.body.identifiant
				const motdepasse = req.body.motdepasse
				const id = req.body.id
				const resultat = await db.EXISTS('pads:' + id)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1) {
					let donneesPad = await db.HGETALL('pads:' + id)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					const proprietaire = donneesPad.identifiant
					if (proprietaire === identifiant && motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
						exporterPad(req, res, id, 'erreur')
					} else if (!donneesPad.hasOwnProperty('motdepasse') && proprietaire === identifiant) {
						const resultat = await db.EXISTS('utilisateurs:' + identifiant)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
								exporterPad(req, res, id, 'erreur')
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('non_autorise')
					}
				} else if (resultat !== 1 && isNaN(parseInt(id)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
					if (typeof donneesPad === 'object' && donneesPad !== null) {
						const proprietaire = donneesPad.pad.identifiant
						if (proprietaire === identifiant && motdepasse.trim() !== '' && donneesPad.pad.hasOwnProperty('motdepasse') && donneesPad.pad.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesPad.pad.motdepasse)) {
							exporterPadJson(res, id, donneesPad)
						} else if (!donneesPad.pad.hasOwnProperty('motdepasse') && proprietaire === identifiant) {
							const resultat = await db.EXISTS('utilisateurs:' + identifiant)
							if (resultat === null) { res.send('erreur'); return false }
							if (resultat === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) { res.send('erreur'); return false }
								if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
									exporterPadJson(res, id, donneesPad)
								} else {
									res.send('non_autorise')
								}
							} else {
								res.send('erreur')
							}
						} else {
							res.send('non_autorise')
						}
					} else {
						res.send('erreur')
					}
				} else {
					res.send('contenu_inexistant')
				}
			} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'supprimer') {
				const identifiant = req.body.identifiant
				const pad = req.body.id
				const motdepasse = req.body.motdepasse
				const resultat = await db.EXISTS('pads:' + pad)
				if (resultat === null) { res.send('erreur'); return false }
				if (resultat === 1 || (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json')))) {
					if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
						const donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))
						if (typeof donneesPad === 'object' && donneesPad !== null) {
							await ajouterPadDansDb(pad, donneesPad)
						} else {
							res.send('erreur')
							return false
						}
					}
					let donneesPad = await db.HGETALL('pads:' + pad)
					donneesPad = Object.assign({}, donneesPad)
					if (donneesPad === null) { res.send('erreur'); return false }
					if (motdepasse.trim() !== '' && donneesPad.hasOwnProperty('motdepasse') && donneesPad.motdepasse.trim() !== '' && donneesPad.identifiant === identifiant && await bcrypt.compare(motdepasse, donneesPad.motdepasse)) {
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs === null) { res.send('erreur'); return false }
						for (let i = 0; i < blocs.length; i++) {
							await db
							.multi()
							.UNLINK('commentaires:' + blocs[i])
							.UNLINK('evaluations:' + blocs[i])
							.UNLINK('pad-' + pad + ':' + blocs[i])
							.exec()
						}
						await db
						.multi()
						.UNLINK('blocs:' + pad)
						.UNLINK('pads:' + pad)
						.UNLINK('activite:' + pad)
						.UNLINK('dates-pads:' + pad)
						.SREM('pads-crees:' + identifiant, pad.toString())
						.SREM('pads-supprimes:' + identifiant, pad.toString())
						.exec()
						const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
						if (utilisateurs === null) { res.send('erreur'); return false }
						for (let j = 0; j < utilisateurs.length; j++) {
							await db
							.multi()
							.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
							.SREM('pads-admins:' + utilisateurs[j], pad.toString())
							.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
							.exec()
						}
						await db.UNLINK('utilisateurs-pads:' + pad)
						if (stockage === 'fs') {
							const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
							await fs.remove(chemin)
						} else if (stockage === 's3') {
							const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
							if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
								for (let i = 0; i < liste.Contents.length; i++) {
									await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
								}
							}
						}
						res.send('contenu_supprime')
					} else if (!donneesPad.hasOwnProperty('motdepasse') && donneesPad.identifiant === identifiant) {
						const resultat = await db.EXISTS('utilisateurs:' + identifiant)
						if (resultat === null) { res.send('erreur'); return false }
						if (resultat === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) { res.send('erreur'); return false }
							if (motdepasse.trim() !== '' && utilisateur.hasOwnProperty('motdepasse') && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
								const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
								if (blocs === null) { res.send('erreur'); return false }
								for (let i = 0; i < blocs.length; i++) {
									await db
									.multi()
									.UNLINK('commentaires:' + blocs[i])
									.UNLINK('evaluations:' + blocs[i])
									.UNLINK('pad-' + pad + ':' + blocs[i])
									.exec()
								}
								await db
								.multi()
								.UNLINK('blocs:' + pad)
								.UNLINK('pads:' + pad)
								.UNLINK('activite:' + pad)
								.UNLINK('dates-pads:' + pad)
								.SREM('pads-crees:' + identifiant, pad.toString())
								.SREM('pads-supprimes:' + identifiant, pad.toString())
								.exec()
								const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
									if (utilisateurs === null) { res.send('erreur'); return false }
									for (let j = 0; j < utilisateurs.length; j++) {
										await db
										.multi()
										.SREM('pads-rejoints:' + utilisateurs[j], pad.toString())
										.SREM('pads-utilisateurs:' + utilisateurs[j], pad.toString())
										.SREM('pads-admins:' + utilisateurs[j], pad.toString())
										.SREM('pads-favoris:' + utilisateurs[j], pad.toString())
										.exec()
									}
								await db.UNLINK('utilisateurs-pads:' + pad)
								if (stockage === 'fs') {
									const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad)
									await fs.remove(chemin)
								} else if (stockage === 's3') {
									const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
									if (liste !== null && liste.hasOwnProperty('Contents') && liste.Contents instanceof Array) {
										for (let i = 0; i < liste.Contents.length; i++) {
											await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: liste.Contents[i].Key }))
										}
									}
								}
								res.send('contenu_supprime')
							} else {
								res.send('non_autorise')
							}
						} else {
							res.send('erreur')
						}
					} else {
						res.send('non_autorise')
					}
				} else {
					res.send('contenu_supprime')
				}
			} else {
				res.send('erreur')
			}
		}).catch(function () {
			res.send('erreur')
		})
	})

	app.post('/api/ladigitale/importer', function (req, res) {
		televerserTemp(req, res, async function (err) {
			if (err) { res.send('erreur'); return false }
			try {
				const tokenApi = req.body.token
				const domaine = req.headers.host
				const lien = req.body.lien
				const params = new URLSearchParams()
				params.append('token', tokenApi)
				params.append('domaine', domaine)
				axios.post(lien, params).then(async function (reponse) {
					if (reponse.data === 'non_autorise' || reponse.data === 'erreur') {
						res.send('erreur_token')
					} else if (reponse.data === 'token_autorise' && req.body.action && req.body.action === 'importer') {
						const identifiant = req.body.identifiant
						let nom = req.body.nomUtilisateur
						if (nom === '') {
							nom = identifiant.toUpperCase()
						}
						const titre = req.body.titre
						const motdepasse = req.body.motdepasse
						const hash = await bcrypt.hash(motdepasse, 10)
						let langue = 'fr'
						if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
							langue = req.session.langue
						}
						const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
						const cible = path.join(__dirname, '..', '/static/temp/archive-' + Math.floor((Math.random() * 100000) + 1))
						await extract(source, { dir: cible })
						const donnees = await fs.readJson(path.normalize(cible + '/donnees.json'))
						const parametres = JSON.parse(req.body.parametres)
						// Vérification des clés des données
						if (donnees.hasOwnProperty('pad') && donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && donnees.pad.hasOwnProperty('id') && donnees.pad.hasOwnProperty('token') && donnees.pad.hasOwnProperty('titre') && donnees.pad.hasOwnProperty('identifiant') && donnees.pad.hasOwnProperty('fond') && donnees.pad.hasOwnProperty('acces') && donnees.pad.hasOwnProperty('contributions') && donnees.pad.hasOwnProperty('affichage') && donnees.pad.hasOwnProperty('fichiers') && donnees.pad.hasOwnProperty('liens') && donnees.pad.hasOwnProperty('documents') && donnees.pad.hasOwnProperty('commentaires') && donnees.pad.hasOwnProperty('evaluations') && donnees.pad.hasOwnProperty('date') && donnees.pad.hasOwnProperty('colonnes') && donnees.pad.hasOwnProperty('bloc') && donnees.pad.hasOwnProperty('activite')) {
							const resultat = await db.GET('pad')
							if (resultat === null) { res.send('erreur'); return false }
							const id = parseInt(resultat) + 1
							const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
							checkDiskSpace(dossier).then(async function (diskSpace) {
								const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
								if (stockage === 'fs' && espace < minimumEspaceDisque) {
									res.send('erreur')
								} else {
									const donneesBlocs = []
									const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
									if (stockage === 'fs') {
										await fs.mkdirp(chemin)
									}
									for (const [indexBloc, bloc] of donnees.blocs.entries()) {
										const donneesBloc = new Promise(async function (resolve) {
											if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
												const date = dayjs().format()
												let commentaires = 0
												let evaluations = 0
												if (parametres.commentaires === true) {
													commentaires = bloc.commentaires
												}
												if (parametres.evaluations === true) {
													evaluations = bloc.evaluations
												}
												if (definirVignettePersonnalisee(bloc.vignette) === true) {
													bloc.vignette = path.basename(bloc.vignette)
												}
												let visibilite = 'visible'
												if (bloc.hasOwnProperty('visibilite')) {
													visibilite = bloc.visibilite
												}
												const blocId = 'bloc-id-' + (new Date()).getTime() + Math.random().toString(16).slice(10)
												await db
												.multi()
												.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
												.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
												.exec()
												if (parametres.commentaires === true) {
													for (const commentaire of bloc.listeCommentaires) {
														if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
															await db.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
														}
													}
												}
												if (parametres.evaluations === true) {
													for (const evaluation of bloc.listeEvaluations) {
														if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
															await db.ZADD('evaluations:' + blocId, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
														}
													}
												}
												if (stockage === 'fs' && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
													await fs.copy(path.normalize(cible + '/fichiers/' + bloc.media), path.normalize(chemin + '/' + bloc.media, { overwrite: true }))
												} else if (stockage === 's3' && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.media))) {
													const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + bloc.media))
													await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.media, Body: buffer, ACL: 'public-read' }))
												}
												if (stockage === 'fs' && bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.vignette))) {
													await fs.copy(path.normalize(cible + '/fichiers/' + bloc.vignette), path.normalize(chemin + '/' + bloc.vignette, { overwrite: true }))
												} else if (stockage === 's3' && bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true && await fs.pathExists(path.normalize(cible + '/fichiers/' + bloc.vignette))) {
													const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + bloc.vignette))
													await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.vignette, Body: buffer, ACL: 'public-read' }))
												}
												resolve({ bloc: bloc.bloc, blocId: blocId })
											} else {
												resolve({ bloc: 0, blocId: 0 })
											}
										})
										donneesBlocs.push(donneesBloc)
									}
									Promise.all(donneesBlocs).then(async function (blocs) {
										const token = Math.random().toString(16).slice(2)
										const date = dayjs().format()
										const code = Math.floor(100000 + Math.random() * 900000)
										let registreActivite = 'active'
										let conversation = 'desactivee'
										let listeUtilisateurs = 'activee'
										let editionNom = 'desactivee'
										let ordre = 'croissant'
										let largeur = 'normale'
										let enregistrements = 'desactives'
										let copieBloc = 'desactivee'
										let affichageColonnes = []
										let activiteId = 0
										if (donnees.pad.hasOwnProperty('registreActivite')) {
											registreActivite = donnees.pad.registreActivite
										}
										if (donnees.pad.hasOwnProperty('conversation')) {
											conversation = donnees.pad.conversation
										}
										if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
											listeUtilisateurs = donnees.pad.listeUtilisateurs
										}
										if (donnees.pad.hasOwnProperty('editionNom')) {
											editionNom = donnees.pad.editionNom
										}
										if (donnees.pad.hasOwnProperty('ordre')) {
											ordre = donnees.pad.ordre
										}
										if (donnees.pad.hasOwnProperty('largeur')) {
											largeur = donnees.pad.largeur
										}
										if (donnees.pad.hasOwnProperty('enregistrements')) {
											enregistrements = donnees.pad.enregistrements
										}
										if (donnees.pad.hasOwnProperty('copieBloc')) {
											copieBloc = donnees.pad.copieBloc
										}
										if (donnees.pad.hasOwnProperty('affichageColonnes')) {
											affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
										} else {
											JSON.parse(donnees.pad.colonnes).forEach(function () {
												affichageColonnes.push(true)
											})
										}
										if (parametres.activite === true) {
											activiteId = donnees.pad.activite
										}
										if (stockage === 'fs' && !donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string' && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))) {
											await fs.copy(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)), path.normalize(chemin + '/' + path.basename(donnees.pad.fond), { overwrite: true }))
										} else if (stockage === 's3' && !donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string' && await fs.pathExists(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))) {
											const buffer = await fs.readFile(path.normalize(cible + '/fichiers/' + path.basename(donnees.pad.fond)))
											await s3Client.send(new PutObjectCommand({ Bucket: bucket, Key: id + '/' + path.basename(donnees.pad.fond), Body: buffer, ACL: 'public-read' }))
										}
										await db
										.multi()
										.INCR('pad')
										.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'vues', 0, 'digidrive', 1])
										.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
										.SADD('pads-crees:' + identifiant, id.toString())
										.exec()
										if (parametres.activite === true) {
											if (parametres.commentaires === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-commente'
												})
											}
											if (parametres.evaluations === false) {
												donnees.activite = donnees.activite.filter(function (element) {
													return element.type !== 'bloc-evalue'
												})
											}
											for (const activite of donnees.activite) {
												if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
													blocs.forEach(function (item) {
														if (activite.bloc === item.bloc) {
															activite.bloc = item.blocId
														}
													})
													await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
												}
											}
										}
										await fs.remove(source)
										await fs.remove(cible)
										res.send(id + '/' + token)
									})
								}
							})
						} else {
							await fs.remove(source)
							await fs.remove(cible)
							res.send('donnees_corrompues')
						}
					}
				})
			} catch (err) {
				await fs.remove(path.join(__dirname, '..', '/static/temp/' + req.file.filename))
				res.send('erreur')
			}
		})
	})

	app.use(function (req, res) {
		if (maintenance === true) {
			res.redirect('/maintenance')
		} else {
			res.redirect('/')
		}
	})

	const port = process.env.PORT || 3000
	httpServer.listen(port)

	const io = new Server(httpServer, {
		wsEngine: eiows.Server,
		pingInterval: 120000,
    	pingTimeout: 100000,
    	maxHttpBufferSize: 1e7,
		cookie: false,
		perMessageDeflate: false
	})
	if (cluster === true) {
		io.adapter(createAdapter())
	}
	const wrap = middleware => (socket, next) => middleware(socket.request, {}, next)
	io.use(wrap(sessionMiddleware))

	io.on('connection', function (socket) {
		const req = socket.request
		socket.use(function (__, next) {
			req.session.reload(function (err) {
				if (err) {
					socket.disconnect()
				} else {
					next()
				}
			})
		})

		socket.on('connexion', async function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			const nom = donnees.nom
			const room = 'pad-' + pad
			socket.join(room)
			socket.data.identifiant = identifiant
			socket.data.nom = nom
			const clients = await fetchSockets(room)
			const utilisateurs = []
			if (clients !== null && clients instanceof Array) {
				for (let i = 0; i < clients.length; i++) {
					utilisateurs.push({ identifiant: clients[i].data.identifiant, nom: clients[i].data.nom })
				}
			}
			const utilisateursConnectes = utilisateurs.filter((v, i, a) => a.findIndex(t => (t.identifiant === v.identifiant)) === i)
			io.to(room).emit('connexion', utilisateursConnectes)
		})

		socket.on('sortie', function (pad, identifiant) {
			socket.leave('pad-' + pad)
			socket.to('pad-' + pad).emit('deconnexion', identifiant)
		})

		socket.on('disconnecting', function () {
			if (req.session.identifiant !== '') {
				socket.rooms.forEach(function (room) {
					io.to(room).emit('deconnexion', req.session.identifiant)
				})
			}
		})

		socket.on('deconnexion', function (identifiant) {
			if (req.session.hasOwnProperty('identifiant')) {
				req.session.identifiant = ''
				req.session.motdepasse = ''
				req.session.nom = ''
				req.session.email = ''
				req.session.langue = ''
				req.session.statut = ''
				req.session.save()
			}
			if (identifiant !== '') {
				socket.rooms.forEach(function (room) {
					io.to(room).emit('deconnexion', req.session.identifiant)
				})
			}
		})

		socket.on('verifieracces', async function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			let code = ''
			if (donnees.code === '') {
				if (!req.session.hasOwnProperty('acces')) {
					req.session.acces = []
				}
				req.session.acces.map(function (e) {
					if (e.hasOwnProperty('pad') && parseInt(e.pad) === parseInt(pad)) {
						code = e.code 
					}
				})
			} else {
				code = donnees.code
			}
			if (req.session.identifiant === identifiant && code !== '') {
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('code')) { socket.emit('erreur'); return false }
				if (code === resultat.code) {
					const donneesPad = await recupererDonneesPadProtege(resultat, pad, identifiant)
					socket.emit('verifieracces', { acces: true, pad: donneesPad.pad, blocs: donneesPad.blocs, activite: donneesPad.activite.reverse() })
				} else {
					socket.emit('verifieracces', { acces: false })
				}
			} else {
				socket.emit('verifieracces', { acces: false })
			}
		})

		socket.on('ajouterbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				const admin = await verifierAdmin(pad, donnees, req.session)
				if (donnees.id === pad && donnees.token === token && (donnees.contributions !== 'fermees' || admin)) {
					const id = parseInt(donnees.bloc) + 1
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					let visibilite = 'visible'
					if (admin && privee === true) {
						visibilite = 'privee'
					} else if (!admin && donnees.contributions === 'moderees') {
						visibilite = 'masquee'
					}
					if (vignette && definirVignettePersonnalisee(vignette) === true) {
						vignette = path.basename(vignette)
					}
					await db
					.multi()
					.HINCRBY('pads:' + pad, 'bloc', 1)
					.HSET('pad-' + pad + ':' + bloc, ['id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: id, value: bloc }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
					// Enregistrer entrée du registre d'activité
					if (visibilite === 'visible' || visibilite === 'masquee') {
						await db
						.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
					}
					if (stockage === 'fs' && media !== '' && type !== 'embed' && type !== 'lien' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
						await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + media))
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
					} else if (stockage === 's3' && media !== '' && type !== 'embed' && type !== 'lien') {
						try {
							const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'temp/' + media }))
							if (fichierMeta.hasOwnProperty('ContentLength')) {
								await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + media, CopySource: '/' + bucket + '/temp/' + media, ACL: 'public-read' }))
								await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'temp/' + media }))
							}
						} catch (e) {}
					}
					if (stockage === 'fs' && vignette && definirVignettePersonnalisee(vignette) === true && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + vignette))) {
						await fs.copy(path.join(__dirname, '..', '/static/temp/' + vignette), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + vignette))
						await fs.remove(path.join(__dirname, '..', '/static/temp/' + vignette))
					} else if (stockage === 's3' && vignette && definirVignettePersonnalisee(vignette) === true) {
						try {
							const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'temp/' + vignette }))
							if (fichierMeta.hasOwnProperty('ContentLength')) {
								await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + vignette, CopySource: '/' + bucket + '/temp/' + vignette, ACL: 'public-read' }))
								await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'temp/' + vignette }))
							}
						} catch (e) {}
					}
					io.to('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						let objet = await db.HGETALL('pad-' + pad + ':' + bloc)
						objet = Object.assign({}, objet)
						if (objet === null) { socket.emit('erreur'); return false }
						const admin = await verifierAdmin(pad, donnees, req.session)
						if (objet.identifiant === identifiant || admin || donnees.contributions === 'modifiables') {
							let visibilite = 'visible'
							if (objet.hasOwnProperty('visibilite')) {
								visibilite = objet.visibilite
							}
							if (privee === true) {
								visibilite = 'privee'
							}
							const date = dayjs().format()
							if (vignette && objet.hasOwnProperty('vignette') && path.basename(objet.vignette) !== path.basename(vignette) && definirVignettePersonnalisee(vignette) === true) {
								vignette = path.basename(vignette)
							}
							const activiteId = parseInt(donnees.activite) + 1
							if (visibilite === 'visible' || visibilite === 'privee' || visibilite === 'masquee') {
								// Enregistrer entrée du registre d'activité
								if (visibilite === 'visible' || visibilite === 'masquee') {
									await db
									.multi()
									.HINCRBY('pads:' + pad, 'activite', 1)
									.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-modifie' }) }])
									.exec()
								}
								await db
								.multi()
								.HSET('pad-' + pad + ':' + bloc, ['titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', visibilite, 'couleur', couleur, 'modifie', date])
								.HSET('dates-pads:' + pad, 'date', date)
								.exec()
							}
							if (stockage === 'fs' && objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && type !== 'lien' && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + media))) {
								await fs.copy(path.join(__dirname, '..', '/static/temp/' + media), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + media))
								await fs.remove(path.join(__dirname, '..', '/static/temp/' + media))
							} else if (stockage === 's3' && objet.hasOwnProperty('media') && objet.media !== media && media !== '' && type !== 'embed' && type !== 'lien') {
								try {
									const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'temp/' + media }))
									if (fichierMeta.hasOwnProperty('ContentLength')) {
										await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + media, CopySource: '/' + bucket + '/temp/' + media, ACL: 'public-read' }))
										await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'temp/' + media }))
									}
								} catch (e) {}
							}
							if (objet.hasOwnProperty('media') && objet.media !== media && objet.media !== '' && objet.type !== 'embed' && objet.type !== 'lien') {
								await supprimerFichier(pad, objet.media)
							}
							if (stockage === 'fs' && vignette && objet.hasOwnProperty('vignette') && path.basename(objet.vignette) !== vignette && definirVignettePersonnalisee(vignette) === true && await fs.pathExists(path.join(__dirname, '..', '/static/temp/' + vignette))) {
								await fs.copy(path.join(__dirname, '..', '/static/temp/' + vignette), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + vignette))
								await fs.remove(path.join(__dirname, '..', '/static/temp/' + vignette))
							} else if (stockage === 's3' && vignette && objet.hasOwnProperty('vignette') && path.basename(objet.vignette) !== vignette && definirVignettePersonnalisee(vignette) === true) {
								try {
									const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: 'temp/' + vignette }))
									if (fichierMeta.hasOwnProperty('ContentLength')) {
										await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + vignette, CopySource: '/' + bucket + '/temp/' + vignette, ACL: 'public-read' }))
										await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: 'temp/' + vignette }))
									}
								} catch (e) {}
							}
							if (objet.hasOwnProperty('vignette') && path.basename(objet.vignette) !== vignette && definirVignettePersonnalisee(objet.vignette) === true) {
								await supprimerFichier(pad, path.basename(objet.vignette))
							}
							io.to('pad-' + pad).emit('modifierbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, modifie: date, couleur: couleur, colonne: colonne, visibilite: visibilite, activiteId: activiteId })
							req.session.cookie.expires = new Date(Date.now() + dureeSession)
							req.session.save()
						} else {
							socket.emit('nonautorise')
						}
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('copierbloc', async function (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, visibilite, identifiant, nom, padOrigine) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token && await verifierAdmin(pad, donnees, req.session) === true) {
					const id = parseInt(donnees.bloc) + 1
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					if (vignette && definirVignettePersonnalisee(vignette) === true) {
						vignette = path.basename(vignette)
					}
					await db
					.multi()
					.HINCRBY('pads:' + pad, 'bloc', 1)
					.HSET('pad-' + pad + ':' + bloc, ['id', id, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: id, value: bloc }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
					if (visibilite === 'visible') {
						// Enregistrer entrée du registre d'activité
						await db
						.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
					}
					if (stockage === 'fs' && media !== '' && type !== 'embed' && type !== 'lien' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padOrigine + '/' + media))) {
						await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padOrigine + '/' + media), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + media))
					} else if (stockage === 's3' && media !== '' && type !== 'embed' && type !== 'lien') {
						try {
							const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: padOrigine + '/' + media }))
							if (fichierMeta.hasOwnProperty('ContentLength')) {
								await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + media, CopySource: '/' + bucket + '/' + padOrigine + '/' + media, ACL: 'public-read' }))
							}
						} catch (e) {}
					}
					if (stockage === 'fs' && vignette && definirVignettePersonnalisee(vignette) === true && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padOrigine + '/' + vignette))) {
						await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padOrigine + '/' + vignette), path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + vignette))
					} else if (stockage === 's3' && vignette && definirVignettePersonnalisee(vignette) === true) {
						try {
							const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: padOrigine + '/' + vignette }))
							if (fichierMeta.hasOwnProperty('ContentLength')) {
								await s3Client.send(new CopyObjectCommand({ Bucket: bucket, Key: pad + '/' + vignette, CopySource: '/' + bucket + '/' + padOrigine + '/' + vignette, ACL: 'public-read' }))
							}
						} catch (e) {}
					}
					io.to('pad-' + pad).emit('ajouterbloc', { bloc: bloc, titre: titre, texte: texte, media: media, iframe: iframe, type: type, source: source, vignette: vignette, identifiant: identifiant, nom: nom, date: date, couleur: couleur, commentaires: 0, evaluations: [], colonne: colonne, visibilite: visibilite, activiteId: activiteId })
					socket.emit('copierbloc')
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('autoriserbloc', async function (pad, token, item, indexBloc, indexBlocColonne, moderation, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token && await verifierAdmin(pad, donnees, req.session) === true) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + item.bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						const date = dayjs().format()
						const activiteId = parseInt(donnees.activite) + 1
						if (item.hasOwnProperty('modifie')) {
							await db.HDEL('pad-' + pad + ':' + item.bloc, 'modifie')
						}
						let nomUtilisateur
						if (moderation === 'privee') {
							await db
							.multi()
							.HSET('pad-' + pad + ':' + item.bloc, ['visibilite', 'visible', 'date', date])
							.HSET('dates-pads:' + pad, 'date', date)
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: item.identifiant, titre: item.titre, date: date, type: 'bloc-ajoute' }) }])
							.exec()
							nomUtilisateur = item.nom
						} else {
							await db
							.multi()
							.HSET('pad-' + pad + ':' + item.bloc, 'visibilite', 'visible')
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: identifiant, titre: item.titre, date: date, type: 'bloc-valide' }) }])
							.exec()
							nomUtilisateur = nom
						}
						io.to('pad-' + pad).emit('autoriserbloc', { bloc: item.bloc, titre: item.titre, texte: item.texte, media: item.media, iframe: item.iframe, type: item.type, source: item.source, vignette: item.vignette, identifiant: item.identifiant, nom: nomUtilisateur, date: date, couleur: item.couleur, commentaires: 0, evaluations: [], colonne: item.colonne, visibilite: 'visible', activiteId: activiteId, moderation: moderation, admin: identifiant, indexBloc: indexBloc, indexBlocColonne: indexBlocColonne })
						req.session.cookie.expires = new Date(Date.now() + dureeSession)
						req.session.save()
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacerbloc', async function (items, pad, affichage, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && await verifierAdmin(pad, donnees, req.session) === true) {
					if (ordre === 'decroissant') {
						items.reverse()
					}
					const donneesBlocs = []
					for (let i = 0; i < items.length; i++) {
						const donneeBloc = new Promise(async function (resolve) {
							const resultat = await db.EXISTS('pad-' + pad + ':' + items[i].bloc)
							if (resultat === null) { resolve('erreur'); return false }
							if (resultat === 1) {
								await db
								.multi()
								.ZREM('blocs:' + pad, items[i].bloc)
								.ZADD('blocs:' + pad, [{ score: (i + 1), value: items[i].bloc }])
								.exec()
								if (affichage === 'colonnes') {
									await db.HSET('pad-' + pad + ':' + items[i].bloc, 'colonne', items[i].colonne)
								}
								resolve(i)
							} else {
								resolve('erreur')
							}
						})
						donneesBlocs.push(donneeBloc)
					}
					Promise.all(donneesBlocs).then(function (blocs) {
						let erreurs = 0
						blocs.forEach(function (bloc) {
							if (bloc === 'erreur') {
								erreurs++
							}
						})
						if (erreurs === 0) {
							if (ordre === 'decroissant') {
								items.reverse()
							}
							io.to('pad-' + pad).emit('deplacerbloc', { blocs: items, identifiant: identifiant })
						} else {
							socket.emit('erreur')
						}
					})
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerbloc', async function (bloc, pad, token, titre, colonne, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('id') || !donnees.hasOwnProperty('token') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (donnees.id === pad && donnees.token === token) {
					const resultat = await db.EXISTS('pad-' + pad + ':' + bloc)
					if (resultat === null) { socket.emit('erreur'); return false }
					if (resultat === 1) {
						let objet = await db.HGETALL('pad-' + pad + ':' + bloc)
						objet = Object.assign({}, objet)
						if (objet === null) { socket.emit('erreur'); return false }
						if (objet.identifiant === identifiant || await verifierAdmin(pad, donnees, req.session) === true) {
							if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed' && objet.type !== 'lien') {
								await supprimerFichier(pad, objet.media)
							}
							if (objet.hasOwnProperty('vignette') && definirVignettePersonnalisee(objet.vignette) === true) {
								await supprimerFichier(pad, path.basename(objet.vignette))
							}
							let etherpadId, url
							if (objet.hasOwnProperty('iframe') && objet.iframe !== '' && objet.iframe.includes(etherpad)) {
								etherpadId = objet.iframe.replace(etherpad + '/p/', '')
								url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
								axios.get(url)
							}
							if (objet.hasOwnProperty('media') && objet.media !== '' && objet.media.includes(etherpad)) {
								etherpadId = objet.media.replace(etherpad + '/p/', '')
								url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
								axios.get(url)
							}
							if (objet.hasOwnProperty('bloc') && objet.bloc === bloc) {
								const date = dayjs().format()
								const activiteId = parseInt(donnees.activite) + 1
								await db
								.multi()
								.UNLINK('pad-' + pad + ':' + bloc)
								.ZREM('blocs:' + pad, bloc)
								.UNLINK('commentaires:' + bloc)
								.UNLINK('evaluations:' + bloc)
								.HSET('dates-pads:' + pad, 'date', date)
								// Enregistrer entrée du registre d'activité
								.HINCRBY('pads:' + pad, 'activite', 1)
								.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-supprime' }) }])
								.exec()
								io.to('pad-' + pad).emit('supprimerbloc', { bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, colonne: colonne, activiteId: activiteId })
								req.session.cookie.expires = new Date(Date.now() + dureeSession)
								req.session.save()
							}
						} else {
							socket.emit('nonautorise')
						}
					}
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('commenterbloc', async function (bloc, pad, titre, texte, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
				let donnees = await db.HGETALL('pad-' + pad + ':' + bloc)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('commentaires')) { socket.emit('erreur'); return false }
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires === null) { socket.emit('erreur'); return false }
				const date = dayjs().format()
				const activiteId = parseInt(resultat.activite) + 1
				let commentaireId = parseInt(donnees.commentaires) + 1
				const listeCommentaires = []
				for (let commentaire of commentaires) {
					const commentaireJSON = verifierJSON(commentaire)
					if (commentaireJSON === false) {
						socket.emit('erreur'); return false
					} else {
						listeCommentaires.push(commentaireJSON)
					}
				}
				let maxCommentaireId = 0
				if (listeCommentaires.length > 0) {
					maxCommentaireId = listeCommentaires.reduce(function (p, c) {
						return (p && p.id > c.id) ? p : c
					})
				}
				if (commentaireId === maxCommentaireId.id || commentaireId < maxCommentaireId.id) {
					commentaireId = maxCommentaireId.id + 1
				}
				const commentaire = { id: commentaireId, identifiant: identifiant, date: date, texte: texte }
				await db
				.multi()
				.HSET('pad-' + pad + ':' + bloc, 'commentaires', commentaireId)
				.HSET('dates-pads:' + pad, 'date', date)
				.ZADD('commentaires:' + bloc, [{ score: commentaireId, value: JSON.stringify(commentaire) }])
				// Enregistrer entrée du registre d'activité
				.HINCRBY('pads:' + pad, 'activite', 1)
				.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-commente' }) }])
				.exec()
				io.to('pad-' + pad).emit('commenterbloc', { id: commentaireId, bloc: bloc, identifiant: identifiant, nom: nom, texte: texte, titre: titre, date: date, commentaires: commentaires.length + 1, activiteId: activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaire', async function (bloc, pad, id, texte, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				const resultats = await db.ZRANGEBYSCORE('commentaires:' + bloc, id, id)
				if (resultats === null) { socket.emit('erreur'); return false }
				const dateModification = dayjs().format()
				const resulatsJSON = verifierJSON(resultats)
				let donnees
				if (resulatsJSON === false) {
					socket.emit('erreur'); return false
				} else {
					donnees = resulatsJSON
				}
				const date = donnees.date
				const commentaire = { id: id, identifiant: donnees.identifiant, date: date, modifie: dateModification, texte: texte }
				await db
				.multi()
				.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
				.ZADD('commentaires:' + bloc, [{ score: id, value: JSON.stringify(commentaire) }])
				.HSET('dates-pads:' + pad, 'date', dateModification)
				.exec()
				io.to('pad-' + pad).emit('modifiercommentaire', { id: id, texte: texte })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimercommentaire', async function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				const date = dayjs().format()
				await db
				.multi()
				.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
				.HSET('dates-pads:' + pad, 'date', date)
				.exec()
				const commentaires = await db.ZCARD('commentaires:' + bloc)
				if (commentaires === null) { socket.emit('erreur'); return false }
				io.to('pad-' + pad).emit('supprimercommentaire', { id: id, bloc: bloc, commentaires: commentaires })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('commentaires', async function (bloc, type) {
			const donneesCommentaires = []
			const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
			if (commentaires === null) { socket.emit('erreur'); return false }
			for (let commentaire of commentaires) {
				const commentaireJSON = verifierJSON(commentaire)
				if (commentaireJSON === false) {
					socket.emit('erreur'); return false
				} else {
					commentaire = commentaireJSON
				}
				const donneeCommentaire = new Promise(async function (resolve) {
					const identifiant = commentaire.identifiant
					const resultat = await db.EXISTS('utilisateurs:' + identifiant)
					if (resultat === null) { resolve(); return false }
					if (resultat === 1) {
						let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
						utilisateur = Object.assign({}, utilisateur)
						if (utilisateur === null) { resolve(); return false }
						commentaire.nom = utilisateur.nom
						resolve(commentaire)
					} else {
						const reponse = await db.EXISTS('noms:' + identifiant)
						if (reponse === null) { resolve(); return false }
						if (reponse === 1) {
							const nom = await db.HGET('noms:' + identifiant, 'nom')
							if (nom === null) { resolve(); return false }
							commentaire.nom = nom
							resolve(commentaire)
						} else {
							commentaire.nom = ''
							resolve(commentaire)
						}
					}
				})
				donneesCommentaires.push(donneeCommentaire)
			}
			Promise.all(donneesCommentaires).then(function (resultat) {
				socket.emit('commentaires', { commentaires: resultat, type: type })
			})
		})

		socket.on('evaluerbloc', async function (bloc, pad, titre, etoiles, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let resultat = await db.HGETALL('pads:' + pad)
				resultat = Object.assign({}, resultat)
				if (resultat === null || !resultat.hasOwnProperty('activite')) { socket.emit('erreur'); return false }
				let donnees = await db.HGETALL('pad-' + pad + ':' + bloc)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('evaluations')) { socket.emit('erreur'); return false }
				const date = dayjs().format()
				const activiteId = parseInt(resultat.activite) + 1
				const evaluationId = parseInt(donnees.evaluations) + 1
				const evaluation = { id: evaluationId, identifiant: identifiant, date: date, etoiles: etoiles }
				await db
				.multi()
				.HINCRBY('pad-' + pad + ':' + bloc, 'evaluations', 1)
				.ZADD('evaluations:' + bloc, [{ score: evaluationId, value: JSON.stringify(evaluation) }])
				.HSET('dates-pads:' + pad, 'date', date)
				// Enregistrer entrée du registre d'activité
				.HINCRBY('pads:' + pad, 'activite', 1)
				.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-evalue' }) }])
				.exec()
				io.to('pad-' + pad).emit('evaluerbloc', { id: evaluationId, bloc: bloc, identifiant: identifiant, nom: nom, titre: titre, date: date, evaluation: evaluation, activiteId: activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluation', async function (bloc, pad, id, etoiles, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				const date = dayjs().format()
				const evaluation = { id: id, identifiant: identifiant, date: date, etoiles: etoiles }
				await db
				.multi()
				.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
				.ZADD('evaluations:' + bloc, [{ score: id, value: JSON.stringify(evaluation) }])
				.HSET('dates-pads:' + pad, 'date', date)
				.exec()
				io.to('pad-' + pad).emit('modifierevaluation', { id: id, bloc: bloc, date: date, etoiles: etoiles })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('supprimerevaluation', async function (bloc, pad, id, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				const date = dayjs().format()
				await db
				.multi()
				.HSET('dates-pads:' + pad, 'date', date)
				.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
				.exec()
				io.to('pad-' + pad).emit('supprimerevaluation', { id: id, bloc: bloc })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiernom', async function (pad, nom, statut, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				if (statut === 'invite') {
					await db.HSET('noms:' + identifiant, 'nom', nom)
					io.to('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
					req.session.nom = nom
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else if (statut === 'auteur') {
					await db.HSET('utilisateurs:' + identifiant, 'nom', nom)
					io.to('pad-' + pad).emit('modifiernom', { identifiant: identifiant, nom: nom })
					req.session.nom = nom
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitre', async function (pad, titre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'titre', titre)
					io.to('pad-' + pad).emit('modifiertitre', titre)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercodeacces', async function (pad, code, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'code', code)
					io.to('pad-' + pad).emit('modifiercodeacces', code)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieradmins', async function (pad, admins, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				let listeAdmins = []
				if (donnees.hasOwnProperty('admins') && donnees.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
					listeAdmins = JSON.parse(JSON.parse(donnees.admins))
				} else if (donnees.hasOwnProperty('admins')) {
					listeAdmins = JSON.parse(donnees.admins)
				}
				const proprietaire = donnees.identifiant
				if (listeAdmins.includes(identifiant) || proprietaire === identifiant) {
					await db.HSET('pads:' + pad, 'admins', JSON.stringify(admins))
					admins.forEach(async function (admin) {
						if (!listeAdmins.includes(admin)) {
							await db.SADD('pads-admins:' + admin, pad.toString())
						}
					})
					listeAdmins.forEach(async function (admin) {
						if (!admins.includes(admin)) {
							await db.SREM('pads-admins:' + admin, pad.toString())
						}
					})
					io.to('pad-' + pad).emit('modifieradmins', admins)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieracces', async function (pad, acces, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					let code = ''
					if (donnees.hasOwnProperty('code') && donnees.code !== '') {
						code = donnees.code
					} else {
						code = Math.floor(100000 + Math.random() * 900000)
					}
					await db.HSET('pads:' + pad, ['acces', acces, 'code', code])
					io.to('pad-' + pad).emit('modifieracces', { acces: acces, code: code })
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercontributions', async function (pad, contributions, contributionsPrecedentes, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'contributions', contributions)
					io.to('pad-' + pad).emit('modifiercontributions', { contributions: contributions, contributionsPrecedentes: contributionsPrecedentes })
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieraffichage', async function (pad, affichage, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'affichage', affichage)
					io.to('pad-' + pad).emit('modifieraffichage', affichage)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierordre', async function (pad, ordre, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'ordre', ordre)
					io.to('pad-' + pad).emit('modifierordre', ordre)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlargeur', async function (pad, largeur, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'largeur', largeur)
					io.to('pad-' + pad).emit('modifierlargeur', largeur)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfond', async function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, ['fond', fond, 'fondRepete', 'desactive'])
					io.to('pad-' + pad).emit('modifierfond', fond)
					if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '' && typeof ancienfond === 'string') {
						await supprimerFichier(pad, path.basename(ancienfond))
					}
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercouleurfond', async function (pad, fond, ancienfond, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, ['fond', fond, 'fondRepete', 'desactive'])
					io.to('pad-' + pad).emit('modifiercouleurfond', fond)
					if (!ancienfond.includes('/img/') && ancienfond.substring(0, 1) !== '#' && ancienfond !== '' && typeof ancienfond === 'string') {
						await supprimerFichier(pad, path.basename(ancienfond))
					}
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfondrepete', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'fondRepete', statut)
					io.to('pad-' + pad).emit('modifierfondrepete', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifieractivite', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'registreActivite', statut)
					io.to('pad-' + pad).emit('modifieractivite', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierconversation', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'conversation', statut)
					io.to('pad-' + pad).emit('modifierconversation', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlisteutilisateurs', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'listeUtilisateurs', statut)
					io.to('pad-' + pad).emit('modifierlisteutilisateurs', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiereditionnom', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'editionNom', statut)
					io.to('pad-' + pad).emit('modifiereditionnom', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierfichiers', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'fichiers', statut)
					io.to('pad-' + pad).emit('modifierfichiers', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierenregistrements', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'enregistrements', statut)
					io.to('pad-' + pad).emit('modifierenregistrements', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierliens', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'liens', statut)
					io.to('pad-' + pad).emit('modifierliens', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierdocuments', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'documents', statut)
					io.to('pad-' + pad).emit('modifierdocuments', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercommentaires', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'commentaires', statut)
					io.to('pad-' + pad).emit('modifiercommentaires', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierevaluations', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'evaluations', statut)
					io.to('pad-' + pad).emit('modifierevaluations', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiercopiebloc', async function (pad, statut, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.HSET('pads:' + pad, 'copieBloc', statut)
					io.to('pad-' + pad).emit('modifiercopiebloc', statut)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('message', function (pad, texte, identifiant, nom) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				const date = dayjs().format()
				io.to('pad-' + pad).emit('message', { texte: texte, identifiant: identifiant, nom: nom, date: date })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('reinitialisermessages', async function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					io.to('pad-' + pad).emit('reinitialisermessages')
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('reinitialiseractivite', async function (pad, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.UNLINK('activite:' + pad)
					io.to('pad-' + pad).emit('reinitialiseractivite')
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('ajoutercolonne', async function (pad, titre, colonnes, affichageColonnes, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('activite') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					const date = dayjs().format()
					const activiteId = parseInt(donnees.activite) + 1
					colonnes.push(titre)
					affichageColonnes.push(true)
					await db
					.multi()
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					// Enregistrer entrée du registre d'activité
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-ajoutee' }) }])
					.exec()
					io.to('pad-' + pad).emit('ajoutercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, activiteId: activiteId })
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiertitrecolonne', async function (pad, titre, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					const colonnes = JSON.parse(donnees.colonnes)
					colonnes[index] = titre
					await db.HSET('pads:' + pad, 'colonnes', JSON.stringify(colonnes))
					io.to('pad-' + pad).emit('modifiertitrecolonne', colonnes)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})
		
		socket.on('modifieraffichagecolonne', async function (pad, valeur, index, identifiant) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					let affichageColonnes = []
					if (donnees.hasOwnProperty('affichageColonnes')) {
						affichageColonnes = JSON.parse(donnees.affichageColonnes)
					} else {
						const colonnes = JSON.parse(donnees.colonnes)
						colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					affichageColonnes[index] = valeur
					await db.HSET('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes))
					io.to('pad-' + pad).emit('modifieraffichagecolonne', affichageColonnes, valeur, index)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('verifierblocscolonnes', async function (donnees) {
			const pad = donnees.pad
			const identifiant = donnees.identifiant
			if (req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null) { socket.emit('erreur'); return false }
				const donneesPad = await recupererDonneesPadProtege(donnees, pad, identifiant)
				socket.emit('verifierblocscolonnes', donneesPad.blocs)
			}
		})

		socket.on('supprimercolonne', async function (pad, titre, colonne, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					const colonnes = JSON.parse(donnees.colonnes)
					colonnes.splice(colonne, 1)
					let affichageColonnes = []
					if (donnees.hasOwnProperty('affichageColonnes')) {
						affichageColonnes = JSON.parse(donnees.affichageColonnes)
					} else {
						colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					affichageColonnes.splice(colonne, 1)
					const donneesBlocs = []
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) { socket.emit('erreur'); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							let resultat = await db.HGETALL('pad-' + pad + ':' + bloc)
							resultat = Object.assign({}, resultat)
							if (resultat === null) { resolve({}); return false }
							resolve(resultat)
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (blocs) {
						const blocsSupprimes = []
						const blocsRestants = []
						blocs.forEach(function (item) {
							if (item && item.hasOwnProperty('colonne') && parseInt(item.colonne) === parseInt(colonne)) {
								blocsSupprimes.push(item.bloc)
							} else if (item) {
								blocsRestants.push(item)
							}
						})
						const donneesBlocsSupprimes = []
						for (const blocSupprime of blocsSupprimes) {
							const donneesBlocSupprime = new Promise(async function (resolve) {
								const resultat = await db.EXISTS('pad-' + pad + ':' + blocSupprime)
								if (resultat === null) { resolve(); return false }
								if (resultat === 1) {
									let objet = await db.HGETALL('pad-' + pad + ':' + blocSupprime)
									objet = Object.assign({}, objet)
									if (objet === null) { resolve(); return false }
									if (objet.hasOwnProperty('media') && objet.media !== '' && objet.type !== 'embed' && objet.type !== 'lien') {
										await supprimerFichier(pad, objet.media)
									}
									if (objet.hasOwnProperty('vignette') && definirVignettePersonnalisee(objet.vignette) === true) {
										await supprimerFichier(pad, path.basename(objet.vignette))
									}
									if (objet.hasOwnProperty('bloc') && objet.bloc === blocSupprime) {
										await db
										.multi()
										.UNLINK('pad-' + pad + ':' + blocSupprime)
										.ZREM('blocs:' + pad, blocSupprime)
										.UNLINK('commentaires:' + blocSupprime)
										.UNLINK('evaluations:' + blocSupprime)
										.exec()
										resolve('supprime')
									} else {
										resolve()
									}
								} else {
									resolve()
								}
							})
							donneesBlocsSupprimes.push(donneesBlocSupprime)
						}
						const donneesBlocsRestants = []
						for (let i = 0; i < blocsRestants.length; i++) {
							const donneeBloc = new Promise(async function (resolve) {
								if (parseInt(blocsRestants[i].colonne) > parseInt(colonne)) {
									await db.HSET('pad-' + pad + ':' + blocsRestants[i].bloc, 'colonne', (parseInt(blocsRestants[i].colonne) - 1))
									resolve(i)
								} else {
									resolve(i)
								}
							})
							donneesBlocsRestants.push(donneeBloc)
						}
						Promise.all([donneesBlocsSupprimes, donneesBlocsRestants]).then(async function () {
							const date = dayjs().format()
							const activiteId = parseInt(donnees.activite) + 1
							await db
							.multi()
							.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-supprimee' }) }])
							.exec()
							io.to('pad-' + pad).emit('supprimercolonne', { identifiant: identifiant, nom: nom, titre: titre, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, activiteId: activiteId })
							req.session.cookie.expires = new Date(Date.now() + dureeSession)
							req.session.save()
						})
					})
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('deplacercolonne', async function (pad, titre, affichage, direction, colonne, identifiant, nom) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('colonnes') || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					const colonnes = JSON.parse(donnees.colonnes)
					let affichageColonnes = []
					if (donnees.hasOwnProperty('affichageColonnes')) {
						affichageColonnes = JSON.parse(donnees.affichageColonnes)
					} else {
						colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					if (direction === 'gauche') {
						colonnes.splice((parseInt(colonne) - 1), 0, titre)
						colonnes.splice((parseInt(colonne) + 1), 1)
						affichageColonnes.splice((parseInt(colonne) - 1), 0, affichage)
						affichageColonnes.splice((parseInt(colonne) + 1), 1)
					} else if (direction === 'droite') {
						const titreDeplace = colonnes[parseInt(colonne) + 1]
						colonnes.splice((parseInt(colonne) + 1), 0, titre)
						colonnes.splice(parseInt(colonne), 1, titreDeplace)
						colonnes.splice((parseInt(colonne) + 2), 1)
						const affichageDeplace = affichageColonnes[parseInt(colonne) + 1]
						affichageColonnes.splice((parseInt(colonne) + 1), 0, affichage)
						affichageColonnes.splice(parseInt(colonne), 1, affichageDeplace)
						affichageColonnes.splice((parseInt(colonne) + 2), 1)
					}
					const donneesBlocs = []
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) { socket.emit('erreur'); return false }
					for (const bloc of blocs) {
						const donneesBloc = new Promise(async function (resolve) {
							let resultat = await db.HGETALL('pad-' + pad + ':' + bloc)
							resultat = Object.assign({}, resultat)
							if (resultat === null) { resolve({}); return false }
							resolve(resultat)
						})
						donneesBlocs.push(donneesBloc)
					}
					Promise.all(donneesBlocs).then(function (blocs) {
						const donneesBlocsDeplaces = []
						for (const item of blocs) {
							const donneesBlocDeplace = new Promise(async function (resolve) {
								if (item && item.hasOwnProperty('bloc')) {
									const resultat = await db.EXISTS('pad-' + pad + ':' + item.bloc)
									if (resultat === null) { resolve(); return false }
									if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'gauche') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) - 1))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === parseInt(colonne) && direction === 'droite') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', (parseInt(colonne) + 1))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) - 1) && direction === 'gauche') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne))
										resolve('deplace')
									} else if (resultat === 1 && parseInt(item.colonne) === (parseInt(colonne) + 1) && direction === 'droite') {
										await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', parseInt(colonne))
										resolve('deplace')
									} else {
										resolve()
									}
								} else {
									resolve()
								}
							})
							donneesBlocsDeplaces.push(donneesBlocDeplace)
						}
						Promise.all(donneesBlocsDeplaces).then(async function () {
							const date = dayjs().format()
							const activiteId = parseInt(donnees.activite) + 1
							await db
							.multi()
							.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
							// Enregistrer entrée du registre d'activité
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-deplacee' }) }])
							.exec()
							io.to('pad-' + pad).emit('deplacercolonne', { identifiant: identifiant, nom: nom, titre: titre, direction: direction, colonne: colonne, colonnes: colonnes, affichageColonnes: affichageColonnes, date: date, activiteId: activiteId })
							req.session.cookie.expires = new Date(Date.now() + dureeSession)
							req.session.save()
						})
					})
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifiernotification', async function (pad, admins) {
			if (maintenance === true) {
				socket.emit('maintenance')
				return false
			}
			await db.HSET('pads:' + pad, 'notification', JSON.stringify(admins))
			io.to('pad-' + pad).emit('modifiernotification', admins)
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			req.session.save()
		})

		socket.on('verifiermodifierbloc', function (pad, bloc, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				socket.to('pad-' + pad).emit('verifiermodifierbloc', { bloc: bloc, identifiant: identifiant })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			}
		})

		socket.on('reponsemodifierbloc', function (pad, identifiant, reponse) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				socket.to('pad-' + pad).emit('reponsemodifierbloc', { identifiant: identifiant, reponse: reponse })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				req.session.save()
			}
		})

		socket.on('supprimeractivite', async function (pad, id, identifiant) {
			if (identifiant !== '' && identifiant !== undefined && req.session.identifiant === identifiant) {
				let donnees = await db.HGETALL('pads:' + pad)
				donnees = Object.assign({}, donnees)
				if (donnees === null || !donnees.hasOwnProperty('identifiant')) { socket.emit('erreur'); return false }
				if (await verifierAdmin(pad, donnees, req.session) === true) {
					await db.ZREMRANGEBYSCORE('activite:' + pad, id, id)
					io.to('pad-' + pad).emit('supprimeractivite', id)
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					req.session.save()
				} else {
					socket.emit('nonautorise')
				}
			} else {
				socket.emit('deconnecte')
			}
		})

		socket.on('modifierlangue', function (langue) {
			req.session.langue = langue
			req.session.save()
		})

		socket.on('verifiermaintenance', function () {
			socket.emit('verifiermaintenance', maintenance)
		})

		socket.on('activermaintenance', function (admin) {
			if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
				maintenance = true
				socket.emit('verifiermaintenance', true)
			}
		})

		socket.on('desactivermaintenance', function (admin) {
			if (admin !== '' && admin === process.env.ADMIN_PASSWORD) {
				maintenance = false
				socket.emit('verifiermaintenance', false)
			}
		})
	})

	function creerPad (id, token, titre, date, identifiant) {
		return new Promise(async function (resolve) {
			if (id === 1) {
				await db.SET('pad', 1)
			} else {
				await db.INCR('pad')
			}
			await db
			.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0])
			.SADD('pads-crees:' + identifiant, id.toString())
			.SADD('utilisateurs-pads:' + id, identifiant)
			.HSET('dates-pads:' + id, 'date', date)
			.exec()
			resolve(true)
		})
	}

	function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		return new Promise(async function (resolve) {
			if (id === 1) {
				await db.SET('pad', 1)
			} else {
				await db.INCR('pad')
			}
			let digidrive = 0
			if (type === 'api') {
				digidrive = 1
			}
			await db
			.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'vues', 0, 'digidrive', digidrive])
			.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
			.exec()
			if (type === 'api') {
				await db.SADD('pads-crees:' + identifiant, id.toString())
			}
			resolve(true)
		})
	}

	async function ajouterPadDansDb (id, donnees) {
		return new Promise(function (resolveMain) {
			const donneesBlocs = []
			for (const [indexBloc, bloc] of donnees.blocs.entries()) {
				const donneesBloc = new Promise(async function (resolve) {
					if (bloc.hasOwnProperty('id') && bloc.hasOwnProperty('bloc') && bloc.hasOwnProperty('titre') && bloc.hasOwnProperty('texte') && bloc.hasOwnProperty('media') && bloc.hasOwnProperty('iframe') && bloc.hasOwnProperty('type') && bloc.hasOwnProperty('source') && bloc.hasOwnProperty('vignette') && bloc.hasOwnProperty('identifiant') && bloc.hasOwnProperty('commentaires') && bloc.hasOwnProperty('evaluations') && bloc.hasOwnProperty('colonne') && bloc.hasOwnProperty('listeCommentaires') && bloc.hasOwnProperty('listeEvaluations')) {
						let visibilite = 'visible'
						if (bloc.hasOwnProperty('visibilite')) {
							visibilite = bloc.visibilite
						}
						await db
						.multi()
						.HSET('pad-' + id + ':' + bloc.bloc, ['id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						.ZADD('blocs:' + id, [{ score: indexBloc, value: bloc.bloc }])
						.exec()
						for (const commentaire of bloc.listeCommentaires) {
							if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
								await db.ZADD('commentaires:' + bloc.bloc, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
							}
						}
						for (const evaluation of bloc.listeEvaluations) {
							if (evaluation.hasOwnProperty('id') && evaluation.hasOwnProperty('identifiant') && evaluation.hasOwnProperty('date') && evaluation.hasOwnProperty('etoiles')) {
								await db.ZADD('evaluations:' + bloc.bloc, [{ score: evaluation.id, value: JSON.stringify(evaluation) }])
							}
						}
						resolve()
					} else {
						resolve()
					}
				})
				donneesBlocs.push(donneesBloc)
			}
			Promise.all(donneesBlocs).then(async function () {
				let registreActivite = 'active'
				let conversation = 'desactivee'
				let listeUtilisateurs = 'activee'
				let editionNom = 'desactivee'
				let ordre = 'croissant'
				let largeur = 'normale'
				let enregistrements = 'desactives'
				let copieBloc = 'desactivee'
				let admins = JSON.stringify([])
				let vues = 0
				let digidrive = 0
				let affichageColonnes = []
				if (donnees.pad.hasOwnProperty('registreActivite')) {
					registreActivite = donnees.pad.registreActivite
				}
				if (donnees.pad.hasOwnProperty('conversation')) {
					conversation = donnees.pad.conversation
				}
				if (donnees.pad.hasOwnProperty('listeUtilisateurs')) {
					listeUtilisateurs = donnees.pad.listeUtilisateurs
				}
				if (donnees.pad.hasOwnProperty('editionNom')) {
					editionNom = donnees.pad.editionNom
				}
				if (donnees.pad.hasOwnProperty('ordre')) {
					ordre = donnees.pad.ordre
				}
				if (donnees.pad.hasOwnProperty('largeur')) {
					largeur = donnees.pad.largeur
				}
				if (donnees.pad.hasOwnProperty('enregistrements')) {
					enregistrements = donnees.pad.enregistrements
				}
				if (donnees.pad.hasOwnProperty('copieBloc')) {
					copieBloc = donnees.pad.copieBloc
				}
				if (donnees.pad.hasOwnProperty('admins') && donnees.pad.admins.substring(0, 2) !== '"\\') { // fix bug update 0.9.0
					admins = donnees.pad.admins
				}
				if (donnees.pad.hasOwnProperty('vues')) {
					vues = donnees.pad.vues
				}
				if (donnees.pad.hasOwnProperty('digidrive')) {
					digidrive = donnees.pad.digidrive
				}
				if (donnees.pad.hasOwnProperty('affichageColonnes')) {
					affichageColonnes = donnees.pad.affichageColonnes
				} else if (donnees.pad.colonnes.length > 0) {
					const colonnes = JSON.parse(donnees.pad.colonnes)
					colonnes.forEach(function () {
						affichageColonnes.push(true)
					})
					affichageColonnes = JSON.stringify(affichageColonnes)
				} else {
					affichageColonnes = JSON.stringify(affichageColonnes)
				}
				if (donnees.pad.hasOwnProperty('motdepasse') && donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive])
				} else if (donnees.pad.hasOwnProperty('motdepasse') && !donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'motdepasse', donnees.pad.motdepasse, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive])
				} else if (donnees.pad.hasOwnProperty('code')) {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'code', donnees.pad.code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive])
				} else {
					await db.HSET('pads:' + id, ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive])
				}
				for (const activite of donnees.activite) {
					if (activite.hasOwnProperty('bloc') && activite.hasOwnProperty('identifiant') && activite.hasOwnProperty('titre') && activite.hasOwnProperty('date') && activite.hasOwnProperty('type') && activite.hasOwnProperty('id')) {
						await db.ZADD('activite:' + id, [{ score: activite.id, value: JSON.stringify(activite) }])
					}
				}
				if (isNaN(parseInt(id)) === false) {
					await fs.remove(path.join(__dirname, '..', '/static/pads/' + id + '.json'))
					await fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + id + '.json'))
					resolveMain('pad_ajoute_dans_db')
				} else {
					resolveMain('')
				}
			})
		})
	}

	function recupererDonneesUtilisateur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour compatibilité avec les anciens chemins
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
							donnees.fond = path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								donnees.nom = donnees.identifiant
								resolve(donnees)
								return false
							}
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							// Pour compatibilité avec les anciens chemins
							if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
								donnees.fond = path.basename(donnees.fond)
							}
							const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (reponse === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = donnees.identifiant
									resolve(donnees)
									return false
								}
								if (utilisateur.nom === '') {
									donnees.nom = donnees.identifiant
								} else {
									donnees.nom = utilisateur.nom
								}
								resolve(donnees)
							} else {
								donnees.nom = donnees.identifiant
								resolve(donnees)
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads supprimés
		const donneesPadsSupprimes = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-supprimes:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour compatibilité avec les anciens chemins
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
							donnees.fond = path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								donnees.nom = donnees.identifiant
								resolve(donnees)
								return false
							}
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							// Pour compatibilité avec les anciens chemins
							if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
								donnees.fond = path.basename(donnees.fond)
							}
							const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (reponse === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = donnees.identifiant
									resolve(donnees)
									return false
								}
								if (utilisateur.nom === '') {
									donnees.nom = donnees.identifiant
								} else {
									donnees.nom = utilisateur.nom
								}
								resolve(donnees)
							} else {
								donnees.nom = donnees.identifiant
								resolve(donnees)
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads rejoints
		const donneesPadsRejoints = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-rejoints:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour compatibilité avec les anciens chemins
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
							donnees.fond = path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === null) {
							donnees.nom = donnees.identifiant
							resolve(donnees)
							return false
						}
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								donnees.nom = donnees.identifiant
								resolve(donnees)
								return false
							}
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							// Pour compatibilité avec les anciens chemins
							if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
								donnees.fond = path.basename(donnees.fond)
							}
							const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (reponse === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = donnees.identifiant
									resolve(donnees)
									return false
								}
								if (utilisateur.nom === '') {
									donnees.nom = donnees.identifiant
								} else {
									donnees.nom = utilisateur.nom
								}
								resolve(donnees)
							} else {
								donnees.nom = donnees.identifiant
								resolve(donnees)
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-admins:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads); return false }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}) }
						// Pour compatibilité avec les anciens chemins
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
							donnees.fond = path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								donnees.nom = donnees.identifiant
								resolve(donnees)
								return false
							}
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							// Pour compatibilité avec les anciens chemins
							if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
								donnees.fond = path.basename(donnees.fond)
							}
							const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (reponse === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = donnees.identifiant
									resolve(donnees)
									return false
								}
								if (utilisateur.nom === '') {
									donnees.nom = donnees.identifiant
								} else {
									donnees.nom = utilisateur.nom
								}
								resolve(donnees)
							} else {
								donnees.nom = donnees.identifiant
								resolve(donnees)
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads favoris
		const donneesPadsFavoris = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-favoris:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						// Pour compatibilité avec les anciens chemins
						if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
							donnees.fond = path.basename(donnees.fond)
						}
						const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
						if (reponse === 1) {
							let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
							utilisateur = Object.assign({}, utilisateur)
							if (utilisateur === null) {
								donnees.nom = donnees.identifiant
								resolve(donnees)
								return false
							}
							if (utilisateur.nom === '') {
								donnees.nom = donnees.identifiant
							} else {
								donnees.nom = utilisateur.nom
							}
							resolve(donnees)
						} else {
							donnees.nom = donnees.identifiant
							resolve(donnees)
						}
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							// Pour compatibilité avec les anciens chemins
							if (donnees.hasOwnProperty('fond') && !donnees.fond.includes('/img/') && donnees.fond.substring(0, 1) !== '#' && donnees.fond !== '' && typeof donnees.fond === 'string') {
								donnees.fond = path.basename(donnees.fond)
							}
							const reponse = await db.EXISTS('utilisateurs:' + donnees.identifiant)
							if (reponse === 1) {
								let utilisateur = await db.HGETALL('utilisateurs:' + donnees.identifiant)
								utilisateur = Object.assign({}, utilisateur)
								if (utilisateur === null) {
									donnees.nom = donnees.identifiant
									resolve(donnees)
									return false
								}
								if (utilisateur.nom === '') {
									donnees.nom = donnees.identifiant
								} else {
									donnees.nom = utilisateur.nom
								}
								resolve(donnees)
							} else {
								donnees.nom = donnees.identifiant
								resolve(donnees)
							}
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsSupprimes, donneesPadsRejoints, donneesPadsAdmins, donneesPadsFavoris])
	}

	function recupererDonneesAuteur (identifiant) {
		// Pads créés
		const donneesPadsCrees = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						resolve(donnees)
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							resolve(donnees)
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		// Pads administrés
		const donneesPadsAdmins = new Promise(async function (resolveMain) {
			const pads = await db.SMEMBERS('pads-admins:' + identifiant)
			const donneesPads = []
			if (pads === null) { resolveMain(donneesPads) }
			for (const pad of pads) {
				const donneePad = new Promise(async function (resolve) {
					const resultat = await db.EXISTS('pads:' + pad)
					if (resultat === null) { resolve({}); return false }
					if (resultat === 1) {
						let donnees = await db.HGETALL('pads:' + pad)
						donnees = Object.assign({}, donnees)
						if (donnees === null) { resolve({}); return false }
						resolve(donnees)
					} else if (resultat !== 1 && isNaN(parseInt(pad)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						const donnees = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						if (typeof donnees === 'object' && donnees !== null && donnees.hasOwnProperty('identifiant')) {
							resolve(donnees)
						} else {
							resolve({})
						}
					} else {
						resolve({})
					}
				})
				donneesPads.push(donneePad)
			}
			Promise.all(donneesPads).then(function (resultat) {
				resolveMain(resultat)
			})
		})
		return Promise.all([donneesPadsCrees, donneesPadsAdmins])
	}

	async function recupererDonneesPad (id, token, identifiant, statut, pads, res) {
		let pad = await db.HGETALL('pads:' + id)
		pad = Object.assign({}, pad)
		if (pad === null) { res.send('erreur'); return false }
		if (pad !== null && pad.hasOwnProperty('id') && pad.id === id && pad.hasOwnProperty('token') && pad.token === token) {
			// Pour homogénéité des paramètres de pad avec coadministration
			if (!pad.hasOwnProperty('admins') || (pad.hasOwnProperty('admins') && pad.admins.substring(0, 2) === '"\\')) { // fix bug update 0.9.0
				pad.admins = []
			} else if (pad.hasOwnProperty('admins') && pad.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
				pad.admins = JSON.parse(JSON.parse(pad.admins))
			} else if (pad.hasOwnProperty('admins')) {
				pad.admins = JSON.parse(pad.admins)
			}
			// Vérifier si admin
			let admin = false
			if ((statut === 'utilisateur' && (pad.admins.includes(identifiant) || pad.identifiant === identifiant)) || (statut === 'auteur' && pads && pads.includes(parseInt(id)))) {
				admin = true
			}
			// Vérifier accès
			let accesCode = false
			if (pad.hasOwnProperty('code') && pad.acces === 'code') {
				accesCode = true
			}
			let accesPrive = false
			if (pad.acces === 'prive') {
				accesPrive = true
			}
			let nombreColonnes = 0
			if (pad.hasOwnProperty('colonnes')) {
				nombreColonnes = JSON.parse(pad.colonnes).length
				pad.colonnes = JSON.parse(pad.colonnes)
			}
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
			let vues = 0
			if (pad.hasOwnProperty('vues')) {
				vues = parseInt(pad.vues)
				if (!admin && !accesPrive) {
					vues = vues + 1
				}
			}
			if (!pad.hasOwnProperty('digidrive')) {
				pad.digidrive = 0
			}
			// Pour homogénéité des paramètres de pad
			if (!pad.hasOwnProperty('fondRepete')) {
				pad.fondRepete = 'desactive'
			}
			if (!pad.hasOwnProperty('ordre')) {
				pad.ordre = 'croissant'
			}
			if (!pad.hasOwnProperty('largeur')) {
				pad.largeur = 'normale'
			}
			if (!pad.hasOwnProperty('enregistrements')) {
				pad.enregistrements = 'desactives'
			}
			if ((admin || (!accesCode && !accesPrive)) && pad.hasOwnProperty('affichageColonnes')) {
				pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
				if ((pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length === 0) || (pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length < pad.colonnes.length)) { // fix bug update 0.9.11
					const affichageColonnes = []
					if (pad.hasOwnProperty('colonnes')) {
						pad.colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					pad.affichageColonnes = affichageColonnes
				}
			} else if ((admin || (!accesCode && !accesPrive)) && !pad.hasOwnProperty('affichageColonnes')) {
				const affichageColonnes = []
				if (pad.hasOwnProperty('colonnes')) {
					pad.colonnes.forEach(function () {
						affichageColonnes.push(true)
					})
				}
				pad.affichageColonnes = affichageColonnes
			}
			// Pour compatibilité avec les anciens chemins
			if (pad.hasOwnProperty('fond') && !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#' && pad.fond !== '' && typeof pad.fond === 'string') {
				pad.fond = path.basename(pad.fond)
			}
			// Cacher mot de passe front
			if (pad.hasOwnProperty('motdepasse')) {
				pad.motdepasse = ''
			}
			// Cacher données front
			if (!admin) {
				if (accesCode) {
					pad.code = ''
				}
				if (accesCode || accesPrive) {
					pad.colonnes = []
					pad.affichageColonnes = []
				}
				pad.admins = []
			}
			// Récupérer les données de tous les blocs
			const listeBlocs = []
			let donneesBlocs = []
			if (admin || (!accesCode && !accesPrive)) {
				const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
				if (blocs !== null) {
					for (const bloc of blocs) {
						let donneesBloc = await db.HGETALL('pad-' + id + ':' + bloc)
						donneesBloc = Object.assign({}, donneesBloc)
						if (Object.keys(donneesBloc).length > 0) {
							// Ne pas ajouter les capsules en attente de modération ou privées
							if (((pad.contributions === 'moderees' && donneesBloc.visibilite === 'masquee') || donneesBloc.visibilite === 'privee') && donneesBloc.identifiant !== identifiant && !admin) {
								donneesBloc = {}
							}
							// Ne pas ajouter les capsules dans les colonnes masquées
							else if (pad.affichage === 'colonnes' && pad.affichageColonnes[donneesBloc.colonne] === false && !admin) {
								donneesBloc = {}
							} else {
								// Ajouter dans la liste des blocs
								listeBlocs.push(bloc)
								// Pour résoudre le problème des capsules qui sont référencées dans une colonne inexistante
								if (parseInt(donneesBloc.colonne) >= nombreColonnes) {
									donneesBloc.colonne = nombreColonnes - 1
								}
								// Pour compatibilité avec les anciens chemins
								if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
									donneesBloc.vignette = path.basename(donneesBloc.vignette)
								}
								// Pour homogénéité des paramètres du bloc avec modération activée
								if (!donneesBloc.hasOwnProperty('visibilite')) {
									donneesBloc.visibilite = 'visible'
								}
								// Pour résoudre le problème lié au changement de domaine de digidoc
								if (donneesBloc.hasOwnProperty('iframe') && donneesBloc.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
									donneesBloc.iframe = donneesBloc.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
								}
								// Pour résoudre le problème lié au changement de domaine de digidoc
								if (donneesBloc.hasOwnProperty('media') && donneesBloc.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
									donneesBloc.media = donneesBloc.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
								}
								// Ajouter couleur
								if (!donneesBloc.hasOwnProperty('couleur') || donneesBloc.couleur === null || typeof donneesBloc.couleur !== 'string') {
									donneesBloc.couleur = '#242f3d'
								}
								// Filtrer HTML
								let html = donneesBloc.texte
								html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
								html = html.replace(/style=".*?"/mg, '')
								html = html.replace(/class=".*?"/mg, '')
								donneesBloc.texte = html
								// Commentaires
								const commentaires = await db.ZCARD('commentaires:' + bloc)
								if (commentaires === null) {
									donneesBloc.commentaires = []
								} else {
									donneesBloc.commentaires = commentaires
								}
								// Evaluations
								const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
								if (evaluations === null) {
									donneesBloc.evaluations = []
								} else {
									const donneesEvaluations = []
									evaluations.forEach(function (evaluation) {
										donneesEvaluations.push(JSON.parse(evaluation))
									})
									donneesBloc.evaluations = donneesEvaluations
								}
								// Utilisateurs
								const utilisateurExiste = await db.EXISTS('utilisateurs:' + donneesBloc.identifiant)
								if (utilisateurExiste === null) {
									donneesBloc.nom = ''
								} else if (utilisateurExiste === 1) {
									let donneesUtilisateur = await db.HGETALL('utilisateurs:' + donneesBloc.identifiant)
									donneesUtilisateur = Object.assign({}, donneesUtilisateur)
									if (donneesUtilisateur === null) {
										donneesBloc.nom = ''
									} else {
										donneesBloc.nom = donneesUtilisateur.nom
									}
								} else {
									const nomExiste = await db.EXISTS('noms:' + donneesBloc.identifiant)
									if (nomExiste === null) {
										donneesBloc.nom = ''
									} else if (nomExiste === 1) {
										const donneesNom = await db.HGET('noms:' + donneesBloc.identifiant, 'nom')
										if (donneesNom === null) {
											donneesBloc.nom = ''
										} else {
											donneesBloc.nom = donneesNom
										}
									} else {
										donneesBloc.nom = ''
									}
								}
							}
						}
						donneesBlocs.push(donneesBloc)
					}
				}
			}
			donneesBlocs = donneesBlocs.filter(function (element) {
				return Object.keys(element).length > 0
			})
			if (pad.ordre === 'decroissant') {
				donneesBlocs.reverse()
			}
			// Récupérer les entrées du registre d'activité
			let donneesEntrees = []
			if (admin || (!accesCode && !accesPrive)) {
				const entrees = await db.ZRANGE('activite:' + id, 0, -1)
				if (entrees !== null) {
					for (let entree of entrees) {
						let donneesEntree = JSON.parse(entree)
						const utilisateurEntreeExiste = await db.EXISTS('utilisateurs:' + donneesEntree.identifiant)
						if (utilisateurEntreeExiste === null) {
							donneesEntree.nom = ''
						} else if (utilisateurEntreeExiste === 1) {
							let donneesUtilisateurEntree = await db.HGETALL('utilisateurs:' + donneesEntree.identifiant)
							donneesUtilisateurEntree = Object.assign({}, donneesUtilisateurEntree)
							if (donneesUtilisateurEntree === null) {
								donneesEntree.nom = ''
							} else {
								donneesEntree.nom = donneesUtilisateurEntree.nom
							}
						} else {
							const nomEntreeExiste = await db.EXISTS('noms:' + donneesEntree.identifiant)
							if (nomEntreeExiste === null) {
								donneesEntree.nom = ''
							} else if (nomEntreeExiste === 1) {
								const nomUtilisateurEntree = await db.HGET('noms:' + donneesEntree.identifiant, 'nom')
								if (nomUtilisateurEntree === null) {
									donneesEntree.nom = ''
								} else {
									donneesEntree.nom = nomUtilisateurEntree
								}
							} else {
								donneesEntree.nom = ''
							}
						}
						donneesEntrees.push(donneesEntree)
					}
				}
			}
			donneesEntrees = donneesEntrees.filter(function (element) {
				return Object.keys(element).length > 0 && ((element.hasOwnProperty('type') && element.type.includes('colonne')) || (element.hasOwnProperty('bloc') && listeBlocs.includes(element.bloc)))
			})
			donneesEntrees.reverse()
			// Ajouter nombre de vues
			await db.HSET('pads:' + id, 'vues', vues)
			// Ajouter dans pads rejoints
			if (pad.identifiant !== identifiant && statut === 'utilisateur') {
				const padsRejoints = await db.SMEMBERS('pads-rejoints:' + identifiant)
				if (padsRejoints === null) { res.send('erreur'); return false }
				let padDejaRejoint = false
				for (const padRejoint of padsRejoints) {
					if (padRejoint === id) {
						padDejaRejoint = true
					}
				}
				if (padDejaRejoint === false && pad.acces !== 'prive') {
					await db
					.multi()
					.SADD('pads-rejoints:' + identifiant, id.toString())
					.SADD('pads-utilisateurs:' + identifiant, id.toString())
					.SADD('utilisateurs-pads:' + id, identifiant)
					.exec()
				} 
				// Vérifier notification mise à jour pad
				else if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
					pad.notification.splice(pad.notification.indexOf(identifiant), 1)
					await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
				}
			} 
			// Vérifier notification mise à jour pad
			else if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
				pad.notification.splice(pad.notification.indexOf(identifiant), 1)
				await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
			}
			res.json({ pad: pad, blocs: donneesBlocs, activite: donneesEntrees })
		} else {
			res.send('erreur')
		}
	}

	async function recupererDonneesPadProtege (pad, id, identifiant) {
		return new Promise(async function (resolveData) {
			let nombreColonnes = 0
			if (pad.hasOwnProperty('colonnes')) {
				nombreColonnes = JSON.parse(pad.colonnes).length
				pad.colonnes = JSON.parse(pad.colonnes)
			}
			if (pad.hasOwnProperty('affichageColonnes')) {
				pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
				if ((pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length === 0) || (pad.hasOwnProperty('colonnes') && pad.affichageColonnes.length < pad.colonnes.length)) { // fix bug update 0.9.11
					const affichageColonnes = []
					if (pad.hasOwnProperty('colonnes')) {
						pad.colonnes.forEach(function () {
							affichageColonnes.push(true)
						})
					}
					pad.affichageColonnes = affichageColonnes
				}
			} else {
				const affichageColonnes = []
				if (pad.hasOwnProperty('colonnes')) {
					pad.colonnes.forEach(function () {
						affichageColonnes.push(true)
					})
				}
				pad.affichageColonnes = affichageColonnes
			}
			// Récupérer les données de tous les blocs
			const listeBlocs = []
			let donneesBlocs = []
			const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
			if (blocs !== null) {
				for (const bloc of blocs) {
					let donneesBloc = await db.HGETALL('pad-' + id + ':' + bloc)
					donneesBloc = Object.assign({}, donneesBloc)
					if (Object.keys(donneesBloc).length > 0) {
						// Ne pas ajouter les capsules en attente de modération ou privées
						if (((pad.contributions === 'moderees' && donneesBloc.visibilite === 'masquee') || donneesBloc.visibilite === 'privee') && donneesBloc.identifiant !== identifiant) {
							donneesBloc = {}
						}
						// Ne pas ajouter les capsules dans les colonnes masquées
						else if (pad.affichage === 'colonnes' && pad.affichageColonnes[donneesBloc.colonne] === false) {
							donneesBloc = {}
						} else {
							// Ajouter dans la liste des blocs
							listeBlocs.push(bloc)
							// Pour résoudre le problème des capsules qui sont référencées dans une colonne inexistante
							if (parseInt(donneesBloc.colonne) >= nombreColonnes) {
								donneesBloc.colonne = nombreColonnes - 1
							}
							// Pour compatibilité avec les anciens chemins
							if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
								donneesBloc.vignette = path.basename(donneesBloc.vignette)
							}
							// Pour homogénéité des paramètres du bloc avec modération activée
							if (!donneesBloc.hasOwnProperty('visibilite')) {
								donneesBloc.visibilite = 'visible'
							}
							// Pour résoudre le problème lié au changement de domaine de digidoc
							if (donneesBloc.hasOwnProperty('iframe') && donneesBloc.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
								donneesBloc.iframe = donneesBloc.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
							}
							// Pour résoudre le problème lié au changement de domaine de digidoc
							if (donneesBloc.hasOwnProperty('media') && donneesBloc.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com') === true) {
								donneesBloc.media = donneesBloc.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
							}
							// Ajouter couleur
							if (!donneesBloc.hasOwnProperty('couleur') || donneesBloc.couleur === null || typeof donneesBloc.couleur !== 'string') {
								donneesBloc.couleur = '#242f3d'
							}
							// Filtrer HTML
							let html = donneesBloc.texte
							html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
							html = html.replace(/style=".*?"/mg, '')
							html = html.replace(/class=".*?"/mg, '')
							donneesBloc.texte = html
							// Commentaires
							const commentaires = await db.ZCARD('commentaires:' + bloc)
							if (commentaires === null) {
								donneesBloc.commentaires = []
							} else {
								donneesBloc.commentaires = commentaires
							}
							// Evaluations
							const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
							if (evaluations === null) {
								donneesBloc.evaluations = []
							} else {
								const donneesEvaluations = []
								evaluations.forEach(function (evaluation) {
									donneesEvaluations.push(JSON.parse(evaluation))
								})
								donneesBloc.evaluations = donneesEvaluations
							}
							// Utilisateurs
							const utilisateurExiste = await db.EXISTS('utilisateurs:' + donneesBloc.identifiant)
							if (utilisateurExiste === null) {
								donneesBloc.nom = ''
							} else if (utilisateurExiste === 1) {
								let donneesUtilisateur = await db.HGETALL('utilisateurs:' + donneesBloc.identifiant)
								donneesUtilisateur = Object.assign({}, donneesUtilisateur)
								if (donneesUtilisateur === null) {
									donneesBloc.nom = ''
								} else {
									donneesBloc.nom = donneesUtilisateur.nom
								}
							} else {
								const nomExiste = await db.EXISTS('noms:' + donneesBloc.identifiant)
								if (nomExiste === null) {
									donneesBloc.nom = ''
								} else if (nomExiste === 1) {
									const donneesNom = await db.HGET('noms:' + donneesBloc.identifiant, 'nom')
									if (donneesNom === null) {
										donneesBloc.nom = ''
									} else {
										donneesBloc.nom = donneesNom
									}
								} else {
									donneesBloc.nom = ''
								}
							}
						}
					}
					donneesBlocs.push(donneesBloc)
				}
			}
			donneesBlocs = donneesBlocs.filter(function (element) {
				return Object.keys(element).length > 0
			})
			if (pad.ordre === 'decroissant') {
				donneesBlocs.reverse()
			}
			// Récupérer les entrées du registre d'activité
			let donneesEntrees = []
			const entrees = await db.ZRANGE('activite:' + id, 0, -1)
			if (entrees !== null) {
				for (let entree of entrees) {
					let donneesEntree = JSON.parse(entree)
					const utilisateurEntreeExiste = await db.EXISTS('utilisateurs:' + donneesEntree.identifiant)
					if (utilisateurEntreeExiste === null) {
						donneesEntree.nom = ''
					} else if (utilisateurEntreeExiste === 1) {
						let donneesUtilisateurEntree = await db.HGETALL('utilisateurs:' + donneesEntree.identifiant)
						donneesUtilisateurEntree = Object.assign({}, donneesUtilisateurEntree)
						if (donneesUtilisateurEntree === null) {
							donneesEntree.nom = ''
						} else {
							donneesEntree.nom = donneesUtilisateurEntree.nom
						}
					} else {
						const nomEntreeExiste = await db.EXISTS('noms:' + donneesEntree.identifiant)
						if (nomEntreeExiste === null) {
							donneesEntree.nom = ''
						} else if (nomEntreeExiste === 1) {
							const nomUtilisateurEntree = await db.HGET('noms:' + donneesEntree.identifiant, 'nom')
							if (nomUtilisateurEntree === null) {
								donneesEntree.nom = ''
							} else {
								donneesEntree.nom = nomUtilisateurEntree
							}
						} else {
							donneesEntree.nom = ''
						}
					}
					donneesEntrees.push(donneesEntree)
				}
			}
			donneesEntrees = donneesEntrees.filter(function (element) {
				return Object.keys(element).length > 0 && ((element.hasOwnProperty('type') && element.type.includes('colonne')) || (element.hasOwnProperty('bloc') && listeBlocs.includes(element.bloc)))
			})
			donneesEntrees.reverse()
			// Vérifier notification mise à jour pad
			if (pad.hasOwnProperty('notification') && pad.notification.includes(identifiant) && Array.isArray(pad.notification)) {
				pad.notification.splice(pad.notification.indexOf(identifiant), 1)
				await db.HSET('pads:' + id, 'notification', JSON.stringify(pad.notification))
				resolveData({ pad: pad, blocs: donneesBlocs, activite: donneesEntrees })
			} else {
				resolveData({ pad: pad, blocs: donneesBlocs, activite: donneesEntrees })
			}
		})
	}

	async function verifierAcces (pad, identifiant, motdepasse) {
		return new Promise(async function (resolve) {
			let donnees = await db.HGETALL('pads:' + pad)
			donnees = Object.assign({}, donnees)
			if (donnees === null || !donnees.hasOwnProperty('identifiant')) { resolve({ acces: 'erreur', utilisateur: {} }); return false }
			if (identifiant === donnees.identifiant && donnees.hasOwnProperty('motdepasse') && await bcrypt.compare(motdepasse, donnees.motdepasse)) {
				let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				utilisateur = Object.assign({}, utilisateur)
				if (utilisateur === null || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve({ acces: 'erreur', utilisateur: {} }); return false }
				if (!donnees.hasOwnProperty('digidrive') || (donnees.hasOwnProperty('digidrive') && parseInt(donnees.digidrive) === 0)) {
					await db.HSET('pads:' + pad, 'digidrive', 1)
				}
				resolve({ acces: 'pad_debloque', utilisateur: utilisateur })
			} else if (identifiant === donnees.identifiant && !donnees.hasOwnProperty('motdepasse')) {
				const resultat = await db.EXISTS('utilisateurs:' + identifiant)
				if (resultat === null) { resolve({ acces: 'erreur', utilisateur: {} }); return false }
				if (resultat === 1) {
					let utilisateur = await db.HGETALL('utilisateurs:' + identifiant)
					utilisateur = Object.assign({}, utilisateur)
					if (utilisateur === null || !utilisateur.hasOwnProperty('id') || !utilisateur.hasOwnProperty('motdepasse') || !utilisateur.hasOwnProperty('nom') || !utilisateur.hasOwnProperty('langue')) { resolve({ acces: 'erreur', utilisateur: {} }); return false }
					if (motdepasse.trim() !== '' && utilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, utilisateur.motdepasse)) {
						if (!donnees.hasOwnProperty('digidrive') || (donnees.hasOwnProperty('digidrive') && parseInt(donnees.digidrive) === 0)) {
							await db.HSET('pads:' + pad, 'digidrive', 1)
						}
						resolve({ acces: 'pad_debloque', utilisateur: utilisateur })
					} else {
						resolve({ acces: 'erreur', utilisateur: {} })
					}
				} else {
					resolve({ acces: 'erreur', utilisateur: {} })
				}
			} else {
				resolve({ acces: 'erreur', utilisateur: {} })
			}
		})
	}

	async function exporterPad (req, res, id, erreur) {
		// Récupérer les données du pad
		let donneesPad = await db.HGETALL('pads:' + id)
		donneesPad = Object.assign({}, donneesPad)
		// Récupérer les blocs
		let donneesBlocs = []
		const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
		if (blocs !== null) {
			for (const bloc of blocs) {
				let donneesBloc = await db.HGETALL('pad-' + id + ':' + bloc)
				donneesBloc = Object.assign({}, donneesBloc)
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires !== null) {
					const donneesCommentaires = []
					for (let commentaire of commentaires) {
						donneesCommentaires.push(JSON.parse(commentaire))
					}
					donneesBloc.commentaires = donneesCommentaires.length
					donneesBloc.listeCommentaires = donneesCommentaires
				}
				const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
				if (evaluations !== null) {
					const donneesEvaluations = []
					evaluations.forEach(function (evaluation) {
						donneesEvaluations.push(JSON.parse(evaluation))
					})
					donneesBloc.evaluations = donneesEvaluations.length
					donneesBloc.listeEvaluations = donneesEvaluations
				}
				const nomExiste = await db.EXISTS('noms:' + donneesBloc.identifiant)
				if (nomExiste === 1) {
					const nomUtilisateur = await db.HGET('noms:' + donneesBloc.identifiant, 'nom')
					if (nomUtilisateur !== null) {
						donneesBloc.nom = nomUtilisateur
						donneesBloc.info = formaterDate(donneesBloc, req.session.langue)
					}
				} else {
					donneesBloc.nom = genererPseudo()
					donneesBloc.info = formaterDate(donneesBloc, req.session.langue)
				}
				donneesBlocs.push(donneesBloc)
			}
		}
		donneesBlocs = donneesBlocs.filter(function (element) {
			return Object.keys(element).length > 0
		})
		// Récupérer les entrées du registre d'activité
		let donneesEntrees = []
		const entrees = await db.ZRANGE('activite:' + id, 0, -1)
		if (entrees !== null) {
			for (let entree of entrees) {
				let donneesEntree = JSON.parse(entree)
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + donneesEntree.identifiant)
				if (utilisateurExiste === null || utilisateurExiste === 0) {
					donneesEntree = {}
				}
				donneesEntrees.push(donneesEntree)
			}
		}
		donneesEntrees = donneesEntrees.filter(function (element) {
			return Object.keys(element).length > 0
		})
		if (donneesPad.hasOwnProperty('id')) {
			const parametres = {}
			parametres.pad = donneesPad
			parametres.blocs = donneesBlocs
			parametres.activite = donneesEntrees
			const html = genererHTML(donneesPad, donneesBlocs)
			const chemin = path.join(__dirname, '..', '/static/temp')
			await fs.mkdirp(path.normalize(chemin + '/' + id))
			await fs.mkdirp(path.normalize(chemin + '/' + id + '/fichiers'))
			await fs.mkdirp(path.normalize(chemin + '/' + id + '/static'))
			await fs.writeFile(path.normalize(chemin + '/' + id + '/donnees.json'), JSON.stringify(parametres, '', 4), 'utf8')
			await fs.writeFile(path.normalize(chemin + '/' + id + '/index.html'), html, 'utf8')
			if (!parametres.pad.fond.includes('/img/') && parametres.pad.fond.substring(0, 1) !== '#' && parametres.pad.fond !== '' && typeof parametres.pad.fond === 'string') {
				const fichierFond = path.basename(parametres.pad.fond)
				if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond))) {
					await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond), path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond, { overwrite: true }))
				} else if (stockage === 's3') {
					try {
						const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + fichierFond }))
						if (fichierMeta.hasOwnProperty('ContentLength')) {
							await telechargerFichierS3(id + '/' + fichierFond, path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond))
						}
					} catch (e) {}
				}
			} else if (parametres.pad.fond.includes('/img/') && await fs.pathExists(path.join(__dirname, '..', '/public' + parametres.pad.fond))) {
				await fs.copy(path.join(__dirname, '..', '/public' + parametres.pad.fond), path.normalize(chemin + '/' + id + '/static' + parametres.pad.fond, { overwrite: true }))
			}
			if (await fs.pathExists(path.join(__dirname, '..', '/static/export/css'))) {
				await fs.copy(path.join(__dirname, '..', '/static/export/css'), path.normalize(chemin + '/' + id + '/static/css'))
			}
			if (await fs.pathExists(path.join(__dirname, '..', '/static/export/js'))) {
				await fs.copy(path.join(__dirname, '..', '/static/export/js'), path.normalize(chemin + '/' + id + '/static/js'))
			}
			await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff2'))
			await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff2'))
			await fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.normalize(chemin + '/' + id + '/static/img/favicon.png'))
			for (const bloc of parametres.blocs) {
				if (stockage === 'fs' && Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media))) {
					await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
				} else if (stockage === 's3' && Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
					try {
						const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.media }))
						if (fichierMeta.hasOwnProperty('ContentLength')) {
							await telechargerFichierS3(id + '/' + bloc.media, path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media))
						}
					} catch (e) {}
				}
				if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('vignette') && bloc.vignette !== '') {
					if (typeof bloc.vignette === 'string' && bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
						await fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.normalize(chemin + '/' + id + '/static' + bloc.vignette, { overwrite: true }))
					} else if (definirVignettePersonnalisee(bloc.vignette) === true) {
						const fichierVignette = path.basename(bloc.vignette)
						if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette))) {
							await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette), path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette, { overwrite: true }))
						} else if (stockage === 's3') {
							try {
								const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + fichierVignette }))
								if (fichierMeta.hasOwnProperty('ContentLength')) {
									await telechargerFichierS3(id + '/' + fichierVignette, path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette))
								}
							} catch (e) {}
						}
					}
				}
			}
			const archiveId = Math.floor((Math.random() * 100000) + 1)
			const sortie = fs.createWriteStream(path.normalize(chemin + '/pad-' + id + '_' + archiveId + '.zip'))
			const archive = archiver('zip', {
				zlib: { level: 9 }
			})
			sortie.on('finish', async function () {
				await fs.remove(path.normalize(chemin + '/' + id))
				res.send('pad-' + id + '_' + archiveId + '.zip')
			})
			archive.pipe(sortie)
			archive.directory(path.normalize(chemin + '/' + id), false)
			archive.finalize()
		} else {
			res.send(erreur)
		}
	}

	async function exporterPadJson (res, id, donnees) {
		const html = genererHTML(donnees.pad, donnees.blocs)
		const chemin = path.join(__dirname, '..', '/static/temp')
		await fs.mkdirp(path.normalize(chemin + '/' + id))
		await fs.mkdirp(path.normalize(chemin + '/' + id + '/fichiers'))
		await fs.mkdirp(path.normalize(chemin + '/' + id + '/static'))
		await fs.writeFile(path.normalize(chemin + '/' + id + '/donnees.json'), JSON.stringify(donnees, '', 4), 'utf8')
		await fs.writeFile(path.normalize(chemin + '/' + id + '/index.html'), html, 'utf8')
		if (!donnees.pad.fond.includes('/img/') && donnees.pad.fond.substring(0, 1) !== '#' && donnees.pad.fond !== '' && typeof donnees.pad.fond === 'string') {
			const fichierFond = path.basename(donnees.pad.fond)
			if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond))) {
				await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond), path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond, { overwrite: true }))
			} else if (stockage === 's3') {
				try {
					const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + fichierFond }))
					if (fichierMeta.hasOwnProperty('ContentLength')) {
						await telechargerFichierS3(id + '/' + fichierFond, path.normalize(chemin + '/' + id + '/fichiers/' + fichierFond))
					}
				} catch (e) {}
			}
		} else if (donnees.pad.fond.includes('/img/') && await fs.pathExists(path.join(__dirname, '..', '/public' + donnees.pad.fond))) {
			await fs.copy(path.join(__dirname, '..', '/public' + donnees.pad.fond), path.normalize(chemin + '/' + id + '/static' + donnees.pad.fond, { overwrite: true }))
		}
		if (await fs.pathExists(path.join(__dirname, '..', '/static/export/css'))) {
			await fs.copy(path.join(__dirname, '..', '/static/export/css'), path.normalize(chemin + '/' + id + '/static/css'))
		}
		if (await fs.pathExists(path.join(__dirname, '..', '/static/export/js'))) {
			await fs.copy(path.join(__dirname, '..', '/static/export/js'), path.normalize(chemin + '/' + id + '/static/js'))
		}
		await fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/MaterialIcons-Regular.woff2'))
		await fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.normalize(chemin + '/' + id + '/static/fonts/Roboto-Slab-Medium.woff2'))
		await fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.normalize(chemin + '/' + id + '/static/img/favicon.png'))
		for (const bloc of donnees.blocs) {
			if (stockage === 'fs' && Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media))) {
				await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media), path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media, { overwrite: true }))
			} else if (stockage === 's3' && Object.keys(bloc).length > 0 && bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
				try {
					const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + bloc.media }))
					if (fichierMeta.hasOwnProperty('ContentLength')) {
						await telechargerFichierS3(id + '/' + bloc.media, path.normalize(chemin + '/' + id + '/fichiers/' + bloc.media))
					}
				} catch (e) {}
			}
			if (Object.keys(bloc).length > 0 && bloc.hasOwnProperty('vignette') && bloc.vignette !== '') {
				if (typeof bloc.vignette === 'string' && bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http']) && await fs.pathExists(path.join(__dirname, '..', '/public' + bloc.vignette))) {
					await fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.normalize(chemin + '/' + id + '/static' + bloc.vignette, { overwrite: true }))
				} else if (definirVignettePersonnalisee(bloc.vignette) === true) {
					const fichierVignette = path.basename(bloc.vignette)
					if (stockage === 'fs' && await fs.pathExists(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette))) {
						await fs.copy(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette), path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette, { overwrite: true }))
					} else if (stockage === 's3') {
						try {
							const fichierMeta = await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: id + '/' + fichierVignette }))
							if (fichierMeta.hasOwnProperty('ContentLength')) {
								await telechargerFichierS3(id + '/' + fichierVignette, path.normalize(chemin + '/' + id + '/fichiers/' + fichierVignette))
							}
						} catch (e) {}
					}
				}
			}
		}
		const archiveId = Math.floor((Math.random() * 100000) + 1)
		const sortie = fs.createWriteStream(path.normalize(chemin + '/pad-' + id + '_' + archiveId + '.zip'))
		const archive = archiver('zip', {
			zlib: { level: 9 }
		})
		sortie.on('finish', async function () {
			await fs.remove(path.normalize(chemin + '/' + id))
			res.send('pad-' + id + '_' + archiveId + '.zip')
		})
		archive.pipe(sortie)
		archive.directory(path.normalize(chemin + '/' + id), false)
		archive.finalize()
	}

	async function fetchSockets (room) {
		for (let i = 0; i < 5; i++) {
			try {
				return await io.in(room).fetchSockets()
			} catch (e) {}
		}
	}

	async function verifierAdmin (pad, donnees, session) {
		return new Promise(async function (resolve) {
			if (session.hasOwnProperty('identifiant') && session.hasOwnProperty('statut') && session.statut === 'utilisateur' && session.hasOwnProperty('motdepasse')) {
				const proprietaire = donnees.identifiant
				let admins = []
				if (donnees.hasOwnProperty('admins')) {
					admins = donnees.admins
				}
				let donneesUtilisateur = await db.HGETALL('utilisateurs:' + session.identifiant)
				donneesUtilisateur = Object.assign({}, donneesUtilisateur)
				if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { resolve('erreur'); return false }
				if ((proprietaire === session.identifiant || admins.includes(session.identifiant)) && await bcrypt.compare(session.motdepasse, donneesUtilisateur.motdepasse)) {
					resolve(true)
				} else {
					resolve(false)
				}
			} else if (session.hasOwnProperty('statut') && session.statut === 'auteur' && session.hasOwnProperty('pads') && session.pads.includes(parseInt(pad))) {
				resolve(true)
			} else {
				resolve(false)
			}
		})
	}

	async function verifierAdminUtilisateur (pad, identifiant, motdepasse) {
		return new Promise(async function (resolve) {
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = Object.assign({}, donneesPad)
			if (donneesPad === null) { resolve('erreur'); return false }
			let admins = []
			if (donneesPad.hasOwnProperty('admins')) {
				admins = donneesPad.admins
			}
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = Object.assign({}, donneesUtilisateur)
			if (donneesUtilisateur === null || !donneesUtilisateur.hasOwnProperty('motdepasse')) { resolve('erreur'); return false }
			if ((donneesPad.identifiant === identifiant || admins.includes(identifiant)) && await bcrypt.compare(motdepasse, donneesUtilisateur.motdepasse)) {
				resolve(true)
			} else {
				resolve(false)
			}
		})
	}

	function supprimerSession (req) {
		if (req.hasOwnProperty('session')) {
			req.session.identifiant = ''
			req.session.motdepasse = ''
			req.session.nom = ''
			req.session.email = ''
			req.session.langue = ''
			req.session.statut = ''
			req.session.destroy()
		}
	}

	function genererPseudo () {
		const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
		return nom
	}

	function genererMotDePasse (longueur) {
		function rand (max) {
			return Math.floor(Math.random() * max)
		}
		function verifierMotDePasse (motdepasse, regex, caracteres) {
			if (!regex.test(motdepasse)) {
				const nouveauCaractere = caracteres.charAt(rand(caracteres.length))
				const position = rand(motdepasse.length + 1)
				motdepasse = motdepasse.slice(0, position) + nouveauCaractere + motdepasse.slice(position)
			}
			return motdepasse
		}
		const caracteres = '123456789abcdefghijklmnopqrstuvwxyz'.split('')
		const caracteresSpeciaux = '!#$@*'
		const specialRegex = /[!#\$@*]/
		const majuscules = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		const majusculesRegex = /[A-Z]/

		let motdepasse = ''
		let index

		while (motdepasse.length < longueur) {
			index = rand(caracteres.length)
			motdepasse += caracteres[index]
			caracteres.splice(index, 1)
		}
		motdepasse = verifierMotDePasse(motdepasse, specialRegex, caracteresSpeciaux)
		motdepasse = verifierMotDePasse(motdepasse, majusculesRegex, majuscules)
		return motdepasse  
	}

	function verifierEmail (email) {
		const regexExp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/gi
		return regexExp.test(email)
	}

	function definirNomFichier (fichier) {
		const info = path.parse(fichier)
		const extension = info.ext.toLowerCase()
		let nom = v.latinise(info.name.toLowerCase())
		nom = nom.replace(/\ /gi, '-')
		nom = nom.replace(/[^0-9a-z_\-]/gi, '')
		if (nom.length > 100) {
			nom = nom.substring(0, 100)
		}
		nom = nom + '_' + Math.random().toString(36).substring(2) + extension
		return nom
	}

	function definirVignettePersonnalisee (vignette) {
		if (vignette !== '' && typeof vignette === 'string' && !vignette.includes('/img/') && (!verifierURL(vignette, ['https', 'http']) || (verifierURL(vignette, ['https', 'http']) && vignette.includes(lienPublicS3)))) {
			return true
		} else {
			return false
		}
	}

	function definirCheminFichiers () {
		if (process.env.VITE_STORAGE && process.env.VITE_STORAGE === 's3' && process.env.VITE_S3_PUBLIC_LINK && process.env.VITE_S3_PUBLIC_LINK !== '') {
			return process.env.VITE_S3_PUBLIC_LINK
		} else {
			return '/fichiers'
		}
	}

	async function telechargerFichierS3 (cle, fichier) {
		return new Promise(async function (resolve) {
			const donnees = await s3Client.send(new GetObjectCommand({ Bucket: bucket, Key: cle }))
			const writeStream = fs.createWriteStream(fichier)
			donnees.Body.pipe(writeStream)
			writeStream.on('finish', function () {
				resolve('termine')
			})
			writeStream.on('error', function () {
				resolve('erreur')
			})
		})
	}

	async function supprimerFichier (pad, fichier) {
		return new Promise(async function (resolve) {
			if (stockage === 'fs' && fichier !== '') {
				const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/' + fichier)
				if (await fs.pathExists(chemin)) {
					await fs.remove(chemin)
				}
			} else if (stockage === 's3' && fichier !== '') {
				await s3Client.send(new DeleteObjectCommand({ Bucket: bucket, Key: pad + '/' + fichier }))
			}
			resolve()
		})
	}

	const televerser = multer({
		storage: multer.diskStorage({
			destination: function (req, fichier, callback) {
				const pad = req.body.pad
				const chemin = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad + '/')
				callback(null, chemin)
			},
			filename: function (req, fichier, callback) {
				const nom = definirNomFichier(fichier.originalname)
				callback(null, nom)
			}
		}),
		fileFilter: function (req, fichier, callback) {
			if (req.body.pad) {
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				checkDiskSpace(dossier).then(function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
						callback('erreur_espace_disque')
					} else {
						callback(null, true)
					}
				})
			} else {
				callback(null, true)
			}
		}
	}).single('fichier')

	const televerserTemp = multer({
		storage: multer.diskStorage({
			destination: function (req, fichier, callback) {
				const chemin = path.join(__dirname, '..', '/static/temp/')
				callback(null, chemin)
			},
			filename: function (req, fichier, callback) {
				const nom = definirNomFichier(fichier.originalname)
				callback(null, nom)
			}
		}),
		fileFilter: function (req, fichier, callback) {
			if (req.body.pad) {
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				checkDiskSpace(dossier).then(function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
						callback('erreur_espace_disque')
					} else {
						callback(null, true)
					}
				})
			} else {
				callback(null, true)
			}
		}
	}).single('fichier')

	function verifierURL (s, protocoles) {
		try {
			const url = new URL(s)
			return protocoles ? url.protocol ? protocoles.map(x => `${x.toLowerCase()}:`).includes(url.protocol) : false : true
		} catch (err) {
			return false
		}
	}

	function verifierJSON (json){
		try {
			const o = JSON.parse(json)
			if (o && typeof o === 'object') {
				return o
			}
		}
		catch (e) { }
		return false
	}

	function formaterDate (donnees, langue) {
		let dateFormattee = ''
		switch (langue) {
		case 'fr':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '. Modifiée le ' + dayjs(new Date(donnees.modifie)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.modifie)).locale('fr').format('LT') + '.'
			} else {
				dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '.'
			}
			break
		case 'es':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '. Modificada el ' + dayjs(new Date(donnees.modifie)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.modifie)).locale('es').format('LT') + '.'
			} else {
				dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '.'
			}
			break
		case 'it':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '. Modifica attivata ' + dayjs(new Date(donnees.modifie)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.modifie)).locale('it').format('LT') + '.'
			} else {
				dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '.'
			}
			break
		case 'de':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '. Geändert am ' + dayjs(new Date(donnees.modifie)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.modifie)).locale('de').format('LT') + '.'
			} else {
				dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '.'
			}
			break
		case 'en':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '. Modified on ' + dayjs(new Date(donnees.modifie)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.modifie)).locale('en').format('LT') + '.'
			} else {
				dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '.'
			}
			break
		case 'hr':
			if (donnees.hasOwnProperty('modifie')) {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '. Izmijenjeno na ' + dayjs(new Date(donnees.modifie)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.modifie)).locale('hr').format('LT') + '.'
			} else {
				dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '.'
			}
			break
		}
		return dateFormattee
	}

	function genererHTML (pad, blocs) {
		return `
		<!DOCTYPE html>
		<html lang="fr">
			<head>
				<meta charset="utf-8">
				<meta name="viewport" content="width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes">
				<meta name="description" content="Digipad permet de créer des murs multimédias collaboratifs.">
				<meta name="robots" content="index, no-follow">
				<meta name="theme-color" content="#00ced1">
				<meta property="og:title" content="Digipad by La Digitale">
				<meta property="og:description" content="Digipad permet de créer des murs multimédias collaboratifs.">
				<meta property="og:type" content="website" />
				<meta property="og:locale" content="fr_FR" />
				<title>Digipad by La Digitale</title>
				<link rel="icon" type="image/png" href="./static/img/favicon.png">
				<link rel="stylesheet" href="./static/css/destyle.css">
				<link rel="stylesheet" href="./static/css/main.css">
				<link rel="stylesheet" href="./static/css/pad.css">
				<script src="./static/js/vue.js" type="text/javascript"></script>
				<script src="./static/js/vue-masonry-css.js" type="text/javascript"></script>
			</head>
			<body>
				<noscript>
					<strong>Veuillez activer Javascript dans votre navigateur pour utiliser <i>Digipad</i>.</strong>
				</noscript>
				<div id="app">
					<main id="page" :class="pad.affichage">
						<header v-if="!chargement">
							<span id="titre">{{ pad.titre }}</span>
						</header>

						<div id="pad" :class="{'fond-personnalise': pad.fond.substring(0, 1) !== '#' && !pad.fond.includes('/img/') && (!pad.hasOwnProperty('fondRepete') || pad.fondRepete === 'desactive'), 'fond-personnalise-repete': pad.fond.substring(0, 1) !== '#' && !pad.fond.includes('/img/') && pad.hasOwnProperty('fondRepete') && pad.fondRepete === 'active'}" :style="definirFond(pad.fond)" v-if="!chargement">
							<!-- Affichage mur -->
							<masonry id="blocs" class="mur" :cols="definirLargeurCapsules()" :gutter="0" v-if="pad.affichage === 'mur'">
								<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
									<div class="contenu">
										<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
											<span>{{ item.titre }}</span>
										</div>
										<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
										<div class="media" v-if="item.media !== ''">
											<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
											<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
											<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
											<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
											<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
										</div>
										<div class="evaluation" v-if="pad.evaluations === 'activees'">
											<span class="etoiles">
												<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
												<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
												<span>({{ item.listeEvaluations.length }})</span>
											</span>
										</div>
										<div class="action" :style="{'color': item.couleur}">
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter.space.prevent="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></span>
											<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></span>
											<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
										</div>
									</div>
								</div>
							</masonry>
							<!-- Affichage flux vertical -->
							<div id="blocs" class="flux-vertical" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-else-if="pad.affichage === 'flux-vertical'">
								<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
									<div class="contenu">
										<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
											<span>{{ item.titre }}</span>
										</div>
										<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
										<div class="media" v-if="item.media !== ''">
											<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
											<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
											<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
											<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
											<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
										</div>
										<div class="evaluation" v-if="pad.evaluations === 'activees'">
											<span class="etoiles">
												<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
												<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
												<span>({{ item.listeEvaluations.length }})</span>
											</span>
										</div>
										<div class="action" :style="{'color': item.couleur}">
											<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter.space.prevent="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></span>
											<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></span>
											<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
										</div>
									</div>
								</div>
							</div>
							<!-- Affichage colonne -->
							<div id="blocs" class="colonnes" v-else-if="pad.affichage === 'colonnes'">
								<section :id="'colonne' + indexCol" class="colonne" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-for="(col, indexCol) in pad.colonnes" :key="'colonne' + indexCol">
									<div class="bloc haut">
										<div class="titre-colonne">
											<span>{{ col }}</span>
										</div>
									</div>
									<div class="conteneur-colonne ascenseur" v-if="colonnes[indexCol].length > 0">
										<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in colonnes[indexCol]" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
											<div class="contenu">
												<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
													<span>{{ item.titre }}</span>
												</div>
												<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
												<div class="media" v-if="item.media !== ''">
													<img role="button" tabindex="0" v-if="item.type === 'image'" :src="'./fichiers/' + item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
													<img role="button" tabindex="0" v-else-if="item.type === 'lien-image'" :src="item.media" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)">
													<span role="button" tabindex="0" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'" @click="afficherMedia(item)" @keydown.enter.space.prevent="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></span>
													<span v-else-if="item.type === 'lien'"><a :href="item.media" target="_blank"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
													<span v-else><a :href="'./fichiers/' + item.media" download><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a></span>
												</div>
												<div class="evaluation" v-if="pad.evaluations === 'activees'">
													<span class="etoiles">
														<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
														<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
														<span>({{ item.listeEvaluations.length }})</span>
													</span>
												</div>
												<div class="action" :style="{'color': item.couleur}">
													<span role="button" tabindex="0" class="bouton" @click="ouvrirModaleCommentaires(item.bloc)" @keydown.enter.space.prevent="ouvrirModaleCommentaires(item.bloc)" v-if="pad.commentaires === 'actives'"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></span>
													<span role="button" tabindex="0" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></span>
													<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
												</div>
											</div>
										</div>
									</div>
								</section>
							</div>
						</div>

						<div class="conteneur-modale" v-if="modaleCommentaires">
							<div id="discussion" class="modale" role="dialog">
								<div class="en-tete">
									<span class="titre">{{ titre }}</span>
									<span role="button" tabindex="0" class="fermer" @click="fermerModaleCommentaires" @keydown.enter.space.prevent="fermerModaleCommentaires"><i class="material-icons" aria-hidden="true">close</i></span>
								</div>
								<ul class="commentaires ascenseur">
									<li v-for="(entreeCommentaire, indexEntreeCommentaire) in commentaires" :key="indexEntreeCommentaire">
										<span class="meta">// {{ noms[entreeCommentaire.identifiant] }}</span>
										<div class="texte" v-html="entreeCommentaire.texte"></div>
									</li>
								</ul>
							</div>
						</div>
						
						<div id="conteneur-chargement" v-if="chargement">
							<div id="chargement">
								<div class="spinner">
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
									<div></div>
								</div>
							</div>
						</div>
					</main>
				</div>
				
				<script type="text/javascript">
					var vm = new Vue({
						el: '#app',
						data: {
							chargement: true,
							modaleCommentaires: false,
							pad: ` + JSON.stringify(pad) + `,
							blocs: ` + JSON.stringify(blocs) + `,
							colonnes: [],
							commentaires: [],
							noms: {},
							titre: '',
							defilement: false,
							depart: 0,
							distance: 0
						},
						methods: {
							ouvrirModaleCommentaires (bloc) {
								let commentaires = []
								let titre = ''
								this.blocs.forEach(function (item) {
									if (item.bloc === bloc) {
										commentaires = item.listeCommentaires
										titre = item.titre
									}
								})
								if (commentaires.length > 0) {
									this.commentaires = commentaires
									this.titre = titre
									this.modaleCommentaires = true
									this.$nextTick(function () {
										document.querySelector('.modale .fermer').focus()
									})
								}
							},
							fermerModaleCommentaires () {
								this.modaleCommentaires = false
								this.commentaires = []
								this.titre = ''
							},
							definirFond (fond) {
								if (fond.substring(0, 1) === '#') {
									return { backgroundColor: fond }
								} else if (fond.includes('/img/')) {
									return { backgroundImage: 'url(./static/' + fond + ')' }
								} else {
									return { backgroundImage: 'url(./fichiers/' + fond.split('/').pop() + ')' }
								}
							},
							definirLargeurCapsules () {
								let donnees
								switch (this.pad.largeur) {
								case 'large':
									donnees = { default: 4, 1729: 4, 1449: 3, 1365: 2, 899: 2, 499: 1 }
									break
								case 'normale':
									donnees = { default: 5, 1729: 5, 1449: 4, 1365: 3, 899: 2, 499: 1 }
									break
								}
								return donnees
							},
							definirColonnes (blocs) {
								const colonnes = []
								if (this.pad.colonnes && JSON.parse(this.pad.colonnes).length > 0) {
									this.pad.colonnes = JSON.parse(this.pad.colonnes)
									this.pad.colonnes.forEach(function () {
										colonnes.push([])
									})
									blocs.forEach(function (bloc, index) {
										if (bloc.colonne !== undefined) {
											colonnes[parseInt(bloc.colonne)].push(bloc)
										} else {
											blocs[index].colonne = 0
											colonnes[bloc.colonne].push(bloc)
										}
									})
								} else {
									this.pad.colonnes.push('Colonne sans titre')
									colonnes.push([])
									blocs.forEach(function (bloc, index) {
										blocs[index].colonne = 0
										colonnes[0].push(bloc)
									})
								}
								this.blocs = blocs
								this.colonnes = colonnes
							},
							afficherMedia (item) {
								let lien
								if (this.verifierURL(item.media) === true) {
									lien = item.media
								} else {
									lien = './fichiers/' + item.media
								}
								window.open(lien, '_blank')
							},
							definirVignette (item) {
								let vignette
								if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && String(item.vignette).includes('/img/')) {
									vignette = './static/img/' + item.vignette.split('/').pop()
								} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && !String(item.vignette).includes('/img/')) {
									vignette = './fichiers/' + item.vignette.split('/').pop()
								} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === true) {
									vignette = item.vignette
								}
								return vignette
							},
							definirIconeMedia (item) {
								let icone
								switch (item.type) {
								case 'image':
								case 'lien-image':
									icone = 'image'
									break
								case 'audio':
									icone = 'volume_up'
									break
								case 'video':
									icone = 'movie'
									break
								case 'pdf':
								case 'document':
								case 'office':
									icone = 'description'
									break
								case 'lien':
									icone = 'link'
									break
								case 'embed':
									if (item.source === 'youtube' || item.source === 'vimeo' || item.source === 'dailymotion' || item.source === 'digiview') {
										icone = 'movie'
									} else if (item.source === 'slideshare' || item.media.includes('wikipedia.org') || item.media.includes('drive.google.com') || item.media.includes('docs.google.com')) {
										icone = 'description'
									} else if (item.source === 'flickr') {
										icone = 'image'
									} else if (item.source === 'soundcloud' || item.media.includes('vocaroo.com') || item.media.includes('voca.ro')) {
										icone = 'volume_up'
									} else if (item.media.includes('google.com/maps')) {
										icone = 'place'
									} else if (item.source === 'etherpad' || item.media.includes('framapad.org')) {
										icone = 'group_work'
									} else {
										icone = 'web'
									}
									break
								default:
									icone = 'save_alt'
									break
								}
								return icone
							},
							definirEvaluationCapsule (evaluations) {
								if (evaluations && evaluations.length > 0) {
									let note = 0
									evaluations.forEach(function (evaluation) {
										note = note + evaluation.etoiles
									})
									if (note > 0) {
										return Math.round(note / evaluations.length)
									} else {
										return 0
									}
								} else {
									return 0
								}
							},
							verifierURL (lien) {
								let url
								try {
									url = new URL(lien)
								} catch (_) {
									return false
								}
								return url.protocol === 'http:' || url.protocol === 'https:'
							},
							genererPseudo () {
								const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
								const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
								return nom
							},
							eclaircirCouleur (hex) {
								if (hex && hex.substring(0, 1) === '#') {
									const r = parseInt(hex.slice(1, 3), 16)
									const v = parseInt(hex.slice(3, 5), 16)
									const b = parseInt(hex.slice(5, 7), 16)
									return 'rgba(' + r + ', ' + v + ', ' + b + ', ' + 0.15 + ')'
								} else {
									return 'transparent'
								}
							},
							activerDefilementHorizontal () {
								const pad = document.querySelector('#pad')
								pad.addEventListener('mousedown', this.defilementHorizontalDebut)
								pad.addEventListener('mouseleave', this.defilementHorizontalFin)
								pad.addEventListener('mouseup', this.defilementHorizontalFin)
								pad.addEventListener('mousemove', this.defilementHorizontalEnCours)
							},
							desactiverDefilementHorizontal () {
								const pad = document.querySelector('#pad')
								pad.removeEventListener('mousedown', this.defilementHorizontalDebut)
								pad.removeEventListener('mouseleave', this.defilementHorizontalFin)
								pad.removeEventListener('mouseup', this.defilementHorizontalFin)
								pad.removeEventListener('mousemove', this.defilementHorizontalEnCours)
							},
							defilementHorizontalDebut (event) {
								const pad = document.querySelector('#pad')
								this.defilement = true
								this.depart = event.pageX - pad.offsetLeft
								this.distance = pad.scrollLeft
							},
							defilementHorizontalFin () {
								this.defilement = false
							},
							defilementHorizontalEnCours (event) {
								if (!this.defilement) { return }
								event.preventDefault()
								const pad = document.querySelector('#pad')
								const x = event.pageX - pad.offsetLeft
								const delta = (x - this.depart) * 1.5
								pad.scrollLeft = this.distance - delta
							}
						},
						created () {
							if (this.pad.ordre === 'decroissant') {
								this.blocs.reverse()
							}
							if (this.pad.affichage === 'colonnes') {
								this.definirColonnes(this.blocs)
							}
						},
						mounted () {
							const noms = {}
							this.blocs.forEach(function (bloc) {
								if (bloc.hasOwnProperty('couleur') === false || bloc.couleur === null || typeof bloc.couleur !== 'string') {
									bloc.couleur = '#242f3d'
								}
								if (noms.hasOwnProperty(bloc.identifiant) === false) {
									noms[bloc.identifiant] = bloc.nom
								}
								bloc.listeCommentaires.forEach(function (commentaire) {
									if (noms.hasOwnProperty(commentaire.identifiant) === false) {
										noms[commentaire.identifiant] = this.genererPseudo()
									}
								}.bind(this))
							}.bind(this))
							this.noms = noms
							document.title = this.pad.titre + ' - Digipad by La Digitale'
							this.chargement = false
							if (this.pad.affichage === 'colonnes') {
								this.$nextTick(function () {
									this.activerDefilementHorizontal()
								}.bind(this))
							}
						}
					})
				</script>
			</body>
		</html>`
	}
}
