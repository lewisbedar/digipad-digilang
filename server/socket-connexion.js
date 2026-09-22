import proxyaddr from 'proxy-addr'
import { etat } from './etat.js'
import {
	definirAccesLecture,
	definirSalonUtilisateur,
	definirSalonAdmin,
	sauvegarderSession,
	verifierIdentifiantPad
} from './fonctions.js'

// Présence et session : entrée et sortie d'un pad, déconnexion, contrôle d'accès, identité et langue du visiteur
export default function creerGestionnairesConnexion ({
	io,
	db,
	dureeSession,
	salonMaintenance,
	trustProxy,
	fonctions
}) {
	const {
		recupererDonneesPadProtege,
		fetchSockets,
		viderCacheAdmins,
		verifierAdmin,
		verifierAccesLecturePad,
		verifierLimiteEchecsCode,
		compterEchecsCode,
		oublierEchecsCode
	} = fonctions

	function compilerConfianceProxy (valeur) {
		if (typeof valeur === 'function') return valeur
		if (valeur === true) return () => true
		if (typeof valeur === 'number') return (adresse, saut) => saut < valeur
		if (typeof valeur === 'string') valeur = valeur.split(',').map((e) => e.trim())
		return proxyaddr.compile(valeur || [])
	}

	const confianceProxy = compilerConfianceProxy(trustProxy)

	async function oublierAccesMemorise (req, pad) {
		if (!req.session.hasOwnProperty('acces') || !Array.isArray(req.session.acces)) return
		const acces = req.session.acces.filter((e) => !(e.hasOwnProperty('pad') && parseInt(e.pad, 10) === parseInt(pad, 10)))
		if (acces.length === req.session.acces.length) return
		req.session.acces = acces
		await sauvegarderSession(req)
	}

	function recupererAdresseClient (socket) {
		const requete = { headers: socket.handshake.headers, socket: { remoteAddress: socket.handshake.address } }
		try {
			return proxyaddr(requete, confianceProxy)
		} catch {
			return socket.handshake.address
		}
	}

	return function enregistrer (socket, req) {
		socket.on('connexion', async (donnees) => {
			try {
				const pad = donnees.pad
				const identifiant = donnees.identifiant
				const nom = donnees.nom
				if (!verifierIdentifiantPad(pad)) return socket.emit('nonautorise')
				const salon = 'pad-' + pad
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('identifiant')) return socket.emit('nonautorise')
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!definirAccesLecture(pad, donneesPad, admin, req.session)) return socket.emit('nonautorise')
				socket.join(salon)
				if (req.session.identifiant) {
					socket.join(definirSalonUtilisateur(pad, req.session.identifiant))
				}
				if (admin) {
					socket.join(definirSalonAdmin(pad))
				}
				socket.data.identifiant = identifiant
				socket.data.nom = nom
				socket.data.identifiantSession = req.session.identifiant || ''
				viderCacheAdmins(pad)
				const clients = await fetchSockets(salon)
				const utilisateurs = []
				if (clients.length > 0) {
					for (let i = 0; i < clients.length; i++) {
						utilisateurs.push({ identifiant: clients[i].data.identifiant, nom: clients[i].data.nom })
					}
				}
				const utilisateursConnectes = utilisateurs.filter((v, i, a) => a.findIndex(t => (t.identifiant === v.identifiant)) === i)
				io.to(salon).emit('connexion', utilisateursConnectes)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('sortie', (pad, identifiant) => {
			socket.leave('pad-' + pad)
			socket.leave(definirSalonAdmin(pad))
			if (req.session.identifiant) {
				socket.leave(definirSalonUtilisateur(pad, req.session.identifiant))
			}
			viderCacheAdmins(pad)
			socket.to('pad-' + pad).emit('deconnexion', identifiant)
		})

		socket.on('disconnecting', () => {
			socket.rooms.forEach((salon) => {
				if (typeof salon === 'string' && /^pad-[0-9]{1,15}$/.test(salon)) viderCacheAdmins(salon.slice(4))
				if (req.session.identifiant !== '') io.to(salon).emit('deconnexion', req.session.identifiant)
			})
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
				socket.rooms.forEach((salon) => {
					io.to(salon).emit('deconnexion', req.session.identifiant)
				})
			}
			const salonsActuels = [...socket.rooms]
			salonsActuels.forEach((salon) => {
				if (salon !== socket.id) {
					socket.leave(salon)
				}
			})
		})

		socket.on('verifieracces', async (pad, identifiant, code) => {
			if (!verifierIdentifiantPad(pad)) return socket.emit('verifieracces', { acces: false })
			let codeMemorise = false
			if (code === '') {
				if (!req.session.hasOwnProperty('acces')) {
					req.session.acces = []
				}
				req.session.acces.forEach((e) => {
					if (e.hasOwnProperty('pad') && parseInt(e.pad, 10) === parseInt(pad, 10)) {
						code = e.code
						codeMemorise = true
					}
				})
			}
			if (req.session.identifiant !== identifiant || code === '') return socket.emit('verifieracces', { acces: false })
			try {
				if (!codeMemorise && await verifierLimiteEchecsCode(recupererAdresseClient(socket), pad)) return socket.emit('verifieracces', { acces: false })
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (!donneesPad.hasOwnProperty('code') || donneesPad.acces !== 'code') return socket.emit('verifieracces', { acces: false })
				if (code !== donneesPad.code) {
					if (codeMemorise) {
						// Accès périmé : le chargement suivant doit repartir sur la saisie du code
						await oublierAccesMemorise(req, pad)
					} else {
						await compterEchecsCode(recupererAdresseClient(socket), pad)
					}
					return socket.emit('verifieracces', { acces: false })
				}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant, admin)
				if (donneesPadProtege === 'erreur') return socket.emit('erreur')
				if (!req.session.hasOwnProperty('acces')) {
					req.session.acces = []
				}
				const accesEnregistre = req.session.acces.find((e) => e.hasOwnProperty('pad') && parseInt(e.pad, 10) === parseInt(pad, 10))
				if (accesEnregistre) {
					accesEnregistre.code = code
				} else {
					req.session.acces.push({ code: code, pad: parseInt(pad, 10) })
				}
				await sauvegarderSession(req)
				// Le compteur d'échecs ne doit pas pénaliser un visiteur qui a fini par saisir le bon code
				await oublierEchecsCode(recupererAdresseClient(socket), pad)
				socket.emit('verifieracces', { acces: true, pad: donneesPadProtege.pad, blocs: donneesPadProtege.blocs, activite: donneesPadProtege.activite })
			} catch (err) {
				console.error(err.stack)
				socket.emit('verifieracces', { acces: false })
			}
		})

		socket.on('modifiernom', async (pad, nom, statut, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			if (typeof nom !== 'string' || nom.length > 100) return socket.emit('erreur')
			try {
				if (!await verifierAccesLecturePad(pad, req.session)) return socket.emit('nonautorise')
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
			socket.join(salonMaintenance)
			socket.emit('verifiermaintenance', etat.maintenance)
		})
	}
}
