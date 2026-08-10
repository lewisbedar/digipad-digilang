import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import { open as ouvrirFichier } from 'node:fs/promises'
import { createClient, WatchError } from 'redis'
import { fileURLToPath } from 'url'
import dayjs from 'dayjs'

let db
const db_port = parseInt(process.env.DB_PORT) || 6379
if (process.env.NODE_ENV === 'production') {
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

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const chemin = path.join(__dirname, '..', '/static/pads')

try {
	await exporterPadsJson()
} catch (e) {
	console.log('Export interrompu : ', e)
	process.exitCode = 1
} finally {
	await db.quit()
}

async function ecrireEtVerifier (cheminFichier, donneesPad) {
	const donnees = JSON.stringify(donneesPad, null, 4)
	const cheminTemporaire = cheminFichier + '.tmp'
	const descripteurFichier = await ouvrirFichier(cheminTemporaire, 'w')
	try {
		await descripteurFichier.writeFile(donnees, 'utf8')
		await descripteurFichier.sync()
	} finally {
		await descripteurFichier.close()
	}
	const donneesFichier = await fs.readFile(cheminTemporaire, 'utf8')
	if (donneesFichier !== donnees) {
		throw new Error('Le fichier ' + cheminTemporaire + ' ne comporte pas les données attendues après écriture.')
	}
	await fs.rename(cheminTemporaire, cheminFichier)
}

async function exporterPadsJson () {
	const jours = 100
	let pad = await db.GET('pad')
	pad = parseInt(pad, 10)
	if (isNaN(pad)) {
		throw new Error('La valeur de la clé "pad" est invalide ou manquante dans Redis.')
	}
	for (let i = 0; i <= pad; i++) {
		const id = i
		try {
			const resultat = await db.EXISTS('pads:' + id)
			if (resultat === 1) {
				let d = await db.HGETALL('pads:' + id)
				d = Object.assign({}, d)
				let donneesActivite = await db.HGETALL('dates-pads:' + id)
				donneesActivite = Object.assign({}, donneesActivite)
				const derniereActivite = donneesActivite.hasOwnProperty('date') ? donneesActivite.date : d.date
				if (derniereActivite && dayjs(new Date(derniereActivite)).isBefore(dayjs().subtract(jours, 'days'))) {
					// Surveillance des clés du pad
					await db.WATCH(['pads:' + id, 'dates-pads:' + id, 'blocs:' + id])
					let surveillanceCles = true
					try {
						await traiterPad(id, d)
						surveillanceCles = false
					} finally {
						if (surveillanceCles) {
							await db.UNWATCH()
						}
					}
				}
			}
		} catch (e) {
			console.log('Erreur lors du traitement du pad ' + id + ', pad ignoré : ', e)
		}
	}
	console.log('Export terminé.')
}

async function traiterPad (id, d) {
	// Données du pad
	const donneesPad = d
	// Données des blocs
	const donneesBlocs = []
	const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
	// Surveillance des clés des blocs et de l'activité, découvertes une fois la liste des blocs connue
	const clesASurveiller = ['activite:' + id]
	for (const bloc of blocs) {
		clesASurveiller.push('pad-' + id + ':' + bloc, 'commentaires:' + bloc, 'evaluations:' + bloc)
	}
	await db.WATCH(clesASurveiller)
	for (const bloc of blocs) {
		let donneesBloc = await db.HGETALL('pad-' + id + ':' + bloc)
		donneesBloc = Object.assign({}, donneesBloc)
		if (donneesBloc !== null && Object.keys(donneesBloc).length > 0) {
			const donneesCommentaires = []
			const commentaires = await db.ZRANGE('commentaires:' + bloc, 0, -1)
			if (commentaires !== null) {
				for (let commentaire of commentaires) {
					try {
						donneesCommentaires.push(JSON.parse(commentaire))
					} catch {}
				}
				donneesBloc.commentaires = donneesCommentaires.length
				donneesBloc.listeCommentaires = donneesCommentaires
			} else {
				donneesBloc.commentaires = 0
				donneesBloc.listeCommentaires = []
			}
			const evaluations = await db.ZRANGE('evaluations:' + bloc, 0, -1)
			if (evaluations !== null) {
				const donneesEvaluations = []
				evaluations.forEach(function (evaluation) {
					try {
						donneesEvaluations.push(JSON.parse(evaluation))
					} catch {}
				})
				donneesBloc.evaluations = donneesEvaluations.length
				donneesBloc.listeEvaluations = donneesEvaluations
			} else {
				donneesBloc.evaluations = 0
				donneesBloc.listeEvaluations = []
			}
			donneesBlocs.push(donneesBloc)
		}
	}
	// Activité du pad
	const donneesEntrees = []
	const entrees = await db.ZRANGE('activite:' + id, 0, -1)
	if (entrees !== null) {
		for (let donneesEntree of entrees) {
			try {
				donneesEntree = JSON.parse(donneesEntree)
				const resultat = await db.EXISTS('utilisateurs:' + donneesEntree.identifiant)
				if (resultat === 1) {
					donneesEntrees.push(donneesEntree)
				}
			} catch (e) {}
		}
	}
	// Écriture des fichiers, avec vérification d'intégrité avant toute suppression
	const parametres = {}
	parametres.pad = donneesPad
	parametres.blocs = donneesBlocs
	parametres.activite = donneesEntrees
	await ecrireEtVerifier(path.normalize(chemin + '/' + id + '.json'), parametres)
	await ecrireEtVerifier(path.normalize(chemin + '/pad-' + id + '.json'), parametres.pad)
	const transaction = db.multi()
	for (const bloc of blocs) {
		transaction.UNLINK('commentaires:' + bloc)
		transaction.UNLINK('evaluations:' + bloc)
		transaction.UNLINK('pad-' + id + ':' + bloc)
	}
	transaction.UNLINK('blocs:' + id)
	transaction.UNLINK('pads:' + id)
	transaction.UNLINK('activite:' + id)
	try {
		await transaction.exec()
		console.log(id)
	} catch (e) {
		if (e instanceof WatchError) {
			console.log('Pad ' + id + ' modifié pendant l\'export, suppression annulée.')
		} else {
			throw e
		}
	}
}
