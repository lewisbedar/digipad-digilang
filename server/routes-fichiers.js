import path from 'path'
import fs from 'fs-extra'
import axios from 'axios'
import Busboy from 'busboy'
import sharp from 'sharp'
import gm from 'gm'
import * as cheerio from 'cheerio'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import util from 'util'
import libre from 'libreoffice-convert'
import { fileURLToPath } from 'url'
import { etat } from './etat.js'
import {
	definirAccesLecture,
	definirNomFichier,
	verifierIdentifiantPad,
	verifierURL,
	verifierContenuFichier,
	verifierFichierAudio,
	genererJetonTeleversement,
	genererJetonFichier
} from './fonctions.js'
libre.convertAsync = util.promisify(libre.convert)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Téléversement et suppression des médias : fichiers, audio, vignettes, fonds, icônes distantes et pads Etherpad
export default function enregistrerRoutesFichiers ({
	app,
	stockage,
	s3Client,
	db,
	etherpad,
	etherpadApi,
	limiteTeleversement,
	secretJetonTeleversement,
	secretJetonFichier,
	fonctions
}) {
	const {
		verifierAdmin,
		verifierAccesLectureDonnees,
		definirParametresTeleverserS3,
		verifierEspaceDisque,
		verifierHoteBloque,
		definirUrlFichier,
		verifierFichierAutorise
	} = fonctions

	async function recupererPadAutorise (padId, session, { adminRequis = false } = {}) {
		if (!verifierIdentifiantPad(padId)) return null
		let donneesPad = await db.HGETALL('pads:' + padId)
		donneesPad = donneesPad ? { ...donneesPad } : {}
		if (!donneesPad.hasOwnProperty('identifiant')) return null
		const admin = await verifierAdmin(padId, donneesPad, session)
		if (adminRequis) return admin ? donneesPad : null
		if (!definirAccesLecture(padId, donneesPad, admin, session)) return null
		return donneesPad
	}

	const actionsJetonTeleversement = ['fichier', 'vignette', 'icone', 'audio', 'fond']

	app.post('/api/generer-jeton-televersement', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const action = req.body.action
		const pad = typeof req.body.pad === 'string' ? req.body.pad : ''
		if (!actionsJetonTeleversement.includes(action)) return res.status(422).send('erreur')
		try {
			if (action === 'audio') {
				const donneesPad = await recupererPadAutorise(pad, req.session)
				if (!donneesPad) return res.status(403).send('non_autorise')
			} else if (action === 'fond') {
				const donneesPad = await recupererPadAutorise(pad, req.session, { adminRequis: true })
				if (!donneesPad) return res.status(403).send('non_autorise')
			}
			const jeton = genererJetonTeleversement(secretJetonTeleversement, action, pad)
			res.status(200).json({ jeton })
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/generer-lien-fichier', async (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		try {
			const pad = req.body.pad
			const fichier = req.body.fichier
			const bloc = typeof req.body.bloc === 'string' ? req.body.bloc : ''
			const telechargement = req.body.telechargement === true
			// Lien pour visionneuse externe
			const visionneuse = req.body.visionneuse === true
			if (!verifierIdentifiantPad(pad) || typeof fichier !== 'string' || fichier === '' || /[/\\]/.test(fichier) || fichier.includes('..')) return res.status(422).send('erreur')
			let donneesPad = await db.HGETALL('pads:' + pad)
			donneesPad = donneesPad ? { ...donneesPad } : {}
			if (!await verifierAccesLectureDonnees(pad, donneesPad, req.session)) return res.status(403).send('non_autorise')
			if (!await verifierFichierAutorise(pad, donneesPad, bloc, fichier, req.session)) return res.status(403).send('non_autorise')
			let url = await definirUrlFichier(pad, fichier, donneesPad.acces, { telechargement })
			if (visionneuse && stockage === 'fs' && donneesPad.acces !== 'public' && url !== '') {
				url += '?jeton=' + encodeURIComponent(genererJetonFichier(secretJetonFichier, pad, fichier))
			}
			res.status(200).json({ url })
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})

	app.post('/api/televerser-fichier', (req, res) => {
		if (etat.maintenance === true) return res.status(503).send('maintenance')
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
								.rotate()
								.keepIccProfile()
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
								.rotate()
								.keepIccProfile()
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
					if (!await verifierEspaceDisque('temp')) return res.status(507).send('erreur_espace_disque')
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
		if (etat.maintenance === true) return res.status(503).send('maintenance')
		const identifiant = req.session.identifiant
		if (!identifiant) return res.status(401).send('non_connecte')
		const buffersAudio = []
		let nomFichier
		let mimetypeAudio
		const donneesFormulaire = new Map()
		let erreurBusboy = false
		let fichierTropVolumineux = false
		const busboy = Busboy({ headers: req.headers, limits: { fileSize: limiteTeleversement } })
		busboy.on('field', (champ, valeur) => {
			donneesFormulaire.set(champ, valeur)
		})
		busboy.on('file', (champ, fichier, meta) => {
			nomFichier = definirNomFichier(meta.filename)
			mimetypeAudio = meta.mimeType
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
			if (!verifierFichierAudio(bufferAudio, nomFichier, mimetypeAudio)) return res.status(422).send('erreur_televersement')
			const padId = donneesFormulaire.get('pad')
			try {
				const donneesPad = await recupererPadAutorise(padId, req.session)
				if (!donneesPad) return res.status(403).send('non_autorise')
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + nomFichier, bufferAudio)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static/temp/' + nomFichier)
					if (!await verifierEspaceDisque('temp')) return res.status(507).send('erreur_espace_disque')
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
		if (etat.maintenance === true) return res.status(503).send('maintenance')
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
						.rotate()
						.keepIccProfile()
						.jpeg({
							quality: 90,
							progressive: true
						})
						.resize(400, 400, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				} else {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.rotate()
						.keepIccProfile()
						.resize(400, 400, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				}
				if (!bufferOptimise) return res.status(422).send('erreur_televersement')
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + nomFichier, bufferOptimise)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static/temp/' + nomFichier)
					if (!await verifierEspaceDisque('temp')) return res.status(507).send('erreur_espace_disque')
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
		if (etat.maintenance === true) return res.status(503).send('maintenance')
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
				const donneesPad = await recupererPadAutorise(padId, req.session, { adminRequis: true })
				if (!donneesPad) return res.status(403).send('non_autorise')
				if (extensionFichier === '.jpg' || extensionFichier === '.jpeg') {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.rotate()
						.keepIccProfile()
						.jpeg({
							quality: 90,
							progressive: true
						})
						.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				} else {
					bufferOptimise = await sharp(bufferImage, { failOnError: false })
						.rotate()
						.keepIccProfile()
						.resize(1200, 1200, { fit: sharp.fit.inside, withoutEnlargement: true })
						.toBuffer()
				}
				if (!bufferOptimise) return res.status(422).send('erreur_televersement')
				if (stockage === 's3') {
					await s3Client.send(new PutObjectCommand(definirParametresTeleverserS3('temp/' + nomFichier, bufferOptimise)))
					res.status(200).send(nomFichier)
				} else {
					const cheminFichier = path.join(__dirname, '..', '/static/temp/' + nomFichier)
					if (!await verifierEspaceDisque('temp')) return res.status(507).send('erreur_espace_disque')
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
		if (etat.maintenance === true) return res.status(503).send('maintenance')
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
		if (etat.maintenance === true) return res.status(503).send('maintenance')
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
}
