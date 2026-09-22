import path from 'path'
import { etat } from './etat.js'
import {
	definirSalonUtilisateur,
	definirSalonAdmin,
	nombreMaxAdmins,
	verifierIdentifiantPad,
	verifierIdentifiantUtilisateur,
	sauvegarderSession
} from './fonctions.js'

// Paramètres du pad : titre, accès, administrateurs, apparence, fonctionnalités activées et vidage
export default function creerGestionnairesPad ({
	io,
	db,
	dureeSession,
	dureeTransfertPropriete,
	fonctions
}) {
	const {
		verifierAdmin,
		supprimerFichierSansEchec,
		definirUrlFond,
		modifierACLFichiers,
		televerserFichierTemp,
		fetchSockets,
		definirAdministrateursPad
	} = fonctions

	const accesPossibles = ['public', 'prive', 'code']
	const delaiAttenteOuvertureACL = 10000
	const delaiAttenteFermetureACL = 30000
	const tentativesEvacuation = 3
	const delaiEntreTentativesEvacuation = 1000

	function temporiser (duree) {
		return new Promise((resoudre) => {
			const minuteur = setTimeout(resoudre, duree)
			if (typeof minuteur.unref === 'function') minuteur.unref()
		})
	}

	function signalerSynchronisationACL (pad, resultat, envoyer) {
		if (resultat.echecs === 0 && resultat.interrompue !== true) return
		console.error('Synchronisation ACL du pad ' + pad + ' : ' + resultat.echecs + ' fichier(s) en échec sur ' + (resultat.traites + resultat.echecs) + (resultat.interrompue === true ? ' (listage interrompu, des fichiers n\'ont pas été tentés)' : ''))
		envoyer(resultat.interrompue === true ? 0 : resultat.echecs)
	}

	async function evacuerSalonNonAdmins (pad) {
		const salonPad = 'pad-' + pad
		const salonAdmin = definirSalonAdmin(pad)
		let clients = null
		for (let tentative = 0; tentative < tentativesEvacuation && clients === null; tentative++) {
			if (tentative > 0) await temporiser(delaiEntreTentativesEvacuation)
			clients = await fetchSockets(salonPad, { strict: true })
		}
		if (clients === null) {
			console.error('Évacuation du salon du pad ' + pad + ' : liste des sockets indisponible, des visiteurs peuvent y être restés')
			return false
		}
		clients.forEach((client) => {
			if (client.rooms.has(salonAdmin)) return
			client.leave(salonPad)
			if (client.data.identifiant) client.leave(definirSalonUtilisateur(pad, client.data.identifiant))
		})
		return true
	}

	async function synchroniserACL (pad, acces, delaiAttente) {
		let terminee = false
		const synchronisation = modifierACLFichiers(pad, acces).catch((err) => {
			console.error('Synchronisation ACL du pad ' + pad + ' : ' + err.stack)
			return { traites: 0, echecs: 0, interrompue: true }
		}).then((resultat) => {
			terminee = true
			return resultat
		})
		await Promise.race([synchronisation, temporiser(delaiAttente)])
		if (terminee) return synchronisation
		const salonAdmin = definirSalonAdmin(pad)
		synchronisation.then((resultat) => {
			signalerSynchronisationACL(pad, resultat, (nombre) => io.to(salonAdmin).emit('erreurfichiers', nombre))
		}).catch((err) => {
			console.error('Signalement de la synchronisation ACL du pad ' + pad + ' : ' + err.stack)
		})
		return 'encours'
	}

	return function enregistrer (socket, req) {
		socket.on('modifiertitre', async (pad, titre, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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

		socket.on('reinitialiservues', async (pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin || donneesPad.identifiant !== identifiant) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'vues', 0)
				io.to('pad-' + pad).emit('reinitialiservues', identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercodeacces', async (pad, code, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'code', code)
				const salonAdmin = definirSalonAdmin(pad)
				io.to(salonAdmin).emit('modifiercodeacces', code, identifiant)
				io.to('pad-' + pad).except(salonAdmin).emit('modifiercodeacces', '', identifiant)
				const evacuation = donneesPad.acces === 'code' ? await evacuerSalonNonAdmins(pad) : true
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
				if (!evacuation) socket.emit('erreurevacuation')
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieradmins', async (pad, admins, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				if (!verifierIdentifiantPad(pad)) return socket.emit('erreur')
				if (!Array.isArray(admins) || admins.length > nombreMaxAdmins) return socket.emit('erreur')
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('identifiant')) return socket.emit('erreur')
				// Seul le propriétaire du pad peut ajouter ou révoquer des co-admins
				if (donneesPad.identifiant !== identifiant || !await verifierAdmin(pad, donneesPad, req.session)) return socket.emit('nonautorise')
				const listeAdmins = definirAdministrateursPad(donneesPad).filter((admin) => admin !== donneesPad.identifiant)
				const candidats = [...new Set(admins.filter((admin) => verifierIdentifiantUtilisateur(admin) && admin !== donneesPad.identifiant))]
				const comptesExistants = await Promise.all(candidats.map((admin) => db.EXISTS('utilisateurs:' + admin)))
				const nouveauxAdmins = candidats.filter((admin, index) => comptesExistants[index] === 1)
				const adminsAjoutes = nouveauxAdmins.filter((admin) => !listeAdmins.includes(admin))
				const adminsRetires = listeAdmins.filter((admin) => !nouveauxAdmins.includes(admin))
				await db.HSET('pads:' + pad, 'admins', JSON.stringify(nouveauxAdmins))
				await Promise.all(adminsAjoutes.map((admin) => db.SADD('pads-admins:' + admin, pad.toString())))
				await Promise.all(adminsRetires.map((admin) => db.SREM('pads-admins:' + admin, pad.toString())))
				const salonAdmin = definirSalonAdmin(pad)
				adminsAjoutes.forEach((adminAjoute) => {
					io.in(definirSalonUtilisateur(pad, adminAjoute)).socketsJoin(salonAdmin)
				})
				adminsRetires.forEach((adminRetire) => {
					io.in(definirSalonUtilisateur(pad, adminRetire)).socketsLeave(salonAdmin)
				})
				// La liste des admins n'est diffusée qu'aux admins
				io.to(salonAdmin).emit('modifieradmins', nouveauxAdmins, identifiant)
				adminsAjoutes.forEach((adminAjoute) => {
					io.to(definirSalonUtilisateur(pad, adminAjoute)).emit('modifieradmins', nouveauxAdmins, identifiant)
				})
				adminsRetires.forEach((adminRetire) => {
					io.to(definirSalonUtilisateur(pad, adminRetire)).emit('modifieradmins', [], identifiant)
				})
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieracces', async (pad, acces, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (!accesPossibles.includes(acces)) return socket.emit('erreur')
				let code = ''
				if (donneesPad.hasOwnProperty('code') && donneesPad.code !== '') {
					code = donneesPad.code
				} else {
					code = Math.floor(100000 + Math.random() * 900000)
				}
				const accesPrecedent = donneesPad.acces
				await db.HSET('pads:' + pad, ['acces', acces, 'code', code])
				const changementAcces = accesPrecedent !== acces
				let synchronisation = null
				if (changementAcces && acces === 'public') {
					synchronisation = await synchroniserACL(pad, acces, delaiAttenteOuvertureACL)
				}
				const salonAdmin = definirSalonAdmin(pad)
				io.to(salonAdmin).emit('modifieracces', acces, code)
				io.to('pad-' + pad).except(salonAdmin).emit('modifieracces', acces, '')
				const evacuation = acces !== 'public' ? await evacuerSalonNonAdmins(pad) : true
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
				if (!evacuation) socket.emit('erreurevacuation')
				if (changementAcces && acces !== 'public') {
					synchronisation = await synchroniserACL(pad, acces, delaiAttenteFermetureACL)
				}
				if (synchronisation === 'encours') {
					socket.emit('synchronisationfichiers', acces)
				} else if (synchronisation) {
					signalerSynchronisationACL(pad, synchronisation, (nombre) => socket.emit('erreurfichiers', nombre))
				}
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercontributions', async (pad, contributions, contributionsPrecedentes, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				const fondPrecedent = donneesPad.fond
				await db.HSET('pads:' + pad, ['fond', fond, 'fondRepete', 'desactive'])
				if (typeof fond === 'string' && fond !== '' && !fond.includes('/img/') && fond.substring(0, 1) !== '#') {
					await televerserFichierTemp(path.basename(fond), pad, donneesPad.acces)
				}
				const fondUrl = await definirUrlFond(pad, fond, donneesPad.acces)
				io.to('pad-' + pad).emit('modifierfond', fond, identifiant, fondUrl)
				if (typeof fondPrecedent === 'string' && fondPrecedent !== fond && fondPrecedent !== '' && !fondPrecedent.includes('/img/') && fondPrecedent.substring(0, 1) !== '#') {
					await supprimerFichierSansEchec(pad, path.basename(fondPrecedent))
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercouleurfond', async (pad, fond, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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
					await supprimerFichierSansEchec(pad, path.basename(fondPrecedent))
				}
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierfondrepete', async (pad, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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

		socket.on('modifiertransfertpropriete', async (pad, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin || donneesPad.identifiant !== identifiant) return socket.emit('nonautorise')
				if (statut === 'active') {
					await db.HSET('pads:' + pad, ['transfertPropriete', 'active', 'transfertProprieteExpire', (Date.now() + dureeTransfertPropriete).toString()])
				} else {
					await db.multi()
						.HSET('pads:' + pad, 'transfertPropriete', 'desactive')
						.HDEL('pads:' + pad, 'transfertProprieteExpire')
						.exec()
				}
				io.to('pad-' + pad).emit('modifiertransfertpropriete', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifierconversation', async (pad, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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
			if (etat.maintenance === true) return socket.emit('maintenance')
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

		socket.on('modifiervisibilitecommentaires', async (pad, visibilite, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!['tous', 'admin'].includes(visibilite)) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (visibilite === 'admin') {
					await db.HSET('pads:' + pad, ['visibiliteCommentaires', visibilite, 'accesCommentaires', 'admin'])
				} else {
					await db.HSET('pads:' + pad, 'visibiliteCommentaires', visibilite)
				}
				io.to('pad-' + pad).emit('modifiervisibilitecommentaires', visibilite, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieraccescommentaires', async (pad, acces, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!['tous', 'admin'].includes(acces)) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (acces === 'tous' && donneesPad.visibiliteCommentaires === 'admin') return socket.emit('erreur')
				await db.HSET('pads:' + pad, 'accesCommentaires', acces)
				io.to('pad-' + pad).emit('modifieraccescommentaires', acces, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiermoderationcommentaires', async (pad, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!['activee', 'desactivee'].includes(statut)) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.HSET('pads:' + pad, 'commentairesModeration', statut)
				io.to('pad-' + pad).emit('modifiermoderationcommentaires', statut, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiervisibiliteevaluations', async (pad, visibilite, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!['tous', 'admin'].includes(visibilite)) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (visibilite === 'admin') {
					await db.HSET('pads:' + pad, ['visibiliteEvaluations', visibilite, 'accesEvaluations', 'admin'])
				} else {
					await db.HSET('pads:' + pad, 'visibiliteEvaluations', visibilite)
				}
				io.to('pad-' + pad).emit('modifiervisibiliteevaluations', visibilite, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifieraccesevaluations', async (pad, acces, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (!['tous', 'admin'].includes(acces)) return socket.emit('erreur')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (acces === 'tous' && donneesPad.visibiliteEvaluations === 'admin') return socket.emit('erreur')
				await db.HSET('pads:' + pad, 'accesEvaluations', acces)
				io.to('pad-' + pad).emit('modifieraccesevaluations', acces, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('modifiercopiebloc', async (pad, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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

		socket.on('modifiervisionneuse', async (pad, visionneuse, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				if (!['viewer', 'viewer-alt'].includes(visionneuse)) return socket.emit('erreur')
				await db.HSET('pads:' + pad, 'visionneuse', visionneuse)
				io.to('pad-' + pad).emit('modifiervisionneuse', visionneuse, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('viderpad', async (pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
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
	}
}
