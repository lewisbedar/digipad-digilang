import 'dotenv/config'
import path from 'path'
import fs from 'fs-extra'
import { createClient } from 'redis'
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

exporterPadsJson()

async function exporterPadsJson () {
	const jours = 100
	let pad = await db.GET('pad')
	pad = parseInt(pad, 10)
	for (let i = 0; i <= pad; i++) {
		const id = i
		const chemin = path.join(__dirname, '..', '/static/pads')
		const resultat = await db.EXISTS('pads:' + id)
		if (resultat === 1) {
			let d = await db.HGETALL('pads:' + id)
			d = Object.assign({}, d)
			let donneesActivite = await db.HGETALL('dates-pads:' + id)
			donneesActivite = Object.assign({}, donneesActivite)
			const derniereActivite = donneesActivite.hasOwnProperty('date') ? donneesActivite.date : d.date
			if (derniereActivite && dayjs(new Date(derniereActivite)).isBefore(dayjs().subtract(jours, 'days'))) {
				// Données du pad
				const donneesPad = d
				// Données des blocs
				const donneesBlocs = []
				const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
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
				// Écriture des fichiers
				const parametres = {}
				parametres.pad = donneesPad
				parametres.blocs = donneesBlocs
				parametres.activite = donneesEntrees
				await fs.writeFile(path.normalize(chemin + '/' + id + '.json'), JSON.stringify(parametres, '', 4), 'utf8')
				await fs.writeFile(path.normalize(chemin + '/pad-' + id + '.json'), JSON.stringify(parametres.pad, '', 4), 'utf8')
				// Suppression données redis
				for (let i = 0; i < blocs.length; i++) {
					await db
					.multi()
					.UNLINK('commentaires:' + blocs[i])
					.UNLINK('evaluations:' + blocs[i])
					.UNLINK('pad-' + id + ':' + blocs[i])
					.exec()
				}
				await db
				.multi()
				.UNLINK('blocs:' + id)
				.UNLINK('pads:' + id)
				.UNLINK('activite:' + id)
				.exec()
				console.log(id)
			}
		}
	}
	console.log('export_termine')
}
