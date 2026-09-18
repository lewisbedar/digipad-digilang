import path from 'path'
import fs from 'fs-extra'
import bcrypt from 'bcrypt'
import { ListObjectsV2Command, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { fileURLToPath } from 'url'
import { etat } from './etat.js'
import {
	tailleLotTransaction,
	verifierIdentifiantPad,
	supprimerSession,
	definirCheminFichiers,
	executerTransactions,
	parseJSON,
	comparerHash,
	verifierMotDePasseAdmin
} from './fonctions.js'
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Administration du serveur : maintenance, consultation et modification des pads et des comptes
export default function enregistrerRoutesAdmin ({
	app,
	stockage,
	s3Client,
	bucket,
	db,
	limitePadsParCompte,
	limiteAuthAdmin,
	limiteActionsSensibles,
	fonctions
}) {
	const {
		recupererDonneesPadJSON,
		definirVignettePersonnalisee,
		definirParametresSupprimerS3,
		supprimerFichierSansEchec,
		supprimerEtherpadBlocs,
		supprimerEtherpad,
		definirMaintenance
	} = fonctions

	app.post('/api/verifier-mot-de-passe-admin', limiteAuthAdmin, (req, res) => {
		const admin = req.body.admin
		if (verifierMotDePasseAdmin(admin)) {
			res.status(200).send('acces_verifie')
		} else {
			res.status(401).send('acces_invalide')
		}
	})

	app.post('/api/gerer-maintenance', limiteAuthAdmin, (req, res) => {
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		definirMaintenance(req.body.maintenance === true, true)
		res.status(200).json({ maintenance: etat.maintenance })
	})

	app.post('/api/modifier-mot-de-passe-admin', limiteAuthAdmin, async (req, res) => {
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		const identifiant = req.body.identifiant
		const email = req.body.email ? req.body.email.toLowerCase() : ''
		const nouveauMotDePasse = typeof req.body.motdepasse === 'string' ? req.body.motdepasse.trim() : ''
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
				// Récupération des emails pour chaque utilisateur
				const listeEmails = await Promise.all(utilisateurs.map(async (id) => {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + id)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (donneesUtilisateur.hasOwnProperty('email')) {
						return { id: id, email: donneesUtilisateur.email.toLowerCase() }
					}
					return null
				}))
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

	app.post('/api/recuperer-donnees-utilisateur-admin', limiteAuthAdmin, async (req, res) => {
		const admin = req.body.admin
		if (!verifierMotDePasseAdmin(admin)) return res.status(403).send('non_autorise')
		const identifiant = req.body.identifiant
		const email = req.body.email ? req.body.email.toLowerCase() : ''
		try {
			if (identifiant !== '') {
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
				if (utilisateurExiste !== 1) return res.status(400).send('identifiant_non_valide')
				let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
				donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
				return res.status(200).json([donneesUtilisateur])
			}
			if (email !== '') {
				const clesUtilisateurs = []
				for await (const cle of db.scanIterator({ MATCH: 'utilisateurs:*', COUNT: 100 })) {
					clesUtilisateurs.push(...cle)
				}
				if (clesUtilisateurs.length === 0) return res.status(400).send('email_non_valide')
				const utilisateurs = clesUtilisateurs.map(cle => cle.substring(13))
				// Récupération des données pour chaque utilisateur potentiel
				const listeUtilisateurs = await Promise.all(utilisateurs.map(async (id) => {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + id)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (donneesUtilisateur.hasOwnProperty('email') && donneesUtilisateur.email.toLowerCase() === email) {
						return donneesUtilisateur
					}
					return null
				}))
				// Recherche des utilisateurs correspondant à l'email
				const utilisateursTrouves = listeUtilisateurs.filter(utilisateur => utilisateur !== null)
				if (utilisateursTrouves.length > 0) {
					return res.status(200).json(utilisateursTrouves)
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
			if (!verifierIdentifiantPad(pad)) return res.status(404).send('pad_inexistant')
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
			if (!verifierIdentifiantPad(pad)) return res.status(404).send('pad_inexistant')
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

	app.post('/api/transferer-compte', limiteAuthAdmin, limiteActionsSensibles, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		const nouvelIdentifiant = typeof req.body.nouvelIdentifiant === 'string' ? req.body.nouvelIdentifiant.trim() : ''
		const admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!admin && etat.maintenance === true) return res.status(503).send('maintenance')
		if ((req.session.identifiant && req.session.identifiant === identifiant && req.session.statut === 'utilisateur' && req.session.hasOwnProperty('motdepasse') && req.session.motdepasse !== '') || admin) {
			try {
				if (nouvelIdentifiant === '' || nouvelIdentifiant === identifiant) return res.status(403).send('non_autorise')
				const utilisateurExiste = await db.EXISTS('utilisateurs:' + identifiant)
				if (utilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
				if (utilisateurExiste !== 1) return res.status(500).send('erreur')
				if (!admin) {
					let donneesUtilisateur = await db.HGETALL('utilisateurs:' + identifiant)
					donneesUtilisateur = donneesUtilisateur ? { ...donneesUtilisateur } : {}
					if (!donneesUtilisateur.hasOwnProperty('motdepasse')) return res.status(500).send('erreur')
					const motdepasseCorrect = comparerHash(req.session.motdepasse, donneesUtilisateur.motdepasse)
					if (!motdepasseCorrect) return res.status(401).send('non_connecte')
					const motdepasse = req.body.motdepasse
					if (typeof motdepasse !== 'string' || motdepasse.trim() === '' || donneesUtilisateur.motdepasse.trim() === '' || !await bcrypt.compare(motdepasse.trim(), donneesUtilisateur.motdepasse)) return res.status(401).send('motdepasse_incorrect')
				}
				const nouvelUtilisateurExiste = await db.EXISTS('utilisateurs:' + nouvelIdentifiant)
				if (nouvelUtilisateurExiste === 0) return res.status(404).send('utilisateur_inexistant')
				if (nouvelUtilisateurExiste !== 1) return res.status(500).send('erreur')
				const pads = await db.SMEMBERS('pads-crees:' + identifiant)
				if (!pads) return res.status(500).send('erreur')
				// Les pads en corbeille sont également transférés (dans la corbeille du compte destinataire)
				const padsCorbeille = await db.SMEMBERS('pads-supprimes:' + identifiant)
				if (!padsCorbeille) return res.status(500).send('erreur')
				if (!admin) {
					const padsDestination = await db.SCARD('pads-crees:' + nouvelIdentifiant)
					if (!Number.isInteger(padsDestination)) return res.status(500).send('erreur')
					if (padsDestination + pads.length > limitePadsParCompte) return res.status(403).json({ message: 'limite_atteinte', limite: limitePadsParCompte })
				}
				const padsATransferer = pads.map((pad) => ({ pad: pad, corbeille: false }))
					.concat(padsCorbeille.filter((pad) => !pads.includes(pad)).map((pad) => ({ pad: pad, corbeille: true })))
				const padsTransferes = []
				const resultats = await executerTransactions(padsATransferer, async ({ pad, corbeille }) => {
					try {
						if (!verifierIdentifiantPad(pad)) return null
						const padExiste = await db.EXISTS('pads:' + pad)
						if (padExiste === 0 && await fs.pathExists(path.join(__dirname, '..', '/static/pads/' + pad + '.json'))) {
							await recupererDonneesPadJSON(pad)
						} else if (padExiste === 0) {
							await db.multi()
								.SREM('pads-crees:' + identifiant, pad.toString())
								.SREM('pads-supprimes:' + identifiant, pad.toString())
								.exec()
							return null
						}
						const cleDestination = corbeille ? 'pads-supprimes:' : 'pads-crees:'
						await db.multi()
							.SADD(cleDestination + nouvelIdentifiant, pad.toString())
							.SREM('pads-crees:' + identifiant, pad.toString())
							.SREM('pads-supprimes:' + identifiant, pad.toString())
							.SREM('pads-favoris:' + identifiant, pad.toString())
							.SADD('utilisateurs-pads:' + pad, nouvelIdentifiant)
							.SREM('utilisateurs-pads:' + pad, identifiant)
							.HSET('pads:' + pad, ['identifiant', nouvelIdentifiant, 'transfertPropriete', 'desactive'])
							.HDEL('pads:' + pad, 'transfertProprieteExpire')
							.SREM('pads-admins:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-rejoints:' + nouvelIdentifiant, pad.toString())
							.SREM('pads-utilisateurs:' + nouvelIdentifiant, pad.toString())
							.exec()
						padsTransferes.push(pad)
						return null
					} catch (err) {
						console.error(err.stack)
						return pad
					}
				})
				// Purge des ids transférés dans les dossiers du compte source
				if (padsTransferes.length > 0) {
					const donneesUtilisateurSource = await db.HGET('utilisateurs:' + identifiant, 'dossiers')
					if (donneesUtilisateurSource) {
						const dossiers = parseJSON(donneesUtilisateurSource, [])
						const idsTransferes = new Set(padsTransferes.map((pad) => parseInt(pad, 10)))
						let dossiersModifies = false
						dossiers.forEach((dossier) => {
							const longueurInitiale = (dossier.pads || []).length
							dossier.pads = (dossier.pads || []).filter((id) => !idsTransferes.has(parseInt(id, 10)))
							if (dossier.pads.length !== longueurInitiale) dossiersModifies = true
						})
						if (dossiersModifies) {
							await db.HSET('utilisateurs:' + identifiant, 'dossiers', JSON.stringify(dossiers))
						}
					}
				}
				const padsEnEchec = resultats.filter((pad) => pad !== null)
				if (padsEnEchec.length > 0) {
					console.error('Transfert de compte incomplet (' + identifiant + ' vers ' + nouvelIdentifiant + ') : ' + padsEnEchec.join(', '))
					return res.status(500).send('transfert_incomplet')
				}
				res.status(200).send('compte_transfere')
			} catch (err) {
				console.error(err.stack)
				res.status(500).send('erreur')
			}
		} else if (motdepasseAdmin) {
			res.status(403).send('non_autorise')
		} else {
			supprimerSession(req)
			res.status(401).send('non_connecte')
		}
	})

	app.post('/api/supprimer-compte', limiteAuthAdmin, async (req, res) => {
		const identifiant = req.body.identifiant
		const motdepasseAdmin = req.body.admin
		let admin = verifierMotDePasseAdmin(motdepasseAdmin)
		if (!admin && etat.maintenance === true) return res.status(503).send('maintenance')
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
			// Traitement par lots de la suppression de chaque pad créé
			const resultatsPadsCrees = await executerTransactions(listePadsCrees, async (pad) => {
				try {
					const padExiste = await db.EXISTS('pads:' + pad)
					if (padExiste === 1) {
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs && blocs.length > 0) {
							await supprimerEtherpadBlocs(pad, blocs)
							const pipelineBlocs = db.multi()
							for (const blocId of blocs) {
								pipelineBlocs
									.UNLINK('commentaires:' + blocId)
									.UNLINK('commentaires-masques:' + blocId)
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
					} else if (padExiste === 0 && verifierIdentifiantPad(pad) && await fs.pathExists(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))) {
						await Promise.all([
							fs.remove(path.join(__dirname, '..', '/static/pads/' + pad + '.json')),
							fs.remove(path.join(__dirname, '..', '/static/pads/pad-' + pad + '.json'))
						])
					} else {
						return null
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
					try {
						if (stockage === 'fs') {
							await fs.remove(path.join(__dirname, '..', '/static' + definirCheminFichiers() + '/' + pad))
						} else if (stockage === 's3') {
							let jetonPagination
							do {
								const listeObjets = await s3Client.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: pad + '/', ContinuationToken: jetonPagination }))
								if (listeObjets && listeObjets.hasOwnProperty('Contents') && Array.isArray(listeObjets.Contents)) {
									await executerTransactions(listeObjets.Contents, (objet) => s3Client.send(new DeleteObjectCommand(definirParametresSupprimerS3(objet.Key))), tailleLotTransaction)
								}
								jetonPagination = listeObjets && listeObjets.IsTruncated ? listeObjets.NextContinuationToken : undefined
							} while (jetonPagination)
						}
					} catch (err) {
						console.error('Suppression des fichiers du pad ' + pad + ' : ' + err.stack)
					}
					return null
				} catch (err) {
					console.error(err.stack)
					return pad
				}
			}, tailleLotTransaction)
			const padsEnEchec = resultatsPadsCrees.filter((pad) => pad !== null)
			if (padsEnEchec.length > 0) {
				console.error('Suppression de compte interrompue (' + identifiant + ') : pads non supprimés : ' + padsEnEchec.join(', '))
				return res.status(500).send('suppression_incomplete')
			}
			// Nettoyage des contributions dans les pads rejoints
			const listePadsRejoints = await db.SMEMBERS('pads-utilisateurs:' + identifiant)
			if (listePadsRejoints && listePadsRejoints.length > 0) {
				const resultatsPadsRejoints = await executerTransactions(listePadsRejoints, async (pad) => {
					try {
						const padExiste = await db.EXISTS('pads:' + pad)
						if (padExiste !== 1) return null
						const blocs = await db.ZRANGE('blocs:' + pad, 0, -1)
						if (blocs === null) return null
						for (const blocId of blocs) {
							let bloc = await db.HGETALL('pad-' + pad + ':' + blocId)
							bloc = bloc ? { ...bloc } : {}
							if (bloc.hasOwnProperty('identifiant') && bloc.identifiant === identifiant) {
								if (bloc.hasOwnProperty('media') && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien') {
									await supprimerFichierSansEchec(pad, bloc.media)
								}
								if (bloc.hasOwnProperty('vignette') && definirVignettePersonnalisee(bloc.vignette) === true) {
									await supprimerFichierSansEchec(pad, path.basename(bloc.vignette))
								}
								await supprimerEtherpad([bloc.iframe, bloc.media])
								await db.multi()
									.UNLINK('pad-' + pad + ':' + blocId)
									.ZREM('blocs:' + pad, blocId)
									.UNLINK('commentaires:' + blocId)
									.UNLINK('commentaires-masques:' + blocId)
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
										if (commentaire.visibilite === 'masquee') {
											await db.ZREMRANGEBYSCORE('commentaires-masques:' + blocId, commentaire.id, commentaire.id)
										}
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
						return null
					} catch (err) {
						console.error(err.stack)
						return pad
					}
				}, tailleLotTransaction)
				const padsRejointsEnEchec = resultatsPadsRejoints.filter((pad) => pad !== null)
				if (padsRejointsEnEchec.length > 0) {
					console.error('Suppression de compte interrompue (' + identifiant + ') : contributions non supprimées dans : ' + padsRejointsEnEchec.join(', '))
					return res.status(500).send('suppression_incomplete')
				}
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
						await Promise.all(listeSessions.map(async (session) => {
							const sessionId = session.substring(9)
							const donneesSessionStr = await db.GET('sessions:' + sessionId)
							if (donneesSessionStr) {
								const donneesSession = parseJSON(donneesSessionStr, null)
								if (donneesSession && donneesSession.hasOwnProperty('identifiant') && donneesSession.identifiant === identifiant) {
									await db.UNLINK('sessions:' + sessionId)
								}
							}
						}))
					}
				} catch (err) {
					console.error(err.stack)
				}
				res.status(200).send('compte_supprime')
			}
		} catch (err) {
			console.error(err.stack)
			res.status(500).send('erreur')
		}
	})
}
