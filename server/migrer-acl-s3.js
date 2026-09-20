import 'dotenv/config'
import { Agent } from 'https'
import { createClient } from 'redis'
import { NodeHttpHandler } from '@smithy/node-http-handler'
import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3'
import { executerTransactions } from './fonctions.js'

// Usage : npm run migrate-acl [-- --simulation]

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
	requestHandler: new NodeHttpHandler({ httpsAgent: agent })
})

const db_port = parseInt(process.env.DB_PORT) || 6379
const db = process.env.NODE_ENV === 'production'
	? await createClient({ url: 'redis://default:' + process.env.DB_PWD + '@' + process.env.DB_HOST + ':' + db_port }).on('error', (err) => console.error('Redis : ' + err)).connect()
	: await createClient({ url: 'redis://localhost:' + db_port }).on('error', (err) => console.error('Redis : ' + err)).connect()

const simulation = process.argv.includes('--simulation')
const accesParPad = new Map()

migrerAclFichiers().then(async () => {
	await db.quit()
	process.exit(0)
}).catch(async (err) => {
	console.error(err.stack)
	await db.quit()
	process.exit(1)
})

function resoudreAccesPad (pad) {
	let acces = accesParPad.get(pad)
	if (acces === undefined) {
		acces = db.HGET('pads:' + pad, 'acces').catch((err) => {
			accesParPad.delete(pad)
			throw err
		})
		accesParPad.set(pad, acces)
	}
	return acces
}

async function migrerAclFichiers () {
	if (!bucket) throw new Error('S3_BUCKET manquant dans les variables d\'environnement')
	console.log(simulation ? 'Simulation (aucune modification ne sera appliquée)' : 'Migration en cours...')
	let jetonPagination
	let compteurTraites = 0
	let compteurOrphelins = 0
	let compteurErreurs = 0
	do {
		const page = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: jetonPagination }))
		const objets = (page.Contents || []).filter((objet) => !objet.Key.startsWith('temp/'))
		// Traitement par lots : un bucket volumineux ne doit pas ouvrir des milliers de requêtes simultanées
		await executerTransactions(objets, async (objet) => {
			try {
				const pad = objet.Key.split('/')[0]
				const acces = await resoudreAccesPad(pad)
				// Pad absent de la base : le fichier est orphelin, verrouillé par précaution
				if (!acces) compteurOrphelins++
				const cible = acces === 'public' ? 'public-read' : 'private'
				if (!simulation) {
					await s3Client.send(new PutObjectAclCommand({ Bucket: bucket, Key: objet.Key, ACL: cible }))
				}
				compteurTraites++
				if (compteurTraites % 500 === 0) console.log(compteurTraites + ' fichiers traités...')
			} catch (err) {
				compteurErreurs++
				console.error('Échec sur ' + objet.Key + ' : ' + err.message)
			}
		}, 100)
		jetonPagination = page.IsTruncated ? page.NextContinuationToken : undefined
	} while (jetonPagination)
	console.log('Terminé : ' + compteurTraites + ' fichiers synchronisés (' + accesParPad.size + ' pads distincts), ' + compteurOrphelins + ' fichiers sans pad en base (passés en privé), ' + compteurErreurs + ' échecs.')
	if (!simulation && compteurTraites > 0) {
		console.log('Si un CDN est placé devant le bucket, purgez son cache maintenant.')
	}
}
