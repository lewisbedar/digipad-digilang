// État partagé et mutable du serveur
// `maintenance` est la seule variable modifiée après le démarrage : elle bascule à chaud via /api/gerer-maintenance et doit rester visible depuis les routes, les sockets et les fonctions utilitaires
const etat = {
	maintenance: false
}

export { etat }
