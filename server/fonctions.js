import path from 'path'
import fs from 'fs-extra'
import v from 'voca'
import AdmZip from 'adm-zip'
import dayjs from 'dayjs'
import 'dayjs/locale/es.js'
import 'dayjs/locale/fr.js'
import 'dayjs/locale/de.js'
import 'dayjs/locale/hr.js'
import 'dayjs/locale/it.js'
import localizedFormat from 'dayjs/plugin/localizedFormat.js'
import { promises as dnsPromises } from 'dns'
import { URL } from 'url'
import { createHash, createHmac, randomInt, timingSafeEqual } from 'crypto'

dayjs.extend(localizedFormat)

// Pour validation des chaînes dans ajouterbloc et modifierbloc
const limitesTailleInput = { titre: 100, texte: 10_000, iframe: 2000, alt: 250, code: 18 }

// Nombre maximum d'opérations asynchrones simultanées dans executerTransactions
const tailleLotTransaction = 10

// Nombre maximum d'administrateurs d'un pad
const nombreMaxAdmins = 50

function obtenirCleEchecConnexion (identifiant, ip) {
	if (typeof identifiant !== 'string' || !identifiant.match(/^[\w-]+$/)) return null
	const adresse = typeof ip === 'string' && ip !== '' ? ip : 'inconnu'
	return 'rl-connexion-id:' + identifiant + ':' + adresse
}

function definirBlocDiffuse (champsBase, visibilite, contenu, contributions) {
	const contenuAMasquer = (visibilite === 'privee' || (visibilite === 'masquee' && contributions === 'moderees'))
	const blocComplet = { ...champsBase, visibilite, texte: contenu.texte, media: contenu.media, alt: contenu.alt, iframe: contenu.iframe, vignette: contenu.vignette }
	if (!contenuAMasquer) {
		return { complet: blocComplet, reduit: blocComplet }
	}
	const blocReduit = { ...champsBase, visibilite }
	delete blocReduit.titre
	delete blocReduit.type
	delete blocReduit.source
	delete blocReduit.identifiant
	delete blocReduit.nom
	delete blocReduit.blocOrigine
	delete blocReduit.activiteId
	return { complet: blocComplet, reduit: blocReduit }
}

function validerIndexColonne (colonne, nombreColonnes) {
	if (typeof colonne !== 'number' && typeof colonne !== 'string') return null
	const index = Number(colonne)
	if (!Number.isInteger(index) || index < 0) return null
	if (index >= Math.max(nombreColonnes, 1)) return null
	return index
}

function definirColonneBloc (colonne, nombreColonnes) {
	const index = parseInt(colonne, 10)
	if (!Number.isInteger(index) || index < 0) return 0
	if (nombreColonnes > 0 && index >= nombreColonnes) return nombreColonnes - 1
	return index
}

function reduireColonnesMasquees (colonnes, affichageColonnes) {
	if (!Array.isArray(colonnes) || !Array.isArray(affichageColonnes)) return colonnes
	return colonnes.map((titre, index) => affichageColonnes[index] === false ? '' : titre)
}

function verifierTitreColonneDisponible (colonnes, titre, indexIgnore = -1) {
	if (typeof titre !== 'string' || titre === '') return true
	if (!Array.isArray(colonnes)) return true
	return !colonnes.some((el, index) => index !== indexIgnore && el === titre)
}

function genererCodeAcces () {
	return randomInt(10000000, 100000000)
}
function verifierTitre (titre) {
	return typeof titre === 'string' && titre.trim() !== '' && titre.length <= limitesTailleInput.titre
}

function verifierMotDePasseSaisi (motdepasse) {
	return typeof motdepasse === 'string' && motdepasse.trim() !== ''
}

function verifierTitreColonne (titre) {
	return typeof titre === 'string' && titre.trim() !== '' && titre.length <= limitesTailleInput.titre
}

function definirTitreColonne (titre, suffixe) {
	return titre.substring(0, Math.max(limitesTailleInput.titre - suffixe.length, 0)) + suffixe
}

function definirTitreColonneDisponible (colonnes, titre) {
	if (verifierTitreColonneDisponible(colonnes, titre)) return titre
	let compteur = 2
	while (!verifierTitreColonneDisponible(colonnes, definirTitreColonne(titre, ' (' + compteur + ')'))) compteur++
	return definirTitreColonne(titre, ' (' + compteur + ')')
}

