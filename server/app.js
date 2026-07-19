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
import helmet from 'helmet'
import v from 'voca'
import multer from 'multer'
import Busboy from 'busboy'
import sharp from 'sharp'
import gm from 'gm'
import archiver from 'archiver'
import AdmZip from 'adm-zip'
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
import rateLimit from 'express-rate-limit'
import { RedisStore as RateLimitRedisStore } from 'rate-limit-redis'
import { EventEmitter } from 'events'
import { randomBytes, timingSafeEqual } from 'crypto'
import Rabbit from 'crypto-js/rabbit.js'
import Utf8 from 'crypto-js/enc-utf8.js'
import checkDiskSpace from 'check-disk-space'
import { pipeline } from 'stream/promises'
import { Agent } from 'https'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { S3Client, CopyObjectCommand, PutObjectCommand, ListObjectsV2Command, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { renderPage, createDevMiddleware } from 'vike/server'
import genererHTML from './genererHTML.js'
import genererXML from './genererXML.js'

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
	const hoteWs = hote.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://')
	const hoteTeleversement = process.env.UPLOAD_HOST || hote
	const langues = ['fr', 'es', 'it', 'de', 'en', 'hr']
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
		}).connect()
	} else {
		db = await createClient({
			url: 'redis://localhost:' + db_port
		}).on('error', (err) => {
			console.error('Erreur Redis : ' + err)
		}).connect()
	}
	const cookieSecurise = parseInt(process.env.COOKIE_SECURE) !== 0
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
	const sessionOptions = {
		secret: process.env.SESSION_KEY || 'cle-par-defaut-dev',
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
		port: parseInt(process.env.EMAIL_PORT),
		secure: parseInt(process.env.EMAIL_SECURE) === 1,
		auth: {
			user: process.env.EMAIL_ADDRESS,
			pass: process.env.EMAIL_PASSWORD
		}
	})

	const dateCron = process.env.CRON_TASK_DATE || '59 23 * * Saturday' // tous les samedis à 23h59
	cron.schedule(dateCron, async () => {
		await fs.emptyDir(path.join(__dirname, '..', '/static/temp'))
	})

	const minimumEspaceDisque = parseInt(process.env.ALERT_AVAILABLE_SPACE) || 10

	// Charger plugin dayjs
	dayjs.extend(localizedFormat)

	const etherpad = process.env.VITE_ETHERPAD || null
	const etherpadApi = process.env.ETHERPAD_API_KEY

	const creationCompte = parseInt(process.env.VITE_CREATE_ACCOUNT) || 1
	const creationPadSansCompte = parseInt(process.env.VITE_PAD_WITHOUT_ACCOUNT) || 1

	const cleCrypto = process.env.ENCRYPTION_KEY || ''

	const validationInscription = parseInt(process.env.ACCOUNT_VALIDATION) || 0

	// Augmenter nombre de tâches asynchrones par défaut
	EventEmitter.defaultMaxListeners = 20
	
	// Pour validation des chaînes dans ajouterbloc et modifierbloc
	const limitesTailleInput = { titre: 100, texte: 10_000, iframe: 2000 }

	const limiteTeleversement = (parseFloat(process.env.VITE_UPLOAD_LIMIT) || 20) * 1024 * 1000

	const limiteApi = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 100,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-api:'
		}),
		skipSuccessfulRequests: true,
		validate: { trustProxy: false }
	})

	const limiteAuth = rateLimit({
		windowMs: 15 * 60 * 1000,
		limit: 10,
		standardHeaders: 'draft-7',
		legacyHeaders: false,
		store: new RateLimitRedisStore({
			sendCommand: (...args) => db.sendCommand(args),
			prefix: 'rl-auth:'
		}),
		skipSuccessfulRequests: true,
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
		validate: { trustProxy: false }
	})

	let scriptSrc
	let domaineMatomo = null
	let domaineUmami = null
	if (process.env.MATOMO && process.env.MATOMO !== '') {
		domaineMatomo = process.env.MATOMO
		scriptSrc = ["'self'", domaineMatomo]
	} else if (process.env.UMAMI_SCRIPT_URL && process.env.UMAMI_SCRIPT_URL !== '') {
		const umamiScriptUrl = new URL(process.env.UMAMI_SCRIPT_URL)
		domaineUmami = umamiScriptUrl.protocol + '//' + umamiScriptUrl.hostname
		scriptSrc = ["'self'", domaineUmami]
	} else {
		scriptSrc = ["'self'"]
	}
	if (!production) {
		scriptSrc.push("'unsafe-inline'")
	}
	let hoteVite = 'ws://localhost:24678'
	if (production) {
		hoteVite = ''
	}
	app.set('trust proxy', true)
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
    	const { devMiddleware } = await createDevMiddleware({ root })
    	app.use(devMiddleware)
  	} else if (production && parseInt(process.env.REVERSE_PROXY) !== 1) {
		const sirv = (await import('sirv')).default
		app.use(sirv(`${root}/dist/client`))
	}

	app.get('/', async (req, res, next) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		if (req.session.identifiant && req.session.statut === 'utilisateur') return res.redirect(302, '/u/' + req.session.identifiant)
		let langue = 'fr'
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
			if (!donneesUtilisateur.motdepasse) return res.redirect(302, '/')
			const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
			if (!motdepasseCorrect) {
				supprimerSession(req)
				return res.redirect(302, '/')
			}
			const [padsCreesRaw, padsCorbeilleRaw, padsRejointsRaw, padsAdminsRaw, padsFavorisRaw] = await recupererDonneesUtilisateur(identifiant)
			let padsCrees = nettoyerPads(padsCreesRaw)
			let padsCorbeille = nettoyerPads(padsCorbeilleRaw)
			let padsRejoints = nettoyerPads(padsRejointsRaw)
			let padsAdmins = nettoyerPads(padsAdminsRaw)
			let padsFavoris = nettoyerPads(padsFavorisRaw)
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
			// Vérification parallèle de l'existence des pads dans les dossiers
			const padsExistent = Array.from(listePadsDossiers).map(async (padId) => {
				const padExiste = await db.EXISTS('pads:' + padId)
				if (!padExiste || padExiste === 0) {
					// Vérifier aussi le fichier JSON
					if (isNaN(parseInt(padId, 10)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))) {
						return null
					}
					return padId
				}
				return null
			})
			const padsSupprimesDossiers = (await Promise.all(padsExistent)).filter(id => id !== null)
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		try {
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
			let donneesPad = 'erreur'
			try {
				const padExiste = await db.EXISTS('pads:' + id)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					await recupererDonneesPadJSON(id)
				}
				donneesPad = await recupererDonneesPad(id, token, req.session.identifiant, req.session.statut, req.session.pads)
			} catch (err) {
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const id = req.params.id
			const token = req.params.token
			const identifiant = req.session.identifiant
			const statut = req.session.statut
			const pads = req.session.pads
			let donneesPad = {}
			const padExiste = await db.EXISTS('pads:' + id)
			if (padExiste === 1) {
				donneesPad = await db.HGETALL('pads:' + id)
				donneesPad = donneesPad ? { ...donneesPad } : {}
			} else if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
				donneesPad = await recupererDonneesPadJSON(id)
			}
			const donneesBlocs = await recupererDonneesBlocs(id, token, identifiant, statut, pads)
			if (typeof donneesBlocs !== 'object' || !donneesBlocs) return res.redirect(302, '/')
			const titre = donneesPad.titre
			const lien = hote + '/p/' + id + '/' + token
			const langue = req.session.langue || 'fr'
			const xml = genererXML(hote, id, titre, lien, donneesBlocs.blocs, donneesBlocs.admin, langue)
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
		if (maintenance === false) return res.redirect(302, '/')
		let langue = 'fr'
		if (req.session.hasOwnProperty('langue') && req.session.langue !== '') {
			langue = req.session.langue
		}
		const pageContextInit = {
			urlOriginal: req.originalUrl,
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
		let langue = 'fr'
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

	app.post('/api/inscription', limiteAuth, async (req, res) => {
		if (creationCompte !== 1) return res.status(403).send('non_autorise')
		try {
			const identifiant = req.body.identifiant
			if (typeof identifiant !== 'string' || !identifiant.match(/^[\w-]+$/)) return res.status(400).send('identifiant_invalide')
			const motdepasse = req.body.motdepasse
			const emailBrut = req.body.email
			if (typeof emailBrut !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBrut)) return res.status(400).send('erreur')
			const email = emailBrut.toLowerCase()
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
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				transporter.sendMail(message, async (err) => {
					if (err) return res.status(500).send('erreur_email')
					res.status(200).send('activation_demandee')
				})
			} else if (emailExiste === 0 && validationInscription === 0) {
				const hash = await bcrypt.hash(motdepasse, 10)
				const date = dayjs().format()
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				transporter.sendMail(message, async (err) => {
					if (err) return res.status(500).send('erreur_email')
					res.status(200).send('compte_cree')
				})
			} else {
				res.status(500).send('erreur')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.get('/activation/:code', async (req, res, next) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
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

	app.post('/api/connexion', limiteAuth, async (req, res) => {
		try {
			const identifiant = req.body.identifiant
			const motdepasse = req.body.motdepasse
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste !== 1) return res.status(401).send('erreur_connexion')
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (Object.keys(donneesUtilisateur).length === 0) return res.status(401).send('erreur_connexion')
			let comparaison = false
			if (motdepasse.trim() !== '' && donneesUtilisateur.hasOwnProperty('motdepasse') && donneesUtilisateur.motdepasse.trim() !== '') {
				comparaison = await bcrypt.compare(motdepasse, donneesUtilisateur.motdepasse)
			}
			let comparaisonTemp = false
			if (donneesUtilisateur.hasOwnProperty('motdepassetemp') && donneesUtilisateur.motdepassetemp.trim() !== '' && motdepasse.trim() !== '') {
				comparaisonTemp = await bcrypt.compare(motdepasse, donneesUtilisateur.motdepassetemp)
			}
			if (comparaison === false && comparaisonTemp === false) return res.status(401).send('erreur_connexion')
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
			const identifiant = req.body.identifiant
			let email = req.body.email.toLowerCase().trim()
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste !== 1) return res.status(400).send('identifiant_invalide')
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
					html: '<p>Votre nouveau mot de passe : ' + motdepasse + '</p><p>Identifiant : ' + identifiant + '</p>'
				}
				try {
					await new Promise((resolve, reject) => {
						transporter.sendMail(message, (err) => { if (err) reject(err); else resolve() })
					})
				} catch (err) {
					console.error(err.stack)
					return res.status(500).send('erreur_email')
				}
				const hash = await bcrypt.hash(motdepasse, 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepassetemp', hash)
				res.status(200).send('message_envoye')
			} else {
				res.status(400).send('email_invalide')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_email')
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

	app.post('/api/recuperer-donnees-pad', async (req, res) => {
		const id = req.body.id
		const token = req.body.token
		const identifiant = req.session.identifiant || ''
		const statut = req.session.statut || 'invite'
		const pads = req.session.pads || []
		try {
			const padExiste = await db.EXISTS('pads:' + id)
			if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
				await recupererDonneesPadJSON(id)
			}
			const donneesPad = await recupererDonneesPad(id, token, identifiant, statut, pads)
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
			const titre = req.body.titre
			const token = Math.random().toString(16).slice(2)
			const date = dayjs().format()
			const destination = req.body.dossier
			const id = await db.INCR('pad')
			const donneesPad = await creerPad(id, token, titre, date, identifiant, destination, donneesUtilisateur)
			if (!donneesPad) return res.status(500).send('erreur_creation')
			res.status(200).json(donneesPad)
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_creation')
		}
	})

	app.post('/api/creer-pad-sans-compte', limiteAuth, async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		if (creationPadSansCompte !== 1) return res.status(401).send('non_connecte')
		let identifiant, nom
		if (!req.session.identifiant || (req.session.identifiant.length !== 13 && req.session.identifiant.substring(0, 1) !== 'u')) {
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
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
			res.status(200).json(donneesPad)
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_creation')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
			supprimerSession(req)
			return res.status(401).send('non_connecte')
		}
		const padSource = req.body.padId
		const dossierDestination = req.body.dossier || ''
		try {
			const admin = await verifierAdminUtilisateur(padSource, identifiant, req.session.motdepasse)
			if (!admin) return res.status(401).send('non_connecte')
			// Vérification de l'espace disque (si stockage local)
			if (stockage === 'fs') {
				const dossierFichiers = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				const espaceDisque = await checkDiskSpace(dossierFichiers)
				const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
				if (pourcentageLibre < minimumEspaceDisque) {
					return res.status(507).send('erreur_espace_disque')
				}
			}
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
			let affichageColonnes = []
			if (donneesPadSource.hasOwnProperty('affichageColonnes')) {
				affichageColonnes = JSON.parse(donneesPadSource.affichageColonnes)
			} else {
				JSON.parse(donneesPadSource.colonnes).forEach(() => { affichageColonnes.push(true) })
			}
			// Duplication des blocs en parallèle
			const listeBlocs = await db.ZRANGE('blocs:' + padSource, 0, -1)
			if (listeBlocs === null) return res.status(500).send('erreur_duplication')
			const promessesBlocs = listeBlocs.map(async (blocSource, index) => {
				let infosBloc = await db.HGETALL('pad-' + padSource + ':' + blocSource)
				infosBloc = infosBloc ? { ...infosBloc } : {}
				if (!infosBloc || Object.keys(infosBloc).length === 0) return null
				// Traitement spécifique Etherpad
				if (infosBloc.iframe && infosBloc.iframe.includes(etherpad)) {
					const etherpadIdSource = infosBloc.iframe.replace(etherpad + '/p/', '')
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
				await db.multi()
					.HSET('pad-' + nId + ':' + blocId, ['id', infosBloc.id, 'bloc', blocId, 'titre', infosBloc.titre, 'texte', infosBloc.texte, 'media', infosBloc.media, 'iframe', infosBloc.iframe, 'type', infosBloc.type, 'source', infosBloc.source, 'vignette', infosBloc.vignette || '', 'date', date, 'identifiant', infosBloc.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', infosBloc.colonne, 'visibilite', infosBloc.visibilite || 'visible', 'couleur', infosBloc.couleur || '#242f3d'])
					.ZADD('blocs:' + nId, { score: index, value: blocId })
					.exec()
				return blocId
			})
			await Promise.all(promessesBlocs)
			// Création des métadonnées du pad
			const champsPad = ['id', nId, 'token', token, 'titre', 'Copie de ' + donneesPadSource.titre, 'identifiant', identifiant, 'fond', donneesPadSource.fond, 'acces', donneesPadSource.acces, 'contributions', donneesPadSource.contributions, 'affichage', donneesPadSource.affichage, 'registreActivite', donneesPadSource.registreActivite || 'active', 'conversation', donneesPadSource.conversation || 'desactivee', 'listeUtilisateurs', donneesPadSource.listeUtilisateurs || 'activee', 'editionNom', donneesPadSource.editionNom || 'desactivee', 'fichiers', donneesPadSource.fichiers, 'enregistrements', donneesPadSource.enregistrements || 'desactives', 'liens', donneesPadSource.liens, 'documents', donneesPadSource.documents, 'commentaires', donneesPadSource.commentaires, 'evaluations', donneesPadSource.evaluations, 'copieBloc', donneesPadSource.copieBloc || 'desactivee', 'ordre', donneesPadSource.ordre || 'croissant', 'largeur', donneesPadSource.largeur || 'normale', 'date', date, 'colonnes', donneesPadSource.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donneesPadSource.bloc, 'activite', 0, 'vues', 0, 'digidrive', 0]
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
			if (stockage === 'fs') {
				const dossierSource = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padSource)
				const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + nId)
				if (await fs.pathExists(dossierSource)) {
					await fs.copy(dossierSource, dossierDestination)
				}
			} else if (stockage === 's3') {
				const listeObjets = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: padSource + '/' }))
				if (listeObjets && listeObjets.Contents) {
					const promessesCopiesS3 = listeObjets.Contents.map((objet) => {
						const nCle = objet.Key.replace(padSource + '/', nId + '/')
						return s3Client.send(new CopyObjectCommand(definirParametresCopierS3(nCle, '/' + bucket + '/' + objet.Key)))
					})
					await Promise.all(promessesCopiesS3)
				}
			}
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
			return res.status(200).json({ id: nId, token, titre: 'Copie de ' + donneesPadSource.titre, identifiant, fond: donneesPadSource.fond, acces: donneesPadSource.acces, code: donneesPadSource.hasOwnProperty('code') ? code : undefined, contributions: donneesPadSource.contributions, affichage: donneesPadSource.affichage, registreActivite: donneesPadSource.registreActivite || 'active', conversation: donneesPadSource.conversation || 'desactivee', listeUtilisateurs: donneesPadSource.listeUtilisateurs || 'activee', editionNom: donneesPadSource.editionNom || 'desactivee', fichiers: donneesPadSource.fichiers, enregistrements: donneesPadSource.enregistrements || 'desactives', liens: donneesPadSource.liens, documents: donneesPadSource.documents, commentaires: donneesPadSource.commentaires, evaluations: donneesPadSource.evaluations, copieBloc: donneesPadSource.copieBloc || 'desactivee', ordre: donneesPadSource.ordre || 'croissant', largeur: donneesPadSource.largeur || 'normale', date, colonnes: donneesPadSource.colonnes, affichageColonnes, bloc: donneesPadSource.bloc, activite: 0, vues: 0 })
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur_duplication')
		}
	})

	app.post('/api/exporter-pad', async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			try {
				const id = req.body.padId
				let donneesPad = {}
				const padExiste = await db.EXISTS('pads:' + id)
				if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + id + '.json'))) {
					donneesPad = await recupererDonneesPadJSON(id)
				} else if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + id)
					donneesPad = donneesPad ? { ...donneesPad } : {}
				} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
				if (!admin && await verifierAdmin(id, donneesPad, req.session) === false) return res.status(403).send('non_autorise')
				const padExporte = await exporterPad(id, 'erreur_export', req.session.langue)
				res.status(200).send(padExporte)
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_export')
			}
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/importer-pad', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const identifiant = req.session.identifiant
			if (!req.session.identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') {
				supprimerSession(req)
				return res.status(401).send('non_connecte')
			}
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse') || !comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)) return res.status(401).send('non_connecte')
			televerserTemp(req, res, async (err) => {
				if (err) return res.status(500).send('erreur_import')
				if (!req.file) return res.status(500).send('erreur_import')
				const source = path.join(__dirname, '..', '/static/temp/' + req.file.filename)
				const dossierTemporaire = path.join(__dirname, '..', '/static/temp/archive-' + Math.floor((Math.random() * 100000) + 1))
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
					// Vérification espace disque
					if (stockage === 'fs') {
						const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
						const espaceDisque = await checkDiskSpace(dossier)
						const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
						if (pourcentageLibre < minimumEspaceDisque) throw new Error('espace_disque_insuffisant')
						await fs.mkdirp(dossierDestination)
					}
					// Traitement parallèle des blocs
					const promessesBlocs = donnees.blocs.map(async (bloc, indexBloc) => {
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
						pipelineBloc.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', nombreCommentaires, 'evaluations', nombreEvaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						pipelineBloc.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
						if (parametres.commentaires === true && Array.isArray(bloc.listeCommentaires)) {
							bloc.listeCommentaires.forEach(commentaire => {
								if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
									pipelineBloc.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
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
							promessesFichiers.push(televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.media, id))
						}
						if (definirVignettePersonnalisee(bloc.vignette) === true) {
							promessesFichiers.push(televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.vignette, id))
						}
						await Promise.all([pipelineBloc.exec(), ...promessesFichiers])
						return { bloc: bloc.bloc, blocId: blocId }
					})
					const blocsCrees = await Promise.all(promessesBlocs)
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
					let affichageColonnes = []
					if (donnees.pad.hasOwnProperty('affichageColonnes')) {
						affichageColonnes = JSON.parse(donnees.pad.affichageColonnes)
					} else {
						JSON.parse(donnees.pad.colonnes).forEach(() => { affichageColonnes.push(true) })
					}
					const activiteId = (parametres.activite === true) ? donnees.pad.activite : 0
					// Copie du fond personnalisé + métadonnées pad en parallèle
					const fondPad = donnees.pad.fond
					const promesseFond = (fondPad && !fondPad.includes('/img/') && fondPad.substring(0, 1) !== '#' && fondPad !== '') ? televerserFichierArchive(dossierTemporaire, dossierDestination, path.basename(fondPad), id) : Promise.resolve()
					await Promise.all([
						promesseFond,
						db.multi()
							.HSET('pads:' + id, ['id', id, 'token', token, 'titre', donnees.pad.titre, 'identifiant', identifiant, 'fond', fondPad, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0])
							.SADD('pads-crees:' + identifiant, id.toString())
							.SADD('utilisateurs-pads:' + id, identifiant)
							.exec()
					])
					// Gestion de l'activité
					if (parametres.activite === true && Array.isArray(donnees.activite)) {
						let activiteFiltree = donnees.activite
						if (parametres.commentaires === false) {
							activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-commente')
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
					res.status(200).json({ id, token, titre: donnees.pad.titre, identifiant, fond: fondPad, acces: donnees.pad.acces, code, contributions: donnees.pad.contributions, affichage: donnees.pad.affichage, registreActivite, conversation, listeUtilisateurs, editionNom, fichiers: donnees.pad.fichiers, enregistrements, liens: donnees.pad.liens, documents: donnees.pad.documents, commentaires: donnees.pad.commentaires, evaluations: donnees.pad.evaluations, copieBloc, ordre, largeur, date, colonnes: donnees.pad.colonnes, affichageColonnes, bloc: donnees.pad.bloc, activite: activiteId, admins: [], vues: 0 })
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') return res.status(401).send('non_connecte')
		try {
			const padId = req.body.padId
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur' || !req.session.hasOwnProperty('motdepasse') || req.session.motdepasse === '') return res.status(401).send('non_connecte')
		try {
			const padId = req.body.padId
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

	app.post('/api/vider-pad', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		const pad = req.body.padId
		const suppressionColonnes = req.body.suppressionColonnes === true
		const titreColonne = req.body.titreColonne
		if (req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) {
			try {
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
					const pipelineBlocs = db.multi()
					for (const blocId of blocs) {
						pipelineBlocs
							.UNLINK('commentaires:' + blocId)
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
				const champsReinitialises = ['bloc', 0, 'activite', 0, 'vues', 0, 'notification', JSON.stringify([])]
				if (donneesPad.affichage === 'colonnes' && !suppressionColonnes) {
					colonnes = donneesPad.hasOwnProperty('colonnes') ? JSON.parse(donneesPad.colonnes) : []
					affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : []
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
						const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
						if (liste && liste.hasOwnProperty('Contents') && Array.isArray(liste.Contents)) {
							const promessesFichiersS3 = []
							for (const objet of liste.Contents) {
								promessesFichiersS3.push(s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key))))
							}
							await Promise.all(promessesFichiersS3)
						}
					} catch {}
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

	app.post('/api/supprimer-pad', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const pad = req.body.padId
		const type = req.body.type
		let suppressionFichiers = true
		if (req.body.hasOwnProperty('suppressionFichiers')) {
			suppressionFichiers = req.body.suppressionFichiers
		}
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if ((req.session.identifiant && req.session.identifiant === identifiant && ((req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || req.session.statut === 'auteur')) || admin) {
			try {
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
						if (donneesPad.hasOwnProperty('admins')) {
							let listeAdmins = JSON.parse(donneesPad.admins)
							if (listeAdmins.includes(identifiant)) {
								listeAdmins.splice(listeAdmins.indexOf(identifiant), 1)
								await db.HSET('pads:' + pad, 'admins', JSON.stringify(listeAdmins))
							}
						}
					}
					await db.SREM('pads-favoris:' + identifiant, pad.toString())
				}
				return res.status(200).send('pad_supprime')
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_suppression')
			}
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/vider-corbeille', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
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

	app.post('/api/modifier-informations', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
			if (email !== ancienemail) {
				const emailExiste = await db.EXISTS('emails:' + email)
				if (emailExiste === 1) return res.status(409).send('email_existe_deja')
			}
			if (ancienemail !== '' && email !== ancienemail) {
				await db.multi()
					.HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
					.HSET('emails:' + email, 'identifiant', identifiant)
					.DEL('emails:' + ancienemail)
					.exec()
				
			} else {
				await db.multi()
					.HSET('utilisateurs:' + identifiant, ['nom', nom, 'email', email])
					.HSET('emails:' + email, 'identifiant', identifiant)
					.exec()
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		if (!req.session.identifiant || req.session.identifiant !== identifiant || req.session.statut !== 'utilisateur') return res.status(401).send('non_connecte')
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			const motdepasse = req.body.motdepasse
			const nouveaumotdepasse = req.body.nouveaumotdepasse
			if (motdepasse.trim() !== '' && nouveaumotdepasse.trim() !== '' && donneesUtilisateur.motdepasse.trim() !== '' && await bcrypt.compare(motdepasse, donneesUtilisateur.motdepasse)) {
				const hash = await bcrypt.hash(nouveaumotdepasse, 10)
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

	app.post('/api/verifier-mot-de-passe-admin', limiteAuthAdmin, (req, res) => {
		const admin = req.body.admin
		if (verifierMotDePasseAdmin(admin)) {
			res.status(200).send('acces_verifie')
		} else {
			res.status(401).send('acces_invalide')
		}
	})

	app.post('/api/modifier-mot-de-passe-admin', limiteAuthAdmin, async (req, res) => {
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		const identifiant = req.body.identifiant
		const email = req.body.email ? req.body.email.toLowerCase() : ''
		const nouveauMotDePasse = req.body.motdepasse
		try {
			if (identifiant !== '') {
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
				if (utilisateurExiste !== 1) return res.status(400).send('identifiant_non_valide')
				const hash = await bcrypt.hash(nouveauMotDePasse, 10)
				await db.HSET('utilisateurs:' + identifiant, 'motdepasse', hash)
				return res.status(200).send('motdepasse_modifie')
			}
			if (email !== '') {
				const clesUtilisateurs = []
				for await (const cle of db.scanIterator({ MATCH: 'utilisateurs:*', COUNT: 100 })) {
					clesUtilisateurs.push(...cle)
				}
				if (clesUtilisateurs.length === 0) return res.status(400).send('email_non_valide')
				const utilisateurs = clesUtilisateurs.map(cle => cle.substring(13))
				// Récupération parallèle des emails pour chaque utilisateur
				const promessesEmails = utilisateurs.map(async (id) => {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + id)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (donneesUtilisateur.hasOwnProperty('email')) {
						return { id: id, email: donneesUtilisateur.email.toLowerCase() }
					}
					return null
				})
				const listeEmails = await Promise.all(promessesEmails)
				// Recherche de l'utilisateur correspondant à l'email
				const utilisateurEmail = listeEmails.find(user => user && user.email === email)
				if (utilisateurEmail) {
					const hash = await bcrypt.hash(nouveauMotDePasse, 10)
					await db.HSET('utilisateurs:' + utilisateurEmail.id, 'motdepasse', hash)
					return res.status(200).send(utilisateurEmail.id)
				} else {
					return res.status(400).send('email_non_valide')
				}
			}
			return res.status(500).send('erreur')
		} catch (err) {
			console.error(err.stack)
			return res.status(500).send('erreur')
		}
	})

	app.post('/api/recuperer-donnees-pad-admin', limiteAuthAdmin, async (req, res) => {
		const pad = req.body.padId
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		try {
			let donneesPad = {}
			const padExiste = await db.EXISTS('pads:' + pad)
			if (padExiste === 1) {
				donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
			} else if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
				donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
				if (typeof donneesPad !== 'object' || !donneesPad) return res.status(500).send('erreur')
			} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
			res.status(200).json(donneesPad)
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/modifier-donnees-pad-admin', limiteAuthAdmin, async (req, res) => {
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		try {
			const pad = req.body.padId
			const champ = req.body.champ
			const valeur = req.body.valeur
			const champsAutorises = ['code', 'motdepasse']
			if (!champsAutorises.includes(champ)) return res.status(500).send('erreur')
			const padExiste = await db.EXISTS('pads:' + pad)
			if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
				await recupererDonneesPadJSON(pad)
			} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
			if (champ === 'motdepasse') {
				const hash = await bcrypt.hash(valeur, 10)
				await db.HSET('pads:' + pad, champ, hash)
			} else {
				await db.HSET('pads:' + pad, champ, valeur)
			}
			res.status(200).send('donnees_modifiees')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/rattacher-pad', limiteAuthAdmin, async (req, res) => {
		const pad = req.body.padId
		const identifiant = req.body.identifiant
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		try {
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
			if (utilisateurExiste !== 1) return res.status(500).send('erreur')
			let donneesPad = {}
			const padExiste = await db.EXISTS('pads:' + pad)
			if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
				donneesPad = await recupererDonneesPadJSON(pad)
			} else if (padExiste === 1) {
				donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
			} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
			if (donneesPad.hasOwnProperty('motdepasse')) {
				await db.multi()
					.SADD('pads-crees:' + identifiant, pad.toString())
					.SADD('utilisateurs-pads:' + pad, identifiant)
					.HSET('pads:' + pad, 'identifiant', identifiant)
					.HDEL('pads:' + pad, 'motdepasse')
					.SREM('pads-rejoints:' + identifiant, pad.toString())
					.SREM('pads-utilisateurs:' + identifiant, pad.toString())
					.exec()
				res.status(200).send('pad_transfere')
			} else {
				res.status(200).send('pad_cree_avec_compte')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/transferer-pad', limiteAuthAdmin, async (req, res) => {
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const pad = req.body.padId
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		try {
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
			if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
			if (utilisateurExiste !== 1) return res.status(500).send('erreur')
			let donneesPad = {}
			const padExiste = await db.EXISTS('pads:' + pad)
			if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
				donneesPad = await recupererDonneesPadJSON(pad)
			} else if (padExiste === 1) {
				donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
			} else if (padExiste === 0) return res.status(404).send('pad_inexistant')
			if (!donneesPad.hasOwnProperty('identifiant')) return res.status(500).send('erreur')
			const identifiant = donneesPad.identifiant
			await db.multi()
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
			res.status(200).send('pad_transfere')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/transferer-compte', limiteAuthAdmin, async (req, res) => {
		const identifiant = req.body.identifiant
		const nouvelIdentifiant = req.body.nouvelIdentifiant
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		try {
			const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
			if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
			if (utilisateurExiste !== 1) return res.status(500).send('erreur')
			const nouvelUtilisateurExiste = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
			if (nouvelUtilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
			if (nouvelUtilisateurExiste !== 1) return res.status(500).send('erreur')
			const pads = await db.SMEMBERS('pads-crees:' + identifiant)
			if (!pads) return res.status(500).send('erreur')
			const promessesPads = pads.map(async (pad) => {
				const padExiste = await db.EXISTS('pads:' + pad)
				if (!padExiste) return { statut: 'inexistant', pad }
				try {
					if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
						await recupererDonneesPadJSON(pad)
					}
					await db.multi()
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
					return { statut: 'transfere', pad }
				} catch {
					return { statut: 'erreur', pad }
				}
			})
			await Promise.all(promessesPads)
			res.status(200).send('compte_transfere')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/supprimer-compte', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || admin)) return res.status(403).send('non_autorise')
		try {
			let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
			donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
			if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
			if (!admin) {
				const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
				if (!motdepasseCorrect) return res.status(403).send('non_autorise')
			}
			const email = donneesUtilisateur.hasOwnProperty('email') ? donneesUtilisateur.email.toLowerCase() : ''
			// Suppression des pads créés
			const listePadsCrees = await db.SMEMBERS('pads-crees:' + identifiant)
			if (listePadsCrees === null) return res.status(500).send('erreur')
			// Traitement parallèle de la suppression de chaque pad créé
			const padsSupprimes = listePadsCrees.map(async (pad) => {
				const padExiste = await db.EXISTS('pads:' + pad)
				if (padExiste === 1) {
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs && blocs.length > 0) {
						const pipelineBlocs = db.multi()
						for (const blocId of blocs) {
							pipelineBlocs
								.UNLINK('commentaires:' + blocId)
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
						.exec()
				} else if (padExiste === 0 && isNaN(parseInt(pad, 10)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					await Promise.all([
						fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json')),
						fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					])
				} else {
					return
				}
				const utilisateursPad = await db.SMEMBERS('utilisateurs-pads:' + pad)
				if (utilisateursPad && utilisateursPad.length > 0) {
					const pipelineUtilisateurs = db.multi()
					for (const utilisateurId of utilisateursPad) {
						pipelineUtilisateurs
							.SREM('pads-rejoints:' + utilisateurId, pad.toString())
							.SREM('pads-utilisateurs:' + utilisateurId, pad.toString())
							.SREM('pads-admins:' + utilisateurId, pad.toString())
							.SREM('pads-favoris:' + utilisateurId, pad.toString())
					}
					await pipelineUtilisateurs.exec()
				}
				await db.UNLINK('utilisateurs-pads:' + pad)
				// Suppression des fichiers
				if (stockage === 'fs') {
					await fs.remove(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))
				} else if (stockage === 's3') {
					try {
						const listeObjets = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
						if (listeObjets && listeObjets.hasOwnProperty('Contents') && Array.isArray(listeObjets.Contents)) {
							await Promise.all(listeObjets.Contents.map(objet => s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key)))))
						}
					} catch {}
				}
			})
			await Promise.all(padsSupprimes)
			// Nettoyage des contributions dans les pads rejoints
			const listePadsRejoints = await db.SMEMBERS('pads-utilisateurs:' + identifiant)
			if (listePadsRejoints && listePadsRejoints.length > 0) {
				const padsRejoints = listePadsRejoints.map(async (pad) => {
					const padExiste = await db.EXISTS('pads:' + pad)
					if (padExiste !== 1) return
					const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
					if (blocs === null) return
					for (const blocId of blocs) {
						let bloc = await db.HGETALL('pad-' + pad + ':' + blocId)
						bloc = bloc ? { ...bloc } : {}
						if (bloc.hasOwnProperty('identifiant') && bloc.identifiant === identifiant) {
							if (bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
								await supprimerFichier(pad, bloc.media)
							}
							if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
								await supprimerFichier(pad, path.basename(bloc.vignette))
							}
							await db.multi()
								.UNLINK('pad-' + pad + ':' + blocId)
								.ZREM('blocs:' + pad, blocId)
								.UNLINK('commentaires:' + blocId)
								.UNLINK('evaluations:' + blocId)
								.exec()
						}
					}
					const entreesActivite = await db.ZRANGE('activite:' + pad, 0, -1)
					if (entreesActivite) {
						for (const entreeStr of entreesActivite) {
							const entree = parseJSON(entreeStr, null)
							if (!entree) continue
							if (entree.identifiant === identifiant) {
								await db.ZREMRANGEBYSCORE('activite:' + pad, entree.id, entree.id)
							}
						}
					}
					for (const blocId of blocs) {
						const commentaires = await db.ZRANGE('commentaires:' + blocId, 0, -1)
						if (commentaires) {
							for (const commentaireStr of commentaires) {
								const commentaire = parseJSON(commentaireStr, null)
								if (!commentaire) continue
								if (commentaire.identifiant === identifiant) {
									await db.ZREMRANGEBYSCORE('commentaires:' + blocId, commentaire.id, commentaire.id)
								}
							}
						}
						const evaluations = await db.ZRANGE('evaluations:' + blocId, 0, -1)
						if (evaluations) {
							for (const evaluationStr of evaluations) {
								const evaluation = parseJSON(evaluationStr, null)
								if (!evaluation) continue
								if (evaluation.identifiant === identifiant) {
									await db.ZREMRANGEBYSCORE('evaluations:' + blocId, evaluation.id, evaluation.id)
								}
							}
						}
					}
				})
				await Promise.all(padsRejoints)
			}
			const pipelineFinal = db.multi()
				.UNLINK('pads-crees:' + identifiant)
				.UNLINK('pads-supprimes:' + identifiant)
				.UNLINK('pads-rejoints:' + identifiant)
				.UNLINK('pads-favoris:' + identifiant)
				.UNLINK('pads-admins:' + identifiant)
				.UNLINK('pads-utilisateurs:' + identifiant)
				.UNLINK('utilisateurs:' + identifiant)
				.UNLINK('noms:' + identifiant)
			if (email !== '') {
				pipelineFinal.UNLINK('emails:' + email)
			}
			await pipelineFinal.exec()
			// Gestion des sessions actives
			if (!admin) {
				supprimerSession(req)
				res.status(200).send('compte_supprime')
			} else {
				// Si supprimé par admin, destruction des sessions actives
				try {
					const listeSessions = []
					for await (const cle of db.scanIterator({ MATCH: 'sessions:*', COUNT: 100 })) {
						listeSessions.push(...cle)
					}
					if (listeSessions.length > 0) {
						const promessesSessions = listeSessions.map(async (session) => {
							const sessionId = session.substring(9)
							const donneesSessionStr = await db.GET('sessions:' + sessionId)
							if (donneesSessionStr) {
								const donneesSession = JSON.parse(donneesSessionStr)
								if (donneesSession.hasOwnProperty('identifiant') && donneesSession.identifiant === identifiant) {
									await db.UNLINK('sessions:' + sessionId)
								}
							}
						})
						await Promise.all(promessesSessions)
					}
				} catch {}
				res.status(200).send('compte_supprime')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/verifier-identifiant', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
			let langue = 'fr'
			if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant)
				res.status(200).json({ message: 'motdepasse_correct', identifiant, nom, langue, pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite.reverse() })
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).json({ message: 'erreur' })
		}
	})

	app.post('/api/verifier-code-acces', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const pad = req.body.pad
			const identifiant = req.body.identifiant
			const code = req.body.code
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('code')) return res.status(500).send('erreur')
			const codeBuffer = Buffer.from(String(code))
			const codeBufferDb = Buffer.from(String(donneesPad.code))
			if (codeBuffer.length !== codeBufferDb.length || !timingSafeEqual(codeBuffer, codeBufferDb)) {
				return res.status(401).send('code_incorrect')
			}
			const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant)
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
			res.status(200).json({ message: 'code_correct', pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite.reverse() })
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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
		if (maintenance === true) return res.redirect(302, '/maintenance')
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

	app.post('/api/televerser-fichier', (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const buffers = []
		let nomFichier
		let mimetype
		let erreurBusboy = false
		let fichierTropVolumineux = false
		const busboy = Busboy({ headers: req.headers, limits: { fileSize: limiteTeleversement } })
		busboy.on('file', (champ, fichier, meta) => {
			mimetype = meta.mimeType
			nomFichier = definirNomFichier(meta.filename)
			fichier.on('data', (donnees) => {
				buffers.push(donnees)
			})
			fichier.on('limit', () => {
				fichierTropVolumineux = true
			})
		})
		busboy.on('error', (err) => {
			erreurBusboy = true
			console.error(err.stack)
			res.status(500).send('erreur_televersement')
		})
		busboy.on('finish', async () => {
			if (erreurBusboy) return
			if (fichierTropVolumineux) return res.status(413).send('fichier_trop_volumineux')
			const bufferFichier = Buffer.concat(buffers)
			if (!bufferFichier || !nomFichier|| !mimetype) return res.status(422).send('erreur_televersement')
			if (!verifierContenuFichier(bufferFichier, mimetype)) return res.status(422).send('erreur_televersement')
			try {
				let fichierFinal = { buffer: bufferFichier, nom: nomFichier }
				let vignetteGeneree = false
				let mimetypeRetour = mimetype
				let fichierVignette = null // { buffer, nom }
				const extensionFichier = path.parse(nomFichier).ext.toLowerCase()
				// Traitement des Images
				if (mimetype.split('/')[0] === 'image') {
					if (extensionFichier === '.jpg' || extensionFichier === '.jpeg') {
						try {
							const bufferOptimise = await sharp(bufferFichier, { failOnError: false })
								.withMetadata()
								.rotate()
								.jpeg({
									quality: 90,
									progressive: true
								})
								.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
								.toBuffer()
							if (bufferOptimise) {
								fichierFinal.buffer = bufferOptimise
							}
						} catch {}
					} else if (extensionFichier !== '.gif') {
						try {
							const bufferOptimise = await sharp(bufferFichier, { failOnError: false })
								.withMetadata()
								.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
								.toBuffer()
							if (bufferOptimise) {
								fichierFinal.buffer = bufferOptimise
							}
						} catch {}
					}
				} 
				// Traitement des PDF (génération vignette)
				else if (mimetype === 'application/pdf') {
					mimetypeRetour = 'pdf'
					try {
						const bufferVignette = await new Promise((resolve, reject) => {
							gm(bufferFichier)
								.selectFrame(0)
								.setFormat('jpg')
								.resize(450)
								.quality(80)
								.toBuffer((err, buffer) => {
									if (err) reject(err)
									else resolve(buffer)
								})
						})
						fichierVignette = {
							buffer: bufferVignette,
							nom: path.parse(nomFichier).name + '.jpg'
						}
						vignetteGeneree = true
					} catch {
						vignetteGeneree = false
					}
				}
				// Traitement des documents LibreOffice (ODT/ODP/ODS -> PDF -> Vignette)
				else if (mimetype.includes('vnd.oasis.opendocument')) {
					mimetypeRetour = 'document'
					let pdfBuffer
					try {
						pdfBuffer = await libre.convertAsync(bufferFichier, '.pdf', undefined)
					} catch {
						pdfBuffer = null
					}
					if (pdfBuffer) {
						try {
							const bufferVignette = await new Promise((resolve, reject) => {
								gm(pdfBuffer)
									.selectFrame(0)
									.setFormat('jpg')
									.resize(450)
									.quality(80)
									.toBuffer((err, buffer) => {
										if (err) reject(err)
										else resolve(buffer)
									})
							})
							fichierVignette = {
								buffer: bufferVignette,
								nom: path.parse(nomFichier).name + '.jpg'
							}
							vignetteGeneree = true
						} catch {
							vignetteGeneree = false
						}
					}
				} 
				// Traitement des Documents Office (DOC/XLS/PPT -> PDF -> Vignette)
				else if (mimetype.includes('msword') || mimetype.includes('ms-powerpoint') || mimetype.includes('ms-excel') || mimetype.includes('officedocument')) {
					mimetypeRetour = 'office'
					let pdfBuffer
					try {
						pdfBuffer = await libre.convertAsync(bufferFichier, '.pdf', undefined)
					} catch {
						pdfBuffer = null
					}
					if (pdfBuffer) {
						try {
							const bufferVignette = await new Promise((resolve, reject) => {
								gm(pdfBuffer)
									.selectFrame(0)
									.setFormat('jpg')
									.resize(450)
									.quality(80)
									.toBuffer((err, buffer) => {
										if (err) reject(err)
										else resolve(buffer)
									})
							})
							fichierVignette = {
								buffer: bufferVignette,
								nom: path.parse(nomFichier).name + '.jpg'
							}
							vignetteGeneree = true
						} catch {
							vignetteGeneree = false
						}
					}
				}
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + fichierFinal.nom, fichierFinal.buffer)))
					if (fichierVignette) {
						await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + fichierVignette.nom, fichierVignette.buffer)))
					}
					res.status(200).json({ fichier: fichierFinal.nom, mimetype: mimetypeRetour, vignetteGeneree })
				} else if (stockage === 'fs') {
					const cheminFichier = path.join(__dirname, '..', '/static/temp/' + fichierFinal.nom)
					const espaceDisque = await checkDiskSpace(path.join(__dirname, '..', '/static/temp'))
					const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
					if (pourcentageLibre < minimumEspaceDisque) return res.status(507).send('erreur_espace_disque')
					await fs.writeFile(cheminFichier, fichierFinal.buffer)
					if (fichierVignette) {
						const cheminVignette = path.join(__dirname, '..', '/static/temp/' + fichierVignette.nom)
						await fs.writeFile(cheminVignette, fichierVignette.buffer)
					}
					res.status(200).json({ fichier: fichierFinal.nom, mimetype: mimetypeRetour, vignetteGeneree })
				}
			} catch (err) {
				console.error(err.stack)
				res.status(422).send('erreur_televersement')
			}
		})
		req.pipe(busboy)
	})

	app.post('/api/televerser-audio', (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const buffersAudio = []
		let nomFichier
		const donneesFormulaire = new Map()
		let erreurBusboy = false
		let fichierTropVolumineux = false
		const busboy = Busboy({ headers: req.headers, limits: { fileSize: limiteTeleversement } })
		busboy.on('field', (champ, valeur) => {
			donneesFormulaire.set(champ, valeur)
		})
		busboy.on('file', (champ, fichier, meta) => {
			nomFichier = definirNomFichier(meta.filename)
			fichier.on('data', (donnees) => {
				buffersAudio.push(donnees)
			})
			fichier.on('limit', () => {
				fichierTropVolumineux = true
			})
		})
		busboy.on('error', (err) => {
			erreurBusboy = true
			console.error(err.stack)
			res.status(500).send('erreur_televersement')
		})
		busboy.on('finish', async () => {
			if (erreurBusboy) return
			if (fichierTropVolumineux) return res.status(413).send('fichier_trop_volumineux')
			const bufferAudio = Buffer.concat(buffersAudio)
			if (!bufferAudio || !nomFichier) return res.status(422).send('erreur_televersement')
			const padId = donneesFormulaire.get('pad')
			try {
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3(padId + '/' + nomFichier, bufferAudio)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padId + '/' + nomFichier)
					const espaceDisque = await checkDiskSpace(path.join(__dirname, '..', '/static' + definirCheminFichiers()))
					const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
					if (pourcentageLibre < minimumEspaceDisque) return res.status(507).send('erreur_espace_disque')
					await fs.ensureDir(path.dirname(cheminFichier))
					await fs.writeFile(cheminFichier, bufferAudio)
					res.status(200).send(nomFichier)
				}
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur_televersement')
			}
		})
		req.pipe(busboy)
	})

	app.post('/api/televerser-vignette', (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const buffersImage = []
		let nomFichier
		let mimetypeVignette
		let erreurBusboy = false
		let fichierTropVolumineux = false
		const busboy = Busboy({ headers: req.headers, limits: { fileSize: 3 * 1024 * 1024 } })
		busboy.on('file', (champ, fichier, meta) => {
			mimetypeVignette = meta.mimeType
			nomFichier = definirNomFichier(meta.filename)
			fichier.on('data', (donnees) => {
				buffersImage.push(donnees)
			})
			fichier.on('limit', () => {
				fichierTropVolumineux = true
			})
		})
		busboy.on('error', (err) => {
			erreurBusboy = true
			console.error(err.stack)
			res.status(500).send('erreur_televersement')
		})
		busboy.on('finish', async () => {
			if (erreurBusboy) return
			if (fichierTropVolumineux) return res.status(413).send('fichier_trop_volumineux')
			const bufferImage = Buffer.concat(buffersImage)
			if (!bufferImage || !nomFichier) return res.status(422).send('erreur_televersement')
			if (!verifierContenuFichier(bufferImage, mimetypeVignette)) return res.status(422).send('erreur_televersement')
			const extensionFichier = path.parse(nomFichier).ext.toLowerCase()
			let bufferOptimise = null
			try {
				if (extensionFichier === '.jpg' || extensionFichier === '.jpeg') {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.withMetadata()
						.rotate()
						.jpeg({
							quality: 90,
							progressive: true
						})
						.resize(400, 400, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				} else {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.withMetadata()
						.resize(400, 400, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				}
				if (!bufferOptimise) return res.status(422).send('erreur_televersement')
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + nomFichier, bufferOptimise)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static/temp/' + nomFichier)
					const espaceDisque = await checkDiskSpace(path.join(__dirname, '..', '/static/temp'))
					const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
					if (pourcentageLibre < minimumEspaceDisque) return res.status(507).send('erreur_espace_disque')
					await fs.writeFile(cheminFichier, bufferOptimise)
					res.status(200).send(nomFichier)
				}
			} catch (err) {
				console.error(err.stack)
				res.status(422).send('erreur_televersement')
			}
		})
		req.pipe(busboy)
	})

	app.post('/api/televerser-fond', (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const buffersImage = []
		let nomFichier
		let mimetypeFond
		const donneesFormulaire = new Map()
		let erreurBusboy = false
		let fichierTropVolumineux = false
		const busboy = Busboy({ headers: req.headers, limits: { fileSize: 3 * 1024 * 1024 } })
		busboy.on('field', (champ, valeur) => {
			donneesFormulaire.set(champ, valeur)
		})
		busboy.on('file', (champ, fichier, meta) => {
			mimetypeFond = meta.mimeType
			nomFichier = definirNomFichier(meta.filename)
			fichier.on('data', (donnees) => {
				buffersImage.push(donnees)
			})
			fichier.on('limit', () => {
				fichierTropVolumineux = true
			})
		})
		busboy.on('error', (err) => {
			erreurBusboy = true
			console.error(err.stack)
			res.status(500).send('erreur_televersement')
		})
		busboy.on('finish', async () => {
			if (erreurBusboy) return
			if (fichierTropVolumineux) return res.status(413).send('fichier_trop_volumineux')
			const bufferImage = Buffer.concat(buffersImage)
			if (!bufferImage || !nomFichier) return res.status(422).send('erreur_televersement')
			if (!verifierContenuFichier(bufferImage, mimetypeFond)) return res.status(422).send('erreur_televersement')
			const padId = donneesFormulaire.get('pad')
			const extensionFichier = path.parse(nomFichier).ext.toLowerCase()
			let bufferOptimise = null
			try {
				if (extensionFichier === '.jpg' || extensionFichier === '.jpeg') {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.withMetadata()
						.rotate()
						.jpeg({
							quality: 90,
							progressive: true
						})
						.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				} else {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.withMetadata()
						.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				}
				if (!bufferOptimise) return res.status(422).send('erreur_televersement')
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3(padId + '/' + nomFichier, bufferOptimise)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padId + '/' + nomFichier)
					const espaceDisque = await checkDiskSpace(path.join(__dirname, '..', '/static' + definirCheminFichiers()))
					const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
					if (pourcentageLibre < minimumEspaceDisque) return res.status(507).send('erreur_espace_disque')
					await fs.ensureDir(path.dirname(cheminFichier))
					await fs.writeFile(cheminFichier, bufferOptimise)
					res.status(200).send(nomFichier)
				}
			} catch (err) {
				console.error(err.stack)
				res.status(422).send('erreur_televersement')
			}
		})
		req.pipe(busboy)
	})

	app.post('/api/recuperer-icone', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(500).send('erreur')
		let favicon = ''
		const domaine = req.body.domaine
		const protocole = req.body.protocole
		if (!['http:', 'https:'].includes(protocole)) return res.status(500).send('erreur')
		if (!domaine || typeof domaine !== 'string' || domaine.trim() === '') return res.status(500).send('erreur')
		const hoteIcone = domaine.toLowerCase()
		if (verifierHoteBloque(hoteIcone)) return res.status(500).send('erreur')
		try {
			const reponse = await axios.get(protocole + '//' + domaine, {
				responseType: 'document',
				timeout: 5000,
				maxContentLength: 2 * 1024 * 1024
			})
			if (reponse && reponse.hasOwnProperty('data')) {
				const $ = cheerio.load(reponse.data)
				const recupererTaille = (el) => {
					return (el.attribs.sizes && parseInt(el.attribs.sizes, 10)) || 0
				}
				let favicons = [
					...$('meta[property="og:image"]')
				]
				if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs') && typeof favicons[0].attribs.content === 'string') {
					favicon = favicons[0].attribs.content
				} else {
					favicons = [
						...$('link[rel="shortcut icon"], link[rel="icon"], link[rel="apple-touch-icon"]')
					].sort((a, b) => {
						return recupererTaille(b) - recupererTaille(a)
					})
					if (favicons.length > 0 && favicons[0].hasOwnProperty('attribs') && typeof favicons[0].attribs.href === 'string') {
						favicon = favicons[0].attribs.href
					}
				}
				if (favicon !== '' && verifierURL(favicon, ['https', 'http']) === true) {
					res.status(200).send(favicon)
				} else if (favicon !== '' && favicon.substring(0, 2) === './') {
					res.status(200).send(protocole + '//' + domaine + favicon.substring(1))
				} else if (favicon !== '' && favicon.substring(0, 1) === '/') {
					res.status(200).send(protocole + '//' + domaine + favicon)
				} else if (favicon !== '') {
					res.status(200).send(protocole + '//' + domaine + '/' + favicon)
				} else {
					res.status(200).send(favicon)
				}
			} else {
				res.status(200).send(favicon)
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/supprimer-etherpad', async (req, res) => {
		if (maintenance === true) return res.redirect(302, '/maintenance')
		try {
			const padID = req.body.padID
			const pad = req.body.pad
			const token = req.body.token
			const identifiant = req.session.identifiant
			if (!padID || typeof padID !== 'string' || !/^[\w-]+$/.test(padID)) return res.status(500).send('erreur')
			if (!identifiant || !pad || !token) return res.status(401).send('non_connecte')
			if (padID.indexOf('pad-' + pad + '-') !== 0) return res.status(403).send('non_autorise')
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!donneesPad.hasOwnProperty('token') || donneesPad.token !== token) return res.status(403).send('non_autorise')
			const admin = await verifierAdmin(pad, donneesPad, req.session)
			if (donneesPad.contributions === 'fermees' && !admin) return res.status(403).send('non_autorise')
			if (etherpad && etherpad !== '' && etherpadApi && etherpadApi !== '') {
				await axios.get(etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + padID, { timeout: 5000 })
			}
			res.status(200).send('etherpad_supprime')
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

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
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				if (stockage === 'fs') {
					const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
					const espaceDisque = await checkDiskSpace(dossier)
					const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
					if (pourcentageLibre < minimumEspaceDisque) return res.status(500).send('erreur')
				}
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
				const champsPad = ['id', padId, 'token', token, 'titre', 'Copie de ' + donneesPad.titre, 'identifiant', identifiant, 'fond', donneesPad.fond, 'acces', donneesPad.acces, 'contributions', donneesPad.contributions, 'affichage', donneesPad.affichage, 'registreActivite', donneesPad.registreActivite || 'active', 'conversation', donneesPad.conversation || 'desactivee', 'listeUtilisateurs', donneesPad.listeUtilisateurs || 'activee', 'editionNom', donneesPad.editionNom || 'desactivee', 'fichiers', donneesPad.fichiers, 'enregistrements', donneesPad.enregistrements || 'desactives', 'liens', donneesPad.liens, 'documents', donneesPad.documents, 'commentaires', donneesPad.commentaires, 'evaluations', donneesPad.evaluations, 'copieBloc', donneesPad.copieBloc || 'desactivee', 'ordre', donneesPad.ordre || 'croissant', 'largeur', donneesPad.largeur || 'normale', 'date', date, 'colonnes', donneesPad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donneesPad.bloc, 'activite', 0, 'vues', 0, 'digidrive', 1]
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
				const blocsTraites = await Promise.all(blocsSource.map(async (blocId, index) => {
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
					if (blocSource.hasOwnProperty('iframe') && blocSource.iframe.includes(etherpad)) {
						const etherpadId = blocSource.iframe.replace(etherpad + '/p/', '')
						const destinationId = 'pad-' + padId + '-' + randomBytes(8).toString('hex')
						const urlCopie = etherpad + '/api/1.2.14/copyPad?apikey=' + etherpadApi + '&sourceID=' + etherpadId + '&destinationID=' + destinationId
						const copieEtherpadReussie = await axios.get(urlCopie, { timeout: 5000 }).then(() => true).catch(() => false)
						if (copieEtherpadReussie) {
							iframe = etherpad + '/p/' + destinationId
							media = etherpad + '/p/' + destinationId
						}
					}
					const champsBloc = ['id', blocSource.id, 'bloc', nouveauBlocId, 'titre', blocSource.titre, 'texte', blocSource.texte, 'media', media, 'iframe', iframe, 'type', blocSource.type, 'source', blocSource.source, 'vignette', vignette, 'date', date, 'identifiant', blocSource.identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', blocSource.colonne, 'visibilite', blocSource.visibilite]
					return { index, nouveauBlocId, champsBloc }
				}))
				const pipelineBlocs = db.multi()
				for (const bloc of blocsTraites.filter(Boolean)) {
					pipelineBlocs.HSET('pad-' + padId + ':' + bloc.nouveauBlocId, bloc.champsBloc)
					pipelineBlocs.ZADD('blocs:' + padId, { score: bloc.index, value: bloc.nouveauBlocId })
				}
				await pipelineBlocs.exec()
				// Copie des fichiers
				if (stockage === 'fs') {
					const dossierSource = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padSource)
					const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + padId)
					if (await fs.pathExists(dossierSource)) {
						await fs.copy(dossierSource, dossierDestination)
					}
				} else if (stockage === 's3') {
					const listeObjets = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: padSource + '/' }))
					if (listeObjets && listeObjets.hasOwnProperty('Contents') && Array.isArray(listeObjets.Contents)) {
						const promessesCopieS3 = listeObjets.Contents.map(objet => {
							const nouvelleCle = objet.Key.replace(padSource + '/', padId + '/')
							return s3Client.send(new CopyObjectCommand(definirParametresCopierS3(nouvelleCle, '/' + bucket + '/' + objet.Key)))
						})
						await Promise.all(promessesCopieS3)
					}
				}
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
				let langue = 'fr'
				if (req.session.hasOwnProperty('langue') && req.session.langue !== '' && req.session.langue !== undefined) {
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
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				// Vérification espace disque
				const espaceDisque = await checkDiskSpace(dossier)
				const pourcentageLibre = Math.round((espaceDisque.free / espaceDisque.size) * 100)
				if (stockage === 'fs' && pourcentageLibre < minimumEspaceDisque) {
					await supprimerArchives(source, dossierTemporaire)
					return res.status(500).send('erreur')
				}
				const dossierDestination = path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id)
				if (stockage === 'fs') {
					await fs.mkdirp(dossierDestination)
				}
				// Traitement parallèle des blocs
				const promessesBlocs = donnees.blocs.map(async (bloc, indexBloc) => {
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
						.HSET('pad-' + id + ':' + blocId, ['id', bloc.id, 'bloc', blocId, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', vignette, 'date', date, 'identifiant', bloc.identifiant, 'commentaires', commentaires, 'evaluations', evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite])
						.ZADD('blocs:' + id, [{ score: indexBloc, value: blocId }])
						.exec()
					// Gestion des commentaires
					if (parametres.commentaires === true && Array.isArray(bloc.listeCommentaires)) {
						for (const commentaire of bloc.listeCommentaires) {
							if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
								await db.ZADD('commentaires:' + blocId, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
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
						await televerserFichierArchive(dossierTemporaire, dossierDestination, bloc.media, id)
					}
					if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette)) {
						await televerserFichierArchive(dossierTemporaire, dossierDestination, vignette, id)
					}
					return { bloc: bloc.bloc, blocId: blocId }
				})
				const blocs = await Promise.all(promessesBlocs)
				const token = Math.random().toString(16).slice(2)
				const date = dayjs().format()
				const code = Math.floor(100000 + Math.random() * 900000)
				const affichageColonnes = donnees.pad.affichageColonnes ? JSON.parse(donnees.pad.affichageColonnes) : JSON.parse(donnees.pad.colonnes).map(() => true)
				const activiteId = parametres.activite === true ? donnees.pad.activite : 0
				const fond = donnees.pad.fond
				if (fond && !fond.includes('/img/') && fond.substring(0, 1) !== '#') {
					await televerserFichierArchive(dossierTemporaire, dossierDestination, path.basename(fond), id)
				}
				await db.multi()
					.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', fond, 'acces', donnees.pad.acces, 'code', code, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', donnees.pad.registreActivite ?? 'active', 'conversation', donnees.pad.conversation ?? 'desactivee', 'listeUtilisateurs', donnees.pad.listeUtilisateurs ?? 'activee', 'editionNom', donnees.pad.editionNom ?? 'desactivee', 'fichiers', donnees.pad.fichiers, 'enregistrements', donnees.pad.enregistrements ?? 'desactives', 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', donnees.pad.copieBloc ?? 'desactivee', 'ordre', donnees.pad.ordre ?? 'croissant', 'largeur', donnees.pad.largeur ?? 'normale', 'date', date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', JSON.stringify(affichageColonnes), 'bloc', donnees.pad.bloc, 'activite', activiteId, 'vues', 0, 'digidrive', 1])
					.HSET('utilisateurs:' + identifiant, ['id', identifiant, 'date', date, 'nom', nom, 'langue', langue])
					.SADD('pads-crees:' + identifiant, id.toString())
					.exec()

				// Gestion de l'activité
				if (parametres.activite && Array.isArray(donnees.activite)) {
					let activiteFiltree = donnees.activite
					if (!parametres.commentaires) {
						activiteFiltree = activiteFiltree.filter(el => el.type !== 'bloc-commente')
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

	app.use((req, res) => {
		if (maintenance === true) {
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

	const port = process.env.PORT || 3000
	httpServer.listen(port)

	const io = new Server(httpServer, {
		wsEngine: eiows.Server,
		cors: {
			origin: hoteWs
		},
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
			let etat = compteurSocket.get(identifiant)
			if (!etat) {
				etat = { n: 0, intervalle: setInterval(() => {
					const e = compteurSocket.get(identifiant)
					if (e) e.n = 0
				}, 1000) }
				compteurSocket.set(identifiant, etat)
			}
			etat.n++
			if (etat.n > 100) {
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
				const etat = compteurSocket.get(identifiant)
				if (etat) {
					clearInterval(etat.intervalle)
					compteurSocket.delete(identifiant)
				}
			}
		})
		next()
	})

	io.on('connection', (socket) => {
		const req = socket.request
		socket.use((__, next) => {
			req.session.reload((err) => {
				if (err) return socket.disconnect()
				next()
			})
		})

		socket.on('connexion', async (donnees) => {
			try {
				const pad = donnees.pad
				const identifiant = donnees.identifiant
				const nom = donnees.nom
				const room = 'pad-' + pad
				socket.join(room)
				socket.data.identifiant = identifiant
				socket.data.nom = nom
				const clients = await fetchSockets(room)
				const utilisateurs = []
				if (clients.length > 0) {
					for (let i = 0; i < clients.length; i++) {
						utilisateurs.push({ identifiant: clients[i].data.identifiant, nom: clients[i].data.nom })
					}
				}
				const utilisateursConnectes = utilisateurs.filter((v, i, a) => a.findIndex(t => (t.identifiant === v.identifiant)) === i)
				io.to(room).emit('connexion', utilisateursConnectes)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('sortie', (pad, identifiant) => {
			socket.leave('pad-' + pad)
			socket.to('pad-' + pad).emit('deconnexion', identifiant)
		})

		socket.on('disconnecting', () => {
			if (req.session.identifiant !== '') {
				socket.rooms.forEach((room) => {
					io.to(room).emit('deconnexion', req.session.identifiant)
				})
			}
		})

		socket.on('deconnexion', async (identifiant) => {
			if (req.session.hasOwnProperty('identifiant')) {
				req.session.identifiant = ''
				req.session.motdepasse = ''
				req.session.nom = ''
				req.session.email = ''
				req.session.langue = ''
				req.session.statut = ''
				await sauvegarderSession(req)
			}
			if (identifiant !== '') {
				socket.rooms.forEach((room) => {
					io.to(room).emit('deconnexion', req.session.identifiant)
				})
			}
		})

		socket.on('verifieracces', async (pad, identifiant, code) => {
			if (code === '') {
				if (!req.session.hasOwnProperty('acces')) {
					req.session.acces = []
				}
				req.session.acces.forEach((e) => {
					if (e.hasOwnProperty('pad') && parseInt(e.pad, 10) === parseInt(pad, 10)) {
						code = e.code
					}
				})
			}
			if (req.session.identifiant !== identifiant || code === '') return socket.emit('verifieracces', { acces: false })
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('code')) return socket.emit('erreur')
				if (code !== donneesPad.code) return socket.emit('verifieracces', { acces: false })
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant)
				socket.emit('verifieracces', { acces: true, pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite.reverse() })
			} catch (err) {
				console.error(err.stack)
				socket.emit('verifieracces', { acces: false })
			}
		})

		socket.on('ajouterbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof titre === 'string' && titre.length > limitesTailleInput.titre) return socket.emit('erreur')
			if (typeof texte === 'string' && texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			if (typeof iframe === 'string' && iframe.length > limitesTailleInput.iframe) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'bloc', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && (donneesPad.contributions !== 'fermees' || admin))
				if (!autorisation) return socket.emit('nonautorise')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + bloc)
				if (blocExiste === 1) return socket.emit('erreur')
				const blocId = parseInt(donneesPad.bloc, 10) + 1
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				let visibilite = 'visible'
				if (admin && privee === true) {
					visibilite = 'privee'
				} else if (!admin && donneesPad.contributions === 'moderees') {
					visibilite = 'masquee'
				}
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				if (vignettePersonnalisee) {
					vignette = path.basename(vignette)
				}
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, ['id', blocId, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: blocId, value: bloc }])
					.HSET('pads:' + pad, 'bloc', blocId)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				if (visibilite === 'visible' || visibilite === 'masquee') {
					await db.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
				}
				if (media !== '' && type !== 'embed' && type !== 'lien') {
					await televerserFichierTemp(media, pad)
				}
				if (vignettePersonnalisee) {
					await televerserFichierTemp(vignette, pad)
				}
				io.to('pad-' + pad).emit('ajouterbloc', { bloc, titre, texte, media, iframe, type, source, vignette, identifiant, nom, date, couleur, commentaires: 0, evaluations: [], colonne, visibilite, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, privee, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof titre === 'string' && titre.length > limitesTailleInput.titre) return socket.emit('erreur')
			if (typeof texte === 'string' && texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			if (typeof iframe === 'string' && iframe.length > limitesTailleInput.iframe) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'contributions', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (Object.keys(donneesBloc).length === 0) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				const autorisation = (donneesBloc.identifiant === identifiant || admin || donneesPad.contributions === 'modifiables')
				if (!autorisation) return socket.emit('nonautorise')
				let visibilite = donneesBloc.visibilite || 'visible'
				if (admin && privee === true) {
					visibilite = 'privee'
				}
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				const vignetteModifiee = (donneesBloc.hasOwnProperty('vignette') && path.basename(donneesBloc.vignette) !== path.basename(vignette))
				if (vignettePersonnalisee && vignetteModifiee) {
					vignette = path.basename(vignette)
				}
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				const statuts = ['visible', 'privee', 'masquee']
				if (statuts.includes(visibilite)) {
					// Ajout dans le registre d'activité uniquement si visible ou masquée
					if (visibilite === 'visible' || visibilite === 'masquee') {
						await db.multi()
							.HINCRBY('pads:' + pad, 'activite', 1)
							.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-modifie' }) }])
							.exec()
					}
					await db.multi()
						.HSET('pad-' + pad + ':' + bloc, ['titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'visibilite', visibilite, 'couleur', couleur, 'modifie', date])
						.HSET('dates-pads:' + pad, 'date', date)
						.exec()
				}
				const mediaModifie = (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== media)
				// Suppression de l'ancien media si modifié
				if (mediaModifie && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
					await supprimerFichier(pad, donneesBloc.media)
				}
				// Ajout du nouveau media si modifié
				if (mediaModifie && media !== '' && type !== 'embed' && type !== 'lien') {
					await televerserFichierTemp(media, pad)
				}
				const ancienneVignettePersonnalisee = (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true)
				if (vignetteModifiee && ancienneVignettePersonnalisee) {
					await supprimerFichier(pad, path.basename(donneesBloc.vignette))
				}
				if (vignettePersonnalisee && vignetteModifiee) {
					await televerserFichierTemp(vignette, pad)
				}
				io.to('pad-' + pad).emit('modifierbloc', { bloc, titre, texte, media, iframe, type, source, vignette, identifiant, nom, modifie: date, couleur, colonne, visibilite, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('copierbloc', async (bloc, pad, token, titre, texte, media, iframe, type, source, vignette, couleur, colonne, visibilite, identifiant, nom, padOrigine) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'identifiant', 'bloc', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				let listeAdmins = []
				if (donneesPad.hasOwnProperty('admins')) {
					listeAdmins = JSON.parse(donneesPad.admins)
				}
				const admin = (listeAdmins.includes(identifiant) || donneesPad.identifiant === identifiant)
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && admin)
				if (!autorisation) return socket.emit('nonautorise')
				const blocId = parseInt(donneesPad.bloc, 10) + 1
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const vignettePersonnalisee = (vignette && definirVignettePersonnalisee(vignette) === true)
				if (vignettePersonnalisee) {
					vignette = path.basename(vignette)
				}
				texte = assainirHTML(texte)
				iframe = assainirIframe(iframe)
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, ['id', blocId, 'bloc', bloc, 'titre', titre, 'texte', texte, 'media', media, 'iframe', iframe, 'type', type, 'source', source, 'vignette', vignette, 'date', date, 'identifiant', identifiant, 'commentaires', 0, 'evaluations', 0, 'colonne', colonne, 'visibilite', visibilite, 'couleur', couleur])
					.ZADD('blocs:' + pad, [{ score: blocId, value: bloc }])
					.HSET('pads:' + pad, 'bloc', blocId)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				// Ajout dans le registre d'activité
				if (visibilite === 'visible') {
					await db.multi()
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
				}
				if (media !== '' && type !== 'embed' && type !== 'lien') {
					await copierFichier(padOrigine, pad, media, 'media')
				}
				if (vignettePersonnalisee && vignette !== '') {
					await copierFichier(padOrigine, pad, vignette, 'vignette')
				}
				io.to('pad-' + pad).emit('ajouterbloc', { bloc, titre, texte, media, iframe, type, source, vignette, identifiant, nom, date, couleur, commentaires: 0, evaluations: [], colonne, visibilite, activiteId })
				socket.emit('copierbloc')
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('autoriserbloc', async (pad, token, item, indexBloc, indexBlocColonne, moderation, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token', 'activite']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				const autorisation = (donneesPad.id === pad && donneesPad.token === token && await verifierAdmin(pad, donneesPad, req.session) === true)
				if (!autorisation) return socket.emit('nonautorise')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + item.bloc)
				if (blocExiste !== 1) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				if (item.hasOwnProperty('modifie')) {
					await db.HDEL('pad-' + pad + ':' + item.bloc, 'modifie')
				}
				let nomUtilisateur
				if (moderation === 'privee') {
					await db.multi()
						.HSET('pad-' + pad + ':' + item.bloc, ['visibilite', 'visible', 'date', date])
						.HSET('dates-pads:' + pad, 'date', date)
					// Enregistrer entrée du registre d'activité
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: item.identifiant, titre: item.titre, date: date, type: 'bloc-ajoute' }) }])
						.exec()
					nomUtilisateur = item.nom
				} else {
					await db.multi()
						.HSET('pad-' + pad + ':' + item.bloc, 'visibilite', 'visible')
					// Enregistrer entrée du registre d'activité
						.HINCRBY('pads:' + pad, 'activite', 1)
						.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: item.bloc, identifiant: identifiant, titre: item.titre, date: date, type: 'bloc-valide' }) }])
						.exec()
					nomUtilisateur = nom
				}
				io.to('pad-' + pad).emit('autoriserbloc', { bloc: item.bloc, titre: item.titre, texte: assainirHTML(item.texte), media: item.media, iframe: assainirIframe(item.iframe), type: item.type, source: item.source, vignette: item.vignette, identifiant: item.identifiant, nom: nomUtilisateur, date, couleur: item.couleur, commentaires: 0, evaluations: [], colonne: item.colonne, visibilite: 'visible', activiteId, moderation, admin: identifiant, indexBloc, indexBlocColonne })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('deplacerbloc', async (items, pad, affichage, ordre, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (donneesPad.id !== pad || !admin) return socket.emit('nonautorise')
				let listeItems = [...items]
				if (ordre === 'decroissant') {
					listeItems.reverse()
				}
				let compteurErreurs = 0
				for (let i = 0; i < listeItems.length; i++) {
					const item = listeItems[i]
					const blocExiste = await db.EXISTS('pad-' + pad + ':' + item.bloc)
					if (blocExiste !== 1) {
						compteurErreurs++
						continue
					}
					await db.multi()
						.ZREM('blocs:' + pad, item.bloc)
						.ZADD('blocs:' + pad, [{ score: i + 1, value: item.bloc }])
						.exec()
					// Mise à jour de la colonne si l'affichage est en colonnes
					if (affichage === 'colonnes' && item.hasOwnProperty('colonne')) {
						await db.HSET('pad-' + pad + ':' + item.bloc, 'colonne', item.colonne)
					}
				}
				if (compteurErreurs === 0) {
					if (ordre === 'decroissant') {
						listeItems.reverse()
					}
					io.to('pad-' + pad).emit('deplacerbloc', { blocs: listeItems, identifiant })
				} else {
					socket.emit('erreur')
				}
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimerbloc', async (bloc, pad, token, titre, colonne, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const clesRequises = ['id', 'token']
				const padValide = clesRequises.every(champ => donneesPad.hasOwnProperty(champ))
				if (!padValide) return socket.emit('erreur')
				if (donneesPad.id !== pad || donneesPad.token !== token) return socket.emit('nonautorise')
				const blocExiste = await db.EXISTS('pad-' + pad + ':' + bloc)
				if (blocExiste !== 1) return socket.emit('erreur')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				const autorisation = (donneesBloc.identifiant === identifiant || await verifierAdmin(pad, donneesPad, req.session) === true)
				if (!autorisation) return socket.emit('nonautorise')
				if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== bloc) return socket.emit('erreur')
				if (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
					await supprimerFichier(pad, donneesBloc.media)
				}
				if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
					await supprimerFichier(pad, path.basename(donneesBloc.vignette))
				}
				let etherpadId, url
				if (donneesBloc.hasOwnProperty('iframe') && donneesBloc.iframe !== '' && donneesBloc.iframe.includes(etherpad)) {
					etherpadId = donneesBloc.iframe.replace(etherpad + '/p/', '')
					url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
					await axios.get(url, { timeout: 5000 }).catch(() => {})
				}
				if (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== '' && donneesBloc.media.includes(etherpad)) {
					etherpadId = donneesBloc.media.replace(etherpad + '/p/', '')
					url = etherpad + '/api/1/deletePad?apikey=' + etherpadApi + '&padID=' + etherpadId
					await axios.get(url, { timeout: 5000 }).catch(() => {})
				}
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.UNLINK('pad-' + pad + ':' + bloc)
					.ZREM('blocs:' + pad, bloc)
					.UNLINK('commentaires:' + bloc)
					.UNLINK('evaluations:' + bloc)
					.HSET('dates-pads:' + pad, 'date', date)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc: bloc, identifiant: identifiant, titre: titre, date: date, type: 'bloc-supprime' }) }])
					.exec()
				io.to('pad-' + pad).emit('supprimerbloc', { bloc, identifiant, nom, titre, date, colonne, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('commenterbloc', async (bloc, pad, titre, texte, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof texte !== 'string' || texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('commentaires')) return socket.emit('erreur')
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires === null) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				let commentaireId = parseInt(donneesBloc.commentaires, 10) + 1
				const listeCommentaires = []
				for (let commentaire of commentaires) {
					const commentaireJSON = parseJSON(commentaire, false)
					if (commentaireJSON === false) return
					listeCommentaires.push(commentaireJSON)
				}
				let maxCommentaireId = 0
				if (listeCommentaires.length > 0) {
					maxCommentaireId = listeCommentaires.reduce((p, c) => { return (p && p.id > c.id) ? p : c })
				}
				if (commentaireId === maxCommentaireId.id || commentaireId < maxCommentaireId.id) {
					commentaireId = maxCommentaireId.id + 1
				}
				texte = assainirHTML(texte)
				const commentaire = { id: commentaireId, identifiant, date, texte }
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, 'commentaires', commentaireId)
					.HSET('dates-pads:' + pad, 'date', date)
					.ZADD('commentaires:' + bloc, [{ score: commentaireId, value: JSON.stringify(commentaire) }])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc, identifiant, titre, date, type: 'bloc-commente' }) }])
					.exec()
				io.to('pad-' + pad).emit('commenterbloc', { id: commentaireId, bloc, identifiant, nom, texte, titre, date, commentaires: commentaires.length + 1, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercommentaire', async (bloc, pad, id, texte, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof texte !== 'string' || texte.length > limitesTailleInput.texte) return socket.emit('erreur')
			try {
				const commentaires = await db.ZRANGEBYSCORE('commentaires:' + bloc, id, id)
				if (commentaires === null) return socket.emit('erreur')
				const dateModification = dayjs().format()
				const commentairesJSON = parseJSON(commentaires[0], false)
				if (commentairesJSON === false) return socket.emit('erreur')
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (commentairesJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				texte = assainirHTML(texte)
				const commentaire = { id, identifiant: commentairesJSON.identifiant, date: commentairesJSON.date, modifie: dateModification, texte }
				await db.multi()
					.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
					.ZADD('commentaires:' + bloc, [{ score: id, value: JSON.stringify(commentaire) }])
					.HSET('dates-pads:' + pad, 'date', dateModification)
					.exec()
				io.to('pad-' + pad).emit('modifiercommentaire', id, texte)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimercommentaire', async (bloc, pad, id, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				const entrees = await db.ZRANGEBYSCORE('commentaires:' + bloc, id, id)
				const commentaireJSON = parseJSON(entrees[0], false)
				if (commentaireJSON === false) return socket.emit('erreur')
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (commentaireJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				await db.multi()
					.ZREMRANGEBYSCORE('commentaires:' + bloc, id, id)
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				const commentaires = await db.ZCARD('commentaires:' + bloc)
				if (commentaires === null) return socket.emit('erreur')
				io.to('pad-' + pad).emit('supprimercommentaire', id, bloc, commentaires)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('commentaires', async (bloc, type, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
				if (commentaires === null) return socket.emit('erreur')
				const promessesCommentaires = commentaires.map(async (comm) => {
					const commentaireJSON = parseJSON(comm, false)
					if (commentaireJSON === false) return null
					const commentaire = commentaireJSON
					commentaire.nom = await recupererNomUtilisateur(commentaire.identifiant)
					return commentaire
				})
				const listeCommentaires = (await Promise.all(promessesCommentaires)).filter(c => c !== null)
				socket.emit('commentaires', listeCommentaires, type)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('evaluerbloc', async (bloc, pad, titre, etoiles, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				let donneesBloc = await db.HGETALL('pad-' + pad + ':' + bloc)
				donneesBloc = donneesBloc ? { ...donneesBloc } : {}
				if (!donneesBloc.hasOwnProperty('evaluations')) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				const evaluationId = parseInt(donneesBloc.evaluations, 10) + 1
				const evaluation = { id: evaluationId, identifiant, date, etoiles }
				await db.multi()
					.HSET('pad-' + pad + ':' + bloc, 'evaluations', evaluationId)
					.ZADD('evaluations:' + bloc, [{ score: evaluationId, value: JSON.stringify(evaluation) }])
					.HSET('dates-pads:' + pad, 'date', date)
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, bloc, identifiant, titre, date, type: 'bloc-evalue' }) }])
					.exec()
				io.to('pad-' + pad).emit('evaluerbloc', { id: evaluationId, bloc, identifiant, nom, titre, date, evaluation, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierevaluation', async (bloc, pad, id, etoiles, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				const entrees = await db.ZRANGEBYSCORE('evaluations:' + bloc, id, id)
				const evaluationJSON = parseJSON(entrees[0], false)
				if (evaluationJSON === false) return socket.emit('erreur')
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (evaluationJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				const evaluation = { id, identifiant: evaluationJSON.identifiant, date, etoiles }
				await db.multi()
					.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
					.ZADD('evaluations:' + bloc, [{ score: id, value: JSON.stringify(evaluation) }])
					.HSET('dates-pads:' + pad, 'date', date)
					.exec()
				io.to('pad-' + pad).emit('modifierevaluation', id, bloc, date, etoiles)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimerevaluation', async (bloc, pad, id, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				const entrees = await db.ZRANGEBYSCORE('evaluations:' + bloc, id, id)
				const evaluationJSON = parseJSON(entrees[0], false)
				if (evaluationJSON === false) return socket.emit('erreur')
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (evaluationJSON.identifiant !== identifiant && !admin) return socket.emit('nonautorise')
				const date = dayjs().format()
				await db.multi()
					.HSET('dates-pads:' + pad, 'date', date)
					.ZREMRANGEBYSCORE('evaluations:' + bloc, id, id)
					.exec()
				io.to('pad-' + pad).emit('supprimerevaluation', id, bloc)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})


		socket.on('modifiernom', async (pad, nom, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof nom !== 'string' || nom.length > 100) return socket.emit('erreur')
			try {
				if (statut === 'invite') {
					await db.HSET('noms:' + identifiant, 'nom', nom)
					io.to('pad-' + pad).emit('modifiernom', nom, identifiant)
					req.session.nom = nom
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					await sauvegarderSession(req)
				} else if (statut === 'auteur') {
					await db.HSET('utilisateurs:' + identifiant, 'nom', nom)
					io.to('pad-' + pad).emit('modifiernom', nom, identifiant)
					req.session.nom = nom
					req.session.cookie.expires = new Date(Date.now() + dureeSession)
					await sauvegarderSession(req)
				}
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiertitre', async (pad, titre, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'titre', titre)
				io.to('pad-' + pad).emit('modifiertitre', titre, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercodeacces', async (pad, code, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'code', code)
				io.to('pad-' + pad).emit('modifiercodeacces', code, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieradmins', async (pad, admins, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				let listeAdmins = []
				if (donneesPad.hasOwnProperty('admins') && donneesPad.admins.substring(0, 1) === '"') { // fix bug update 0.9.0
					listeAdmins = JSON.parse(JSON.parse(donneesPad.admins))
				} else if (donneesPad.hasOwnProperty('admins')) {
					listeAdmins = JSON.parse(donneesPad.admins)
				}
				if (!listeAdmins.includes(identifiant) && donneesPad.identifiant !== identifiant) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'admins', JSON.stringify(admins))
				await Promise.all(admins.map(async (admin) => {
					if (!listeAdmins.includes(admin)) {
						await db.SADD('pads-admins:' + admin, pad.toString())
					}
				}))
				await Promise.all(listeAdmins.map(async (admin) => {
					if (!admins.includes(admin)) {
						await db.SREM('pads-admins:' + admin, pad.toString())
					}
				}))
				io.to('pad-' + pad).emit('modifieradmins', admins, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieracces', async (pad, acces, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				let code = ''
				if (donneesPad.hasOwnProperty('code') && donneesPad.code !== '') {
					code = donneesPad.code
				} else {
					code = Math.floor(100000 + Math.random() * 900000)
				}
				await db.HSET('pads:' + pad, ['acces', acces, 'code', code])
				io.to('pad-' + pad).emit('modifieracces', acces, code)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercontributions', async (pad, contributions, contributionsPrecedentes, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'contributions', contributions)
				io.to('pad-' + pad).emit('modifiercontributions', contributions, contributionsPrecedentes, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieraffichage', async (pad, affichage, titreColonne, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				
				let colonnes = null
				let affichageColonnes = null
				const colonnesExistantes = donneesPad.hasOwnProperty('colonnes') ? JSON.parse(donneesPad.colonnes) : []
				if (affichage === 'colonnes' && colonnesExistantes.length === 0) {
					colonnes = [titreColonne || '']
					affichageColonnes = [true]
					await db.HSET('pads:' + pad, ['affichage', affichage, 'colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
				} else {
					await db.HSET('pads:' + pad, 'affichage', affichage)
				}
				io.to('pad-' + pad).emit('modifieraffichage', affichage, colonnes, affichageColonnes, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierordre', async (pad, ordre, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'ordre', ordre)
				io.to('pad-' + pad).emit('modifierordre', ordre, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierlargeur', async (pad, largeur, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'largeur', largeur)
				io.to('pad-' + pad).emit('modifierlargeur', largeur, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierfond', async (pad, fond, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const fondPrecedent = donneesPad.fond
				await db.HSET('pads:' + pad, ['fond', fond, 'fondRepete', 'desactive'])
				io.to('pad-' + pad).emit('modifierfond', fond, identifiant)
				if (typeof fondPrecedent === 'string' && fondPrecedent !== fond && fondPrecedent !== '' && !fondPrecedent.includes('/img/') && fondPrecedent.substring(0, 1) !== '#') {
					await supprimerFichier(pad, path.basename(fondPrecedent))
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercouleurfond', async (pad, fond, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const fondPrecedent = donneesPad.fond
				await db.HSET('pads:' + pad, ['fond', fond, 'fondRepete', 'desactive'])
				io.to('pad-' + pad).emit('modifiercouleurfond', fond, identifiant)
				if (typeof fondPrecedent === 'string' && fondPrecedent !== fond && fondPrecedent !== '' && !fondPrecedent.includes('/img/') && fondPrecedent.substring(0, 1) !== '#') {
					await supprimerFichier(pad, path.basename(fondPrecedent))
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierfondrepete', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'fondRepete', statut)
				io.to('pad-' + pad).emit('modifierfondrepete', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieractivite', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'registreActivite', statut)
				io.to('pad-' + pad).emit('modifieractivite', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierconversation', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'conversation', statut)
				io.to('pad-' + pad).emit('modifierconversation', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierlisteutilisateurs', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'listeUtilisateurs', statut)
				io.to('pad-' + pad).emit('modifierlisteutilisateurs', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiereditionnom', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'editionNom', statut)
				io.to('pad-' + pad).emit('modifiereditionnom', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierfichiers', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'fichiers', statut)
				io.to('pad-' + pad).emit('modifierfichiers', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierenregistrements', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'enregistrements', statut)
				io.to('pad-' + pad).emit('modifierenregistrements', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierliens', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'liens', statut)
				io.to('pad-' + pad).emit('modifierliens', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierdocuments', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'documents', statut)
				io.to('pad-' + pad).emit('modifierdocuments', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercommentaires', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'commentaires', statut)
				io.to('pad-' + pad).emit('modifiercommentaires', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierevaluations', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'evaluations', statut)
				io.to('pad-' + pad).emit('modifierevaluations', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercopiebloc', async (pad, statut, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'copieBloc', statut)
				io.to('pad-' + pad).emit('modifiercopiebloc', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('message', async (pad, texte, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				const date = dayjs().format()
				io.to('pad-' + pad).emit('message', { texte: texte, identifiant: identifiant, nom: nom, date: date })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('reinitialisermessages', async (pad, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				io.to('pad-' + pad).emit('reinitialisermessages', identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('reinitialiseractivite', async (pad, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.UNLINK('activite:' + pad)
				io.to('pad-' + pad).emit('reinitialiseractivite', identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('ajoutercolonne', async (pad, titre, indexColonne, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes') || !donneesPad.hasOwnProperty('activite')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				if (!Number.isInteger(indexColonne) || indexColonne < 0 || indexColonne > colonnes.length) return socket.emit('erreur')
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				colonnes.splice(indexColonne, 0, titre)
				affichageColonnes.splice(indexColonne, 0, true)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const promessesBlocs = blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				})
				const donneesBlocs = await Promise.all(promessesBlocs)
				// Décalage des blocs situés dans une colonne insérée avant la leur (un bloc sans colonne est considéré comme faisant partie de la colonne 0)
				const blocsADecaler = donneesBlocs.filter((item) => {
					if (!item) return false
					const colonneActuelle = item.hasOwnProperty('colonne') ? parseInt(item.colonne, 10) : 0
					return colonneActuelle >= parseInt(indexColonne, 10)
				})
				const promessesDecalages = blocsADecaler.map(async (bloc) => {
					const colonneActuelle = bloc.hasOwnProperty('colonne') ? parseInt(bloc.colonne, 10) : 0
					const nouvelleColonne = colonneActuelle + 1
					await db.HSET('pad-' + pad + ':' + bloc.bloc, 'colonne', nouvelleColonne)
				})
				await Promise.all(promessesDecalages)
				await db.multi()
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-ajoutee' }) }])
					.exec()
				io.to('pad-' + pad).emit('ajoutercolonne', { identifiant, nom, titre, indexColonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad)
			}
		})

		socket.on('modifiertitrecolonne', async (pad, titre, index, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				if (typeof index !== 'number' || index < 0 || index > colonnes.length) return socket.emit('erreur')
				if (index === colonnes.length) {
					const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : []
					colonnes.push(titre)
					affichageColonnes.push(true)
					await db.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
				} else {
					colonnes[index] = titre
					await db.HSET('pads:' + pad, 'colonnes', JSON.stringify(colonnes))
				}
				io.to('pad-' + pad).emit('modifiertitrecolonne', colonnes, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})
		
		socket.on('modifieraffichagecolonne', async (pad, valeur, index, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				let affichageColonnes = []
				if (donneesPad.hasOwnProperty('affichageColonnes')) {
					affichageColonnes = JSON.parse(donneesPad.affichageColonnes)
				} else {
					colonnes.forEach(() => {
						affichageColonnes.push(true)
					})
				}
				if (typeof index !== 'number' || index < 0 || index >= colonnes.length) return socket.emit('erreur')
				affichageColonnes[index] = valeur
				await db.HSET('pads:' + pad, 'affichageColonnes', JSON.stringify(affichageColonnes))
				io.to('pad-' + pad).emit('modifieraffichagecolonne', affichageColonnes, valeur, index, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('verifierblocscolonnes', async (pad, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant)
				socket.emit('verifierblocscolonnes', donneesPadProtege.blocs)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('vidercolonne', async (pad, titre, colonne, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				colonne = parseInt(colonne, 10)
				if (!Number.isInteger(colonne) || colonne < 0 || colonne >= colonnes.length) return socket.emit('erreur')
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const promessesBlocs = blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				})
				const donneesBlocs = await Promise.all(promessesBlocs)
				const blocsASupprimer = []
				donneesBlocs.forEach((item) => {
					if (!item) return
					if (item.hasOwnProperty('colonne') && parseInt(item.colonne, 10) === parseInt(colonne, 10)) {
						blocsASupprimer.push(item)
					}
				})
				await supprimerBlocs(pad, blocsASupprimer)
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-videe' }) }])
					.exec()
				io.to('pad-' + pad).emit('vidercolonne', { identifiant, nom, titre, colonne, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimercolonne', async (pad, titre, colonne, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				colonnes.splice(colonne, 1)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				affichageColonnes.splice(colonne, 1)
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const promessesBlocs = blocs.map(async (blocId) => {
					const donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return donneesBloc ? { ...donneesBloc } : null
				})
				const donneesBlocs = await Promise.all(promessesBlocs)
				// Séparation des blocs à supprimer et des blocs à modifier (décalage de colonne)
				const blocsASupprimer = []
				const blocsADecaler = []
				donneesBlocs.forEach((item) => {
					if (!item) return
					// Vérification si le bloc est dans la colonne supprimée
					if (item.hasOwnProperty('colonne') && parseInt(item.colonne, 10) === parseInt(colonne, 10)) {
						blocsASupprimer.push(item)
					}
					// Vérification si le bloc est dans une colonne supérieure (nécessite décalage)
					else if (parseInt(item.colonne, 10) > parseInt(colonne, 10)) {
						blocsADecaler.push(item)
					}
				})
				const promessesDecalages = blocsADecaler.map(async (bloc) => {
					const nouvelleColonne = parseInt(bloc.colonne, 10) - 1
					await db.HSET('pad-' + pad + ':' + bloc.bloc, 'colonne', nouvelleColonne)
				})
				await Promise.all([supprimerBlocs(pad, blocsASupprimer), ...promessesDecalages])
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-supprimee' }) }])
					.exec()
				io.to('pad-' + pad).emit('supprimercolonne', { identifiant, nom, titre, colonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad)
			}
		})

		socket.on('deplacercolonne', async (pad, titre, affichage, direction, colonne, identifiant, nom) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			const verrouColonne = await acquerirVerrouColonnes(pad)
			if (!verrouColonne) return socket.emit('colonnesverrouillees')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('colonnes')) return socket.emit('erreur')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = JSON.parse(donneesPad.colonnes)
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : colonnes.map(() => true)
				const indexColonne = parseInt(colonne, 10)
				if (direction === 'gauche') {
					const titreColonne = colonnes.splice(indexColonne, 1)[0]
					const affichageColonne = affichageColonnes.splice(indexColonne, 1)[0]
					colonnes.splice(indexColonne - 1, 0, titreColonne)
					affichageColonnes.splice(indexColonne - 1, 0, affichageColonne)
				} else if (direction === 'droite') {
					const titreColonne = colonnes.splice(indexColonne, 1)[0]
					const affichageColonne = affichageColonnes.splice(indexColonne, 1)[0]
					colonnes.splice(indexColonne + 1, 0, titreColonne)
					affichageColonnes.splice(indexColonne + 1, 0, affichageColonne)
				}
				const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
				if (blocs === null) return socket.emit('erreur')
				const promessesBlocs = blocs.map(async (blocId) => {
					const bloc = await db.HGETALL('pad-' + pad + ':' + blocId)
					return bloc ? { ...bloc } : null
				})
				const donneesBlocs = await Promise.all(promessesBlocs)
				// Identification et mise à jour parallèle des blocs impactés
				const promessesMisesAJour = donneesBlocs.map(async (item) => {
					if (!item || !item.hasOwnProperty('bloc')) return
					const blocId = item.bloc
					const colonneActuelle = parseInt(item.colonne, 10)
					let nouvelleColonne = null
					// Détermination de la nouvelle colonne selon la direction
					if (direction === 'gauche') {
						if (colonneActuelle === indexColonne) {
							nouvelleColonne = indexColonne - 1
						} else if (colonneActuelle === indexColonne - 1) {
							nouvelleColonne = indexColonne
						}
					} else if (direction === 'droite') {
						if (colonneActuelle === indexColonne) {
							nouvelleColonne = indexColonne + 1
						} else if (colonneActuelle === indexColonne + 1) {
							nouvelleColonne = indexColonne
						}
					}
					// Exécution de la mise à jour seulement si la colonne change
					if (nouvelleColonne !== null) {
						const blocExiste = await db.EXISTS('pad-' + pad + ':' + blocId)
						if (blocExiste === 1) {
							await db.HSET('pad-' + pad + ':' + blocId, 'colonne', nouvelleColonne)
						}
					}
				})
				await Promise.all(promessesMisesAJour)
				const date = dayjs().format()
				const activiteId = parseInt(donneesPad.activite, 10) + 1
				await db.multi()
					.HSET('pads:' + pad, ['colonnes', JSON.stringify(colonnes), 'affichageColonnes', JSON.stringify(affichageColonnes)])
					.HINCRBY('pads:' + pad, 'activite', 1)
					.ZADD('activite:' + pad, [{ score: activiteId, value: JSON.stringify({ id: activiteId, identifiant: identifiant, titre: titre, date: date, type: 'colonne-deplacee' }) }])
					.exec()
				io.to('pad-' + pad).emit('deplacercolonne', { identifiant, nom, titre, direction, colonne, colonnes, affichageColonnes, date, activiteId })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			} finally {
				await libererVerrouColonnes(pad)
			}
		})

		socket.on('viderpad', async (pad, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const colonnes = donneesPad.hasOwnProperty('colonnes') ? JSON.parse(donneesPad.colonnes) : []
				const affichageColonnes = donneesPad.hasOwnProperty('affichageColonnes') ? JSON.parse(donneesPad.affichageColonnes) : []
				socket.to('pad-' + pad).emit('viderpad', colonnes, affichageColonnes)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiernotification', async (pad, admins, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('erreur')
			try {
				await db.HSET('pads:' + pad, 'notification', JSON.stringify(admins))
				io.to('pad-' + pad).emit('modifiernotification', admins)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('verifiermodifierbloc', async (pad, bloc, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			socket.to('pad-' + pad).emit('verifiermodifierbloc', bloc, identifiant)
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			await sauvegarderSession(req)
		})

		socket.on('reponsemodifierbloc', async (pad, identifiant, reponse) => {
			if (maintenance === true) return socket.emit('maintenance')
			socket.to('pad-' + pad).emit('reponsemodifierbloc', identifiant, reponse)
			req.session.cookie.expires = new Date(Date.now() + dureeSession)
			await sauvegarderSession(req)
		})

		socket.on('supprimeractivite', async (pad, id, identifiant) => {
			if (maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.ZREMRANGEBYSCORE('activite:' + pad, id, id)
				io.to('pad-' + pad).emit('supprimeractivite', id, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierlangue', async (langue) => {
			try {
				req.session.langue = langue
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('verifiermaintenance', () => {
			socket.emit('verifiermaintenance', maintenance)
		})

		socket.on('activermaintenance', (admin) => {
			if (verifierMotDePasseAdmin(admin)) {
				maintenance = true
				socket.emit('verifiermaintenance', true)
			}
		})

		socket.on('desactivermaintenance', (admin) => {
			if (verifierMotDePasseAdmin(admin)) {
				maintenance = false
				socket.emit('verifiermaintenance', false)
			}
		})
	})

	async function creerPad (id, token, titre, date, identifiant, destination, donneesUtilisateur) {
		await db.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'admins', JSON.stringify([]), 'vues', 0, 'digidrive', 0])
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
		return { id, token, titre, identifiant, fond: '/img/fond1.png', acces: 'public', contributions: 'ouvertes', affichage: 'mur', registreActivite: 'active', conversation: 'desactivee', listeUtilisateurs: 'activee', editionNom: 'desactivee', fichiers: 'actives', enregistrements: 'desactives', liens: 'actives', documents: 'desactives', commentaires: 'desactives', evaluations: 'desactivees', copieBloc: 'desactivee', ordre: 'croissant', largeur: 'normale', date, colonnes: [], affichageColonnes: [], bloc: 0, activite: 0, admins: [], vues: 0 }
	}

	async function creerPadSansCompte (id, token, titre, hash, date, identifiant, nom, langue, type) {
		let digidrive = 0
		if (type === 'api') {
			digidrive = 1
		}
		await db.multi()
			.HSET('pads:' + id, ['id', id, 'token', token, 'titre', titre, 'identifiant', identifiant, 'motdepasse', hash, 'fond', '/img/fond1.png', 'acces', 'public', 'contributions', 'ouvertes', 'affichage', 'mur', 'registreActivite', 'active', 'conversation', 'desactivee', 'listeUtilisateurs', 'activee', 'editionNom', 'desactivee', 'fichiers', 'actives', 'enregistrements', 'desactives', 'liens', 'actives', 'documents', 'desactives', 'commentaires', 'desactives', 'evaluations', 'desactivees', 'copieBloc', 'desactivee', 'ordre', 'croissant', 'largeur', 'normale', 'date', date, 'colonnes', JSON.stringify([]), 'affichageColonnes', JSON.stringify([]), 'bloc', 0, 'activite', 0, 'vues', 0, 'digidrive', digidrive])
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
			const donneesBloc = ['id', bloc.id, 'bloc', bloc.bloc, 'titre', bloc.titre, 'texte', bloc.texte, 'media', bloc.media, 'iframe', bloc.iframe, 'type', bloc.type, 'source', bloc.source, 'vignette', bloc.vignette, 'date', bloc.date, 'identifiant', bloc.identifiant, 'commentaires', bloc.commentaires, 'evaluations', bloc.evaluations, 'colonne', bloc.colonne, 'visibilite', visibilite]
			pipeline.HSET(cleRedisBloc, donneesBloc)
			pipeline.ZADD('blocs:' + id, [{ score: indexBloc, value: bloc.bloc }])
			if (Array.isArray(bloc.listeCommentaires)) {
				for (const commentaire of bloc.listeCommentaires) {
					if (commentaire.hasOwnProperty('id') && commentaire.hasOwnProperty('identifiant') && commentaire.hasOwnProperty('date') && commentaire.hasOwnProperty('texte')) {
						pipeline.ZADD('commentaires:' + bloc.bloc, [{ score: commentaire.id, value: JSON.stringify(commentaire) }])
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
		const champsPad = ['id', id, 'token', donnees.pad.token, 'titre', donnees.pad.titre, 'identifiant', donnees.pad.identifiant, 'fond', donnees.pad.fond, 'acces', donnees.pad.acces, 'contributions', donnees.pad.contributions, 'affichage', donnees.pad.affichage, 'registreActivite', registreActivite, 'conversation', conversation, 'listeUtilisateurs', listeUtilisateurs, 'editionNom', editionNom, 'fichiers', donnees.pad.fichiers, 'enregistrements', enregistrements, 'liens', donnees.pad.liens, 'documents', donnees.pad.documents, 'commentaires', donnees.pad.commentaires, 'evaluations', donnees.pad.evaluations, 'copieBloc', copieBloc, 'ordre', ordre, 'largeur', largeur, 'date', donnees.pad.date, 'colonnes', donnees.pad.colonnes, 'affichageColonnes', affichageColonnes, 'bloc', donnees.pad.bloc, 'activite', donnees.pad.activite, 'admins', admins, 'vues', vues, 'digidrive', digidrive]
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
		const recupererDonnees = async (cleRedis) => {
			const pads = await db.SMEMBERS(cleRedis)
			if (!pads || pads.length === 0) return []
			const promessesPads = pads.map(async (padId) => {
				let donneesPad = null
				const padExiste = await db.EXISTS('pads:' + padId)
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + padId)
					if (!donneesPad) return null
					donneesPad = { ...donneesPad }
					if (!donneesPad.hasOwnProperty('identifiant')) return null
				} else if (padExiste === 0 && isNaN(parseInt(padId, 10)) === false && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + padId + '.json'))
					if (typeof donneesPad !== 'object' || !donneesPad || !donneesPad.hasOwnProperty('identifiant')) return null
				}
				if (!donneesPad) return null
				// Compatibilité anciens chemins pour le fond
				if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
					donneesPad.fond = path.basename(donneesPad.fond)
				}
				let nomAuteur = donneesPad.identifiant
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + donneesPad.identifiant)
				if (utilisateurExiste === 1) {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + donneesPad.identifiant)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (donneesUtilisateur && donneesUtilisateur.hasOwnProperty('nom') && donneesUtilisateur.nom !== '') {
						nomAuteur = donneesUtilisateur.nom
					}
				}
				donneesPad.nom = nomAuteur
				return donneesPad
			})
			const donnees = await Promise.all(promessesPads)
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
			const promessesPads = pads.map(async (pad) => {
				const padExiste = await db.EXISTS('pads:' + pad)
				let donneesPad = null
				if (padExiste === 1) {
					donneesPad = await db.HGETALL('pads:' + pad)
					return donneesPad ? { ...donneesPad } : null
				} else if (padExiste === 0 && !isNaN(parseInt(pad, 10)) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
					donneesPad = await fs.readJson(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
					if (donneesPad && typeof donneesPad === 'object') {
						return donneesPad
					}
				}
				return null
			})
			const donneesPads = await Promise.all(promessesPads)
			return donneesPads.filter(item => item !== null)
		}
		const [padsCrees, padsAdmins] = await Promise.all([
			recupererDonnees('pads-crees:' + identifiant),
			recupererDonnees('pads-admins:' + identifiant)
		])
		return { padsCrees, padsAdmins }
	}

	async function recupererDonneesPad (id, token, identifiant, statut, pads) {
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
		if (accesLecture) {
			if (pad.hasOwnProperty('affichageColonnes')) {
				try {
					pad.affichageColonnes = JSON.parse(pad.affichageColonnes)
					if (pad.affichageColonnes.length === 0 || pad.affichageColonnes.length < pad.colonnes.length) {
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
			if (accesCode) pad.code = ''
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
				const promessesBlocs = listeBlocs.map(async (blocId) => {
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
					// Compatibilité changement domaine digidoc
					if (bloc.hasOwnProperty('iframe') && bloc.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com')) {
						bloc.iframe = bloc.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
					}
					if (bloc.hasOwnProperty('media') && bloc.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com')) {
						bloc.media = bloc.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
					}
					if (!bloc.hasOwnProperty('couleur') || bloc.couleur === null || typeof bloc.couleur !== 'string') {
						bloc.couleur = '#242f3d'
					}
					let html = bloc.texte || ''
					html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
					html = html.replace(/style=".*?"/mg, '').replace(/class=".*?"/mg, '')
					bloc.texte = html
					const [nombreCommentaires, evaluations, nomAuteur] = await Promise.all([
						db.ZCARD('commentaires:' + blocId),
						db.ZRANGE('evaluations:' + blocId, 0, -1),
						recupererNomUtilisateur(bloc.identifiant)
					])
					bloc.commentaires = nombreCommentaires || 0
					bloc.evaluations = []
					if (evaluations) {
						bloc.evaluations = evaluations.map(ev => {
							return parseJSON(ev, null)
						}).filter(e => e !== null)
					}
					bloc.nom = nomAuteur
					listeBlocsValides.push(blocId)
					return bloc
				})
				const resultatsBlocs = await Promise.all(promessesBlocs)
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
				const promessesActivite = activite.map(async (entreeStr) => {
					const entree = parseJSON(entreeStr, null)
					if (!entree) return null
					entree.nom = await recupererNomUtilisateur(entree.identifiant)
					return entree
				})
				const resultatsActivite = await Promise.all(promessesActivite)
				// Filtrage : on ne garde que les événements liés aux blocs ou aux colonnes visibles
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

	async function recupererDonneesPadProtege (pad, id, identifiant) {
		let nombreColonnes = 0
		let colonnes = []
		let affichageColonnes = []
		try {
			colonnes = JSON.parse(pad.colonnes)
			affichageColonnes = JSON.parse(pad.affichageColonnes)
			nombreColonnes = colonnes.length
			if (pad.hasOwnProperty('notification')) {
				pad.notification = JSON.parse(pad.notification)
			}
		} catch {
			colonnes = []
			affichageColonnes = []
			nombreColonnes = 0
		}
		pad.colonnes = colonnes
		// Fix bug update 0.9.11 : recalcul affichageColonnes si nécessaire
		if (affichageColonnes.length === 0 || affichageColonnes.length < colonnes.length) {
			affichageColonnes = colonnes.map(() => true)
		}
		pad.affichageColonnes = affichageColonnes
		const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
		let donneesBlocs = []
		let listeBlocsValides = []
		if (listeBlocs && listeBlocs.length > 0) {
			const promessesBlocs = listeBlocs.map(async (blocId) => {
				let bloc = await db.HGETALL('pad-' + id + ':' + blocId)
				if (!bloc || Object.keys(bloc).length === 0) return null
				bloc = { ...bloc }
				if (!bloc.hasOwnProperty('visibilite')) bloc.visibilite = 'visible'
				// Filtres de visibilité
				const blocVisible = !((pad.contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
				const colonneMasquee = (pad.affichage === 'colonnes' && affichageColonnes[bloc.colonne] === false)
				if ((!blocVisible || colonneMasquee) && bloc.identifiant !== identifiant) return null
				// Correction colonne inexistante
				if (parseInt(bloc.colonne, 10) >= nombreColonnes) {
					bloc.colonne = nombreColonnes - 1
				}
				if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
					bloc.vignette = path.basename(bloc.vignette)
				}
				if (bloc.hasOwnProperty('iframe') && bloc.iframe.includes('env-7747481.jcloud-ver-jpe.ik-server.com')) {
					bloc.iframe = bloc.iframe.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
				}
				if (bloc.hasOwnProperty('media') && bloc.media.includes('env-7747481.jcloud-ver-jpe.ik-server.com')) {
					bloc.media = bloc.media.replace('https://env-7747481.jcloud-ver-jpe.ik-server.com', process.env.VITE_ETHERPAD)
				}
				if (!bloc.hasOwnProperty('couleur') || bloc.couleur === null || typeof bloc.couleur !== 'string') {
					bloc.couleur = '#242f3d'
				}
				let html = bloc.texte || ''
				html = v.stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
				html = html.replace(/style=".*?"/mg, '').replace(/class=".*?"/mg, '')
				bloc.texte = html
				const [nombreCommentaires, evaluations, nomAuteur] = await Promise.all([
					db.ZCARD('commentaires:' + blocId),
					db.ZRANGE('evaluations:' + blocId, 0, -1),
					recupererNomUtilisateur(bloc.identifiant)
				])
				bloc.commentaires = nombreCommentaires || 0
				bloc.evaluations = []
				if (evaluations) {
					bloc.evaluations = evaluations.map(ev => {
						return parseJSON(ev, null)
					}).filter(e => e !== null)
				}
				bloc.nom = nomAuteur
				listeBlocsValides.push(blocId)
				return bloc
			})
			const resultatsBlocs = await Promise.all(promessesBlocs)
			donneesBlocs = resultatsBlocs.filter(b => b !== null)
		}
		if (pad.ordre === 'decroissant') {
			donneesBlocs.reverse()
		}
		let donneesEntrees = []
		const activite = await db.ZRANGE('activite:' + id, 0, -1)
		if (activite) {
			const promessesActivite = activite.map(async (entreeStr) => {
				const entree = parseJSON(entreeStr, null)
				if (!entree) return null
				entree.nom = await recupererNomUtilisateur(entree.identifiant)
				return entree
			})
			const resultatsActivite = await Promise.all(promessesActivite)
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

	async function recupererNomUtilisateur (id) {
		let donneesUtilisateur = await db.HGETALL('utilisateurs:' + id)
		donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
		if (donneesUtilisateur.hasOwnProperty('nom') && donneesUtilisateur.nom !== '') {
			return donneesUtilisateur.nom
		}
		const nom = await db.HGET('noms:' + id, 'nom')
		return nom || ''
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
		if (admin || (!accesCode && !accesPrive)) {
			const listeBlocs = await db.ZRANGE('blocs:' + id, 0, -1)
			if (listeBlocs && listeBlocs.length > 0) {
				const promessesBlocs = listeBlocs.map(async (blocId) => {
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
					bloc.nom = await recupererNomUtilisateur(bloc.identifiant)
					return bloc
				})
				const resultatsBlocs = await Promise.all(promessesBlocs)
				donneesBlocs = resultatsBlocs.filter(b => b !== null)
			}
		}
		return { blocs: donneesBlocs, admin }
	}

	async function recupererDonneesPadJSON (pad) {
		if (!pad || pad === '' || isNaN(parseInt(pad, 10)) === true) return {}
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
			langue = 'fr'
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
			if (listeBlocs && listeBlocs.length > 0) {
				const promessesBlocs = listeBlocs.map(async (blocId) => {
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
					const nomUtilisateur = await recupererNomUtilisateur(bloc.identifiant)
					bloc.nom = nomUtilisateur || genererPseudo()
					bloc.info = formaterDate(bloc, langue)
					return bloc
				})
				const resultatsBlocs = await Promise.all(promessesBlocs)
				donneesBlocs = resultatsBlocs.filter(b => b !== null && Object.keys(b).length > 0)
			}
			let donneesEntrees = []
			if (activite) {
				const promessesActivite = activite.map(async (entreeStr) => {
					const entree = parseJSON(entreeStr, null)
					if (!entree) return null
					const utilisateurExiste = await db.EXISTS('utilisateurs:' + entree.identifiant)
					return (utilisateurExiste === 1) ? entree : null
				})
				const resultatsActivite = await Promise.all(promessesActivite)
				donneesEntrees = resultatsActivite.filter(e => e !== null)
			}
			const parametres = { pad: donneesPad, blocs: donneesBlocs, activite: donneesEntrees }
			const html = genererHTML(donneesPad, donneesBlocs, langue)
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
			const promessesFichiers = []
			if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && !donneesPad.fond.includes('/img/') && donneesPad.fond.substring(0, 1) !== '#') {
				const fichierFond = path.basename(donneesPad.fond)
				promessesFichiers.push(
					copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierFond), cleS3: id + '/' + fichierFond }, path.join(dossierFichiers, fichierFond))
				)
			} else if (donneesPad.hasOwnProperty('fond') && typeof donneesPad.fond === 'string' && donneesPad.fond !== '' && donneesPad.fond.includes('/img/')) {
				promessesFichiers.push(
					fs.copy(path.join(__dirname, '..', '/public' + donneesPad.fond), path.join(dossierStatic, donneesPad.fond), { overwrite: true }).catch(() => {})
				)
			}
			promessesFichiers.push(
				fs.copy(path.join(__dirname, '..', '/static/export/css'), path.join(dossierStatic, 'css')).catch(() => {}),
				fs.copy(path.join(__dirname, '..', '/static/export/js'), path.join(dossierStatic, 'js')).catch(() => {}),
				fs.copy(path.join(__dirname, '..', '/public/fonts/MaterialIcons-Regular.woff2'), path.join(dossierStatic, 'fonts/MaterialIcons-Regular.woff2')).catch(() => {}),
				fs.copy(path.join(__dirname, '..', '/public/fonts/Roboto-Slab-Medium.woff2'), path.join(dossierStatic, 'fonts/Roboto-Slab-Medium.woff2')).catch(() => {}),
				fs.copy(path.join(__dirname, '..', '/public/img/favicon.png'), path.join(dossierStatic, 'img/favicon.png')).catch(() => {})
			)
			for (const bloc of parametres.blocs) {
				if (!bloc || Object.keys(bloc).length === 0) continue
				if (bloc.media && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
					promessesFichiers.push(
						copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + bloc.media), cleS3: id + '/' + bloc.media }, path.join(dossierFichiers, bloc.media))
					)
				}
				if (bloc.vignette && bloc.vignette !== '' && typeof bloc.vignette === 'string') {
					if (!verifierURL(bloc.vignette, ['https', 'http'])) {
						if (bloc.vignette.includes('/img/')) {
							promessesFichiers.push(
								fs.copy(path.join(__dirname, '..', '/public' + bloc.vignette), path.join(dossierStatic, bloc.vignette), { overwrite: true }).catch(() => {})
							)
						} else {
							const fichierVignette = path.basename(bloc.vignette)
							promessesFichiers.push(
								copierFichierExport({ chemin: path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + id + '/' + fichierVignette), cleS3: id + '/' + fichierVignette }, path.join(dossierFichiers, fichierVignette))
							)
						}
					}
				}
			}
			// Exécution parallèle de tous les transferts de fichiers
			await Promise.all(promessesFichiers)
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
		const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
		if (blocs) {
			const pipelineBlocs = db.multi()
			for (const blocId of blocs) {
				pipelineBlocs
					.UNLINK('commentaires:' + blocId)
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
		const utilisateurs = await db.SMEMBERS('utilisateurs-pads:' + pad)
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
				const liste = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/' }))
				if (liste && liste.hasOwnProperty('Contents') && Array.isArray(liste.Contents)) {
					const promessesFichiersS3 = []
					for (const objet of liste.Contents) {
						promessesFichiersS3.push(s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key))))
					}
					await Promise.all(promessesFichiersS3)
				}
			} catch {}
		}
		return true
	}

	async function fetchSockets (room) {
		for (let i = 0; i < 5; i++) {
			try {
				return await io.in(room).fetchSockets()
			} catch (err) {
				if (i === 4) console.error('Erreur fetchSockets :', err.message)
			}
		}
		return []
	}

	function sauvegarderSession (req) {
		return new Promise((resolve, reject) => {
			req.session.save((err) => {
				if (err) reject(err)
				else resolve()
			})
		})
	}

	function nettoyerPads (pads) {
		return pads.filter(el => el && Object.keys(el).length > 0).map(el => ({ ...el, id: parseInt(el.id, 10) }))
	}

	function supprimerDoublons (pads) {
		return pads.filter((valeur, index, self) =>
			index === self.findIndex((t) => (
				t.id === valeur.id && t.token === valeur.token
			))
		)
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

	async function verifierAdminUtilisateur (pad, identifiant, motdepasse) {
		if (!pad || !identifiant || !motdepasse) return false
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		let listeAdmins = []
		if (donneesPad.hasOwnProperty('admins')) {
			listeAdmins = JSON.parse(donneesPad.admins)
		}
		let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
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

	function supprimerSession (req) {
		if (req.hasOwnProperty('session')) {
			req.session.identifiant = ''
			req.session.motdepasse = ''
			req.session.nom = ''
			req.session.email = ''
			req.session.langue = ''
			req.session.statut = ''
			req.session.pads = []
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

	async function extraireArchive (source, dir) {
		const zip = new AdmZip(source)
		await new Promise((resolve, reject) => {
			zip.extractAllToAsync(dir, true, false, (err) => {
				if (err) return reject(err)
				resolve()
			})
		})
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

	async function acquerirVerrouColonnes (pad) {
		const cle = 'verrou-colonnes:' + pad
		for (let tentative = 0; tentative < 40; tentative++) {
			const acquis = await db.SET(cle, '1', { NX: true, PX: 2000 })
			if (acquis) return true
			await new Promise((resolve) => setTimeout(resolve, 25))
		}
		return false
	}

	async function libererVerrouColonnes (pad) {
		await db.UNLINK('verrou-colonnes:' + pad)
	}

	async function supprimerBlocs (pad, blocsASupprimer) {
		const promessesSuppressions = blocsASupprimer.map(async (blocSupprime) => {
			const blocId = blocSupprime.bloc
			let donneesBloc = await db.HGETALL('pad-' + pad + ':' + blocId)
			donneesBloc = donneesBloc ? { ...donneesBloc } : {}
			if (!donneesBloc.hasOwnProperty('bloc') || donneesBloc.bloc !== blocId) return // Bloc déjà supprimé ou inexistant
			if (donneesBloc.hasOwnProperty('media') && donneesBloc.media !== '' && donneesBloc.type !== 'embed' && donneesBloc.type !== 'lien') {
				await supprimerFichier(pad, donneesBloc.media)
			}
			if (donneesBloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(donneesBloc.vignette) === true) {
				await supprimerFichier(pad, path.basename(donneesBloc.vignette))
			}
			await db.multi()
				.UNLINK('pad-' + pad + ':' + blocId)
				.ZREM('blocs:' + pad, blocId)
				.UNLINK('commentaires:' + blocId)
				.UNLINK('evaluations:' + blocId)
				.exec()
		})
		await Promise.all(promessesSuppressions)
	}

	async function supprimerArchives (source, cible) {
		try {
			await Promise.all([
				fs.remove(source),
				fs.remove(cible)
			])
		} catch {}
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
				const dossier = path.join(__dirname, '..', '/static' + definirCheminFichiers())
				checkDiskSpace(dossier).then(function (diskSpace) {
					const espace = Math.round((diskSpace.free / diskSpace.size) * 100)
					if (espace < minimumEspaceDisque) {
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

	function verifierURL (s, protocoles) {
		try {
			const url = new URL(s)
			const liste = (Array.isArray(protocoles) && protocoles.length > 0) ? protocoles : ['https', 'http']
			return liste.map(x => `${x.toLowerCase()}:`).includes(url.protocol)
		} catch {
			return false
		}
	}

	function assainirHTML (html) {
		if (!html || typeof html !== 'string') return ''
		return html.replace(/<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|meta|link|base)(\s[^>]*)?\/?>/gi, '').replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '').replace(/(href|src|action)\s*=\s*(?:"(javascript|vbscript):[^"]*"|'(javascript|vbscript):[^']*'|(javascript|vbscript):[^\s>]*)/gi, '')
	}

	function assainirIframe (html) {
		if (!html || typeof html !== 'string') return ''
		return html.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '').replace(/src\s*=\s*(?:"(javascript|vbscript|data):[^"]*"|'(javascript|vbscript|data):[^']*'|(javascript|vbscript|data):[^\s>]*)/gi, '')
	}

	function parseJSON (str, fallback) {
		try {
			return JSON.parse(str)
		} catch {
			return fallback
		}
	}

	function comparerHash (h1, h2) {
		if (!h1 || !h2 || h1.length !== h2.length) return false
		return timingSafeEqual(Buffer.from(h1), Buffer.from(h2))
	}

	function verifierMotDePasseAdmin (motdepasse) {
		const adminPassword = process.env.ADMIN_PASSWORD
		if (!motdepasse || !adminPassword || motdepasse.length !== adminPassword.length) return false
		return timingSafeEqual(Buffer.from(motdepasse), Buffer.from(adminPassword))
	}

	function verifierContenuFichier (buffer, mimetype) {
		if (!buffer || buffer.length < 4) return false
		const b = buffer
		const type = mimetype.split(';')[0].trim()
		if (type === 'image/jpeg' || type === 'image/jpg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
		if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
		if (type === 'image/gif') {
			const sig = b.slice(0, 6).toString('binary')
			return sig === 'GIF87a' || sig === 'GIF89a'
		}
		if (type === 'image/webp') return b.slice(0, 4).toString('binary') === 'RIFF' && b.length >= 12 && b.slice(8, 12).toString('binary') === 'WEBP'
		if (type === 'application/pdf') return b.slice(0, 4).toString('ascii') === '%PDF'
		return true
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
}
