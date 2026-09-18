import { etat } from './etat.js'
import {
	definirSalonUtilisateur,
	definirSalonAdmin,
	sauvegarderSession
} from './fonctions.js'

// Présence et session : entrée et sortie d'un pad, déconnexion, contrôle d'accès, identité et langue du visiteur
export default function creerGestionnairesConnexion ({
	io,
	db,
	dureeSession,
	salonMaintenance,
	fonctions
}) {
	const {
		recupererDonneesPadProtege,
		fetchSockets,
		verifierAdmin
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('connexion', async (donnees) => {
			try {
				const pad = donnees.pad
				const identifiant = donnees.identifiant
				const nom = donnees.nom
				const salon = 'pad-' + pad
				socket.join(salon)
				if (req.session.identifiant) {
					socket.join(definirSalonUtilisateur(pad, req.session.identifiant))
				}
				socket.data.identifiant = identifiant
				socket.data.nom = nom
				let [donneesPad, clients] = await Promise.all([db.HGETALL('pads:' + pad), fetchSockets(salon)])
				donneesPad = donneesPad ? { ...donneesPad } : {}
				if (await verifierAdmin(pad, donneesPad, req.session)) {
					socket.join(definirSalonAdmin(pad))
				}
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
			socket.to('pad-' + pad).emit('deconnexion', identifiant)
		})

		socket.on('disconnecting', () => {
			if (req.session.identifiant !== '') {
				socket.rooms.forEach((salon) => {
					io.to(salon).emit('deconnexion', req.session.identifiant)
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
				const donneesPadProtege = await recupererDonneesPadProtege(donneesPad, pad, identifiant, false)
				if (donneesPadProtege === 'erreur') return socket.emit('erreur')
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
