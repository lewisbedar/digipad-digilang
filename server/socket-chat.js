import dayjs from 'dayjs'
import { etat } from './etat.js'
import {
	sauvegarderSession
} from './fonctions.js'

// Conversation du pad : envoi des messages et vidage de la conversation
export default function creerGestionnairesChat ({
	io,
	db,
	dureeSession,
	fonctions
}) {
	const {
		verifierAdmin,
		verifierAccesLecturePad
	} = fonctions

	return function enregistrer (socket, req) {
		socket.on('message', async (pad, texte, identifiant, nom) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				if (!await verifierAccesLecturePad(pad, req.session)) return socket.emit('nonautorise')
				const date = dayjs().format()
				io.to('pad-' + pad).emit('message', { texte: texte, identifiant: identifiant, nom: nom, date: date })
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})

		socket.on('reinitialisermessages', async (pad, identifiant) => {
			if (etat.maintenance === true) return socket.emit('maintenance')
			if (!identifiant || req.session.identifiant !== identifiant) return socket.emit('deconnecte')
			try {
				let donneesPad = await db.HGETALL('pads:' + pad)
				donneesPad = donneesPad ? { ...donneesPad } : {}
				const admin = await verifierAdmin(pad, donneesPad, req.session)
				if (!admin) return socket.emit('nonautorise')
				io.to('pad-' + pad).emit('reinitialisermessages', identifiant)
				req.session.cookie.expires = new Date(Date.now() + dureeSession)
				await sauvegarderSession(req)
			} catch (err) {
				console.error(err.stack)
				socket.emit('erreur')
			}
		})
	}
}
