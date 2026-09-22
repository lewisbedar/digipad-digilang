import { etat } from './etat.js'
import {
	sauvegarderSession
} from './fonctions.js'

// Registre d'activité du pad : vidage complet et suppression d'une entrée
export default function creerGestionnairesActivite ({
	io,
	db,
	dureeSession,
	fonctions
}) {
	const {
		verifierAdmin
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('reinitialiseractivite', async (pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.multi()
					.UNLINK('activite:' + pad)
					.HSET('pads:' + pad, 'activiteColonne', 0)
					.exec()
				io.to('pad-' + pad).emit('reinitialiseractivite', identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('supprimeractivite', async (pad, id, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				await db.ZREMRANGEBYSCORE('activite:' + pad, id, id)
				io.to('pad-' + pad).emit('supprimeractivite', id, identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})
	}
}