function normaliserTitresColonnes (colonnes) {
	if (!Array.isArray(colonnes)) return []
	const occurrences = new Map()
	colonnes.forEach((titre) => {
		if (typeof titre !== 'string' || titre === '') return
		occurrences.set(titre, (occurrences.get(titre) || 0) + 1)
	})
	const titresRetenus = []
	colonnes.forEach((titre, index) => {
		if (typeof titre !== 'string' || titre === '' || occurrences.get(titre) === 1) {
			titresRetenus.push(titre)
			return
		}
		let compteur = index + 1
		while (!verifierTitreColonneDisponible(titresRetenus, definirTitreColonne(titre, ' ' + compteur)) || colonnes.includes(definirTitreColonne(titre, ' ' + compteur))) compteur++
		titresRetenus.push(definirTitreColonne(titre, ' ' + compteur))
	})
	return titresRetenus
}

function creerFiltreActiviteColonnes (colonnes, affichageColonnes) {
	const titresMasques = new Set()
	if (Array.isArray(colonnes)) {
		colonnes.forEach((titre, index) => {
			if (typeof titre !== 'string' || titre === '') return
			if (Array.isArray(affichageColonnes) && affichageColonnes[index] === false) titresMasques.add(titre)
		})
	}
	return (entree) => {
		if (entree.masquee === true) return false
		return !titresMasques.has(entree.titre)
	}
}

function normaliserAffichageColonnes (colonnes, affichageColonnes) {
	const listeColonnes = Array.isArray(colonnes) ? colonnes : parseJSON(colonnes, null)
	if (!Array.isArray(listeColonnes)) return []
	const listeAffichage = Array.isArray(affichageColonnes) ? affichageColonnes : parseJSON(affichageColonnes, null)
	if (!Array.isArray(listeAffichage)) return listeColonnes.map(() => true)
	return listeColonnes.map((titre, index) => listeAffichage[index] !== false)
}

function definirAffichageColonnes (donneesPad, affichageColonnes) {
	const colonnes = Array.isArray(donneesPad.colonnes) ? donneesPad.colonnes : parseJSON(donneesPad.colonnes, null)
	const listeAffichage = Array.isArray(affichageColonnes) ? affichageColonnes : parseJSON(affichageColonnes, null)
	if (!Array.isArray(colonnes)) return Array.isArray(listeAffichage) ? listeAffichage : null
	return normaliserAffichageColonnes(colonnes, listeAffichage)
}

function creerFiltreColonneMasquee (donneesPad, affichageColonnes) {
	if (donneesPad.affichage !== 'colonnes') return () => false
	const liste = definirAffichageColonnes(donneesPad, affichageColonnes)
	if (!liste) return () => false
	return (colonne) => liste[definirColonneBloc(colonne, liste.length)] === false
}

function verifierColonneMasquee (donneesPad, affichageColonnes, colonne) {
	return creerFiltreColonneMasquee(donneesPad, affichageColonnes)(colonne)
}

function verifierIdentifiantPad (pad) {
	return (typeof pad === 'string' || typeof pad === 'number') && /^[0-9]{1,15}$/.test(String(pad))
}

function verifierIdentifiantUtilisateur (identifiant) {
	return typeof identifiant === 'string' && identifiant.length <= 100 && /^[\w-]+$/.test(identifiant)
}

function verifierIdentifiantBloc (bloc) {
	return typeof bloc === 'string' && /^bloc-id-[0-9a-f]{20,64}$/.test(bloc)
}

// Compatibilité avec les anciens id de bloc
function verifierIdentifiantBlocExistant (bloc) {
	return typeof bloc === 'string' && /^bloc-id-[0-9a-f]{10,64}$/.test(bloc)
}

function verifierBlocVisible (bloc, contributions) {
	return !((contributions === 'moderees' && bloc.visibilite === 'masquee') || bloc.visibilite === 'privee')
}

function verifierCapsuleLisible (donneesPad, bloc, admin, identifiant) {
	if (admin === true) return true
	if (bloc.identifiant && bloc.identifiant === identifiant) return true
	if (!verifierBlocVisible(bloc, donneesPad.contributions)) return false
	return !verifierColonneMasquee(donneesPad, parseJSON(donneesPad.affichageColonnes, null), bloc.colonne)
}

function definirIndicesColonnesExport (pad) {
	if (pad.affichage !== 'colonnes') return null
	const colonnes = parseJSON(pad.colonnes, null)
	if (!Array.isArray(colonnes)) return null
	const affichageColonnes = normaliserAffichageColonnes(colonnes, parseJSON(pad.affichageColonnes, null))
	if (!colonnes.some((titre, index) => affichageColonnes[index] === false)) return null
	const indices = new Map()
	colonnes.forEach((titre, index) => {
		if (affichageColonnes[index] === false) return
		indices.set(index, indices.size)
	})
	return indices
}

