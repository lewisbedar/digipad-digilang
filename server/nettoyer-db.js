import 'dotenv/config'
import { createClient } from 'redis'
import dayjs from 'dayjs'

let db
const db_port = parseInt(process.env.DB_PORT) || 6379
if (process.env.NODE_ENV === 'production') {
	db = await createClient({
		url: 'redis://default:' + encodeURIComponent(process.env.DB_PWD)  + '@' + process.env.DB_HOST + ':' + db_port
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

nettoyerDb()

async function nettoyerDb () {
	const jours = 100
	const listeUtilisateurs = []
	const listeUtilisateursPadSupprime = []
	let pad = await db.GET('pad')
	pad = parseInt(pad, 10)
	for (let i = 0; i <= pad; i++) {
		const id = i
		const resultat = await db.EXISTS('pads:' + id)
		if (resultat === 1) {
			let d = await db.HGETALL('pads:' + id)
			d = Object.assign({}, d)
			listeUtilisateurs.push(d.identifiant)
			let colonnes = []
			try {
				colonnes = JSON.parse(d.colonnes)
			} catch (e) { console.error('Erreur parsing colonnes pad ' + id + ':', e.message) }
			let donneesActivite = await db.HGETALL('dates-pads:' + id)
			donneesActivite = Object.assign({}, donneesActivite)
			const derniereActivite = donneesActivite.hasOwnProperty('date') ? donneesActivite.date : d.date
			if (colonnes.length === 0 && derniereActivite && dayjs(new Date(derniereActivite)).isBefore(dayjs().subtract(jours, 'days'))) {
				const blocs = await db.ZRANGE('blocs:' + id, 0, -1)
				if (blocs.length === 0) {
					await supprimerPad(d.identifiant, id)
					console.log('pad_supprime:', id)
					listeUtilisateursPadSupprime.push(d.identifiant)
				}
			}
		}
	}
	for await (const cles of db.scanIterator({ MATCH: 'utilisateurs:*', COUNT: 100 })) {
		for (const cle of cles) {
			const identifiant = cle.replace('utilisateurs:', '')
			let d = await db.HGETALL('utilisateurs:' + identifiant)
			d = Object.assign({}, d)
			if (d.hasOwnProperty('motdepasse') && d.hasOwnProperty('date') && dayjs(new Date(d.date)).isBefore(dayjs().subtract(jours, 'days'))) {
				const [padsCrees, padsRejoints, padsAdmin] = await Promise.all([
					db.SMEMBERS('pads-crees:' + identifiant),
					db.SMEMBERS('pads-rejoints:' + identifiant),
					db.SMEMBERS('pads-admins:' + identifiant)
				])
				if (padsCrees.length === 0 && padsRejoints.length === 0 && padsAdmin.length === 0) {
					const email = d.hasOwnProperty('email') ? d.email : ''
					await supprimerCompte(identifiant, email)
					console.log('compte_supprime:', identifiant)
				}
			} else if (definirOccurrences(listeUtilisateurs, identifiant) === definirOccurrences(listeUtilisateursPadSupprime, identifiant) && !d.hasOwnProperty('motdepasse') && d.hasOwnProperty('date') && dayjs(new Date(d.date)).isBefore(dayjs().subtract(jours, 'days'))) {
				await supprimerCompte(identifiant, '')
				console.log('compte_supprime:', identifiant)
			}
		}
	}
	console.log('nettoyage_termine')
}

async function supprimerPad (identifiant, pad) {
	const resultat = await db.EXISTS('pads:' + pad)
	if (resultat === 1) {
		let donneesPad = await db.HGETALL('pads:' + pad)
		donneesPad = Object.assign({}, donneesPad)
		if (donneesPad.identifiant === identifiant) { // pad créé
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
			return 'pad_supprime : ' + pad
		}
	} else {
		return 'pad_inexistant'
	}
}

async function supprimerCompte (identifiant, email) {
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
	if (email !== '') {
		await db.UNLINK('emails:' + email)
	}
	return 'compte_supprime : ' + identifiant
}

function definirOccurrences (array, valeur) {
	let nombre = 0
	array.forEach((v) => (v === valeur && nombre++))
	return nombre
}
