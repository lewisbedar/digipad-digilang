import 'dotenv/config'
import { Agent } from 'https'
import { createClient } from 'redis'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3'
import { executerTransactions } from './fonctions.js'

// Usage : npm run migrate-acl [-- --simulation] [-- --prefixe=2] [-- --lot=100] [-- --reinitialiser]
// --simulation     : aucune modification, ne touche ni au point de reprise ni à la file des échecs
// --prefixe=2      : ne traite que les clés commençant par « 2 », ce qui permet de lancer plusieurs
//                    process en parallèle sur des plages d'identifiants de pads distinctes
// --lot=100        : nombre de requêtes ACL simultanées
// --reinitialiser  : oublie le point de reprise et la file des échecs du préfixe demandé

const bucket = process.env.S3_BUCKET
const s3ServerType = process.env.S3_SERVER_TYPE || 'aws'
const agent = new Agent({ keepAlive: true, maxSockets: parseInt(process.env.S3_MAX_SOCKETS) || 500 })
const s3Client = new S3Client({
	endpoint: process.env.S3_ENDPOINT,
	region: process.env.S3_REGION,
	credentials: {
		accessKeyId: process.env.S3_ACCESS_KEY,
		secretAccessKey: process.env.S3_SECRET_KEY
	},
	forcePathStyle: s3ServerType === 'minio' ? true : false,
	retryMode: 'adaptive',
	maxAttempts: 3,
	requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

const db_port = parseInt(process.env.DB_PORT) || 6379
const db = process.env.NODE_ENV === 'production'
	? await createClient({ url: 'redis://default:' + encodeURIComponent(process.env.DB_PWD) + '@' + process.env.DB_HOST + ':' + db_port }).on('error', (err) => console.error('Redis : ' + err)).connect()
	: await createClient({ url: 'redis://localhost:' + db_port }).on('error', (err) => console.error('Redis : ' + err)).connect()

const parametres = process.argv.slice(2)
const simulation = parametres.includes('--simulation')
const reinitialiser = parametres.includes('--reinitialiser')
const prefixe = lireParametre('prefixe', '')
const tailleLot = Math.max(1, Math.min(500, parseInt(lireParametre('lot', '100')) || 100))
const cleReprise = 'migration-acl:reprise:' + (prefixe || '*')
const cleEchecs = 'migration-acl:echecs:' + (prefixe || '*')
const maxEchecsMemorises = 200000
const maxRepriseS3 = 4
const attenteInitialeS3 = 500
const attenteMaxS3 = 15000
const codesReprise = ['SlowDown', 'RequestLimitExceeded', 'RequestTimeout', 'ServiceUnavailable', 'InternalError', 'ThrottlingException', 'TooManyRequests']
const statutsReprise = [429, 500, 502, 503, 504]
const codesReseauReprise = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENOTFOUND']

let padEnCache = null
let accesEnCache = null

let compteurTraites = 0
let compteurPads = 0
let compteurOrphelins = 0
let compteurErreurs = 0
let compteurReprises = 0
let compteurEchecsMemorises = 0
let dateDebut = Date.now()

migrerAclFichiers().then(async () => {
	await db.quit()
	process.exit(0)
}).catch(async (err) => {
	console.error(err.stack)
	await db.quit()
	process.exit(1)
})

function lireParametre (nom, valeurDefaut) {
	const parametre = parametres.find((element) => element.startsWith('--' + nom + '='))
	return parametre ? parametre.slice(nom.length + 3) : valeurDefaut
}

function temporiser (duree) {
	return new Promise((resolve) => setTimeout(resolve, duree))
}

function verifierReprise (err) {
	if (!err) return false
	const code = err.name || err.Code || ''
	const statut = err.$metadata ? err.$metadata.httpStatusCode : undefined
	return codesReprise.includes(code) || statutsReprise.includes(statut) || codesReseauReprise.includes(err.code)
}

async function envoyerCommandeS3 (commande) {
	let attente = attenteInitialeS3
	for (let essai = 1; ; essai++) {
		try {
			return await s3Client.send(commande)
		} catch (err) {
			if (essai >= maxRepriseS3 || !verifierReprise(err)) throw err
			compteurReprises++
			await temporiser(attente + Math.floor(Math.random() * attente))
			attente = Math.min(attente * 2, attenteMaxS3)
		}
	}
}

function resoudreAccesPad (pad) {
	if (padEnCache !== pad) {
		padEnCache = pad
		compteurPads++
		accesEnCache = db.HGET('pads:' + pad, 'acces').catch((err) => {
			if (padEnCache === pad) {
				padEnCache = null
				accesEnCache = null
			}
			throw err
		})
	}
	return accesEnCache
}

function journaliserAvancement () {
	const duree = (Date.now() - dateDebut) / 1000
	const debit = duree > 0 ? Math.round(compteurTraites / duree) : 0
	console.log(compteurTraites + ' fichiers traités (' + debit + '/s, ' + compteurErreurs + ' échec(s))...')
}

async function enregistrerReprise (jetonPagination) {
	if (jetonPagination) {
		await db.HSET(cleReprise, {
			jeton: jetonPagination,
			traites: String(compteurTraites),
			orphelins: String(compteurOrphelins),
			date: new Date().toISOString()
		}).catch((err) => console.error('Enregistrement du point de reprise : ' + err.message))
	} else {
		await db.UNLINK(cleReprise).catch(() => {})
	}
}

async function memoriserEchec (cle) {
	if (simulation || compteurEchecsMemorises >= maxEchecsMemorises) return
	const ajoutes = await db.SADD(cleEchecs, cle).catch(() => 0)
	compteurEchecsMemorises += ajoutes
	if (compteurEchecsMemorises >= maxEchecsMemorises) {
		console.error('File des échecs saturée (' + maxEchecsMemorises + ' clés) : corrigez la cause puis relancez la migration complète.')
	}
}

async function traiterObjet (cle, enReprise = false) {
	try {
		const pad = cle.split('/')[0]
		const acces = await resoudreAccesPad(pad)
		// Pad absent de la db : le fichier est orphelin, verrouillé par précaution
		if (!acces && !enReprise) compteurOrphelins++
		const cible = acces === 'public' ? 'public-read' : 'private'
		if (!simulation) {
			await envoyerCommandeS3(new PutObjectAclCommand({ Bucket: bucket, Key: cle, ACL: cible }))
		}
		compteurTraites++
		if (compteurTraites % 2000 === 0) journaliserAvancement()
		return true
	} catch (err) {
		compteurErreurs++
		console.error('Échec sur ' + cle + ' : ' + err.message)
		if (!enReprise) await memoriserEchec(cle)
		return false
	}
}

async function rejouerEchecs () {
	const total = await db.SCARD(cleEchecs).catch(() => 0)
	if (!total) return
	console.log('Seconde passe sur ' + total + ' fichier(s) en échec...')
	const restants = []
	let lot = await db.SPOP_COUNT(cleEchecs, 1000)
	while (lot && lot.length > 0) {
		lot.sort()
		const resultats = await executerTransactions(lot, (cle) => traiterObjet(cle, true), tailleLot)
		lot.forEach((cle, index) => {
			if (resultats[index] !== true) restants.push(cle)
		})
		lot = await db.SPOP_COUNT(cleEchecs, 1000)
	}
	for (let debut = 0; debut < restants.length; debut += 1000) {
		await db.SADD(cleEchecs, restants.slice(debut, debut + 1000)).catch((err) => console.error('Conservation des échecs : ' + err.message))
	}
	console.log('Seconde passe terminée : ' + (total - restants.length) + ' rattrapé(s), ' + restants.length + ' encore en échec.')
	if (restants.length > 0) {
		console.log('Les clés en échec sont conservées dans l\'ensemble Redis « ' + cleEchecs + ' » : relancez le script pour les rejouer.')
	}
}

async function migrerAclFichiers () {
	if (!bucket) throw new Error('S3_BUCKET manquant dans les variables d\'environnement')
	if (reinitialiser && !simulation) {
		await db.UNLINK([cleReprise, cleEchecs]).catch(() => {})
		console.log('Point de reprise et file des échecs réinitialisés')
	}
	console.log(simulation ? 'Simulation (aucune modification ne sera appliquée)' : 'Migration en cours...')
	if (prefixe !== '') console.log('Préfixe traité : ' + prefixe)
	let jetonPagination
	if (!simulation) {
		const reprise = await db.HGETALL(cleReprise).catch(() => null)
		if (reprise && reprise.jeton) {
			jetonPagination = reprise.jeton
			compteurTraites = parseInt(reprise.traites) || 0
			compteurOrphelins = parseInt(reprise.orphelins) || 0
			console.log('Reprise du point d\'arrêt du ' + reprise.date + ' : ' + compteurTraites + ' fichiers déjà traités')
		}
	}
	const traitesAvant = compteurTraites
	dateDebut = Date.now()
	do {
		const page = await envoyerCommandeS3(new ListObjectsV2Command({
			Bucket: bucket,
			Prefix: prefixe !== '' ? prefixe : undefined,
			ContinuationToken: jetonPagination
		}))
		const objets = (page.Contents || []).filter((objet) => !objet.Key.startsWith('temp/'))
		// Traitement par lots : un bucket volumineux ne doit pas ouvrir des milliers de requêtes simultanées
		await executerTransactions(objets, (objet) => traiterObjet(objet.Key), tailleLot)
		jetonPagination = page.IsTruncated ? page.NextContinuationToken : undefined
		// Point de reprise écrit après la page, pour ne jamais sauter d'objets non traités
		if (!simulation) await enregistrerReprise(jetonPagination)
	} while (jetonPagination)
	if (!simulation) await rejouerEchecs()
	const duree = Math.round((Date.now() - dateDebut) / 1000)
	console.log('Terminé : ' + compteurTraites + ' fichiers synchronisés (' + (compteurTraites - traitesAvant) + ' sur cette exécution, en ' + duree + ' s), environ ' + compteurPads + ' pads distincts, ' + compteurOrphelins + ' fichiers sans pad en base (passés en privé), ' + compteurErreurs + ' échec(s), ' + compteurReprises + ' requête(s) rejouée(s).')
	const echecsRestants = simulation ? 0 : await db.SCARD(cleEchecs).catch(() => 0)
	if (echecsRestants > 0) {
		console.log('Attention : ' + echecsRestants + ' fichier(s) n\'ont pas pu être mis à jour et restent dans leur ACL d\'origine.')
	}
	if (!simulation && compteurTraites > 0) {
		console.log('Si un CDN est placé devant le bucket, purgez son cache maintenant.')
	}
}