function definirDonneesPadExport (pad) {
	const champs = ['titre', 'affichage', 'ordre', 'largeur', 'colonnes', 'fond', 'fondRepete', 'commentaires', 'evaluations']
	const donneesPadExport = {}
	champs.forEach((champ) => {
		if (pad.hasOwnProperty(champ)) donneesPadExport[champ] = pad[champ]
	})
	if (pad.visibiliteCommentaires === 'admin') donneesPadExport.commentaires = 'desactives'
	if (pad.visibiliteEvaluations === 'admin') donneesPadExport.evaluations = 'desactivees'
	const indicesColonnes = definirIndicesColonnesExport(pad)
	if (indicesColonnes) {
		const titres = parseJSON(pad.colonnes, []).filter((titre, index) => indicesColonnes.has(index))
		donneesPadExport.colonnes = JSON.stringify(titres)
		if (titres.length === 0) donneesPadExport.affichage = 'mur'
	}
	return donneesPadExport
}

function definirFichiersExport (blocs) {
	const fichiers = new Set()
	blocs.forEach((bloc) => {
		if (typeof bloc.media === 'string' && bloc.media !== '' && bloc.type !== 'embed' && bloc.type !== 'lien' && !verifierURL(bloc.media, ['https', 'http'])) fichiers.add(path.basename(bloc.media))
		if (typeof bloc.vignette === 'string' && bloc.vignette !== '' && !bloc.vignette.includes('/img/') && !verifierURL(bloc.vignette, ['https', 'http'])) fichiers.add(path.basename(bloc.vignette))
	})
	return Array.from(fichiers)
}

function definirBlocsExport (blocs, pad) {
	const commentairesVisibles = pad.visibiliteCommentaires !== 'admin'
	const evaluationsVisibles = pad.visibiliteEvaluations !== 'admin'
	const champs = ['bloc', 'titre', 'texte', 'media', 'alt', 'iframe', 'type', 'source', 'vignette', 'colonne', 'couleur', 'identifiant', 'nom', 'info']
	const indicesColonnes = definirIndicesColonnesExport(pad)
	const nombreColonnes = parseJSON(pad.colonnes, []).length
	const colonneMasquee = creerFiltreColonneMasquee(pad, pad.affichageColonnes)
	const colonneEffective = (bloc) => definirColonneBloc(bloc.colonne, nombreColonnes)
	const blocsExportes = blocs.filter((bloc) => verifierBlocVisible(bloc, pad.contributions) && !colonneMasquee(colonneEffective(bloc)))
	return blocsExportes.map((bloc) => {
		const blocExport = {}
		champs.forEach((champ) => {
			if (bloc.hasOwnProperty(champ)) blocExport[champ] = bloc[champ]
		})
		if (indicesColonnes) {
			blocExport.colonne = indicesColonnes.get(colonneEffective(bloc)) ?? 0
		}
		const listeCommentaires = (commentairesVisibles && Array.isArray(bloc.listeCommentaires)) ? bloc.listeCommentaires.filter((commentaire) => commentaire.visibilite !== 'masquee') : []
		blocExport.listeCommentaires = listeCommentaires
		blocExport.commentaires = listeCommentaires.length
		blocExport.listeEvaluations = (evaluationsVisibles && Array.isArray(bloc.listeEvaluations)) ? bloc.listeEvaluations : []
		blocExport.evaluations = blocExport.listeEvaluations.length
		return blocExport
	})
}

function definirBlocsDeplaces (listeItems, blocs, donneesPad, identifiantLecteur) {
	const colonneMasquee = creerFiltreColonneMasquee(donneesPad, donneesPad.affichageColonnes)
	return listeItems.filter((item, index) => {
		const bloc = blocs[index]
		if (!bloc) return false
		if (identifiantLecteur && bloc.identifiant === identifiantLecteur) return true
		if (!verifierBlocVisible(bloc, donneesPad.contributions)) return false
		return !colonneMasquee(bloc.colonne)
	})
}

function recupererNombreCommentaires (totalCommentaires, identifiantsMasques, admin, identifiant, commentairesVisibles = true) {
	if (!admin && commentairesVisibles === false) return { commentaires: 0, commentairesEnAttente: 0 }
	const commentairesMasques = identifiantsMasques.length
	const commentairesMasquesAuteur = identifiantsMasques.filter(m => extraireIdentifiantMasque(m) === identifiant).length
	return {
		commentaires: admin ? totalCommentaires : (totalCommentaires - commentairesMasques + commentairesMasquesAuteur),
		commentairesEnAttente: admin ? commentairesMasques : commentairesMasquesAuteur
	}
}

