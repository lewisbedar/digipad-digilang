import creerGestionnairesConnexion from './socket-connexion.js'
import creerGestionnairesBlocs from './socket-blocs.js'
import creerGestionnairesCommentaires from './socket-commentaires.js'
import creerGestionnairesColonnes from './socket-colonnes.js'
import creerGestionnairesPad from './socket-pad.js'
import creerGestionnairesChat from './socket-chat.js'
import creerGestionnairesActivite from './socket-activite.js'

// Orchestrateur socket.io : construit une fois les gestionnaires de chaque domaine, puis les attache à chaque connexion
export default function initialiserSocket ({
	io,
	db,
	dureeSession,
	dureeTransfertPropriete,
	salonMaintenance,
	trustProxy,
	fonctions
}) {
	const enregistrerConnexion = creerGestionnairesConnexion({
		io,
		db,
		dureeSession,
		salonMaintenance,
		trustProxy,
		fonctions
	})
	const enregistrerBlocs = creerGestionnairesBlocs({
		io,
		db,
		dureeSession,
		fonctions
	})
	const enregistrerCommentaires = creerGestionnairesCommentaires({
		io,
		db,
		dureeSession,
		fonctions
	})
	const enregistrerColonnes = creerGestionnairesColonnes({
		io,
		db,
		dureeSession,
		fonctions
	})
	const enregistrerPad = creerGestionnairesPad({
		io,
		db,
		dureeSession,
		dureeTransfertPropriete,
		fonctions
	})
	const enregistrerChat = creerGestionnairesChat({
		io,
		db,
		dureeSession,
		fonctions
	})
	const enregistrerActivite = creerGestionnairesActivite({
		io,
		db,
		dureeSession,
		fonctions
	})

	io.on('connection', (socket) => {
		const req = socket.request
		socket.use((__, next) => {
			req.session.reload((err) => {
				if (err) {
					socket.emit('deconnecte', true)
					return socket.disconnect()
				}
				next()
			})
		})

		enregistrerConnexion(socket, req)
		enregistrerBlocs(socket, req)
		enregistrerCommentaires(socket, req)
		enregistrerColonnes(socket, req)
		enregistrerPad(socket, req)
		enregistrerChat(socket, req)
		enregistrerActivite(socket, req)
	})
}