function verifierActiviteVisible (entree, donneesPad, admin, identifiant, commentairesMasquesParBloc) {
	if (entree.type === 'bloc-evalue') return (admin || donneesPad.visibiliteEvaluations !== 'admin')
	if (entree.type !== 'bloc-commente' && entree.type !== 'commentaire-valide') return true
	if (admin) return true
	if (donneesPad.visibiliteCommentaires === 'admin') return false
	if (entree.type === 'bloc-commente' && entree.hasOwnProperty('commentaire')) {
		const identifiantsMasques = commentairesMasquesParBloc ? commentairesMasquesParBloc.get(entree.bloc) : null
		if (identifiantsMasques && identifiantsMasques.some((masque) => extraireIdCommentaireMasque(masque) === String(entree.commentaire) && extraireIdentifiantMasque(masque) !== identifiant)) return false
	}
	return true
}

function definirModeration (donnees) {
	const source = donnees || {}
	const visibiliteCommentaires = (source.visibiliteCommentaires === 'admin') ? 'admin' : 'tous'
	const accesCommentaires = (visibiliteCommentaires === 'admin' || source.accesCommentaires === 'admin') ? 'admin' : 'tous'
	const commentairesModeration = (source.commentairesModeration === 'activee') ? 'activee' : 'desactivee'
	const visibiliteEvaluations = (source.visibiliteEvaluations === 'admin') ? 'admin' : 'tous'
	const accesEvaluations = (visibiliteEvaluations === 'admin' || source.accesEvaluations === 'admin') ? 'admin' : 'tous'
	return { visibiliteCommentaires, accesCommentaires, commentairesModeration, visibiliteEvaluations, accesEvaluations }
}

function definirParametresModeration (donnees) {
	return Object.entries(definirModeration(donnees)).flat()
}

function definirSalonUtilisateur (pad, identifiant) {
	return 'pad-' + pad + '-u-' + identifiant
}

function definirSalonAdmin (pad) {
	return 'pad-admin-' + pad
}

function extraireIdentifiantMasque (masque) {
	return masque.substring(masque.indexOf(':') + 1)
}

function extraireIdCommentaireMasque (masque) {
	return masque.substring(0, masque.indexOf(':'))
}

function sauvegarderSession (req) {
	return new Promise((resolve, reject) => {
		req.session.save((err) => {
			if (err) reject(err)
			else resolve()
		})
	})
}

const champsPadsClient = ['id', 'token', 'titre', 'identifiant', 'nom', 'fond', 'fondUrl', 'acces', 'date', 'vues', 'notification', 'transfertPropriete', 'affichage']

function filtrerChamps (objet, champs) {
	const resultat = {}
	if (!objet) return resultat
	champs.forEach((champ) => {
		if (objet.hasOwnProperty(champ)) resultat[champ] = objet[champ]
	})
	return resultat
}

function reduireNotification (notification, identifiant) {
	if (!identifiant) return []
	const liste = typeof notification === 'string' ? parseJSON(notification, []) : notification
	if (!Array.isArray(liste)) return []
	return liste.includes(identifiant) ? [identifiant] : []
}

function definirAdministrateursPad (donneesPad) {
	const administrateurs = []
	if (donneesPad.identifiant) administrateurs.push(donneesPad.identifiant)
	if (!donneesPad.hasOwnProperty('admins')) return administrateurs
	try {
		let admins = donneesPad.admins
		if (typeof admins === 'string') admins = admins.substring(0, 2) === '"\\' ? [] : JSON.parse(admins)
		if (typeof admins === 'string') admins = JSON.parse(admins)
		if (Array.isArray(admins)) {
			admins.forEach((admin) => {
				if (typeof admin === 'string' && admin !== '' && !administrateurs.includes(admin)) administrateurs.push(admin)
			})
		}
	} catch {}
	return administrateurs
}

function verifierAdministrateurListe (identifiant, donneesPad) {
	if (!identifiant) return false
	return definirAdministrateursPad(donneesPad).includes(identifiant)
}

function nettoyerPads (pads, identifiant) {
	return pads.filter(el => el && Object.keys(el).length > 0).map((el) => {
		const pad = filtrerChamps(el, champsPadsClient)
		pad.id = parseInt(el.id, 10)
		if (pad.hasOwnProperty('notification')) pad.notification = reduireNotification(pad.notification, identifiant)
		return pad
	})
}

function supprimerDoublons (pads) {
	return pads.filter((valeur, index, self) =>
		index === self.findIndex((t) => (
			t.id === valeur.id && t.token === valeur.token
		))
	)
}

function definirAccesLecture (pad, donneesPad, admin, session) {
	const accesCode = donneesPad.hasOwnProperty('code') && donneesPad.acces === 'code'
	const accesPrive = donneesPad.acces === 'prive'
	if (admin || (!accesCode && !accesPrive)) return true
	if (!accesCode || !session || !session.hasOwnProperty('acces')) return false
	return session.acces.some((e) => e.hasOwnProperty('pad') && parseInt(e.pad, 10) === parseInt(pad, 10) && e.code === donneesPad.code)
}

function supprimerSession (req) {
	if (req.hasOwnProperty('session')) {
		req.session.identifiant = ''
		req.session.motdepasse = ''
		req.session.nom = ''
		req.session.email = ''
		req.session.langue = ''
		req.session.statut = ''
		req.session.pads = []
		req.session.destroy()
	}
}

function genererPseudo () {
	const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
	return nom
}

function genererMotDePasse (longueur) {
	function rand (max) {
		return Math.floor(Math.random() * max)
	}
	function verifierMotDePasse (motdepasse, regex, caracteres) {
		if (!regex.test(motdepasse)) {
			const nouveauCaractere = caracteres.charAt(rand(caracteres.length))
			const position = rand(motdepasse.length + 1)
			motdepasse = motdepasse.slice(0, position) + nouveauCaractere + motdepasse.slice(position)
		}
		return motdepasse
	}
	const caracteres = '123456789abcdefghijklmnopqrstuvwxyz'.split('')
	const caracteresSpeciaux = '!#$@*'
	const specialRegex = /[!#\$@*]/
	const majuscules = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
	const majusculesRegex = /[A-Z]/
	let motdepasse = ''
	let index
	while (motdepasse.length < longueur) {
		index = rand(caracteres.length)
		motdepasse += caracteres[index]
		caracteres.splice(index, 1)
	}
	motdepasse = verifierMotDePasse(motdepasse, specialRegex, caracteresSpeciaux)
	motdepasse = verifierMotDePasse(motdepasse, majusculesRegex, majuscules)
	return motdepasse  
}

function verifierEmail (email) {
	const regexExp = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/gi
	return regexExp.test(email)
}

function verifierFormatEmail (email) {
	if (typeof email !== 'string') return false
	const adresse = email.trim()
	if (adresse.length < 6 || adresse.length > 254) return false
	if (adresse.indexOf(' ') !== -1) return false
	const positionArobase = adresse.lastIndexOf('@')
	if (positionArobase < 1) return false
	const partieLocale = adresse.slice(0, positionArobase)
	const domaine = adresse.slice(positionArobase + 1)
	if (partieLocale.length > 64) return false
	if (domaine.length > 253 || domaine.indexOf('.') === -1) return false
	if (domaine.startsWith('.') || domaine.endsWith('.') || domaine.indexOf('..') !== -1) return false
	const tld = domaine.slice(domaine.lastIndexOf('.') + 1)
	// TLD alphabétique classique ou TLD internationalisé en punycode (xn--...)
	if (!/^[a-zA-Z]{2,}$/.test(tld) && !/^xn--[a-z0-9-]{2,}$/i.test(tld)) return false
	return verifierEmail(adresse)
}

const cacheMxDomaines = new Map()

const dureeCacheMx = 3600000 // 1 heure pour un résultat positif

const dureeCacheMxNegatif = 300000 // 5 minutes pour un résultat négatif

const tailleMaxCacheMx = 5000

const timeoutDnsMx = 3000

function nettoyerCacheMx (maintenant) {
	for (const [cle, valeur] of cacheMxDomaines) {
		if (valeur.expiration <= maintenant) cacheMxDomaines.delete(cle)
	}
	while (cacheMxDomaines.size > tailleMaxCacheMx) {
		cacheMxDomaines.delete(cacheMxDomaines.keys().next().value)
	}
}

async function verifierDomaineEmail (domaine) {
	const creerResolveur = () => new dnsPromises.Resolver({ timeout: timeoutDnsMx, tries: 1 })
	const absenceEnregistrement = (err) => err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')
	// Repli sur un enregistrement A/AAAA quand le domaine n'a pas de MX (RFC 5321)
	const verifierEnregistrementA = async () => {
		const resolveur = creerResolveur()
		try {
			await resolveur.resolve4(domaine)
			return true
		} catch (e4) {
			if (!absenceEnregistrement(e4)) return null
		}
		try {
			await resolveur.resolve6(domaine)
			return true
		} catch (e6) {
			return absenceEnregistrement(e6) ? false : null
		}
	}
	const hoteMxExploitable = (e) => {
		if (!e || typeof e.exchange !== 'string') return false
		return e.exchange.trim().replace(/\.$/, '') !== ''
	}
	const maintenant = Date.now()
	const enCache = cacheMxDomaines.get(domaine)
	if (enCache && enCache.expiration > maintenant) return enCache.domaineValide
	let domaineValide
	let resultatFiable = true
	try {
		const enregistrements = await creerResolveur().resolveMx(domaine)
		const aMxExploitable = Array.isArray(enregistrements) && enregistrements.some(hoteMxExploitable)
		const nullMxExplicite = Array.isArray(enregistrements) && enregistrements.length > 0 && !aMxExploitable
		if (aMxExploitable) {
			domaineValide = true
		} else if (nullMxExplicite) {
			// Domaine refusant explicitement le courrier -> rejet certain, pas de repli A/AAAA
			domaineValide = false
		} else {
			const repliA = await verifierEnregistrementA()
			domaineValide = repliA === null ? true : repliA
			resultatFiable = repliA !== null
		}
	} catch (err) {
		if (err && err.code === 'ENOTFOUND') {
			// Domaine inexistant (NXDOMAIN)
			domaineValide = false
		} else if (err && err.code === 'ENODATA') {
			// Aucun MX -> on tente le repli A/AAAA avant de rejeter
			const repliA = await verifierEnregistrementA()
			domaineValide = repliA === null ? true : repliA
			resultatFiable = repliA !== null
		} else {
			// Incertitude réseau/DNS (timeout, SERVFAIL…) -> envoi pas bloqué
			domaineValide = true
			resultatFiable = false
		}
	}
	if (resultatFiable) {
		nettoyerCacheMx(maintenant)
		const duree = domaineValide ? dureeCacheMx : dureeCacheMxNegatif
		cacheMxDomaines.set(domaine, { domaineValide: domaineValide, expiration: maintenant + duree })
	}
	return domaineValide
}

function definirNomFichier (fichier) {
	const info = path.parse(fichier)
	const extension = info.ext.toLowerCase()
	let nom = v.latinise(info.name.toLowerCase())
	nom = nom.replace(/\ /gi, '-')
	nom = nom.replace(/[^0-9a-z_\-]/gi, '')
	if (nom.length > 100) {
		nom = nom.substring(0, 100)
	}
	nom = nom + '_' + Math.random().toString(36).substring(2) + extension
	return nom
}

function definirCheminFichiers () {
	if (process.env.VITE_STORAGE && process.env.VITE_STORAGE === 's3' && process.env.VITE_S3_PUBLIC_LINK && process.env.VITE_S3_PUBLIC_LINK !== '') {
		return process.env.VITE_S3_PUBLIC_LINK
	} else {
		return '/fichiers'
	}
}

async function extraireArchive (source, dir) {
	const zip = new AdmZip(source)
	await new Promise((resolve, reject) => {
		zip.extractAllToAsync(dir, true, false, (err) => {
			if (err) return reject(err)
			resolve()
		})
	})
}

async function supprimerArchives (source, cible) {
	try {
		await Promise.all([
			fs.remove(source),
			fs.remove(cible)
		])
	} catch {}
}

function verifierURL (s, protocoles) {
	try {
		const url = new URL(s)
		const liste = (Array.isArray(protocoles) && protocoles.length > 0) ? protocoles : ['https', 'http']
		return liste.map(x => `${x.toLowerCase()}:`).includes(url.protocol)
	} catch {
		return false
	}
}

function assainirHTML (html) {
	if (!html || typeof html !== 'string') return ''
	const passesMaximum = 10
	let passes = 0
	let precedent
	let assaini = html
	do {
		precedent = assaini
		passes++
		assaini = precedent.replace(/<\s*\/?\s*(script|style|iframe|frame|frameset|object|embed|applet|form|input|button|meta|link|base)(\s[^>]*)?\/?>/gi, '').replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '').replace(/(href|src|action)\s*=\s*(?:"(javascript|vbscript):[^"]*"|'(javascript|vbscript):[^']*'|(javascript|vbscript):[^\s>]*)/gi, '')
	} while (assaini !== precedent && passes < passesMaximum)
	if (assaini !== precedent) return assaini.replace(/[<>]/g, '')
	return assaini
}

function assainirIframe (html) {
	if (!html || typeof html !== 'string') return ''
	return html.replace(/\son\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, '').replace(/src\s*=\s*(?:"(javascript|vbscript|data):[^"]*"|'(javascript|vbscript|data):[^']*'|(javascript|vbscript|data):[^\s>]*)/gi, '')
}

function assainirTexteAlternatif (alt) {
	if (!alt || typeof alt !== 'string') return ''
	return alt.replace(/[<>]/g, '').trim().substring(0, limitesTailleInput.alt)
}

async function executerTransactions (liste, traitement, taille = tailleLotTransaction) {
	if (!Array.isArray(liste)) throw new TypeError('executerTransactions attend un tableau')
	const resultats = []
	for (let debut = 0; debut < liste.length; debut += taille) {
		const lot = liste.slice(debut, debut + taille)
		const resultatsLot = await Promise.all(lot.map((element, index) => traitement(element, debut + index)))
		resultats.push(...resultatsLot)
	}
	return resultats
}

function parseJSON (str, fallback) {
	try {
		return JSON.parse(str)
	} catch {
		return fallback
	}
}

function comparerChaines (c1, c2) {
	if (typeof c1 !== 'string' || typeof c2 !== 'string') return false
	const tampon1 = Buffer.from(c1)
	const tampon2 = Buffer.from(c2)
	if (tampon1.length !== tampon2.length) return false
	return timingSafeEqual(tampon1, tampon2)
}

function comparerHash (h1, h2) {
	if (!h1 || !h2) return false
	return comparerChaines(h1, h2)
}

function verifierMotDePasseAdmin (motdepasse) {
	const motdepasseAdmin = process.env.ADMIN_PASSWORD
	if (!motdepasse || typeof motdepasse !== 'string' || !motdepasseAdmin) return false
	const empreinte = createHash('sha256').update(motdepasse).digest()
	const empreinteAdmin = createHash('sha256').update(motdepasseAdmin).digest()
	return timingSafeEqual(empreinte, empreinteAdmin)
}

const dureeJetonTeleversement = 120_000

function genererJetonTeleversement (secret, action, pad) {
	const charge = Buffer.from(JSON.stringify({ action, pad: pad || '', exp: Date.now() + dureeJetonTeleversement })).toString('base64url')
	const signature = createHmac('sha256', secret).update(charge).digest('base64url')
	return charge + '.' + signature
}

const dureeJetonFichier = 3600_000

function genererJetonFichier (secret, pad, fichier) {
	const charge = Buffer.from(JSON.stringify({ pad: String(pad), fichier, exp: Date.now() + dureeJetonFichier })).toString('base64url')
	const signature = createHmac('sha256', secret).update(charge).digest('base64url')
	return charge + '.' + signature
}

function verifierJetonFichier (secret, jeton, pad, fichier) {
	if (!secret || typeof jeton !== 'string' || jeton === '') return false
	const separateur = jeton.lastIndexOf('.')
	if (separateur === -1) return false
	const charge = jeton.substring(0, separateur)
	const signature = jeton.substring(separateur + 1)
	const signatureAttendue = createHmac('sha256', secret).update(charge).digest('base64url')
	if (!comparerChaines(signature, signatureAttendue)) return false
	const donnees = parseJSON(Buffer.from(charge, 'base64url').toString(), null)
	if (!donnees || typeof donnees !== 'object') return false
	if (String(donnees.pad) !== String(pad) || donnees.fichier !== fichier) return false
	return typeof donnees.exp === 'number' && donnees.exp > Date.now()
}

function verifierFichierAudio (buffer, nomFichier, mimetype) {
	if (!buffer || buffer.length < 3 || typeof nomFichier !== 'string' || typeof mimetype !== 'string') return false
	if (path.extname(nomFichier).toLowerCase() !== '.mp3') return false
	if (!['audio/mpeg', 'audio/mp3'].includes(mimetype.split(';')[0].trim().toLowerCase())) return false
	return buffer.subarray(0, 3).toString('binary') === 'ID3' || (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0)
}

function verifierContenuFichier (buffer, mimetype) {
	if (!buffer || buffer.length < 4) return false
	const b = buffer
	const type = mimetype.split(';')[0].trim()
	if (type === 'image/jpeg' || type === 'image/jpg') return b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF
	if (type === 'image/png') return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4E && b[3] === 0x47
	if (type === 'image/gif') {
		const sig = b.slice(0, 6).toString('binary')
		return sig === 'GIF87a' || sig === 'GIF89a'
	}
	if (type === 'image/webp') return b.slice(0, 4).toString('binary') === 'RIFF' && b.length >= 12 && b.slice(8, 12).toString('binary') === 'WEBP'
	if (type === 'application/pdf') return b.slice(0, 4).toString('ascii') === '%PDF'
	const categorie = type.split('/')[0]
	if (categorie === 'audio' || categorie === 'video') {
		const debut = b.slice(0, 4).toString('binary')
		if (b.slice(0, 3).toString('binary') === 'ID3') return true
		if (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0) return true
		if (b.length >= 8 && b.slice(4, 8).toString('binary') === 'ftyp') return true
		if (debut === 'OggS' || debut === 'fLaC') return true
		if (debut === 'RIFF' && b.length >= 12 && ['WAVE', 'AVI '].includes(b.slice(8, 12).toString('binary'))) return true
		return b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3
	}
	return true
}

function formaterDate (donnees, langue) {
	let dateFormattee = ''
	switch (langue) {
	case 'fr':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '. Modifiée le ' + dayjs(new Date(donnees.modifie)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.modifie)).locale('fr').format('LT') + '.'
		} else {
			dateFormattee = 'Créée le ' + dayjs(new Date(donnees.date)).locale('fr').format('L') + ' à ' + dayjs(new Date(donnees.date)).locale('fr').format('LT') + ' par ' + donnees.nom + '.'
		}
		break
	case 'es':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '. Modificada el ' + dayjs(new Date(donnees.modifie)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.modifie)).locale('es').format('LT') + '.'
		} else {
			dateFormattee = 'Creada el ' + dayjs(new Date(donnees.date)).locale('es').format('L') + ' a las ' + dayjs(new Date(donnees.date)).locale('es').format('LT') + ' por ' + donnees.nom + '.'
		}
		break
	case 'it':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '. Modifica attivata ' + dayjs(new Date(donnees.modifie)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.modifie)).locale('it').format('LT') + '.'
		} else {
			dateFormattee = 'Creazione attivata ' + dayjs(new Date(donnees.date)).locale('it').format('L') + ' alle ' + dayjs(new Date(donnees.date)).locale('it').format('LT') + ' di ' + donnees.nom + '.'
		}
		break
	case 'de':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '. Geändert am ' + dayjs(new Date(donnees.modifie)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.modifie)).locale('de').format('LT') + '.'
		} else {
			dateFormattee = 'Erstellt am ' + dayjs(new Date(donnees.date)).locale('de').format('L') + ' um ' + dayjs(new Date(donnees.date)).locale('de').format('LT') + ' von ' + donnees.nom + '.'
		}
		break
	case 'en':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '. Modified on ' + dayjs(new Date(donnees.modifie)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.modifie)).locale('en').format('LT') + '.'
		} else {
			dateFormattee = 'Created on ' + dayjs(new Date(donnees.date)).locale('en').format('L') + ' at ' + dayjs(new Date(donnees.date)).locale('en').format('LT') + ' by ' + donnees.nom + '.'
		}
		break
	case 'hr':
		if (donnees.hasOwnProperty('modifie')) {
			dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '. Izmijenjeno na ' + dayjs(new Date(donnees.modifie)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.modifie)).locale('hr').format('LT') + '.'
		} else {
			dateFormattee = 'Stvoreno na ' + dayjs(new Date(donnees.date)).locale('hr').format('L') + ' u ' + dayjs(new Date(donnees.date)).locale('hr').format('LT') + ' po ' + donnees.nom + '.'
		}
		break
	}
	return dateFormattee
}

export {
	limitesTailleInput,
	nombreMaxAdmins,
	tailleLotTransaction,
	obtenirCleEchecConnexion,
	definirBlocDiffuse,
	definirColonneBloc,
	normaliserAffichageColonnes,
	validerIndexColonne,
	reduireColonnesMasquees,
	genererCodeAcces,
	verifierTitre,
	verifierMotDePasseSaisi,
	verifierTitreColonne,
	verifierTitreColonneDisponible,
	definirTitreColonneDisponible,
	normaliserTitresColonnes,
	creerFiltreActiviteColonnes,
	creerFiltreColonneMasquee,
	verifierColonneMasquee,
	verifierIdentifiantPad,
	verifierIdentifiantUtilisateur,
	verifierIdentifiantBloc,
	verifierIdentifiantBlocExistant,
	verifierBlocVisible,
	verifierCapsuleLisible,
	definirDonneesPadExport,
	definirBlocsExport,
	definirFichiersExport,
	definirBlocsDeplaces,
	recupererNombreCommentaires,
	verifierActiviteVisible,
	definirModeration,
	definirParametresModeration,
	definirSalonUtilisateur,
	definirSalonAdmin,
	extraireIdentifiantMasque,
	extraireIdCommentaireMasque,
	sauvegarderSession,
	champsPadsClient,
	filtrerChamps,
	nettoyerPads,
	definirAdministrateursPad,
	verifierAdministrateurListe,
	supprimerDoublons,
	definirAccesLecture,
	supprimerSession,
	genererPseudo,
	genererMotDePasse,
	verifierEmail,
	verifierFormatEmail,
	cacheMxDomaines,
	dureeCacheMx,
	dureeCacheMxNegatif,
	tailleMaxCacheMx,
	timeoutDnsMx,
	nettoyerCacheMx,
	verifierDomaineEmail,
	definirNomFichier,
	definirCheminFichiers,
	extraireArchive,
	supprimerArchives,
	verifierURL,
	assainirHTML,
	assainirIframe,
	assainirTexteAlternatif,
	executerTransactions,
	parseJSON,
	comparerHash,
	verifierMotDePasseAdmin,
	genererJetonTeleversement,
	genererJetonFichier,
	verifierJetonFichier,
	verifierContenuFichier,
	verifierFichierAudio,
	formaterDate
}
