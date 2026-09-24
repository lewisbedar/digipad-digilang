import axios from 'axios'
import imagesLoaded from 'imagesloaded'
import linkifyHtml from 'linkify-html'
import escapeHtml from 'voca/escape_html'
import stripTags from 'voca/strip_tags'
import DOMPurify from 'dompurify'
import fileSaver from 'file-saver'
const { saveAs } = fileSaver
import ClipboardJS from 'clipboard'
import lamejs from 'lamejs'
import ChargementPage from '#root/components/chargement-page.vue'
import Chargement from '#root/components/chargement.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'
import Capsule from '#root/components/capsule.vue'
import Emojis from '#root/components/emojis.vue'
import Enregistrement from '#root/components/enregistrement.vue'
import { VueDraggableNext } from 'vue-draggable-next'

export default {
	name: 'DigipadPad',
	provide () {
		return {
			parent: this
		}
	},
	components: {
		ChargementPage,
		Chargement,
		Message,
		Notification,
		Capsule,
		Emojis,
		Enregistrement,
		draggable: VueDraggableNext
	},
	data () {
		return {
			chargementPage: true,
			chargement: false,
			message: '',
			messagesEnAttente: [],
			notification: '',
			modale: '',
			titreModale: '',
			action: '',
			mode: '',
			affichage: '',
			colonnes: [],
			affichageColonnes: [],
			colonne: 0,
			titreModaleColonne: '',
			modeColonne: '',
			titreColonne: '',
			bloc: '',
			titre: '',
			texte: '',
			media: '',
			alt: '',
			lien: '',
			iframe: '',
			vignette: '',
			vignetteDefaut: '',
			source: '',
			type: '',
			progressionFichier: 0,
			progressionVignette: 0,
			progressionFond: 0,
			progressionEnregistrement: false,
			visibilite: false,
			visibiliteInitiale: '',
			chargementLien: false,
			chargementMedia: false,
			menu: '',
			menuColonne: null,
			menuCapsule: null,
			commentaires: [],
			commentaire: '',
			commentaireId: '',
			commentaireModifie: '',
			editeurCommentaire: '',
			editionCommentaire: false,
			blocId: '',
			focusId: '',
			emojis: '',
			evaluations: [],
			evaluation: 0,
			evaluationId: '',
			listeEvaluations: [],
			messagesChat: [],
			messageChat: '',
			nouveauxMessagesChat: 0,
			utilisateurs: [],
			utilisateur: '',
			nomUtilisateur: '',
			couleur: '#242f3d',
			etiquettes: [],
			couleurEtiquette: '#1c7ed6',
			limiteEtiquettes: 10,
			couleurs: ['#f76707', '#f59f00', '#74b816', '#37b24d', '#0ca678', '#1098ad', '#1c7ed6', '#4263eb', '#7048e8', '#ae3ec9', '#d6336c', '#f03e3e', '#495057'],
			panneaux: [],
			fonds: ['fond1.png', 'fond2.png', 'fond3.png', 'fond4.png', 'fond5.png', 'fond6.png', 'fond7.png', 'fond8.png', 'fond9.png', 'fond10.png', 'fond11.png'],
			modaleConfirmation: false,
			messageConfirmation: '',
			typeConfirmation: '',
			suppressionColonnes: false,
			modaleDiaporama: false,
			donneesBloc: {},
			motDePasse: '',
			nouveauMotDePasse: '',
			defilement: false,
			depart: 0,
			distance: 0,
			resultats: {},
			page: 1,
			accesAutorise: false,
			codeAcces: '',
			codeVisible: false,
			modificationCode: false,
			clipboardLien: null,
			clipboardCode: null,
			codeqr: null,
			recherche: false,
			requete: '',
			chargementVignette: false,
			admins: [],
			blob: '',
			transcodage: false,
			enregistrement: false,
			donneesUtilisateur: {},
			padDestination: '',
			colonneDestination: '',
			integration: false,
			derniersRenouvellements: {},
			delaiEntreRenouvellements: 10000,
			tentativesMaxRenouvellement: 3,
			delaiOubliRenouvellements: 900000,
			visionneusesEnCours: [],
			urlVisionneuseDocument: '',
			elementPrecedent: null,
			hote: this.$pageContext.pageProps.hote,
			hoteTeleversement: this.$pageContext.pageProps.hoteTeleversement,
			userAgent: this.$pageContext.pageProps.userAgent,
			langues: this.$pageContext.pageProps.langues,
			identifiant: this.$pageContext.pageProps.identifiant,
			nom: this.$pageContext.pageProps.nom,
			statut: this.$pageContext.pageProps.statut,
			langue: this.$pageContext.pageProps.langue,
			pads: this.$pageContext.pageProps.pads,
			pad: this.$pageContext.pageProps.pad,
			blocs: this.$pageContext.pageProps.blocs,
			activite: this.$pageContext.pageProps.activite,
			etherpad: import.meta.env.VITE_ETHERPAD,
			pixabayApi: import.meta.env.VITE_PIXABAY_API_KEY,
			limite: import.meta.env.VITE_UPLOAD_LIMIT ? parseFloat(import.meta.env.VITE_UPLOAD_LIMIT) : 20,
			fichiersAutorises: import.meta.env.VITE_UPLOAD_FILE_TYPES,
			stockage: import.meta.env.VITE_STORAGE,
			lienPublicS3: import.meta.env.VITE_S3_PUBLIC_LINK,
			visionneuseDocx: import.meta.env.VITE_DOCX_VIEWER,
			visionneuseDocxAlt: import.meta.env.VITE_DOCX_VIEWER_ALT
		}
	},
	computed: {
		admin () {
			return ((this.statut === 'utilisateur' && ((this.pad.hasOwnProperty('identifiant') && this.pad.identifiant === this.identifiant) || (this.pad.hasOwnProperty('admins') && this.pad.admins.includes(this.identifiant)))) || (this.statut === 'auteur' && this.pad.hasOwnProperty('identifiant') && this.pad.identifiant === this.identifiant && this.pad.hasOwnProperty('id') && this.pads.includes(parseInt(this.pad.id, 10))))
		},
		mobile () {
			if (((this.userAgent.match(/iPhone/i) || this.userAgent.match(/iPad/i) || this.userAgent.match(/iPod/i)) && this.userAgent.match(/Mobile/i)) || this.userAgent.match(/Android/i)) {
				return true
			} else {
				return false
			}
		},
		viaDigidrive () {
			return this.statut === 'auteur' && parseInt(this.pad.digidrive, 10) === 1
		},
		tabIndex () {
			return this.modale === '' && this.message === '' && !this.modaleConfirmation && !this.modaleDiaporama && !this.transcodage && !this.progressionEnregistrement && this.panneaux.length === 0 ? 0 : -1
		},
		tabIndexModale () {
			return this.message === '' && !this.modaleConfirmation && !this.transcodage && !this.progressionEnregistrement ? 0 : -1
		},
		tabIndexModaleDiaporama () {
			return this.modale === '' && this.message === '' && this.menu === '' && !this.transcodage && !this.progressionEnregistrement ? 0 : -1
		},
		disabled () {
			return this.modale === '' && this.message === '' && !this.modaleConfirmation && !this.modaleDiaporama && !this.transcodage && !this.progressionEnregistrement && this.panneaux.length === 0 ? false : true
		},
		disabledAlt () {
			return this.modale === '' && this.message === '' && !this.modaleConfirmation && !this.modaleDiaporama && !this.transcodage && !this.progressionEnregistrement ? false : true
		},
		panneauOuvert () {
			return this.panneaux.length > 0
		},
		disabledModale () {
			return this.message === '' && !this.modaleConfirmation && !this.transcodage && !this.progressionEnregistrement ? false : true
		},
		disabledModaleDiaporama () {
			return this.modale === '' && this.message === '' && this.menu === '' && !this.transcodage && !this.progressionEnregistrement ? false : true
		},
		disabledConfirmation () {
			return this.message === '' ? false : true
		},
		commentairesVisibles () {
			return !this.pad.visibiliteCommentaires || this.pad.visibiliteCommentaires === 'tous' || this.admin
		},
		evaluationsVisibles () {
			return !this.pad.visibiliteEvaluations || this.pad.visibiliteEvaluations === 'tous' || this.admin
		},
		commentairesAutorises () {
			return !this.pad.accesCommentaires || this.pad.accesCommentaires === 'tous' || this.admin
		},
		evaluationsAutorisees () {
			return !this.pad.accesEvaluations || this.pad.accesEvaluations === 'tous' || this.admin
		},
		donneesBlocsRecues () {
			const bloc = this.blocs.find((item) => item.bloc === this.blocId)
			return !bloc || bloc.hasOwnProperty('texte')
		},
		blocsRecherche () {
			let resultats = []
			let blocs = []
			switch (this.requete) {
			case '!eval+':
				blocs = this.blocs.slice().sort((a, b) => {
					return this.definirEvaluationCapsule(b.evaluations) - this.definirEvaluationCapsule(a.evaluations)
				})
				break
			case '!eval-':
				blocs = this.blocs.slice().sort((a, b) => {
					return this.definirEvaluationCapsule(a.evaluations) - this.definirEvaluationCapsule(b.evaluations)
				})
				break
			case '!mod':
				blocs = this.blocs.filter((element) => {
					return element.visibilite === 'masquee'
				})
				break
			case '!priv':
				blocs = this.blocs.filter((element) => {
					return element.visibilite === 'privee'
				})
				break
			case '!modcom':
				blocs = this.blocs.filter((element) => {
					return element.commentairesEnAttente > 0
				})
				break
			case '!comm+':
				blocs = this.blocs.slice().sort((a, b) => {
					return b.commentaires - a.commentaires
				})
				break
			case '!comm-':
				blocs = this.blocs.slice().sort((a, b) => {
					return a.commentaires - b.commentaires
				})
				break
			default:
				blocs = this.blocs.filter((element) => {
					const requete = this.requete.toLowerCase()
					return (element.titre || '').toLowerCase().includes(requete) || (element.texte || '').toLowerCase().includes(requete) || (element.media || '').toLowerCase().includes(requete) || (element.iframe || '').toLowerCase().includes(requete) || (element.source || '').toLowerCase().includes(requete) || this.verifierEtiquettesRecherche(element, requete)
				})
			}
			if (this.pad.affichage === 'colonnes') {
				if (this.pad.colonnes && this.pad.colonnes.length > 0) {
					this.pad.colonnes.forEach(() => {
						resultats.push([])
					})
					blocs.forEach((bloc) => {
						if (bloc.colonne !== undefined && bloc.colonne >= 0 && bloc.colonne < resultats.length) {
							resultats[bloc.colonne].push(bloc)
						} else {
							resultats[0].push({ ...bloc, colonne: 0 })
						}
					})
				} else {
					resultats.push([])
					blocs.forEach((bloc) => {
						resultats[0].push({ ...bloc, colonne: 0 })
					})
				}
			} else {
				resultats = blocs
			}
			return resultats
		},
		visionneuse () {
			if (this.visionneuseDocx && this.visionneuseDocx !== '' && this.visionneuseDocx !== null && this.visionneuseDocxAlt && this.visionneuseDocxAlt !== '' && this.visionneuseDocxAlt !== null) {
				if (this.pad.visionneuse && this.pad.visionneuse === 'viewer-alt') {
					return this.visionneuseDocxAlt
				} else {
					return this.visionneuseDocx
				}
			} else if (this.visionneuseDocx && this.visionneuseDocx !== '' && this.visionneuseDocx !== null) {
				return this.visionneuseDocx
			} else {
				return ''
			}
		}
	},
	watch: {
		affichage (affichage) {
			if (affichage === 'colonnes') {
				this.definirColonnes(this.blocs)
				if (!this.mobile) {
					this.$nextTick(() => {
						this.activerDefilementHorizontal()
					})
				}
			} else if (affichage !== 'colonnes' && !this.mobile) {
				this.desactiverDefilementHorizontal()
			}
		},
		blocs: {
			handler () {
				this.$nextTick(() => {
					this.chargement = false
					let auteur = false
					if (this.utilisateur === this.identifiant) {
						auteur = true
					}
					const blocActif = document.querySelector('.bloc.actif')
					if (blocActif && this.action !== 'modifier' && this.bloc !== '' && auteur === true) {
						blocActif.classList.remove('actif')
					}
					if ((this.action === 'ajouter' || this.action === 'dupliquer') && auteur === true && this.bloc !== '') {
						this.notification = this.action === 'dupliquer' ? this.$t('capsuleDupliquee') : this.$t('capsuleAjoutee')
						document.querySelector('#' + this.bloc)?.classList.add('actif')
						const bloc = this.bloc
						this.$nextTick(() => {
							document.querySelector('#' + bloc)?.focus()
						})
					} else if (this.action === 'modifier' && auteur === true) {
						this.notification = this.$t('capsuleModifiee')
					} else if (this.action === 'supprimer' && auteur === true) {
						this.notification = this.$t('capsuleSupprimee')
					}
					this.utilisateur = ''
					if (this.action !== 'organiser' && auteur === true) {
						this.fermerModaleBloc()
					}
				})
			},
			deep: true
		},
		messagesChat () {
			this.$nextTick(() => {
				document.querySelector('#messages')?.scrollIntoView({ behavior: 'smooth', block: 'end' })
			})
		},
		page (page) {
			this.rechercherImage(page)
		},
		recherche (valeur) {
			if (valeur) {
				this.$nextTick(() => {
					document.querySelector('#champ-recherche input')?.focus()
				})
			} else {
				this.requete = ''
			}
		},
		'pad.accesCommentaires' (acces) {
			if ((this.modale === 'commentaires' || this.modaleDiaporama) && (!acces || acces === 'tous' || this.admin)) {
				this.$nextTick(() => {
					if (this.editeurCommentaire !== '' && !document.body.contains(this.editeurCommentaire.content)) {
						this.editeurCommentaire = ''
					}
					this.genererEditeur()
				})
			}
		},
		'pad.visibiliteCommentaires' (visibilite) {
			if (visibilite === 'admin' && !this.admin && this.modale === 'commentaires') {
				this.fermerModaleCommentaires()
			}
		}
	},
	async created () {
		const params = this.$pageContext.pageProps.params
		const identifiant = params.id
		const motdepasse = params.mdp
		if (identifiant && identifiant !== '' && motdepasse && motdepasse !== '') {
			window.history.replaceState({}, document.title, window.location.href.split('?')[0])
		}
		const langueNav = navigator.language.substring(0, 2)
		const langueParam = params.lang
		if (langueParam && langueParam !== '' && this.langues.includes(langueParam)) {
			this.langue = langueParam
			localStorage.setItem('digipad_lang', langueParam)
		} else if (!langueParam && langueNav !== '' && this.langues.includes(langueNav)) {
			this.langue = langueNav
		}
		if (localStorage.getItem('digipad_lang')) {
			this.langue = localStorage.getItem('digipad_lang')
		}
		this.$i18n.locale = this.langue
		if (this.langue !== this.$pageContext.pageProps.langue) {
			this.$socket.emit('modifierlangue', this.langue)
		}

		if (this.pad.affichage === 'colonnes') {
			this.definirColonnes(this.blocs)
		}

		this.ecouterSocket()

		if (this.pad.acces === 'public' || (this.pad.acces === 'prive' && this.admin)) {
			this.accesAutorise = true
			this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
		} else if (this.pad.acces === 'code' && !this.admin) {
			const code = params.code
			if (code && code !== '') {
				this.$socket.emit('verifieracces', this.pad.id, this.identifiant, code)
			} else {
				this.$socket.emit('verifieracces', this.pad.id, this.identifiant, '')
			}
		} else if (this.pad.acces === 'code' && this.admin) {
			this.accesAutorise = true
			this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
		} else if (this.statut === 'utilisateur') {
			window.location.href = '/u/' + this.identifiant
		} else {
			window.location.replace('/')
		}

		if (this.fichiersAutorises === null || this.fichiersAutorises === undefined) {
			this.fichiersAutorises = '.jpg,.jpeg,.png,.gif,.mp4,.m4v,.mp3,.m4a,.ogg,.wav,.pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.ods,.odg,.xls,.xlsx'
		}
		if (this.limite === null || this.limite === undefined || isNaN(this.limite)) {
			this.limite = 20
		}

		const observer = new PerformanceObserver(async (liste) => {
			for (const entree of liste.getEntries()) {
				if (entree.type === 'back_forward') {
					await this.actualiserDonneesPad()
				}
			}
		})
		observer.observe({ type: 'navigation', buffered: true })
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

		this.chargerImages('#pad', () => {
			try {
				this.chargementPage = false
				this.afficherBlocURL()
			} catch {}
		})

		if (Object.keys(this.pad).length > 0) {
			document.addEventListener('mousedown', this.surlignerBloc, false)
			window.addEventListener('beforeunload', this.quitterPage, false)
			window.addEventListener('resize', this.redimensionner, false)
			window.addEventListener('message', this.ecouterMessage, false)

			if (!this.mobile && this.pad.affichage === 'colonnes') {
				this.activerDefilementHorizontal()
			}

			const lien = this.hote + '/p/' + this.pad.id + '/' + this.pad.token
			this.clipboardLien = new ClipboardJS('#copier-lien .lien', {
				text: () => {
					return lien
				}
			})
			this.clipboardLien.on('success', () => {
				document.querySelector('#copier-lien .lien')?.focus()
				this.notification = this.$t('lienCopie')
			})
			const iframe = '<iframe src="' + this.hote + '/p/' + this.pad.id + '/' + this.pad.token + '" frameborder="0" width="100%" height="500"></iframe>'
			this.clipboardCode = new ClipboardJS('#copier-code button', {
				text: () => {
					return iframe
				}
			})
			this.clipboardCode.on('success', () => {
				document.querySelector('#copier-code button')?.focus()
				this.notification = this.$t('codeCopie')
			})

			this.blocs.forEach((bloc) => {
				bloc.texte = this.formaterHTML(bloc.texte)
				if (bloc.hasOwnProperty('iframe')) {
					bloc.iframe = DOMPurify.sanitize(bloc.iframe, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] })
				}
			})

			if (!this.mobile) {
				document.querySelector('#pad').addEventListener('mousedown', this.gererMousedown, false)
				document.querySelector('#pad').addEventListener('mouseup', this.gererMouseup, false)
			}

			document.querySelector('#pad').addEventListener('dragover', this.gererDrag, false)
			document.querySelector('#pad').addEventListener('dragenter', this.gererDrag, false)
			document.querySelector('#pad').addEventListener('drop', this.gererDrop, false)
			document.addEventListener('click', this.gererClic, false)
			document.addEventListener('keydown', this.gererClavier, false)
			document.addEventListener('scroll', this.gererDefilement, true)
			window.addEventListener('paste', this.gererColler, false)

			if (window !== window.parent) {
				this.integration = true
			}
		}

	},
	beforeUnmount () {
		this.desactiverDefilementHorizontal()
		this.$socket.off()
		this.panneaux.forEach((panneau) => {
			panneau.close()
		})
		this.panneaux = []
		this.clipboardLien?.destroy()
		this.clipboardCode?.destroy()
		this.codeqr?.clear()
		document.removeEventListener('mousedown', this.surlignerBloc, false)
		window.removeEventListener('beforeunload', this.quitterPage, false)
		window.removeEventListener('resize', this.redimensionner, false)
		window.removeEventListener('message', this.ecouterMessage, false)
		document.querySelector('#pad').removeEventListener('mousedown', this.gererMousedown, false)
		document.querySelector('#pad').removeEventListener('mouseup', this.gererMouseup, false)
		document.querySelector('#pad').removeEventListener('dragover', this.gererDrag, false)
		document.querySelector('#pad').removeEventListener('dragenter', this.gererDrag, false)
		document.querySelector('#pad').removeEventListener('drop', this.gererDrop, false)
		document.removeEventListener('click', this.gererClic, false)
		document.removeEventListener('keydown', this.gererClavier, false)
		document.removeEventListener('scroll', this.gererDefilement, true)
		window.removeEventListener('paste', this.gererColler, false)
	},
	methods: {
		chargerImages (selecteur, callback, delai = 5000) {
			let termine = false
			const executer = () => {
				if (termine) return
				termine = true
				callback()
			}
			imagesLoaded(selecteur, { background: true }, executer)
			setTimeout(executer, delai)
		},
		allerAccueil () {
			if (this.statut === 'invite' || this.statut === 'auteur') {
				this.quitterPage()
				window.location.href = '/'
			}
		},
		allerCompte () {
			this.quitterPage()
			window.location.href = '/u/' + this.identifiant
		},
		ecouterMessage (event) {
			if (this.source === 'digiview') {
				this.vignette = event.data
				this.vignetteDefaut = event.data
			}
		},
		activerInput (id) {
			document.querySelector('#' + id)?.click()
		},
		gererRecherche () {
			if (this.action !== 'organiser') {
				this.recherche = !this.recherche
			}
		},
		definirFond (fond) {
			if (fond.substring(0, 1) === '#') {
				return { backgroundColor: fond }
			} else if (fond.includes('/img/')) {
				return { backgroundImage: 'url(' + fond + ')' }
			} else if (this.pad.fondUrl) {
				return { backgroundImage: 'url(' + this.pad.fondUrl + ')' }
			} else if (Object.hasOwn(this.pad, 'fondUrl')) {
				return {}
			} else {
				return { backgroundImage: 'url(' + this.definirCheminFichiers() + '/' + this.pad.id + '/' + fond + ')' }
			}
		},
		definirUtilisateurs (donnees) {
			let utilisateurs = []
			const autresUtilisateurs = []
			donnees.forEach((utilisateur) => {
				if (utilisateur.identifiant === this.identifiant && utilisateurs.length === 0) {
					utilisateurs.push(utilisateur)
				} else if (utilisateur.identifiant !== this.identifiant) {
					autresUtilisateurs.push(utilisateur)
				}
			})
			utilisateurs = utilisateurs.concat(autresUtilisateurs)
			this.utilisateurs = utilisateurs
		},
		definirNom (donnees) {
			const identifiant = donnees.identifiant || ''
			if ((!donnees.hasOwnProperty('nom') || donnees.nom === '') && /^u[0-9a-f]{8,13}$/.test(identifiant)) {
				return identifiant.slice(0, 8).toUpperCase()
			} else if (!donnees.hasOwnProperty('nom') || donnees.nom === '') {
				return identifiant.toUpperCase()
			} else {
				return donnees.nom
			}
		},
		definirColonnes (blocs) {
			const colonnes = []
			const affichageColonnes = []
			let blocsModifies
			if (this.pad.colonnes && this.pad.colonnes.length > 0) {
				this.pad.colonnes.forEach(() => {
					colonnes.push([])
				})
				blocsModifies = blocs.map((bloc) => {
					if (bloc.colonne !== undefined && bloc.colonne >= 0 && bloc.colonne < colonnes.length) {
						return bloc
					}
					return { ...bloc, colonne: 0 }
				})
				blocsModifies.forEach((bloc) => {
					colonnes[bloc.colonne].push(bloc)
				})
				this.pad.affichageColonnes.forEach((affichage) => {
					affichageColonnes.push(affichage)
				})
			} else {
				this.pad.colonnes = [this.$t('colonneSansTitre')]
				this.pad.affichageColonnes = [true]
				colonnes.push([])
				blocsModifies = blocs.map((bloc) => ({ ...bloc, colonne: 0 }))
				blocsModifies.forEach((bloc) => {
					colonnes[0].push(bloc)
				})
				affichageColonnes.push(true)
			}
			this.blocs = blocsModifies
			this.colonnes = colonnes
			this.affichageColonnes = affichageColonnes
		},
		definirVignette (item) {
			let vignette
			let vignetteGeneree = false
			if (item.hasOwnProperty('vignetteGeneree')) {
				vignetteGeneree = item.vignetteGeneree
			}
			if (item.hasOwnProperty('vignette') && item.vignette !== '' && typeof item.vignette === 'string' && (item.vignette.substring(0, 5) === '/img/' || (this.verifierURL(item.vignette) === true && !this.verifierLienPublicS3(item.vignette)))) {
				vignette = item.vignette
			} else if (item.hasOwnProperty('vignette') && item.vignette !== '' && typeof item.vignette === 'string') {
				vignette = item.vignetteUrl || (this.definirCheminFichiers() + '/' + this.pad.id + '/' + this.definirNomLienFichier(item.vignette))
			} else if (vignetteGeneree === true && this.modale === 'bloc') {
				vignette = item.fichier.replace(/\.[^/.]+$/, '') + '.jpg'
			} else if (vignetteGeneree === true) {
				vignette = this.definirLienVignette(this.pad.id, item.fichier.replace(/\.[^/.]+$/, '') + '.jpg')
			} else {
				switch (item.type) {
				case 'audio':
				case 'enregistrement':
					vignette = '/img/audio.png'
					break
				case 'video':
					vignette = '/img/video.png'
					break
				case 'pdf':
					vignette = '/img/pdf.png'
					break
				case 'document':
					vignette = '/img/document.png'
					break
				case 'office':
					vignette = '/img/office.png'
					break
				case 'lien':
					vignette = '/img/lien.png'
					break
				case 'embed': {
					const media = item.media || ''
					if (item.source === 'h5p') {
						vignette = '/img/h5p.png'
					} else if (item.source === 'digiview') {
						vignette = '/img/digiview.png'
					} else if (item.source === 'youtube') {
						vignette = '/img/youtube.png'
					} else if (item.source === 'vimeo') {
						vignette = '/img/vimeo.png'
					} else if (item.source === 'dailymotion') {
						vignette = '/img/dailymotion.png'
					} else if (item.source === 'slideshare') {
						vignette = '/img/slideshare.png'
					} else if (item.source === 'flickr') {
						vignette = '/img/flickr.png'
					} else if (item.source === 'soundcloud') {
						vignette = '/img/soundcloud.png'
					} else if (item.source === 'twitter') {
						vignette = '/img/twitter.png'
					} else if (item.source === 'etherpad') {
						vignette = '/img/etherpad.png'
					} else if (media.includes('facebook.com')) {
						vignette = '/img/facebook.png'
					} else if (media.includes('vocaroo.com') || media.includes('voca.ro')) {
						vignette = '/img/vocaroo.png'
					} else if (media.includes('drive.google.com')) {
						vignette = '/img/google-drive.png'
					} else if (media.includes('docs.google.com/document')) {
						vignette = '/img/google-docs.png'
					} else if (media.includes('docs.google.com/presentation')) {
						vignette = '/img/google-slides.png'
					} else if (media.includes('docs.google.com/spreadsheets')) {
						vignette = '/img/google-sheets.png'
					} else if (media.includes('docs.google.com/forms')) {
						vignette = '/img/google-forms.png'
					} else if (media.includes('docs.google.com/drawings')) {
						vignette = '/img/google-drawings.png'
					} else if (media.includes('google.com/maps')) {
						vignette = '/img/google-maps.png'
					} else if (media.includes('wikipedia.org')) {
						vignette = '/img/wikipedia.png'
					} else if (media.includes('quizlet.com')) {
						vignette = '/img/quizlet.png'
					} else if (media.includes('genial.ly')) {
						vignette = '/img/genially.png'
					} else if (media.includes('ladigitale.dev')) {
						vignette = '/img/ladigitale.png'
					} else if (media.includes('framapad.org')) {
						vignette = '/img/framapad.png'
					} else {
						vignette = '/img/code.png'
					}
					break
				}
				default:
					vignette = '/img/telechargement.png'
					break
				}
			}
			return vignette
		},
		async recupererVignettePeertube (lien) {
			const url = new URL(lien)
			const domaine = url.hostname
			let id = null
			let rechercheId = lien.match(/\/w\/([a-zA-Z0-9\-_]+)/)
			if (!rechercheId) {
				rechercheId = lien.match(/\/videos\/watch\/([a-zA-Z0-9\-_]+)/)
				if (!rechercheId) {
					rechercheId = lien.match(/\/videos\/embed\/([a-zA-Z0-9\-_]+)/)
					if (rechercheId) {
						id = rechercheId[1]
					}
				} else {
					id = rechercheId[1]
				}
			} else {
				id = rechercheId[1]
			}
			if (id !== null) {
				const lienApi = 'https://' + domaine + '/api/v1/videos/' + id
				const reponse = await fetch(lienApi)
				if (reponse.ok) {
					const donnees = await reponse.json()
					const vignette = donnees.thumbnailPath
					if (!vignette) {
						return '/img/video.png'
					} else {
						return 'https://' + domaine + vignette
					}
				} else {
					return '/img/video.png'
				}
			} else {
				return '/img/video.png'
			}
		},
		definirIconeMedia (item) {
			let icone
			switch (item.type) {
			case 'image':
			case 'lien-image':
				icone = 'image'
				break
			case 'audio':
				icone = 'volume_up'
				break
			case 'video':
				icone = 'movie'
				break
			case 'pdf':
			case 'document':
			case 'office':
				icone = 'description'
				break
			case 'lien':
				icone = 'link'
				break
			case 'embed': {
				const media = item.media || ''
				if (item.source === 'youtube' || item.source === 'vimeo' || item.source === 'dailymotion' || item.source === 'digiview') {
					icone = 'movie'
				} else if (item.source === 'slideshare' || media.includes('wikipedia.org') || media.includes('drive.google.com') || media.includes('docs.google.com')) {
					icone = 'description'
				} else if (item.source === 'flickr') {
					icone = 'image'
				} else if (item.source === 'soundcloud' || media.includes('vocaroo.com') || media.includes('voca.ro')) {
					icone = 'volume_up'
				} else if (media.includes('google.com/maps')) {
					icone = 'place'
				} else if (item.source === 'etherpad' || media.includes('framapad.org')) {
					icone = 'group_work'
				} else {
					icone = 'web'
				}
				break
			}
			default:
				icone = 'save_alt'
				break
			}
			return icone
		},
		definirDescription (item) {
			if (item.hasOwnProperty('modifie')) {
				return this.$t('creeeLe') + ' ' + this.$formaterDate(item.date, this.langue) + ' ' + this.$t('par') + ' ' + this.definirNom(item) + '. ' + this.$t('modifieeLe') + ' ' + this.$formaterDate(item.modifie, this.langue) + '.'
			} else {
				return this.$t('creeeLe') + ' ' + this.$formaterDate(item.date, this.langue) + ' ' + this.$t('par') + ' ' + this.definirNom(item) + '.'
			}
		},
		definirNomLienFichier (fichier) {
			if (!fichier) return ''
			return fichier.split('\\').pop().split('/').pop()
		},
		definirTexteAlternatif (item) {
			if (item && typeof item.alt === 'string') {
				return item.alt
			}
			return ''
		},
		gererMenuColonne (indexCol) {
			this.elementPrecedent = (document.activeElement || document.body)
			this.menuColonne = this.menuColonne === indexCol ? null : indexCol
			if (this.menuColonne === indexCol) {
				this.$nextTick(() => {
					const menu = document.querySelectorAll('.menu-deroulant-colonne')[indexCol]
					if (menu) menu.querySelector('[role="menuitem"]')?.focus()
				})
			}
		},
		gererMenuCapsule (bloc) {
			this.menuColonne = null
			const menuFerme = (this.menuCapsule !== bloc)
			this.fermerMenuCapsule()
			if (!menuFerme) return
			this.definirElementPrecedentCapsule(bloc)
			this.menuCapsule = bloc
			this.$nextTick(() => {
				this.positionnerMenuCapsule(bloc)
				document.querySelector('#menu-capsule-' + bloc)?.querySelector('[role="menuitem"]')?.focus({ preventScroll: true })
			})
		},
		positionnerMenuCapsule (bloc) {
			const conteneur = document.querySelector('[data-menu-capsule="' + bloc + '"]')
			const menu = document.querySelector('#menu-capsule-' + bloc)
			if (!conteneur || !menu) return
			const bouton = conteneur.querySelector('.bouton-menu')
			if (!bouton) return
			const positionBouton = bouton.getBoundingClientRect()
			const marge = this.convertirRem(0.5)
			const largeur = menu.offsetWidth
			const hauteur = menu.offsetHeight
			const pad = document.querySelector('#pad')
			const zone = pad ? pad.getBoundingClientRect() : { top: 0, bottom: window.innerHeight, left: 0, right: window.innerWidth }
			const limiteHaut = Math.max(marge, zone.top + marge)
			const limiteBas = Math.min(window.innerHeight, zone.bottom) - marge
			const limiteGauche = Math.max(marge, zone.left + marge)
			const limiteDroite = Math.min(window.innerWidth, zone.right) - marge
			let gauche = positionBouton.right - largeur
			if (gauche + largeur > limiteDroite) {
				gauche = limiteDroite - largeur
			}
			if (gauche < limiteGauche) {
				gauche = limiteGauche
			}
			const placeAuDessus = positionBouton.top - limiteHaut
			const placeEnDessous = limiteBas - positionBouton.bottom
			let haut
			if (hauteur <= placeAuDessus) {
				haut = positionBouton.top - hauteur
			} else if (hauteur <= placeEnDessous) {
				haut = positionBouton.bottom
			} else if (placeAuDessus >= placeEnDessous) {
				haut = limiteHaut
			} else {
				haut = limiteBas - hauteur
			}
			menu.style.left = gauche + 'px'
			menu.style.top = Math.max(limiteHaut, Math.min(haut, limiteBas - hauteur)) + 'px'
		},
		fermerMenuCapsule () {
			if (this.menuCapsule === null) return
			const bloc = this.menuCapsule
			const menu = document.querySelector('#menu-capsule-' + bloc)
			const focusMenu = (menu !== null && menu.contains(document.activeElement))
			this.menuCapsule = null
			this.elementPrecedent = null
			if (focusMenu) {
				const bouton = this.definirBoutonMenuCapsule(bloc)
				this.$nextTick(() => {
					bouton?.focus({ preventScroll: true })
				})
			}
		},
		definirBoutonMenuCapsule (bloc) {
			const conteneur = document.querySelector('[data-menu-capsule="' + bloc + '"]')
			return (conteneur ? (conteneur.querySelector('.bouton-menu') || document.body) : document.body)
		},
		definirElementPrecedentCapsule (bloc) {
			this.elementPrecedent = this.definirBoutonMenuCapsule(bloc)
		},
		ouvrirModaleColonne (type, index) {
			if (type === 'edition') {
				this.colonne = index
				this.titreModaleColonne = this.$t('modifierColonne')
				this.titreColonne = this.pad.colonnes[index]
				this.menuColonne = null
				const menu = document.querySelectorAll('.menu-deroulant-colonne')[index]
				this.elementPrecedent = (menu ? (menu.querySelector('.bouton-menu') || document.body) : document.body)
			} else {
				this.titreModaleColonne = this.$t('ajouterColonne')
				this.elementPrecedent = (document.activeElement || document.body)
			}
			this.modeColonne = type
			this.modale = 'colonne'
			this.$nextTick(() => {
				document.querySelector('#champ-nom-colonne')?.focus()
			})
		},
		ajouterColonne (indexColonne) {
			let titre = ''
			if ((this.modale === 'colonne' && this.titreColonne.trim() === '') || (this.modale === '' && this.menuColonne === null)) {
				return
			}
			if (this.menuColonne !== null) {
				this.menuColonne = null
				const titreParDefaut = this.$t('colonneSansTitre')
				titre = titreParDefaut
				let compteur = 2
				while (this.pad.colonnes.includes(titre)) {
					titre = titreParDefaut + ' (' + compteur + ')'
					compteur++
				}
			} else {
				titre = this.titreColonne.trim()
			}
			this.chargement = true
			this.$socket.emit('ajoutercolonne', this.pad.id, titre, indexColonne, this.identifiant, this.nom)
			if (this.modale === 'colonne') {
				this.fermerModaleColonne()
			}
		},
		modifierColonne () {
			if (this.titreColonne.trim() !== '') {
				this.chargement = true
				this.$socket.emit('modifiertitrecolonne', this.pad.id, this.titreColonne.trim(), this.colonne, this.identifiant)
				this.fermerModaleColonne()
			}
		},
		dupliquerColonne (index) {
			const menu = document.querySelectorAll('.menu-deroulant-colonne')[index]
			const bouton = (menu ? (menu.querySelector('.bouton-menu') || document.body) : document.body)
			this.elementPrecedent = null
			this.menuColonne = null
			this.chargement = true
			this.$nextTick(() => {
				bouton.focus()
			})
			this.$socket.emit('dupliquercolonne', this.pad.id, this.pad.token, index, this.identifiant, this.nom)
		},
		afficherColonne (colonne) {
			this.menuColonne = null
			this.chargement = true
			this.$socket.emit('modifieraffichagecolonne', this.pad.id, true, colonne, this.identifiant)
		},
		masquerColonne (colonne) {
			this.menuColonne = null
			this.chargement = true
			this.$socket.emit('modifieraffichagecolonne', this.pad.id, false, colonne, this.identifiant)
		},
		afficherViderColonne (index) {
			this.colonne = index
			this.titreColonne = this.pad.colonnes[index]
			this.messageConfirmation = this.$t('confirmationViderColonne')
			this.typeConfirmation = 'vider-colonne'
			const menu = document.querySelectorAll('.menu-deroulant-colonne')[index]
			this.elementPrecedent = (menu ? (menu.querySelector('.bouton-menu') || document.body) : document.body)
			this.menuColonne = null
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		viderColonne () {
			this.modaleConfirmation = false
			this.chargement = true
			this.$socket.emit('vidercolonne', this.pad.id, this.titreColonne, this.colonne, this.identifiant, this.nom)
			this.fermerModaleColonne()
		},
		afficherSupprimerColonne (index) {
			this.colonne = index
			this.titreColonne = this.pad.colonnes[index]
			this.messageConfirmation = this.$t('confirmationSupprimerColonne')
			this.typeConfirmation = 'supprimer-colonne'
			const menu = document.querySelectorAll('.menu-deroulant-colonne')[index]
			this.elementPrecedent = (menu ? (menu.querySelector('.bouton-menu') || document.body) : document.body)
			this.menuColonne = null
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		supprimerColonne () {
			this.modaleConfirmation = false
			this.chargement = true
			this.$socket.emit('supprimercolonne', this.pad.id, this.titreColonne, this.colonne, this.identifiant, this.nom)
			this.fermerModaleColonne()
		},
		fermerModaleColonne () {
			this.modale = ''
			this.titreModaleColonne = ''
			this.titreColonne = ''
			this.modeColonne = ''
			this.colonne = 0
			this.gererFocus()
		},
		deplacerColonne (direction, colonne) {
			this.chargement = true
			this.$socket.emit('deplacercolonne', this.pad.id, this.pad.colonnes[colonne], direction, colonne, this.identifiant, this.nom)
		},
		definirLargeurCapsules () {
			switch (this.pad.largeur) {
			case 'large':
				return { default: 4, 1729: 4, 1449: 3, 1365: 2, 899: 2, 499: 1 }
			default:
				return { default: 5, 1729: 5, 1449: 4, 1365: 3, 899: 2, 499: 1 }
			}
		},
		ouvrirModaleBloc (mode, item, colonne) {
			this.mode = mode
			this.urlVisionneuseDocument = ''
			if (mode === 'creation') {
				this.titreModale = this.$t('ajouterCapsule')
			} else {
				this.$socket.emit('verifiermodifierbloc', this.pad.id, item.bloc, this.identifiant)
				this.titreModale = this.$t('modifierCapsule')
				this.donneesBloc = item
				this.bloc = item.bloc
				this.titre = item.titre
				this.texte = item.texte
				this.media = item.media
				this.alt = item.hasOwnProperty('alt') && typeof item.alt === 'string' ? item.alt : ''
				this.iframe = item.iframe
				this.type = item.type
				this.source = item.source
				this.rafraichirMedia(item)
				this.preparerVisionneuse(item)
				if (!item.hasOwnProperty('texte')) {
					this.recupererBloc(item.bloc)
				}
				if (item.hasOwnProperty('couleur')) {
					this.couleur = item.couleur
				}
				this.etiquettes = Array.isArray(item.etiquettes) ? JSON.parse(JSON.stringify(item.etiquettes)) : []
				if (item.hasOwnProperty('vignette') && item.vignette !== '' && typeof item.vignette === 'string') {
					this.vignette = item.vignette
					this.vignetteDefaut = this.vignette
				} else if (item.type !== 'image' && (!item.hasOwnProperty('vignette') || item.vignette === '' || typeof item.vignette !== 'string')) {
					this.vignette = this.definirVignette(item)
					this.vignetteDefaut = this.vignette
				}
				if (item.hasOwnProperty('visibilite') && item.visibilite === 'privee') {
					this.visibilite = true
				} else {
					this.visibilite = false
				}
				if (mode === 'edition' && item.hasOwnProperty('visibilite') && item.visibilite === 'privee') {
					this.visibiliteInitiale = 'privee'
				}
				if (item.iframe !== '') {
					this.lien = item.media
				}
			}
			if (this.pad.affichage === 'colonnes') {
				this.colonne = colonne
			}
			this.menu = ''
			if (this.menuCapsule !== null) {
				this.definirElementPrecedentCapsule(this.menuCapsule)
				this.menuCapsule = null
			} else {
				this.elementPrecedent = (document.activeElement || document.body)
			}
			this.modale = 'bloc'
			this.$nextTick(() => {
				if (mode === 'creation') {
					document.querySelector('#champ-titre')?.focus()
				} else {
					document.querySelector('#bloc .fermer')?.focus()
				}
				const editeur = pell.init({
					element: document.querySelector('#texte'),
					onChange: (html) => {
						this.texte = html
					},
					actions: [
						{ name: 'gras', title: this.$t('gras'), icon: '<i class="material-icons" aria-hidden="true">format_bold</i>', result: () => pell.exec('bold') },
						{ name: 'italique', title: this.$t('italique'), icon: '<i class="material-icons" aria-hidden="true">format_italic</i>', result: () => pell.exec('italic') },
						{ name: 'souligne', title: this.$t('souligne'), icon: '<i class="material-icons" aria-hidden="true">format_underlined</i>', result: () => pell.exec('underline') },
						{ name: 'barre', title: this.$t('barre'), icon: '<i class="material-icons" aria-hidden="true">format_strikethrough</i>', result: () => pell.exec('strikethrough') },
						{ name: 'exposant', title: this.$t('exposant'), icon: '<i class="material-icons" aria-hidden="true">superscript</i>', result: () => pell.exec('superscript') },
						{ name: 'couleur', title: this.$t('couleurTexte'), icon: '<i class="material-icons couleur-texte" aria-hidden="true">format_color_text</i>', result: () => {
							let i = 0
							let couleurActuelle = ''
							let element = window.getSelection()?.focusNode?.parentNode ?? null
							while (i < 6 && couleurActuelle === '' && element !== null) {
								if (element.tagName === 'FONT' && element.color) {
									couleurActuelle = element.color
								} else {
									element = element.parentNode
								}
								i++
							}
							const champ = document.querySelector('#couleur-texte')
							if (champ === null) {
								return
							}
							champ.value = couleurActuelle !== '' ? couleurActuelle : '#001d1d'
							this.ouvrirSelecteurCouleur(champ)
						} },
						{ name: 'liste-ordonnee', title: this.$t('listeOrdonnee'), icon: '<i class="material-icons" aria-hidden="true">format_list_numbered</i>', result: () => pell.exec('insertOrderedList') },
						{ name: 'liste', title: this.$t('liste'), icon: '<i class="material-icons" aria-hidden="true">format_list_bulleted</i>', result: () => pell.exec('insertUnorderedList') },
						{ name: 'lien', title: this.$t('lien'), icon: '<i class="material-icons" aria-hidden="true">link</i>', result: () => {
							let i = 0
							let lienActuel = ''
							let element = window.getSelection()?.focusNode?.parentNode ?? null
							while (i < 6 && lienActuel === '' && element !== null) {
								if (element.href) {
									lienActuel = element.href
								} else {
									element = element.parentNode
								}
								i++
							}
							if (lienActuel !== '') {
								const range = document.createRange()
								range.selectNodeContents(element)
								const selection = window.getSelection()
								selection.removeAllRanges()
								selection.addRange(range)
							}
							const url = window.prompt(this.$t('adresseLien'), lienActuel)
							if (url && url !== '') {
								pell.exec('createLink', url)
							} else if (url === '') {
								pell.exec('unlink')
							}
						} },
						{ name: 'supprimer-formatage', title: this.$t('supprimerFormatage'), icon: '<i class="material-icons" aria-hidden="true">format_clear</i>', result: () => {
							pell.exec('removeFormat')
						} }
					],
					classes: { actionbar: 'boutons-editeur', button: 'bouton-editeur', content: 'contenu-editeur', selected: 'bouton-actif' }
				})
				editeur.content.innerHTML = this.formaterHTML(this.texte)
				editeur.content.onpaste = (event) => {
					event.preventDefault()
					event.stopPropagation()
					let html = event.clipboardData.getData('text/html')
					if (html !== '') {
						html = stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
						html = html.replace(/style=".*?"/mg, '')
						html = html.replace(/class=".*?"/mg, '')
						html = this.formaterHTML(html)
						pell.exec('insertHTML', html)
					} else {
						pell.exec('insertText', event.clipboardData.getData('text/plain'))
					}
				}
				this.initialiserChampCouleur(editeur, 'couleur-texte')
			})
		},
		echapperHTML (texte) {
			return escapeHtml(texte)
		},
		formaterHTML (html) {
			html = linkifyHtml(html || '', {
				defaultProtocol: 'https',
				truncate: 50,
				rel: 'noreferrer',
				target: '_blank'
			})
			html = DOMPurify.sanitize(html, { ADD_ATTR: ['target', 'rel'] })
			const div = document.createElement('div')
			div.innerHTML = html
			div.querySelectorAll('a[href]').forEach((lien) => {
				lien.setAttribute('target', '_blank')
				lien.setAttribute('rel', 'noreferrer')
			})
			return div.innerHTML
		},
		modifierCouleurTexte (event) {
			pell.exec('foreColor', event.target.value)
		},
		initialiserChampCouleur (editeur, id) {
			const icone = editeur?.querySelector('.couleur-texte') ?? null
			if (icone === null) {
				return
			}
			const bouton = icone.closest('button')
			if (bouton === null) {
				return
			}
			let champ = document.querySelector('#' + id)
			if (champ === null) {
				champ = document.createElement('input')
				champ.type = 'color'
				champ.id = id
				champ.tabIndex = -1
				champ.setAttribute('aria-hidden', 'true')
				champ.style.cssText = 'position: absolute; left: 0; top: 0; width: 100%; height: 100%; padding: 0; margin: 0; border: 0; opacity: 0; pointer-events: none;'
				champ.addEventListener('input', this.modifierCouleurTexte)
				champ.addEventListener('change', this.modifierCouleurTexte)
			}
			bouton.style.position = 'relative'
			bouton.appendChild(champ)
		},
		ouvrirSelecteurCouleur (champ) {
			if (!champ) {
				return
			}
			try {
				if (typeof champ.showPicker === 'function') {
					champ.showPicker()
				} else {
					champ.click()
				}
			} catch {
				champ.click()
			}
		},
		async ajouterFichier (champ) {
			const fichiersAutorises = this.fichiersAutorises.split(',').map((e) => { return e.trim().substring(1) })
			if (champ.files && champ.files[0]) {
				const extension = champ.files[0].name.substring(champ.files[0].name.lastIndexOf('.') + 1).toLowerCase()
				if (fichiersAutorises.includes(extension) && champ.files[0].size <= (this.limite * 1024 * 1024)) {
					const fichier = champ.files[0]
					const formulaire = new FormData()
					formulaire.append('pad', this.pad.id)
					formulaire.append('fichier', fichier)
					let jeton
					try {
						jeton = await this.recupererJetonTeleversement('fichier', this.pad.id)
					} catch (err) {
						if (champ instanceof HTMLInputElement) { champ.value = '' }
						this.progressionFichier = 0
						this.message = this.definirMessageErreur(err)
						return
					}
					axios.post(this.hoteTeleversement + '/api/televerser-fichier', formulaire, {
						headers: { 'x-jeton-televersement': jeton },
						onUploadProgress: (progression) => {
							const pourcentage = parseInt(Math.round((progression.loaded * 100) / progression.total))
							this.progressionFichier = pourcentage
						}
					}).then((reponse) => {
						const donnees = reponse.data
						this.chargementMedia = true
						this.media = donnees.fichier
						this.type = donnees.mimetype.split('/')[0]
						donnees.type = this.type
						const vignette = this.definirVignette(donnees)
						if (this.type !== 'image') {
							this.vignette = vignette
							this.vignetteDefaut = vignette
						}
						switch (this.type) {
						case 'image':
							this.$nextTick(() => {
								imagesLoaded('#media', () => {
									this.chargementMedia = false
								})
							})
							break
						case 'video':
							this.$nextTick(() => {
								const video = document.querySelector('#video')
								video.addEventListener('loadedmetadata', () => {
									imagesLoaded('#vignette', () => {
										this.chargementMedia = false
									})
								})
								video.addEventListener('error', () => {
									this.chargementMedia = false
								})
							})
							break
						case 'audio':
							this.$nextTick(() => {
								const audio = document.querySelector('#audio')
								audio.addEventListener('loadedmetadata', () => {
									imagesLoaded('#vignette', () => {
										this.chargementMedia = false
									})
								})
								audio.addEventListener('error', () => {
									this.chargementMedia = false
								})
							})
							break
						case 'pdf':
						case 'document':
						case 'office':
							this.$nextTick(() => {
								if (this.visionneuse !== '') {
									const iframe = document.querySelector('#document')
									iframe.addEventListener('load', () => {
										imagesLoaded('#vignette', () => {
											this.chargementMedia = false
										})
									})
								} else {
									imagesLoaded('#vignette', () => {
										this.chargementMedia = false
									})
								}
							})
							break
						default:
							this.chargementMedia = false
						}
						this.progressionFichier = 0
						if (champ instanceof HTMLInputElement) { champ.value = '' }
					}).catch((err) => {
						if (champ instanceof HTMLInputElement) { champ.value = '' }
						this.progressionFichier = 0
						if (err.response?.data === 'non_connecte') {
							window.location.replace('/')
						} else if (err.response?.data === 'erreur_televersement') {
							this.message = this.$t('erreurTeleversementFichier')
						} else if (err.response?.data === 'erreur_espace_disque') {
							this.message = this.$t('erreurEspaceDisque')
						} else if (err.response?.data === 'fichier_trop_volumineux') {
							this.message = this.$t('tailleMaximale', { taille: this.limite })
						} else {
							this.message = this.definirMessageErreur(err)
						}
					})
				} else {
					if (!fichiersAutorises.includes(extension)) {
						this.message = this.$t('formatFichierPasAccepte')
					} else if (champ.files[0].size > (this.limite * 1024 * 1024)) {
						this.message = this.$t('tailleMaximale', { taille: this.limite })
					}
					if (champ instanceof HTMLInputElement) { champ.value = '' }
				}
			} else if (champ instanceof HTMLInputElement) {
				champ.value = ''
			}
		},
		definirExtensionFichier (fichier) {
			return fichier.substring(fichier.lastIndexOf('.') + 1)
		},
		definirNomFichier (fichier) {
			return fichier.substring(0, fichier.lastIndexOf('.'))
		},
		supprimerFichier () {
			if (this.verifierURL(this.media) && this.media.includes(this.etherpad)) {
				const etherpadId = this.media.replace(this.etherpad + '/p/', '')
				axios.post(this.hote + '/api/supprimer-etherpad', { padID: etherpadId, pad: this.pad.id, token: this.pad.token })
			}
			this.media = ''
			this.alt = ''
			this.lien = ''
			this.type = ''
			this.vignette = ''
			this.vignetteDefaut = ''
			this.resultats = {}
		},
		async ajouterAudio () {
			if (this.mode === 'edition' && this.texte === undefined) {
				this.recupererBloc(this.bloc)
				return
			}
			this.transcodage = true
			let blob
			try {
				blob = await this.blobEnMp3()
			} catch {
				this.transcodage = false
				this.progressionEnregistrement = false
				this.message = this.$t('erreurTranscodage')
				return
			}
			const formulaire = new FormData()
			formulaire.append('pad', this.pad.id)
			formulaire.append('fichier', blob, 'enregistrement.mp3')
			let jeton
			try {
				jeton = await this.recupererJetonTeleversement('audio', this.pad.id)
			} catch (err) {
				this.transcodage = false
				this.progressionEnregistrement = false
				this.message = this.definirMessageErreur(err)
				return
			}
			axios.post(this.hoteTeleversement + '/api/televerser-audio', formulaire, {
				headers: { 'x-jeton-televersement': jeton },
				onUploadProgress: () => {
					this.progressionEnregistrement = true
				}
			}).then((reponse) => {
				const donnees = reponse.data
				this.modale = ''
				const iframe = DOMPurify.sanitize(this.iframe, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] })
				if (this.mode === 'creation') {
					this.$socket.emit('ajouterbloc', this.bloc, this.pad.id, this.pad.token, this.titre, this.formaterHTML(this.texte), donnees, iframe, 'audio', this.source, this.vignette, this.couleur, this.colonne, this.visibilite, this.identifiant, this.nom, this.alt, this.etiquettes)
				} else {
					this.$socket.emit('modifierbloc', this.bloc, this.pad.id, this.pad.token, this.titre, this.formaterHTML(this.texte), donnees, iframe, 'audio', this.source, this.vignette, this.couleur, this.visibilite, this.identifiant, this.nom, this.alt, this.etiquettes)
				}
				this.progressionEnregistrement = false
			}).catch((err) => {
				this.transcodage = false
				this.progressionEnregistrement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'erreur_televersement') {
					this.message = this.$t('erreurTeleversementFichier')
				} else if (err.response?.data === 'erreur_espace_disque') {
					this.message = this.$t('erreurEspaceDisque')
				} else if (err.response?.data === 'fichier_trop_volumineux') {
					this.message = this.$t('tailleMaximale', { taille: this.limite })
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.definirMessageErreur(err)
				}
			})
		},
		async blobEnMp3 () {
			const audioContext = new AudioContext()
			try {
				const arrayBuffer = await new Promise((resolve, reject) => {
					const fileReader = new FileReader()
					fileReader.onerror = () => reject(new Error('erreur_lecture_fichier'))
					fileReader.onloadend = () => resolve(fileReader.result)
					fileReader.readAsArrayBuffer(this.blob)
				})
				const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
				return this.transcoder(audioBuffer)
			} finally {
				audioContext.close()
			}
		},
		async ajouterLien () {
			if (this.lien !== '') {
				const regexIframe = /<iframe(.+)<\/iframe>/
				if (regexIframe.test(this.lien)) {
					const regexDigiview = /\/digiview\/inc\/video(.*?)vignette=([^&"]*)/
					const matchDigiview = this.lien.match(regexDigiview)
					if (matchDigiview) {
						try {
							const vignette = decodeURIComponent(matchDigiview[2])
							this.vignette = vignette
							this.vignetteDefaut = vignette
						} catch {}
					}
					const matchIframe = this.lien.match(/<iframe [^>]*src="[^"]*"[^>]*>/g)
					if (matchIframe) {
						this.lien = matchIframe.map(x => x.replace(/.*src="([^"]*)".*/, '$1'))[0]
					}
				}
				if (this.verifierURL(this.lien) && !this.lien.match(/\.(jpeg|jpg|gif|png)$/) && await this.verifierInstancePeertube(this.lien)) {
					const vignette = await this.recupererVignettePeertube(this.lien)
					this.iframe = this.lien
					this.$nextTick(() => {
						this.media = this.lien
						this.source = 'peertube'
						this.type = 'embed'
						this.vignette = vignette
						this.vignetteDefaut = vignette
						this.chargementLien = false
					})
				} else if (this.verifierURL(this.lien) && !this.lien.match(/\.(jpeg|jpg|gif|png)$/)) {
					this.chargementLien = true
					axios.get('https://noembed.com/embed?url=' + encodeURIComponent(this.lien)).then(async (reponse) => {
						let donnees = reponse.data
						if (donnees.hasOwnProperty('error')) {
							this.iframe = this.lien
							this.$nextTick(async () => {
								this.media = this.lien
								this.source = 'web'
								if (this.lien.includes('ladigitale.dev/digiquiz/')) {
									this.source = 'h5p'
								} else if (this.lien.includes('ladigitale.dev/digiview/')) {
									this.source = 'digiview'
								}
								this.type = 'embed'
								donnees = {}
								donnees.media = this.media
								donnees.source = this.source
								donnees.type = this.type
								if (this.source === 'web' && !this.media.includes('facebook.com') && !this.media.includes('vocaroo.com') && !this.media.includes('drive.google.com') && !this.media.includes('docs.google.com') && !this.media.includes('google.com/maps') && !this.media.includes('wikipedia.org') && !this.media.includes('genial.ly') && !this.media.includes('ladigitale.dev/digitools/') && !this.media.includes('framapad.org')) {
									this.chargementLien = false
									this.chargementVignette = true
									const url = new URL(this.lien)
									const domaine = url.hostname
									const protocole = url.protocol
									const utiliserVignetteParDefaut = () => {
										this.vignette = this.definirVignette(donnees)
										this.vignetteDefaut = this.definirVignette(donnees)
										this.chargementVignette = false
									}
									let jeton
									try {
										jeton = await this.recupererJetonTeleversement('icone')
									} catch {
										return utiliserVignetteParDefaut()
									}
									axios.post(this.hoteTeleversement + '/api/recuperer-icone', {
										domaine: domaine,
										protocole: protocole
									}, {
										headers: { 'x-jeton-televersement': jeton }
									}).then(async (reponse) => {
										this.chargementVignette = false
										if (reponse.data === '') {
											const favicon = await this.verifierIcone(protocole + '//' + domaine + '/favicon.ico')
											if (favicon === true) {
												this.vignette = protocole + '//' + domaine + '/favicon.ico'
												this.vignetteDefaut = protocole + '//' + domaine + '/favicon.ico'
											} else {
												this.vignette = this.definirVignette(donnees)
												this.vignetteDefaut = this.definirVignette(donnees)
											}
										} else if (reponse.data !== '' && typeof reponse.data === 'string') {
											const favicon = await this.verifierIcone(reponse.data)
											if (favicon === true) {
												this.vignette = reponse.data
												this.vignetteDefaut = reponse.data
											} else {
												this.vignette = this.definirVignette(donnees)
												this.vignetteDefaut = this.definirVignette(donnees)
											}
										}
									}).catch(() => {
										utiliserVignetteParDefaut()
									})
								} else if (this.vignette === '' && this.vignetteDefaut === '') {
									this.vignette = this.definirVignette(donnees)
									this.vignetteDefaut = this.definirVignette(donnees)
									this.chargementLien = false
								}
							})
						} else {
							if (donnees.provider_name.toLowerCase() === 'learningapps.org') {
								donnees.html = donnees.html.replace('http://LearningApps.org', 'https://learningapps.org')
							}
							if (regexIframe.test(donnees.html)) {
								this.iframe = donnees.html.match(/<iframe [^>]*src="[^"]*"[^>]*>/g).map(x => x.replace(/.*src="([^"]*)".*/, '$1'))[0]
							} else {
								this.iframe = donnees.html
							}
							this.media = this.lien
							this.source = donnees.provider_name.toLowerCase()
							this.type = 'embed'
							if (donnees.thumbnail_url && donnees.thumbnail_url !== '') {
								this.vignette = donnees.thumbnail_url
								this.vignetteDefaut = donnees.thumbnail_url
							} else {
								donnees.media = this.media
								donnees.source = this.source
								donnees.type = this.type
								if (this.vignette === '' && this.vignetteDefaut === '') {
									this.vignette = this.definirVignette(donnees)
									this.vignetteDefaut = this.definirVignette(donnees)
								}
							}
							this.chargementLien = false
						}
					}).catch(() => {
						this.chargementLien = false
						this.lien = ''
						this.message = this.$t('erreurRecuperationContenu')
					})
				} else if (this.verifierURL(this.lien) && this.lien.match(/\.(jpeg|jpg|gif|png)$/)) {
					this.chargementMedia = true
					this.media = this.lien
					this.type = 'lien-image'
					this.$nextTick(() => {
						imagesLoaded('#media', () => {
							this.chargementMedia = false
						})
					})
				} else {
					this.rechercherImage(1)
				}
			}
		},
		async verifierInstancePeertube (url) {
			if (url.match(/\/videos\/watch\/([a-zA-Z0-9\-_]+)/) || url.match(/\/videos\/embed\/([a-zA-Z0-9\-_]+)/) || (url.match(/\/w\/([a-zA-Z0-9\-_]+)/) && !url.includes('digiwall.app'))) {
				const { origin } = new URL(url)
				try {
					const res = await fetch(origin + '/api/v1/config')
					const data = await res.json()
					return !!(data?.instance && data?.serverVersion && data?.serverCommit !== undefined)
				} catch {
					return false
				}
			} else {
				return false
			}
		},
		verifierIcone (lien) {
			return new Promise((resolve) => {
				const img = new Image()
				img.src = lien
				img.onload = () => resolve(true)
				img.onerror = () => resolve(false)
			})
		},
		rechercherImage (page) {
			if (this.lien !== '') {
				this.chargementLien = true
				const requete = encodeURIComponent(this.lien.trim())
				if (page === 1) {
					this.page = page
				}
				axios.get('https://pixabay.com/api/?key=' + this.pixabayApi + '&q=' + requete + '&image_type=photo&lang=' + this.langue + '&orientation=horizontal&safesearch=true&per_page=16&page=' + page).then((reponse) => {
					this.chargementLien = false
					const donnees = reponse.data
					if (donnees && donnees.total > 0) {
						this.resultats = donnees
						this.$nextTick(() => {
							new flexImages({ selector: '#resultats', rowHeight: 60 })
						})
					}
				}).catch(() => {
					this.chargementLien = false
					this.lien = ''
					this.message = this.$t('erreurRecuperationContenu')
				})
			}
		},
		modifierPage (type) {
			if (type === 'suivante' && this.page < (this.resultats.total / 16)) {
				this.page++
			} else if (type === 'precedente' && this.page > 1) {
				this.page--
			}
		},
		selectionnerImage (image) {
			this.chargementMedia = true
			this.media = image
			this.type = 'lien-image'
			this.$nextTick(() => {
				imagesLoaded('#media', () => {
					this.chargementMedia = false
				})
			})
		},
		verifierURL (lien) {
			let url
			try {
				url = new URL(lien)
			} catch {
				return false
			}
			return url.protocol === 'http:' || url.protocol === 'https:'
		},
		convertirEnLien () {
			this.iframe = ''
			this.media = this.lien
			this.source = 'web'
			this.type = 'lien'
			if (this.vignette === '' || this.vignette === '/img/code.png') {
				this.vignette = '/img/lien.png'
			}
		},
		supprimerLien () {
			if (this.iframe.includes(this.etherpad)) {
				const etherpadId = this.iframe.replace(this.etherpad + '/p/', '')
				axios.post(this.hote + '/api/supprimer-etherpad', { padID: etherpadId, pad: this.pad.id, token: this.pad.token })
			}
			this.media = ''
			this.alt = ''
			this.lien = ''
			this.iframe = ''
			this.type = ''
			this.source = ''
			this.vignette = ''
			this.vignetteDefaut = ''
			this.resultats = {}
			this.chargementVignette = false
		},
		ajouterDocument () {
			this.chargementLien = true
			this.lien = this.etherpad + '/p/pad-' + this.pad.id + '-' + Math.random().toString(16).slice(2)
			this.iframe = this.lien
			this.$nextTick(() => {
				this.media = this.lien
				this.source = 'etherpad'
				this.type = 'embed'
				const donnees = {}
				donnees.media = this.media
				donnees.source = this.source
				donnees.type = this.type
				this.vignette = this.definirVignette(donnees)
				this.vignetteDefaut = this.definirVignette(donnees)
				this.chargementLien = false
			})
		},
		async ajouterVignette () {
			const champ = document.querySelector('#televerser-vignette')
			const formats = ['jpg', 'jpeg', 'png', 'gif']
			if (champ.files && champ.files[0]) {
				const extension = champ.files[0].name.substring(champ.files[0].name.lastIndexOf('.') + 1).toLowerCase()
				if (formats.includes(extension) && champ.files[0].size <= 3072000) {
					const fichier = champ.files[0]
					const formulaire = new FormData()
					formulaire.append('pad', this.pad.id)
					formulaire.append('fichier', fichier)
					let jeton
					try {
						jeton = await this.recupererJetonTeleversement('vignette', this.pad.id)
					} catch (err) {
						this.message = this.definirMessageErreur(err)
						return
					}
					axios.post(this.hoteTeleversement + '/api/televerser-vignette', formulaire, {
						headers: { 'x-jeton-televersement': jeton },
						onUploadProgress: (progression) => {
							const pourcentage = parseInt(Math.round((progression.loaded * 100) / progression.total))
							this.progressionVignette = pourcentage
						}
					}).then((reponse) => {
						const donnees = reponse.data
						if (typeof donnees === 'string') {
							this.vignette = donnees
							this.$nextTick(() => {
								imagesLoaded('#vignette', () => {
									this.progressionVignette = 0
									this.$nextTick(() => {
										const modaleBloc = document.querySelector('#bloc')
										modaleBloc.scrollTop = modaleBloc.scrollHeight
									})
								})
							})
						}
						champ.value = ''
					}).catch((err) => {
						champ.value = ''
						this.progressionVignette = 0
						if (err.response?.data === 'non_connecte') {
							window.location.replace('/')
						} else if (err.response?.data === 'erreur_televersement') {
							this.message = this.$t('erreurTeleversementVignette')
						} else if (err.response?.data === 'erreur_espace_disque') {
							this.message = this.$t('erreurEspaceDisque')
						} else if (err.response?.data === 'fichier_trop_volumineux') {
							this.message = this.$t('tailleMaximale', { taille: 3 })
						} else {
							this.message = this.definirMessageErreur(err)
						}
					})
				} else {
					if (!formats.includes(extension)) {
						this.message = this.$t('formatFichierPasAccepte')
					} else if (champ.files[0].size > 3072000) {
						this.message = this.$t('tailleMaximale', { taille: 3 })
					}
					champ.value = ''
				}
			} else {
				champ.value = ''
			}
		},
		remettreVignetteDefaut () {
			this.vignette = this.vignetteDefaut
		},
		modifierVisibiliteCapsule () {
			this.visibilite = !this.visibilite
		},
		ajouterBloc () {
			const randomHex = crypto.getRandomValues(new Uint8Array(8)).reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
			this.bloc = 'bloc-id-' + Date.now() + randomHex
			if (((this.titre !== '' || this.texte !== '' || this.media !== '') && !this.enregistrement) && this.type !== 'enregistrement') {
				this.chargement = true
				const iframe = DOMPurify.sanitize(this.iframe, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] })
				this.$socket.emit('ajouterbloc', this.bloc, this.pad.id, this.pad.token, this.titre, this.formaterHTML(this.texte), this.media, iframe, this.type, this.source, this.vignette, this.couleur, this.colonne, this.visibilite, this.identifiant, this.nom, this.alt, this.etiquettes)
				this.modale = ''
			} else if (((this.titre !== '' || this.texte !== '' || this.media !== '') && !this.enregistrement) && this.type === 'enregistrement') {
				this.ajouterAudio()
			}
		},
		modifierBloc () {
			if (this.texte === undefined) {
				this.recupererBloc(this.bloc)
				return
			}
			if (((this.titre !== '' || this.texte !== '' || this.media !== '') && !this.enregistrement) && this.type !== 'enregistrement') {
				this.chargement = true
				const iframe = DOMPurify.sanitize(this.iframe, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] })
				this.$socket.emit('modifierbloc', this.bloc, this.pad.id, this.pad.token, this.titre, this.formaterHTML(this.texte), this.media, iframe, this.type, this.source, this.vignette, this.couleur, this.visibilite, this.identifiant, this.nom, this.alt, this.etiquettes)
				this.modale = ''
			} else if (((this.titre !== '' || this.texte !== '' || this.media !== '') && !this.enregistrement) && this.type === 'enregistrement') {
				this.ajouterAudio()
			}
		},
		dupliquerBloc (bloc) {
			const bouton = this.definirBoutonMenuCapsule(bloc)
			this.elementPrecedent = null
			this.menuCapsule = null
			this.chargement = true
			this.$nextTick(() => {
				bouton.focus({ preventScroll: true })
			})
			const randomHex = crypto.getRandomValues(new Uint8Array(8)).reduce((hex, octet) => hex + octet.toString(16).padStart(2, '0'), '')
			const id = 'bloc-id-' + Date.now() + randomHex
			this.$socket.emit('dupliquerbloc', id, this.pad.id, this.pad.token, bloc, this.identifiant, this.nom)
		},
		autoriserBloc (donneesBloc, moderation) {
			this.chargement = true
			let indexBloc = -1
			let indexBlocColonne = -1
			this.blocs.forEach((item, index) => {
				if (item.bloc === donneesBloc.bloc) {
					indexBloc = index
				}
			})
			if (this.pad.affichage === 'colonnes') {
				this.colonnes.forEach((colonne) => {
					colonne.forEach((item, index) => {
						if (item.bloc === donneesBloc.bloc) {
							indexBlocColonne = index
						}
					})
				})
			}
			this.$socket.emit('autoriserbloc', this.pad.id, this.pad.token, donneesBloc, indexBloc, indexBlocColonne, moderation, this.identifiant, this.nom)
		},
		recupererBloc (bloc) {
			this.$socket.emit('recupererbloc', this.pad.id, bloc, this.identifiant)
		},
		rafraichirCommentaires (bloc) {
			this.$socket.emit('commentaires', bloc, this.pad.id, 'rafraichir', this.identifiant)
		},
		verifierModaleCommentaires (bloc) {
			return (this.modale === 'commentaires' && this.bloc === bloc) || (this.modaleDiaporama && this.donneesBloc.bloc === bloc)
		},
		mettreAJourBloc (bloc, callback) {
			this.blocs.forEach((item) => { if (item.bloc === bloc) callback(item) })
			if (this.pad.affichage === 'colonnes') {
				this.colonnes.forEach((colonne) => {
					colonne.forEach((item) => { if (item.bloc === bloc) callback(item) })
				})
			}
		},
		synchroniserCommentaires (bloc, commentaires, commentairesEnAttente) {
			this.mettreAJourBloc(bloc, (item) => {
				item.commentaires = commentaires
				item.commentairesEnAttente = commentairesEnAttente
			})
		},
		autoriserCommentaire (id) {
			this.chargement = true
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			}
			this.$socket.emit('autorisercommentaire', this.pad.id, bloc, id, this.identifiant, this.nom)
		},
		fermerModaleBloc () {
			this.modale = ''
			this.mode = ''
			this.action = ''
			this.titreModale = ''
			this.colonne = 0
			this.bloc = ''
			this.titre = ''
			this.texte = ''
			this.iframe = ''
			this.vignette = ''
			this.vignetteDefaut = ''
			this.type = ''
			this.source = ''
			this.media = ''
			this.alt = ''
			this.etiquettes = []
			this.couleurEtiquette = '#1c7ed6'
			this.lien = ''
			this.progressionFichier = 0
			this.progressionVignette = 0
			this.progressionEnregistrement = false
			this.chargementLien = false
			this.chargementMedia = false
			this.chargementVignette = false
			this.resultats = {}
			this.visibilite = false
			this.visibiliteInitiale = ''
			this.donneesBloc = {}
			this.blob = ''
			this.enregistrement = false
			this.transcodage = false
			this.gererFocus()
		},
		afficherSupprimerBloc (bloc, titre, colonne) {
			this.bloc = bloc
			this.titre = titre
			this.colonne = colonne
			this.messageConfirmation = this.$t('confirmationSupprimerCapsule')
			this.typeConfirmation = 'supprimer-bloc'
			this.definirElementPrecedentCapsule(bloc)
			this.menuCapsule = null
			this.modaleConfirmation = true
			this.$socket.emit('verifiermodifierbloc', this.pad.id, bloc, this.identifiant)
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		supprimerBloc () {
			this.modaleConfirmation = false
			this.chargement = true
			this.$socket.emit('supprimerbloc', this.bloc, this.pad.id, this.pad.token, this.titre, this.identifiant, this.nom)
		},
		fermerModaleConfirmation () {
			this.modaleConfirmation = false
			this.commentaireId = ''
			this.titre = ''
			this.messageConfirmation = ''
			this.typeConfirmation = ''
			this.gererFocus()
		},
		async afficherEnvoyerBloc (bloc, titre) {
			this.blocId = bloc
			this.titre = titre
			this.definirElementPrecedentCapsule(bloc)
			this.menuCapsule = null
			if (Object.keys(this.donneesUtilisateur).length === 0) {
				this.chargement = true
				let reponse
				try {
					reponse = await axios.post(this.hote + '/api/recuperer-donnees-auteur', {
						identifiant: this.identifiant,
						pad: this.pad.id
					}, {
						headers: { 'Content-Type': 'application/json' }
					})
				} catch (err) {
					this.chargement = false
					if (err.response?.data === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.message = this.definirMessageErreur(err)
					}	
					return
				}
				this.chargement = false
				const padsCrees = reponse.data.padsCrees.filter((element) => {
					return parseInt(element.id, 10) !== parseInt(this.pad.id, 10)
				})
				padsCrees.sort((a, b) => {
					const a1 = a.titre.toLowerCase()
					const b1 = b.titre.toLowerCase()
					return a1 < b1 ? -1 : a1 > b1 ? 1 : 0
				})
				const padsAdmins = reponse.data.padsAdmins.filter((element) => {
					return parseInt(element.id, 10) !== parseInt(this.pad.id, 10)
				})
				padsAdmins.sort((a, b) => {
					const a1 = a.titre.toLowerCase()
					const b1 = b.titre.toLowerCase()
					return a1 < b1 ? -1 : a1 > b1 ? 1 : 0
				})
				this.donneesUtilisateur.padsCrees = padsCrees
				this.donneesUtilisateur.padsAdmins = padsAdmins
			}
			if (this.donneesUtilisateur.hasOwnProperty('padsCrees') || this.donneesUtilisateur.hasOwnProperty('padsAdmins')) {
				this.modale = 'copier-bloc'
				this.$nextTick(() => {
					document.querySelector('.modale .fermer')?.focus()
				})
			}
		},
		verifierColonnesDestination () {
			if (this.padDestination !== '') {
				let colonnes = false
				;(this.donneesUtilisateur.padsCrees || []).forEach((pad) => {
					if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10) && pad.affichage === 'colonnes' && JSON.parse(pad.colonnes).length > 0) {
						colonnes = true
					}
				})
				;(this.donneesUtilisateur.padsAdmins || []).forEach((pad) => {
					if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10) && pad.affichage === 'colonnes' && JSON.parse(pad.colonnes).length > 0) {
						colonnes = true
					}
				})
				return colonnes
			} else {
				return false
			}
		},
		definirNombreColonnesDestination () {
			let colonnes = []
			;(this.donneesUtilisateur.padsCrees || []).forEach((pad) => {
				if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10)) {
					colonnes = JSON.parse(pad.colonnes)
				}
			})
			;(this.donneesUtilisateur.padsAdmins || []).forEach((pad) => {
				if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10)) {
					colonnes = JSON.parse(pad.colonnes)
				}
			})
			return colonnes
		},
		envoyerBloc () {
			if (this.padDestination !== '' && ((this.verifierColonnesDestination() && this.colonneDestination !== '') || (!this.verifierColonnesDestination() && this.colonneDestination === ''))) {
				let donneesBloc = {}
				let token = ''
				let colonneDestination = this.colonneDestination
				this.blocs.forEach((item) => {
					if (item.bloc === this.blocId) {
						donneesBloc = item
					}
				})
				this.donneesUtilisateur.padsCrees.forEach((pad) => {
					if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10)) {
						token = pad.token
					}
				})
				this.donneesUtilisateur.padsAdmins.forEach((pad) => {
					if (parseInt(pad.id, 10) === parseInt(this.padDestination, 10)) {
						token = pad.token
					}
				})
				if (colonneDestination === '') {
					colonneDestination = 0
				}
				if (Object.keys(donneesBloc).length > 0 && !donneesBloc.hasOwnProperty('texte')) {
					this.recupererBloc(donneesBloc.bloc)
					return
				}
				if (Object.keys(donneesBloc).length > 0 && token !== '') {
					this.chargement = true
					const randomHex = crypto.getRandomValues(new Uint8Array(8)).reduce((hex, byte) => hex + byte.toString(16).padStart(2, '0'), '')
					const id = 'bloc-id-' + Date.now() + randomHex
					this.$socket.emit('copierbloc', id, this.padDestination, token, donneesBloc.titre, donneesBloc.texte, donneesBloc.media, donneesBloc.iframe, donneesBloc.type, donneesBloc.source, donneesBloc.vignette, donneesBloc.couleur, colonneDestination, donneesBloc.visibilite, this.identifiant, this.nom, this.pad.id, donneesBloc.alt, donneesBloc.etiquettes)
					this.fermerModaleCopieBloc()
				}
			}
		},
		fermerModaleCopieBloc () {
			this.modale = ''
			this.blocId = ''
			this.titre = ''
			this.padDestination = ''
			this.colonneDestination = ''
			this.gererFocus()
		},
		retirerVisionneuseEnCours (bloc) {
			this.visionneusesEnCours = this.visionneusesEnCours.filter((e) => e !== bloc)
		},
		async afficherVisionneuse (item) {
			if (!this.panneaux.map((e) => { return e.id }).includes('panneau_' + item.bloc) && !this.visionneusesEnCours.includes(item.bloc)) {
				this.visionneusesEnCours.push(item.bloc)
				const imageId = 'image-' + Date.now()
				let html = ''
				let urlMedia = ''
				let urlMediaHote = ''
				try {
					this.elementPrecedent = (document.activeElement || document.body)
					await this.rafraichirMedia(item)
					urlMedia = this.stockage === 's3' && item.mediaUrl ? item.mediaUrl : this.definirCheminFichiers() + '/' + this.pad.id + '/' + item.media
					urlMediaHote = this.stockage === 's3' && item.mediaUrl ? item.mediaUrl : this.definirCheminFichiersHote() + '/' + this.pad.id + '/' + item.media
					if (item.type === 'document' || item.type === 'office') {
						urlMediaHote = await this.definirLienFichierVisionneuse(item) || urlMediaHote
					}
					switch (item.type) {
					case 'image':
						html = '<span id="' + imageId + '" class="image"><img src="' + escapeHtml(urlMedia) + '" alt="' + escapeHtml(this.definirTexteAlternatif(item)) + '"></span>'
						break
					case 'lien-image':
						html = '<span id="' + imageId + '" class="image"><img src="' + escapeHtml(item.media) + '" alt="' + escapeHtml(this.definirTexteAlternatif(item)) + '"></span>'
						break
					case 'audio':
						html = '<audio controls preload="metadata" src="' + escapeHtml(urlMedia) + '"></audio>'
						break
					case 'video':
						html = '<video controls playsinline crossOrigin="anonymous" src="' + escapeHtml(urlMedia) + '"></video>'
						break
					case 'pdf':
						html = '<iframe src="' + escapeHtml(this.definirLienVisionneuse('/pdfjs/web/viewer.html?file=', urlMediaHote)) + '" allowfullscreen></iframe>'
						break
					case 'document':
					case 'office':
						html = '<iframe src="' + escapeHtml(this.definirLienVisionneuse(this.visionneuse, urlMediaHote)) + '" allowfullscreen></iframe>'
						break
					case 'embed':
						if (item.source === 'etherpad') {
							html = '<iframe src="' + escapeHtml(item.media) + '?userName=' + encodeURIComponent(this.nom) + '" allowfullscreen></iframe>'
						} else if (this.verifierURL(item.iframe)) {
							html = '<iframe src="' + escapeHtml(item.iframe) + '" allow="autoplay; fullscreen"></iframe>'
						} else {
							html = '<div class="html">' + DOMPurify.sanitize(item.iframe, { ADD_TAGS: ['iframe'], ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder'] }) + '</div>'
						}
						break
					}
				} catch (err) {
					this.retirerVisionneuseEnCours(item.bloc)
					throw err
				}
				this.$nextTick(() => {
					try {
						let clipboardVisionneuse = null
						let panzoomInstance = null
						let panzoomTarget = null
						let largeurPanneau = '320px'
						let hauteurPanneau = '312px'
						let position = 'center'
						if (document.querySelector('#page').offsetWidth > 1023) {
							largeurPanneau = '948px'
							hauteurPanneau = '940px'
							position = { my: 'center', at: 'center', offsetX: this.convertirRem(2), offsetY: this.convertirRem(2) }
						} else if (document.querySelector('#page').offsetWidth < 1024 && document.querySelector('#page').offsetWidth > 359) {
							largeurPanneau = document.querySelector('#page').offsetWidth - this.convertirRem(7) + 'px'
							hauteurPanneau = '500px'
							if (parseInt(largeurPanneau, 10) < 328) {
								largeurPanneau = '328px'
							}
							position = { my: 'center', at: 'center', offsetX: this.convertirRem(2), offsetY: this.convertirRem(2) }
						}
						if (parseInt(hauteurPanneau, 10) > (document.querySelector('#page').offsetHeight - this.convertirRem(7))) {
							hauteurPanneau = document.querySelector('#page').offsetHeight - this.convertirRem(7) + 'px'
						}
						const snapOptions = this.definirOptionsSnap()
						const panneau = jsPanel.create({
							id: 'panneau_' + item.bloc,
							animateIn: 'jsPanelFadeIn',
							animateOut: 'jsPanelFadeOut',
							iconfont: 'material-icons',
							closeOnEscape: true,
							border: '4px solid ' + item.couleur,
							headerTitle: this.echapperHTML(item.titre),
							position: position,
							maximizedMargin: 0,
							syncMargins: true,
							resizeit: {
								minWidth: 200,
								minHeight: 150
							},
							panelSize: {
								width: largeurPanneau,
								height: hauteurPanneau
							},
							content: html,
							callback: (panel) => {
								panel.setControlStatus('normalize', 'hide')
								panel.setControlStatus('minimize', 'remove')
								document.querySelector('#masque').classList.add('ouvert')
								if (item.type === 'image' || item.type === 'lien-image') {
									document.querySelector('#' + imageId + ' img').style.maxHeight = document.querySelector('#' + panel.id + ' .jsPanel-content').clientHeight + 'px'
									const image = document.querySelector('#' + imageId)
									const panzoom = Panzoom(image, {
										maxScale: 10,
										minScale: 0.5,
										panOnlyWhenZoomed: true
									})
									image.parentElement.addEventListener('wheel', panzoom.zoomWithWheel)
									panzoomInstance = panzoom
									panzoomTarget = image.parentElement
									panel.addControl({
										html: '<span class="material-icons">adjust</span>',
										name: 'dezoom',
										ariaLabel: this.$t('recentrer'),
										handler: () => {
											document.querySelector('#' + imageId + ' img').style.maxHeight = document.querySelector('#' + panel.id + ' .jsPanel-content').clientHeight + 'px'
											panzoom.reset()
										},
										afterInsert: (control) => {
											control.title = this.$t('recentrer')
										}
									})
									panel.querySelector('.jsPanel-btn-dezoom').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											document.querySelector('#' + imageId + ' img').style.maxHeight = document.querySelector('#' + panel.id + ' .jsPanel-content').clientHeight + 'px'
											panzoom.reset()
										}
									})
								} else if (item.type === 'audio') {
									panel.resize({
										width: largeurPanneau,
										height: '150px'
									}).reposition()
									panel.addControl({
										html: '<a class="material-icons telecharger" download href="' + escapeHtml(urlMedia) + '" target="_blank" title="' + this.$t('telecharger') + '" aria-label="' + this.$t('telecharger') + '">file_download</a>',
										name: 'telecharger',
										handler: () => {}
									})
								} else if (item.type === 'embed') {
									panel.addControl({
										html: '<span class="material-icons">link</span>',
										name: 'copier-lien',
										ariaLabel: this.$t('copierLien'),
										handler: () => {},
										afterInsert: (control) => {
											control.title = this.$t('copierLien')
											let lien
											if (item.source === 'etherpad') {
												lien = item.media
											} else if (this.verifierURL(item.iframe)) {
												lien = item.iframe
											} else {
												lien = (item.iframe.match(/<iframe [^>]*src="[^"]*"[^>]*>/g) || []).map(x => x.replace(/.*src="([^"]*)".*/, '$1'))[0] || ''
											}
											clipboardVisionneuse = new ClipboardJS(panel.querySelector('.jsPanel-btn-copier-lien'), {
												text: () => {
													return lien
												}
											})
											clipboardVisionneuse.on('success', () => {
												panel.querySelector('.jsPanel-btn-copier-lien')?.focus()
												this.notification = this.$t('lienCopie')
											})
										}
									})
									panel.querySelector('.jsPanel-btn-copier-lien').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											e.target.click()
										}
									})
								} else if (item.type === 'pdf' || item.type === 'document' || item.type === 'office') {
									panel.addControl({
										html: '<a class="material-icons telecharger" download href="' + escapeHtml(urlMedia) + '" target="_blank" title="' + this.$t('telecharger') + '" aria-label="' + this.$t('telecharger') + '">file_download</a>',
										name: 'telecharger',
										handler: () => {}
									})
								}
								if (panel.querySelector('.jsPanel-btn-smallify')) {
									panel.querySelector('.jsPanel-btn-smallify').title = this.$t('plier')
									panel.querySelector('.jsPanel-btn-smallify').ariaLabel = this.$t('plier')
									panel.querySelector('.jsPanel-btn-smallify').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											if (panel.status === 'smallified') {
												panel.unsmallify()
											} else {
												panel.smallify()
											}
										}
									})
								}
								if (panel.querySelector('.jsPanel-btn-normalize')) {
									panel.querySelector('.jsPanel-btn-normalize').title = this.$t('normaliser')
									panel.querySelector('.jsPanel-btn-normalize').ariaLabel = this.$t('normaliser')
									panel.querySelector('.jsPanel-btn-normalize').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											panel.normalize()
											panel.querySelector('.jsPanel-btn-maximize')?.focus()
										}
									})
								}
								if (panel.querySelector('.jsPanel-btn-maximize')) {
									panel.querySelector('.jsPanel-btn-maximize').title = this.$t('maximiser')
									panel.querySelector('.jsPanel-btn-maximize').ariaLabel = this.$t('maximiser')
									panel.querySelector('.jsPanel-btn-maximize').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											panel.maximize()
											panel.querySelector('.jsPanel-btn-normalize')?.focus()
										}
									})
								}
								if (panel.querySelector('.jsPanel-btn-close')) {
									panel.querySelector('.jsPanel-btn-close').title = this.$t('fermer')
									panel.querySelector('.jsPanel-btn-close').ariaLabel = this.$t('fermer')
									panel.querySelector('.jsPanel-btn-close').addEventListener('keydown', (e) => {
										if (e.key === 'Enter' || e.key === ' ') {
											e.preventDefault()
											e.stopPropagation()
											panel.close()
										}
									})
								}
							},
							onmaximized: (panel) => {
								if (item.type === 'image' || item.type === 'lien-image') {
									document.querySelector('#' + imageId + ' img').style.maxHeight = document.querySelector('#' + panel.id + ' .jsPanel-content').clientHeight + 'px'
								}
							},
							onbeforeclose: (panel) => {
								if (clipboardVisionneuse) {
									clipboardVisionneuse.destroy()
									clipboardVisionneuse = null
								}
								const panneaux = document.querySelectorAll('.jsPanel')
								if (document.querySelector('#masque') && panneaux.length === 1) {
									document.querySelector('#masque').classList.remove('ouvert')
								}
								const indexPanneau = this.panneaux.findIndex(panneau => panneau.id === panel.id)
								if (indexPanneau !== -1) {
									this.panneaux.splice(indexPanneau, 1)
								}
								if (panzoomTarget && panzoomInstance) {
									panzoomTarget.removeEventListener('wheel', panzoomInstance.zoomWithWheel)
									panzoomInstance = null
									panzoomTarget = null
								}
								if (this.panneaux.length === 0) {
									this.gererFocus()
								} else {
									this.$nextTick(() => {
										const id = this.panneaux[this.panneaux.length - 1].id
										if (id) {
											this.elementPrecedent = document.querySelector('#' + id.replace('panneau_', '')) || document.body
											document.querySelector('#' + id + ' .jsPanel-btn-close')?.focus()
										}
									})
								}
								return true
							},
							dragit: {
								snap: snapOptions
							}
						})
						this.panneaux.push(panneau)
						this.$nextTick(() => {
							document.querySelector('#panneau_' + item.bloc + ' .jsPanel-btn-close')?.focus()
						})
					} finally {
						this.retirerVisionneuseEnCours(item.bloc)
					}
				})
			}
		},
		definirOptionsSnap () {
			let snapOptions
			if (window.innerHeight < window.innerWidth) {
				snapOptions = {
					sensitivity: 40,
					repositionOnSnap: true,
					resizeToPreSnap: true,
					snapLeftTop: (panel) => {
						panel.resize({ width: '50%', height: '100%' })
					},
					snapRightTop: (panel) => {
						panel.resize({ width: '50%', height: '100%' })
					},
					snapLeftBottom: (panel) => {
						panel.resize({ width: '50%', height: '100%' })
					},
					snapRightBottom: (panel) => {
						panel.resize({ width: '50%', height: '100%' })
					},
					snapCenterTop: false,
					snapRightCenter: false,
					snapCenterBottom: false,
					snapLeftCenter: false
				}
			} else {
				snapOptions = {
					sensitivity: 15,
					repositionOnSnap: true,
					resizeToPreSnap: true,
					snapCenterTop: (panel) => {
						panel.resize({ width: '100%', height: '50%' })
					},
					snapCenterBottom: (panel) => {
						panel.resize({ width: '100%', height: '50%' })
					},
					snapLeftTop: false,
					snapRightCenter: false,
					snapRightBottom: false,
					snapRightTop: false,
					snapLeftBottom: false,
					snapLeftCenter: false
				}
			}
			return snapOptions
		},
		activerDefilementHorizontal () {
			const pad = document.querySelector('#pad')
			pad.addEventListener('mousedown', this.defilementHorizontalDebut)
			pad.addEventListener('mouseleave', this.defilementHorizontalFin)
			pad.addEventListener('mouseup', this.defilementHorizontalFin)
			pad.addEventListener('mousemove', this.defilementHorizontalEnCours)
		},
		desactiverDefilementHorizontal () {
			const pad = document.querySelector('#pad')
			pad.removeEventListener('mousedown', this.defilementHorizontalDebut)
			pad.removeEventListener('mouseleave', this.defilementHorizontalFin)
			pad.removeEventListener('mouseup', this.defilementHorizontalFin)
			pad.removeEventListener('mousemove', this.defilementHorizontalEnCours)
		},
		defilementHorizontalDebut (event) {
			const pad = document.querySelector('#pad')
			this.defilement = true
			this.depart = event.pageX - pad.offsetLeft
			this.distance = pad.scrollLeft
		},
		defilementHorizontalFin () {
			this.defilement = false
		},
		defilementHorizontalEnCours (event) {
			if (!this.defilement) { return }
			event.preventDefault()
			const pad = document.querySelector('#pad')
			const x = event.pageX - pad.offsetLeft
			const delta = (x - this.depart) * 1.5
			pad.scrollLeft = this.distance - delta
		},
		definirClasseOrganiser () {
			if (this.blocs.length > 1 || (this.pad.affichage === 'colonnes' && this.pad.colonnes.length > 1)) {
				return true
			} else {
				return false
			}
		},
		activerModeOrganiser () {
			if (this.blocs.length > 1 || (this.pad.affichage === 'colonnes' && this.pad.colonnes.length > 1)) {
				this.chargement = true
				this.menu = ''
				this.recherche = false
				setTimeout(() => {
					this.chargement = false
					this.action = 'organiser'
					this.notification = this.$t('modeOrganiserActive')
				}, 100)
			}
		},
		desactiverModeOrganiser () {
			this.chargement = true
			this.menu = ''
			this.recherche = false
			setTimeout(() => {
				this.chargement = false
				this.action = ''
				this.notification = this.$t('modeOrganiserDesactive')
			}, 100)
		},
		afficherModaleDiaporama () {
			if (this.blocs.length > 0) {
				this.panneaux.forEach((panneau) => {
					panneau.close()
				})
				this.panneaux = []
				this.chargement = true
				let donneesBloc = {}
				const blocActif = document.querySelector('.bloc.actif')
				if (blocActif) {
					const bloc = blocActif.id
					this.blocs.forEach((item) => {
						if (item.bloc === bloc) {
							donneesBloc = item
						}
					})
				} else {
					donneesBloc = this.blocs[0]
					this.definirBlocActif(donneesBloc.bloc)
				}
				this.donneesBloc = donneesBloc
				if (!this.donneesBloc.hasOwnProperty('texte')) {
					this.recupererBloc(this.donneesBloc.bloc)
				}
				this.menu = ''
				this.elementPrecedent = (document.activeElement || document.body)
				this.modaleDiaporama = true
				this.rafraichirMediaDiaporama()
				this.$nextTick(() => {
					document.querySelector('#diapositive').addEventListener('keydown', this.activerClavierDiaporama)
					document.querySelector('#diapositive').addEventListener('click', this.gererFocusCommentaires)
					document.querySelector('#diapositive .fermer')?.focus()
				})
				if (this.pad.commentaires === 'actives' && this.commentairesVisibles) {
					this.$socket.emit('commentaires', donneesBloc.bloc, this.pad.id, 'diapositive', this.identifiant)
				} else {
					this.$nextTick(() => {
						this.chargerDiapositive()
					})
				}
			}
		},
		activerClavierDiaporama (event) {
			if (this.modaleConfirmation || this.modale === 'evaluations' || this.modale === 'liste-evaluations') return
			if (event.ctrlKey && event.key === 'ArrowLeft') {
				this.afficherBlocPrecedent()
			} else if (event.ctrlKey && event.key === 'ArrowRight') {
				this.afficherBlocSuivant()
			}
		},
		afficherBlocPrecedent () {
			this.chargement = true
			this.commentaire = ''
			const bloc = this.donneesBloc.bloc
			let indexBloc = 0
			let indexColonne = 0
			if (this.pad.affichage === 'colonnes') {
				this.colonnes.forEach((colonne, indexCol) => {
					colonne.forEach((item, index) => {
						if (item.bloc === bloc) {
							indexBloc = index
							indexColonne = indexCol
						}
					})
				})
			} else {
				this.blocs.forEach((item, index) => {
					if (item.bloc === bloc) {
						indexBloc = index
					}
				})
			}
			indexBloc--
			if (indexBloc === -1 && this.pad.affichage !== 'colonnes') {
				this.donneesBloc = this.blocs[this.blocs.length - 1]
			} else if (indexBloc !== -1 && this.pad.affichage !== 'colonnes') {
				this.donneesBloc = this.blocs[indexBloc]
			} else if (indexBloc === -1 && this.pad.affichage === 'colonnes') {
				let colonnePrecedente = null
				for (let i = indexColonne - 1; i >= 0; i--) {
					if (this.colonnes[i].length > 0) { colonnePrecedente = i; break }
				}
				if (colonnePrecedente === null) {
					for (let i = this.colonnes.length - 1; i > indexColonne; i--) {
						if (this.colonnes[i].length > 0) { colonnePrecedente = i; break }
					}
				}
				if (colonnePrecedente !== null) {
					this.donneesBloc = this.colonnes[colonnePrecedente][this.colonnes[colonnePrecedente].length - 1]
				}
			} else if (indexBloc !== -1 && this.pad.affichage === 'colonnes') {
				this.donneesBloc = this.colonnes[indexColonne][indexBloc]
			}
			this.definirBlocActif(this.donneesBloc.bloc)
			this.rafraichirMediaDiaporama()
			if (!this.donneesBloc.hasOwnProperty('texte')) {
				this.recupererBloc(this.donneesBloc.bloc)
			}
			if (this.pad.commentaires === 'actives' && this.commentairesVisibles) {
				if (this.editeurCommentaire !== '') {
					this.editeurCommentaire.content.innerHTML = ''
				}
				if (this.editionCommentaire) {
					this.annulerModifierCommentaire()
				}
				this.$socket.emit('commentaires', this.donneesBloc.bloc, this.pad.id, 'diapositive', this.identifiant)
			} else {
				this.chargerDiapositive()
			}
		},
		afficherBlocSuivant () {
			this.chargement = true
			this.commentaire = ''
			const bloc = this.donneesBloc.bloc
			let indexBloc = 0
			let indexColonne = 0
			if (this.pad.affichage === 'colonnes') {
				this.colonnes.forEach((colonne, indexCol) => {
					colonne.forEach((item, index) => {
						if (item.bloc === bloc) {
							indexBloc = index
							indexColonne = indexCol
						}
					})
				})
			} else {
				this.blocs.forEach((item, index) => {
					if (item.bloc === bloc) {
						indexBloc = index
					}
				})
			}
			indexBloc++
			if (indexBloc === this.blocs.length && this.pad.affichage !== 'colonnes') {
				this.donneesBloc = this.blocs[0]
			} else if (indexBloc !== this.blocs.length && this.pad.affichage !== 'colonnes') {
				this.donneesBloc = this.blocs[indexBloc]
			} else if (indexBloc === this.colonnes[indexColonne].length && this.pad.affichage === 'colonnes') {
				let colonneSuivante = null
				for (let i = indexColonne + 1; i < this.colonnes.length; i++) {
					if (this.colonnes[i].length > 0) { colonneSuivante = i; break }
				}
				if (colonneSuivante === null) {
					for (let i = 0; i <= indexColonne; i++) {
						if (this.colonnes[i].length > 0) { colonneSuivante = i; break }
					}
				}
				if (colonneSuivante !== null) {
					this.donneesBloc = this.colonnes[colonneSuivante][0]
				}
			} else if (indexBloc !== this.colonnes[indexColonne].length && this.pad.affichage === 'colonnes') {
				this.donneesBloc = this.colonnes[indexColonne][indexBloc]
			}
			this.definirBlocActif(this.donneesBloc.bloc)
			this.rafraichirMediaDiaporama()
			if (!this.donneesBloc.hasOwnProperty('texte')) {
				this.recupererBloc(this.donneesBloc.bloc)
			}
			if (this.pad.commentaires === 'actives' && this.commentairesVisibles) {
				if (this.editeurCommentaire !== '') {
					this.editeurCommentaire.content.innerHTML = ''
				}
				if (this.editionCommentaire) {
					this.annulerModifierCommentaire()
				}
				this.$socket.emit('commentaires', this.donneesBloc.bloc, this.pad.id, 'diapositive', this.identifiant)
			} else {
				this.chargerDiapositive()
			}
		},
		activerActionBloc (event) {
			if (event.target !== event.currentTarget) return
			event.preventDefault()
			if (event.target.querySelector('.media') && event.target.querySelector('.media').firstElementChild) {
				event.target.querySelector('.media').firstElementChild.click()
			}
		},
		definirAriaLabelBloc (item) {
			if (item.media !== '' && (item.type === 'image' || item.type === 'lien-image' || item.type === 'audio' || item.type === 'video' || (item.type === 'document' && this.visionneuse !== '') || item.type === 'pdf' || (item.type === 'office' && this.visionneuse !== '') || item.type === 'embed')) {
				return this.$t('afficherDansVisionneuse')
			} else if (item.media !== '' && item.type === 'lien') {
				return this.$t('ouvrirLienNouvelOnglet')
			} else if (item.media !== '') {
				return this.$t('telecharger')
			}
		},
		definirBlocActif (bloc) {
			const blocActif = document.querySelector('.bloc.actif')
			if (blocActif) {
				blocActif.classList.remove('actif')
			}
			document.querySelector('#' + bloc)?.classList.add('actif')
			document.querySelector('#' + bloc)?.focus()
		},
		definirTypeMedia () {
			const media = this.donneesBloc.media || ''
			if (this.donneesBloc.source === 'youtube' || this.donneesBloc.source === 'vimeo' || this.donneesBloc.source === 'dailymotion' || this.donneesBloc.source === 'digiview') {
				return 'video'
			} else if (this.donneesBloc.source === 'slideshare' || this.donneesBloc.source === 'soundcloud' || media.includes('clyp.it') || media.includes('vocaroo.com') || media.includes('voca.ro')) {
				return 'embed'
			} else {
				return 'document'
			}
		},
		chargerDiapositive () {
			const contenuCharge = () => {
				this.chargement = false
				this.$nextTick(() => {
					document.querySelector('#diapositive .contenu').style.height = document.querySelector('#diapositive').clientHeight - this.convertirRem(5) + 'px'
					if (this.pad.commentaires === 'actives') {
						this.genererEditeur()
					}
					document.querySelector('#diapositive .fermer')?.focus()
					this.definirParametreURL(this.donneesBloc.bloc)
				})
			}
			if (document.querySelector('#diapositive')) {
				document.querySelector('#diapositive .contenu').removeAttribute('style')
				switch (this.donneesBloc.type) {
				case 'audio':
					this.$nextTick(() => {
						const audio = document.querySelector('#diapositive audio')
						audio.addEventListener('loadedmetadata', () => {
							contenuCharge()
						})
						audio.addEventListener('error', () => {
							contenuCharge()
						})
						if (audio.readyState >= 2) {
							contenuCharge()
						}
					})
					break
				case 'video':
					this.$nextTick(() => {
						const video = document.querySelector('#diapositive video')
						video.addEventListener('loadedmetadata', () => {
							contenuCharge()
						})
						video.addEventListener('error', () => {
							contenuCharge()
						})
						if (video.readyState >= 2) {
							contenuCharge()
						}
					})
					break
				default:
					this.$nextTick(() => {
						imagesLoaded('#diapositive', () => {
							contenuCharge()
						})
					})
					break
				}
			} else {
				this.chargement = false
			}
		},
		afficherBlocURL () {
			const params = this.$pageContext.pageProps.params
			const caps = params.caps
			if (caps && caps !== '' && this.blocs.find(b => b.bloc === 'bloc-id-' + caps)) {
				this.definirBlocActif('bloc-id-' + caps)
				this.afficherModaleDiaporama()
			}
		},
		definirParametreURL (bloc) {
			const page = new URL(window.location.href)
			if (page.searchParams.has('caps')) {
				page.searchParams.set('caps', bloc.replace('bloc-id-', ''))
			} else {
				page.searchParams.append('caps', bloc.replace('bloc-id-', ''))
			}
			window.history.pushState(null, '', '?' + page.searchParams.toString())
		},
		fermerModaleDiaporama () {
			document.querySelector('#diapositive').removeEventListener('keydown', this.activerClavierDiaporama)
			document.querySelector('#diapositive').removeEventListener('click', this.gererFocusCommentaires)
			this.modaleDiaporama = false
			this.commentaires = []
			this.commentaire = ''
			this.commentaireId = ''
			this.commentaireModifie = ''
			this.editeurCommentaire = ''
			this.focusId = ''
			this.emojis = ''
			this.donneesBloc = {}
			window.history.replaceState({}, document.title, window.location.href.split('?')[0])
			const blocActif = document.querySelector('.bloc.actif')
			if (blocActif) {
				this.elementPrecedent = blocActif
			}
			this.gererFocus()
		},
		ouvrirModaleAdmins () {
			this.menu = ''
			this.admins = JSON.parse(JSON.stringify(this.pad.admins))
			this.modale = 'admins'
			this.$nextTick(() => {
				document.querySelector('.modale .fermer')?.focus()
			})
		},
		ajouterAdmin () {
			const identifiantAdmin = document.querySelector('#ajouter-admin input').value.trim()
			if (identifiantAdmin !== '' && this.identifiant !== identifiantAdmin && !this.admins.includes(identifiantAdmin)) {
				this.chargement = true
				axios.post(this.hote + '/api/verifier-identifiant', {
					identifiant: identifiantAdmin
				}).then(() => {
					this.chargement = false
					this.admins.push(identifiantAdmin)
					document.querySelector('#ajouter-admin input').value = ''
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'identifiant_non_valide') {
						this.message = this.$t('identifiantNonValide')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			}
		},
		supprimerAdmin (identifiantAdmin) {
			const index = this.admins.indexOf(identifiantAdmin)
			if (index !== -1) {
				this.admins.splice(index, 1)
			}
		},
		modifierAdmins () {
			if (this.admins.toString() !== this.pad.admins.toString()) {
				this.modale = ''
				this.$socket.emit('modifieradmins', this.pad.id, this.admins, this.identifiant)
				this.chargement = true
			}
		},
		fermerModaleAdmins () {
			this.modale = ''
			this.admins = []
			this.gererFocus()
		},
		ouvrirModaleCommentaires (bloc, titre) {
			this.chargement = true
			this.bloc = bloc
			this.titre = titre
			this.$socket.emit('commentaires', bloc, this.pad.id, 'discussion', this.identifiant)
		},
		envoyerCommentaire (event) {
			event.preventDefault()
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			}
			if (this.commentaire !== '') {
				this.$socket.emit('commenterbloc', bloc, this.pad.id, this.titre, this.formaterHTML(this.commentaire), this.identifiant, this.nom)
				this.commentaire = ''
				this.commentaireId = ''
				this.commentaireModifie = ''
				if (this.editeurCommentaire !== '') {
					this.editeurCommentaire.content.innerHTML = ''
				}
				this.emojis = ''
				this.focusId = ''
			}
		},
		afficherModifierCommentaire (id, texte) {
			this.commentaireId = id
			this.commentaireModifie = texte
			this.editionCommentaire = true
			this.emojis = ''
			this.$nextTick(() => {
				const actions = this.definirActionsEditeur('commentaire-modifie')
				const editeur = pell.init({
					element: document.querySelector('#commentaire-modifie'),
					onChange: (html) => {
						this.commentaireModifie = html
					},
					actions: actions,
					classes: { actionbar: 'boutons-editeur-commentaire', button: 'bouton-editeur', content: 'contenu-editeur-commentaire', selected: 'bouton-actif' }
				})
				editeur.content.innerHTML = this.formaterHTML(this.commentaireModifie)
				editeur.content.onpaste = (event) => {
					event.preventDefault()
					event.stopPropagation()
					let html = event.clipboardData.getData('text/html')
					if (html !== '') {
						html = stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
						html = html.replace(/style=".*?"/mg, '')
						html = html.replace(/class=".*?"/mg, '')
						html = this.formaterHTML(html)
						pell.exec('insertHTML', html)
					} else {
						pell.exec('insertText', event.clipboardData.getData('text/plain'))
					}
				}
				this.initialiserChampCouleur(editeur, 'couleur-texte-commentaire-modifie')
				document.querySelector('#commentaire-' + this.commentaireId + ' .action button')?.focus()
			})
		},
		annulerModifierCommentaire () {
			const id = this.commentaireId
			this.commentaireId = ''
			this.commentaireModifie = ''
			this.editionCommentaire = false
			this.emojis = ''
			this.$nextTick(() => {
				document.querySelector('#commentaire-' + id + ' .action button')?.focus()
			})
		},
		modifierCommentaire () {
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			}
			this.$socket.emit('modifiercommentaire', bloc, this.pad.id, this.commentaireId, this.formaterHTML(this.commentaireModifie), this.identifiant)
			this.commentaireId = ''
			this.commentaireModifie = ''
			this.editionCommentaire = false
			this.emojis = ''
		},
		afficherSupprimerCommentaire (id) {
			this.editionCommentaire = false
			this.commentaireId = id
			this.messageConfirmation = this.$t('confirmationSupprimerCommentaire')
			this.typeConfirmation = 'supprimer-commentaire'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		supprimerCommentaire () {
			this.modaleConfirmation = false
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			}
			this.$socket.emit('supprimercommentaire', bloc, this.pad.id, this.commentaireId, this.identifiant)
			this.fermerModaleConfirmation()
		},
		genererEditeur () {
			if (this.editeurCommentaire === '' && document.querySelector('#commentaire')) {
				const actions = this.definirActionsEditeur('commentaire')
				this.editeurCommentaire = pell.init({
					element: document.querySelector('#commentaire'),
					onChange: (html) => {
						this.commentaire = html
					},
					actions: actions,
					classes: { actionbar: 'boutons-editeur-commentaire', button: 'bouton-editeur', content: 'contenu-editeur-commentaire', selected: 'bouton-actif' }
				})
				this.editeurCommentaire.content.onpaste = (event) => {
					event.preventDefault()
					event.stopPropagation()
					let html = event.clipboardData.getData('text/html')
					if (html !== '') {
						html = stripTags(html, ['b', 'i', 'u', 'strike', 'a', 'br', 'div', 'font', 'ul', 'ol', 'li'])
						html = html.replace(/style=".*?"/mg, '')
						html = html.replace(/class=".*?"/mg, '')
						html = this.formaterHTML(html)
						pell.exec('insertHTML', html)
					} else {
						pell.exec('insertText', event.clipboardData.getData('text/plain'))
					}
				}
				this.initialiserChampCouleur(this.editeurCommentaire, 'couleur-texte-commentaire')
			}
		},
		definirActionsEditeur (type) {
			const actions = [
				{ name: 'gras', title: this.$t('gras'), icon: '<i class="material-icons" aria-hidden="true">format_bold</i>', result: () => pell.exec('bold') },
				{ name: 'italique', title: this.$t('italique'), icon: '<i class="material-icons" aria-hidden="true">format_italic</i>', result: () => pell.exec('italic') },
				{ name: 'souligne', title: this.$t('souligne'), icon: '<i class="material-icons" aria-hidden="true">format_underlined</i>', result: () => pell.exec('underline') },
				{ name: 'barre', title: this.$t('barre'), icon: '<i class="material-icons" aria-hidden="true">format_strikethrough</i>', result: () => pell.exec('strikethrough') },
				{ name: 'exposant', title: this.$t('exposant'), icon: '<i class="material-icons" aria-hidden="true">superscript</i>', result: () => pell.exec('superscript') },
				{ name: 'couleur', title: this.$t('couleurTexte'), icon: '<i class="material-icons couleur-texte" aria-hidden="true">format_color_text</i>', result: () => {
					let i = 0
					let couleurActuelle = ''
					let element = window.getSelection()?.focusNode?.parentNode ?? null
					while (i < 6 && couleurActuelle === '' && element !== null) {
						if (element.tagName === 'FONT' && element.color !== null) {
							couleurActuelle = element.color
						} else {
							element = element.parentNode
						}
						i++
					}
					const champ = document.querySelector('#couleur-texte-' + type)
					if (champ === null) {
						return
					}
					champ.value = couleurActuelle !== '' ? couleurActuelle : '#001d1d'
					this.ouvrirSelecteurCouleur(champ)
				} },
				{ name: 'lien', title: this.$t('lien'), icon: '<i class="material-icons" aria-hidden="true">link</i>', result: () => {
					let i = 0
					let lienActuel = ''
					let element = window.getSelection()?.focusNode?.parentNode ?? null
					while (i < 6 && lienActuel === '' && element !== null) {
						if (element.href && element.href !== null) {
							lienActuel = element.href
						} else {
							element = element.parentNode
						}
						i++
					}
					if (lienActuel !== '') {
						const range = document.createRange()
						range.selectNodeContents(element)
						const selection = window.getSelection()
						selection.removeAllRanges()
						selection.addRange(range)
					}
					const url = window.prompt(this.$t('adresseLien'), lienActuel)
					if (url && url !== '') {
						pell.exec('createLink', url)
					} else if (url === '') {
						pell.exec('unlink')
					}
				} },
				{ name: 'emojis', title: this.$t('emoticones'), icon: '<i class="material-icons" aria-hidden="true">insert_emoticon</i>', result: () => { this.afficherEmojis(type) } },
				{ name: 'supprimer-formatage', title: this.$t('supprimerFormatage'), icon: '<i class="material-icons" aria-hidden="true">format_clear</i>', result: () => {
					pell.exec('removeFormat')
				} }
			]
			return actions
		},
		afficherEmojis (type) {
			if (type === 'commentaire' && this.emojis !== 'commentaire') {
				this.emojis = 'commentaire'
			} else if (type === 'commentaire' && this.emojis === 'commentaire') {
				this.emojis = ''
			} else if (type === 'commentaire-modifie' && this.emojis !== 'commentaire-modifie') {
				this.emojis = 'commentaire-modifie'
			} else if (type === 'commentaire-modifie' && this.emojis === 'commentaire-modifie') {
				this.emojis = ''
			}
		},
		insererEmoji (emoji) {
			pell.exec('insertText', emoji)
		},
		fermerModaleCommentaires () {
			document.querySelector('#discussion').removeEventListener('click', this.gererFocusCommentaires)
			this.modale = ''
			this.commentaires = []
			this.commentaire = ''
			this.commentaireId = ''
			this.commentaireModifie = ''
			this.editeurCommentaire = ''
			this.editionCommentaire = false
			this.focusId = ''
			this.emojis = ''
			this.bloc = ''
			this.titre = ''
			this.gererFocus()
		},
		verifierUtilisateurEvaluation (evaluations) {
			if (evaluations && evaluations.length > 0) {
				let capsuleEvaluee = false
				evaluations.forEach((evaluation) => {
					if (evaluation.identifiant === this.identifiant) {
						capsuleEvaluee = true
					}
				})
				return capsuleEvaluee
			} else {
				return false
			}
		},
		definirEvaluationCapsule (evaluations) {
			if (evaluations && evaluations.length > 0) {
				let note = 0
				evaluations.forEach((evaluation) => {
					note = note + evaluation.etoiles
				})
				if (note > 0) {
					return Math.round(note / evaluations.length)
				} else {
					return 0
				}
			} else {
				return 0
			}
		},
		ouvrirModaleEvaluations (bloc, titre, evaluations) {
			this.bloc = bloc
			this.titre = titre
			if (evaluations !== '') {
				this.evaluations = evaluations
				evaluations.forEach((evaluation) => {
					if (evaluation.identifiant === this.identifiant) {
						this.evaluationId = evaluation.id
						this.evaluation = evaluation.etoiles
					}
				})
			}
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'evaluations'
			this.$nextTick(() => {
				document.querySelector('.modale .fermer')?.focus()
			})
		},
		envoyerEvaluation () {
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			} else {
				this.chargement = true
			}
			this.$socket.emit('evaluerbloc', bloc, this.pad.id, this.titre, this.evaluation, this.identifiant, this.nom)
			this.fermerModaleEvaluations()
		},
		modifierEvaluation () {
			let bloc = this.bloc
			if (Object.keys(this.donneesBloc).length > 0) {
				bloc = this.donneesBloc.bloc
			} else {
				this.chargement = true
			}
			if (this.evaluation === 0) {
				this.$socket.emit('supprimerevaluation', bloc, this.pad.id, this.evaluationId, this.identifiant)
			} else {
				this.$socket.emit('modifierevaluation', bloc, this.pad.id, this.evaluationId, this.evaluation, this.identifiant)
			}
			this.fermerModaleEvaluations()
		},
		fermerModaleEvaluations () {
			this.modale = ''
			this.evaluations = []
			this.evaluation = 0
			this.evaluationId = ''
			this.listeEvaluations = []
			this.bloc = ''
			this.titre = ''
			this.gererFocus()
		},
		ouvrirModaleListeEvaluations (bloc) {
			this.chargement = true
			this.bloc = bloc
			this.elementPrecedent = (document.activeElement || document.body)
			this.$socket.emit('evaluations', bloc, this.pad.id, this.identifiant)
		},
		fermerModaleListeEvaluations () {
			this.modale = ''
			this.listeEvaluations = []
			this.bloc = ''
			this.gererFocus()
		},
		demarrerDeplacerBloc () {
			if (!this.mobile && this.pad.affichage === 'colonnes') {
				this.desactiverDefilementHorizontal()
				this.defilement = false
				this.depart = 0
				this.distance = 0
			}
		},
		deplacerBloc (event) {
			this.chargement = true
			if (this.pad.affichage === 'colonnes') {
				if (!this.mobile) {
					this.activerDefilementHorizontal()
				}
				const blocs = []
				this.colonnes.forEach((colonne, indexColonne) => {
					colonne.forEach((bloc) => {
						blocs.push({ ...bloc, colonne: indexColonne })
					})
				})
				this.blocs = blocs
			}
			let ordre = 'croissant'
			if (this.pad.hasOwnProperty('ordre')) {
				ordre = this.pad.ordre
			}
			this.$socket.emit('deplacerbloc', this.blocs, this.pad.id, this.pad.affichage, ordre, this.identifiant)
			this.$nextTick(() => {
				const blocsActifs = document.querySelectorAll('.bloc.actif')
				if (blocsActifs.length > 0) {
					blocsActifs.forEach((bloc) => {
						bloc.classList.remove('actif')
					})
				}
				let indexBloc
				if (this.pad.affichage === 'colonnes') {
					const indexColonne = event.to.getAttribute('data-index')
					indexBloc = event.newIndex
					if (this.colonnes[indexColonne][indexBloc] && this.colonnes[indexColonne][indexBloc].bloc) {
						document.querySelector('#' + this.colonnes[indexColonne][indexBloc].bloc).classList.add('actif')
						document.querySelector('#' + this.colonnes[indexColonne][indexBloc].bloc)?.focus()
					}
				} else {
					indexBloc = event.newIndex
					if (this.blocs[indexBloc] && this.blocs[indexBloc].bloc) {
						document.querySelector('#' + this.blocs[indexBloc].bloc).classList.add('actif')
						document.querySelector('#' + this.blocs[indexBloc].bloc)?.focus()
					}
				}
			})
		},
		surlignerBloc (event) {
			const blocActif = document.querySelector('.bloc.actif')
			if (blocActif && document.querySelector('#pad').contains(event.target)) {
				blocActif.classList.remove('actif')
			}
			const element = event.target.closest('.bloc') || event.target.closest('li')
			if (element && element.hasAttribute('data-bloc')) {
				if (blocActif) {
					blocActif.classList.remove('actif')
				}
				const id = element.getAttribute('data-bloc')
				document.querySelector('#' + id)?.classList.add('actif')
				document.querySelector('#' + id)?.focus()
				if (document.querySelector('#entrees')?.contains(event.target)) {
					document.querySelector('#' + id)?.scrollIntoView()
				}
			}
		},
		redimensionner () {
			this.fermerMenuCapsule()
			const diapositive = document.querySelector('#diapositive')
			if (diapositive) {
				const contenuDiapositive = document.querySelector('#diapositive .contenu')
				contenuDiapositive.removeAttribute('style')
				this.$nextTick(() => {
					contenuDiapositive.style.height = diapositive.clientHeight - this.convertirRem(5) + 'px'
				})
			}
			const blocs = document.querySelector('#blocs')
			if (blocs) {
				this.$nextTick(() => {
					blocs.classList.add('anime')
					blocs.addEventListener('animationend', () => {
						blocs.classList.remove('anime')
					})
				})
			}
			if (this.enregistrement) {
				this.$nextTick(() => {
					const largeur = document.querySelector('#enregistrement').offsetWidth
					const canvas = document.querySelector('#visualisation')
					canvas.width = largeur
				})
			}
		},
		afficherActivite () {
			if (this.menu !== 'activite') {
				this.elementPrecedent = (document.activeElement || document.body)
				this.menu = 'activite'
				this.$nextTick(() => {
					setTimeout(() => {
						document.querySelector('#menu-activite').classList.add('ouvert')
						document.querySelector('#menu-activite .fermer')?.focus()
					}, 0)
				})
			} else {
				this.fermerMenu()
			}
		},
		afficherChat () {
			this.nouveauxMessagesChat = 0
			if (this.menu !== 'chat') {
				this.elementPrecedent = (document.activeElement || document.body)
				this.menu = 'chat'
				this.$nextTick(() => {
					setTimeout(() => {
						document.querySelector('#menu-conversation').classList.add('ouvert')
						document.querySelector('#menu-conversation .fermer')?.focus()
					}, 0)
				})
			} else {
				this.fermerMenu()
			}
		},
		afficherOptions () {
			if (this.menu !== 'options') {
				this.elementPrecedent = (document.activeElement || document.body)
				this.menu = 'options'
				this.$nextTick(() => {
					setTimeout(() => {
						document.querySelector('#menu-options').classList.add('ouvert')
						document.querySelector('#menu-options .fermer')?.focus()
					}, 0)
				})
			} else {
				this.fermerMenuOptions()
			}
		},
		afficherUtilisateurs () {
			if (this.menu !== 'utilisateurs') {
				this.elementPrecedent = (document.activeElement || document.body)
				this.menu = 'utilisateurs'
				this.$nextTick(() => {
					setTimeout(() => {
						document.querySelector('#menu-utilisateurs').classList.add('ouvert')
						document.querySelector('#menu-utilisateurs .fermer')?.focus()
					}, 0)
				})
			} else {
				this.fermerMenu()
			}
		},
		fermerMenu () {
			this.menu = ''
			this.gererFocus()
		},
		envoyerMessage () {
			if (this.messageChat !== '') {
				this.$socket.emit('message', this.pad.id, this.messageChat, this.identifiant, this.nom)
				this.messageChat = ''
			}
		},
		afficherReinitialiserMessages () {
			this.messageConfirmation = this.$t('confirmationSupprimerMessages')
			this.typeConfirmation = 'reinitialiser-messages'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		reinitialiserMessages () {
			this.$socket.emit('reinitialisermessages', this.pad.id, this.identifiant)
			this.chargement = true
			this.menu = ''
			this.fermerModaleConfirmation()
		},
		afficherReinitialiserActivite () {
			this.messageConfirmation = this.$t('confirmationSupprimerActivite')
			this.typeConfirmation = 'reinitialiser-activite'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		reinitialiserActivite () {
			this.$socket.emit('reinitialiseractivite', this.pad.id, this.identifiant)
			this.chargement = true
			this.menu = ''
			this.fermerModaleConfirmation()
		},
		supprimerActivite (id) {
			this.$socket.emit('supprimeractivite', this.pad.id, id, this.identifiant)
			this.chargement = true
		},
		modifierTitre () {
			const titre = document.querySelector('#titre-pad').value
			if (this.pad.titre !== titre && titre !== '') {
				this.$socket.emit('modifiertitre', this.pad.id, titre, this.identifiant)
				this.chargement = true
			}
		},
		modifierLangue (langue) {
			if (this.langue !== langue) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-langue', {
					identifiant: this.identifiant,
					langue: langue
				}).then(() => {
					this.chargement = false
					this.$i18n.locale = langue
					document.getElementsByTagName('html')[0].setAttribute('lang', langue)
					this.langue = langue
					this.notification = this.$t('langueModifiee')
					localStorage.setItem('digipad_lang', langue)
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'non_autorise') {
						this.message = this.$t('actionNonAutorisee')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			}
		},
		afficherCodeQR () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'code-qr'
			this.$nextTick(() => {
				const lien = this.hote + '/p/' + this.pad.id + '/' + this.pad.token
				this.codeqr = new QRCode('qr', {
					text: lien,
					width: 360,
					height: 360,
					colorDark: '#000000',
					colorLight: '#ffffff',
					correctLevel: QRCode.CorrectLevel.H
				})
				document.querySelector('.modale .fermer')?.focus()
			})
		},
		afficherReinitialiserVues () {
			this.messageConfirmation = this.$t('confirmationReinitialiserVues')
			this.typeConfirmation = 'reinitialiser-vues'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		reinitialiserVues () {
			this.$socket.emit('reinitialiservues', this.pad.id, this.identifiant)
			this.chargement = true
			this.fermerModaleConfirmation()
		},
		modifierAcces (acces) {
			if (this.pad.acces !== acces) {
				this.$socket.emit('modifieracces', this.pad.id, acces, this.identifiant)
				this.chargement = true
			}
		},
		afficherCodeAcces () {
			this.modificationCode = false
			this.codeVisible = true
			this.$nextTick(() => {
				if (document.querySelector('#code-acces')) {
					document.querySelector('#code-acces .icone:last-child')?.focus()
				} else {
					document.querySelector('.modale .icone')?.focus()
				}
			})
		},
		masquerCodeAcces () {
			this.modificationCode = false
			this.codeVisible = false
			this.$nextTick(() => {
				if (document.querySelector('#code-acces')) {
					document.querySelector('#code-acces .icone:last-child')?.focus()
				} else {
					document.querySelector('.modale .icone')?.focus()
				}
			})
		},
		afficherModifierCodeAcces () {
			this.codeVisible = true
			this.modificationCode = true
			this.$nextTick(() => {
				document.querySelector('#code-acces .icone:first-of-type')?.focus()
			})
		},
		annulerModifierCodeAcces () {
			this.codeVisible = false
			this.modificationCode = false
			this.$nextTick(() => {
				document.querySelector('#code-acces .icone:first-of-type')?.focus()
			})
		},
		modifierCodeAcces () {
			const code = document.querySelector('#code-acces input').value
			if (this.pad.code !== code && code !== '') {
				this.$socket.emit('modifiercodeacces', this.pad.id, code, this.identifiant)
				this.chargement = true
			}
		},
		verifierCodeAcces () {
			if (this.codeAcces !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/verifier-code-acces', {
					pad: this.pad.id,
					code: this.codeAcces
				}).then((reponse) => {
					const donnees = reponse.data
					this.chargement = false
					this.accesAutorise = true
					this.blocs = donnees.blocs
					this.activite = donnees.activite
					this.pad.affichage = donnees.pad.affichage
					this.pad.colonnes = donnees.pad.colonnes
					this.pad.affichageColonnes = donnees.pad.affichageColonnes
					this.pad.fondUrl = donnees.pad.fondUrl
					if (this.pad.affichage === 'colonnes') {
						this.definirColonnes(this.blocs)
						if (!this.mobile) {
							this.$nextTick(() => {
								this.activerDefilementHorizontal()
							})
						}
					}
					this.afficherBlocURL()
					this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
					this.fermerModaleCodeAcces()
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data?.message === 'code_incorrect') {
						this.message = this.$t('codePasCorrect')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			}
		},
		fermerModaleCodeAcces () {
			this.codeAcces = ''
			this.modale = ''
			this.modificationCode = false
			this.codeVisible = false
			this.gererFocus()
		},
		modifierContributions (contributions) {
			if (this.pad.contributions !== contributions) {
				this.$socket.emit('modifiercontributions', this.pad.id, contributions, this.pad.contributions, this.identifiant)
				this.chargement = true
			}
		},
		modifierAffichage (affichage) {
			if (this.pad.affichage !== affichage) {
				const titreColonne = (affichage === 'colonnes' && (!this.pad.colonnes || this.pad.colonnes.length === 0)) ? this.$t('colonneSansTitre') : ''
				this.$socket.emit('modifieraffichage', this.pad.id, affichage, titreColonne, this.identifiant)
				this.chargement = true
			}
		},
		modifierOrdre (ordre) {
			if (this.pad.ordre !== ordre) {
				this.$socket.emit('modifierordre', this.pad.id, ordre, this.identifiant)
				this.chargement = true
			}
		},
		modifierLargeur (largeur) {
			if (this.pad.largeur !== largeur) {
				this.$socket.emit('modifierlargeur', this.pad.id, largeur, this.identifiant)
				this.chargement = true
			}
		},
		modifierFond (fond) {
			if (this.pad.fond !== fond) {
				this.$socket.emit('modifierfond', this.pad.id, '/img/' + fond, this.identifiant)
				this.chargement = true
			}
		},
		modifierCouleurFond (event) {
			if (this.pad.fond !== event.target.value) {
				this.$socket.emit('modifiercouleurfond', this.pad.id, event.target.value, this.identifiant)
				this.chargement = true
			}
		},
		async ajouterFond () {
			const champ = document.querySelector('#televerser-fond')
			const formats = ['jpg', 'jpeg', 'png', 'gif']
			if (champ.files && champ.files[0]) {
				const extension = champ.files[0].name.substring(champ.files[0].name.lastIndexOf('.') + 1).toLowerCase()
				if (formats.includes(extension) && champ.files[0].size <= 3072000) {
					this.chargement = true
					const fichier = champ.files[0]
					const formulaire = new FormData()
					formulaire.append('pad', this.pad.id)
					formulaire.append('fichier', fichier)
					let jeton
					try {
						jeton = await this.recupererJetonTeleversement('fond', this.pad.id)
					} catch (err) {
						this.chargement = false
						this.message = this.definirMessageErreur(err)
						return
					}
					axios.post(this.hoteTeleversement + '/api/televerser-fond', formulaire, {
						headers: { 'x-jeton-televersement': jeton },
						onUploadProgress: (progression) => {
							const pourcentage = parseInt(Math.round((progression.loaded * 100) / progression.total))
							this.progressionFond = pourcentage
						}
					}).then((reponse) => {
						const donnees = reponse.data
						this.$socket.emit('modifierfond', this.pad.id, donnees, this.identifiant)
						this.progressionFond = 0
						champ.value = ''
					}).catch((err) => {
						this.chargement = false
						champ.value = ''
						this.progressionFond = 0
						if (err.response?.data === 'non_connecte') {
							window.location.replace('/')
						} else if (err.response?.data === 'erreur_televersement') {
							this.message = this.$t('erreurTeleversementFichier')
						} else if (err.response?.data === 'erreur_espace_disque') {
							this.message = this.$t('erreurEspaceDisque')
						} else if (err.response?.data === 'fichier_trop_volumineux') {
							this.message = this.$t('tailleMaximale', { taille: 3 })
						} else if (err.response?.data === 'non_autorise') {
							this.message = this.$t('actionNonAutorisee')
						} else {
							this.message = this.definirMessageErreur(err)
						}
					})
				} else {
					if (formats.includes(extension) === false) {
						this.message = this.$t('formatFichierPasAccepte')
					} else if (champ.files[0].size > 3072000) {
						this.message = this.$t('tailleMaximale', { taille: 3 })
					}
					champ.value = ''
				}
			} else {
				champ.value = ''
			}
		},
		modifierFondRepete (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierfondrepete', this.pad.id, 'active', this.identifiant)
			} else {
				this.$socket.emit('modifierfondrepete', this.pad.id, 'desactive', this.identifiant)
			}
			this.chargement = true
		},
		modifierActivite (event) {
			if (event.target.checked) {
				this.$socket.emit('modifieractivite', this.pad.id, 'active', this.identifiant)
			} else {
				this.$socket.emit('modifieractivite', this.pad.id, 'desactive', this.identifiant)
			}
			this.chargement = true
		},
		modifierConversation (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierconversation', this.pad.id, 'activee', this.identifiant)
			} else {
				this.$socket.emit('modifierconversation', this.pad.id, 'desactivee', this.identifiant)
			}
			this.chargement = true
		},
		modifierTransfertPropriete (event) {
			if (event.target.checked) {
				this.$socket.emit('modifiertransfertpropriete', this.pad.id, 'active', this.identifiant)
			} else {
				this.$socket.emit('modifiertransfertpropriete', this.pad.id, 'desactive', this.identifiant)
			}
			this.chargement = true
		},
		modifierListeUtilisateurs (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierlisteutilisateurs', this.pad.id, 'activee', this.identifiant)
			} else {
				this.$socket.emit('modifierlisteutilisateurs', this.pad.id, 'desactivee', this.identifiant)
			}
			this.chargement = true
		},
		modifierEditionNom (event) {
			if (event.target.checked) {
				this.$socket.emit('modifiereditionnom', this.pad.id, 'activee', this.identifiant)
			} else {
				this.$socket.emit('modifiereditionnom', this.pad.id, 'desactivee', this.identifiant)
			}
			this.chargement = true
		},
		modifierFichiers (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierfichiers', this.pad.id, 'actives', this.identifiant)
			} else {
				this.$socket.emit('modifierfichiers', this.pad.id, 'desactives', this.identifiant)
			}
			this.chargement = true
		},
		modifierEnregistrements (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierenregistrements', this.pad.id, 'actives', this.identifiant)
			} else {
				this.$socket.emit('modifierenregistrements', this.pad.id, 'desactives', this.identifiant)
			}
			this.chargement = true
		},
		modifierLiens (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierliens', this.pad.id, 'actives', this.identifiant)
			} else {
				this.$socket.emit('modifierliens', this.pad.id, 'desactives', this.identifiant)
			}
			this.chargement = true
		},
		modifierDocuments (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierdocuments', this.pad.id, 'actives', this.identifiant)
			} else {
				this.$socket.emit('modifierdocuments', this.pad.id, 'desactives', this.identifiant)
			}
			this.chargement = true
		},
		modifierCommentaires (event) {
			if (event.target.checked) {
				this.$socket.emit('modifiercommentaires', this.pad.id, 'actives', this.identifiant)
			} else {
				this.$socket.emit('modifiercommentaires', this.pad.id, 'desactives', this.identifiant)
			}
			this.chargement = true
		},
		ajouterEtiquette () {
			const champ = document.querySelector('#ajouter-etiquette input[type="text"]')
			if (champ === null) return
			const nom = champ.value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().substring(0, 32)
			if (nom === '' || this.etiquettes.length >= this.limiteEtiquettes) return
			if (this.etiquettes.some((etiquette) => etiquette.nom.toLowerCase() === nom.toLowerCase())) {
				this.message = this.$t('etiquetteExistante')
				return
			}
			this.etiquettes.push({ nom: nom, couleur: this.couleurEtiquette })
			champ.value = ''
			champ.focus()
		},
		supprimerEtiquette (index) {
			if (index >= 0 && index < this.etiquettes.length) {
				this.etiquettes.splice(index, 1)
			}
		},
		verifierEtiquettesRecherche (item, requete) {
			if (this.pad.etiquettes !== 'activees' || !Array.isArray(item.etiquettes)) return false
			return item.etiquettes.some((etiquette) => (etiquette.nom || '').toLowerCase().includes(requete))
		},
		modifierEtiquettes (event) {
			if (event.target.checked === true) {
				this.$socket.emit('modifieretiquettes', this.pad.id, 'activees', this.identifiant)
			} else {
				this.$socket.emit('modifieretiquettes', this.pad.id, 'desactivees', this.identifiant)
			}
			this.chargement = true
		},
		modifierEvaluations (event) {
			if (event.target.checked) {
				this.$socket.emit('modifierevaluations', this.pad.id, 'activees', this.identifiant)
			} else {
				this.$socket.emit('modifierevaluations', this.pad.id, 'desactivees', this.identifiant)
			}
			this.chargement = true
		},
		modifierVisibiliteCommentaires (visibilite) {
			if (this.pad.visibiliteCommentaires !== visibilite) {
				this.$socket.emit('modifiervisibilitecommentaires', this.pad.id, visibilite, this.identifiant)
				this.chargement = true
			}
		},
		modifierAccesCommentaires (acces) {
			if (this.pad.accesCommentaires !== acces) {
				this.$socket.emit('modifieraccescommentaires', this.pad.id, acces, this.identifiant)
				this.chargement = true
			}
		},
		modifierModerationCommentaires (event) {
			if (event.target.checked) {
				this.$socket.emit('modifiermoderationcommentaires', this.pad.id, 'activee', this.identifiant)
			} else {
				this.$socket.emit('modifiermoderationcommentaires', this.pad.id, 'desactivee', this.identifiant)
			}
			this.chargement = true
		},
		modifierVisibiliteEvaluations (visibilite) {
			if (this.pad.visibiliteEvaluations !== visibilite) {
				this.$socket.emit('modifiervisibiliteevaluations', this.pad.id, visibilite, this.identifiant)
				this.chargement = true
			}
		},
		modifierAccesEvaluations (acces) {
			if (this.pad.accesEvaluations !== acces) {
				this.$socket.emit('modifieraccesevaluations', this.pad.id, acces, this.identifiant)
				this.chargement = true
			}
		},
		modifierCopieBloc (event) {
			if (event.target.checked) {
				this.$socket.emit('modifiercopiebloc', this.pad.id, 'activee', this.identifiant)
			} else {
				this.$socket.emit('modifiercopiebloc', this.pad.id, 'desactivee', this.identifiant)
			}
			this.chargement = true
		},
		modifierVisionneuse (visionneuse) {
			if (!this.pad.visionneuse || this.pad.visionneuse !== visionneuse) {
				this.$socket.emit('modifiervisionneuse', this.pad.id, visionneuse, this.identifiant)
				this.chargement = true
			}
		},
		fermerMenuOptions () {
			this.menu = ''
			const titrePad = document.querySelector('#titre-pad')
			if (titrePad) titrePad.value = this.pad.titre
			this.codeVisible = false
			this.gererFocus()
		},
		afficherModifierNom () {
			this.nomUtilisateur = this.nom
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'modifier-nom'
			this.$nextTick(() => {
				document.querySelector('#champ-nom')?.focus()
			})
		},
		modifierNom () {
			const nom = this.nomUtilisateur
			if (nom !== '') {
				this.$socket.emit('modifiernom', this.pad.id, nom, this.identifiant)
				this.chargement = true
				this.fermerModaleModifierNom()
			}
		},
		fermerModaleModifierNom () {
			this.modale = ''
			this.nomUtilisateur = ''
			this.gererFocus()
		},
		modifierCaracteristique (identifiant, caracteristique, valeur) {
			this.blocs.forEach((item) => {
				if (item.identifiant === identifiant && item.hasOwnProperty(caracteristique)) {
					item[caracteristique] = valeur
				}
			})
			this.commentaires.forEach((commentaire) => {
				if (commentaire.identifiant === identifiant && commentaire.hasOwnProperty(caracteristique)) {
					commentaire[caracteristique] = valeur
				}
			})
			this.activite.forEach((entree) => {
				if (entree.identifiant === identifiant && entree.hasOwnProperty(caracteristique)) {
					entree[caracteristique] = valeur
				}
			})
			this.messagesChat.forEach((message) => {
				if (message.identifiant === identifiant && message.hasOwnProperty(caracteristique)) {
					message[caracteristique] = valeur
				}
			})
			this.utilisateurs.forEach((utilisateur) => {
				if (utilisateur.identifiant === identifiant && utilisateur.hasOwnProperty(caracteristique)) {
					utilisateur[caracteristique] = valeur
				}
			})
		},
		eclaircirCouleur (hex) {
			if (hex && hex.substring(0, 1) === '#') {
				const r = parseInt(hex.slice(1, 3), 16)
				const v = parseInt(hex.slice(3, 5), 16)
				const b = parseInt(hex.slice(5, 7), 16)
				return 'rgba(' + r + ', ' + v + ', ' + b + ', ' + 0.15 + ')'
			} else {
				return 'transparent'
			}
		},
		convertirRem (rem) {
			return rem * parseFloat(getComputedStyle(document.documentElement).fontSize)
		},
		deconnexion () {
			const identifiant = this.identifiant
			axios.post(this.hote + '/api/deconnexion').then(() => {
				this.$socket.emit('deconnexion', identifiant)
				window.location.replace('/')
			}).catch((err) => {
				this.message = this.definirMessageErreur(err)
			})
		},
		afficherModaleModifierMotDePasse () {
			this.menu = ''
			this.modale = 'modifier-mot-de-passe'
			this.$nextTick(() => {
				document.querySelector('#champ-motdepasse-actuel')?.focus()
			})
		},
		modifierMotDePasse () {
			const motDePasse = this.motDePasse
			const nouveauMotDePasse = this.nouveauMotDePasse
			if (nouveauMotDePasse !== '' && nouveauMotDePasse.length < 8) {
				this.message = this.$t('motDePasseTropCourt')
				return
			}
			if (motDePasse !== '' && nouveauMotDePasse !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/modifier-mot-de-passe-pad', {
					pad: this.pad.id,
					identifiant: this.identifiant,
					motdepasse: motDePasse,
					nouveaumotdepasse: nouveauMotDePasse
				}).then(() => {
					this.notification = this.$t('motDePasseModifie')
					this.fermerModaleModifierMotDePasse()
					this.chargement = false
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'motdepasse_trop_court') {
						this.message = this.$t('motDePasseTropCourt')
					} else if (err.response?.data === 'motdepasse_incorrect') {
						this.message = this.$t('motDePasseActuelPasCorrect')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		fermerModaleModifierMotDePasse () {
			this.modale = ''
			this.motDePasse = ''
			this.nouveauMotDePasse = ''
			this.gererFocus()
		},
		afficherModaleMotDePasse () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'mot-de-passe'
			this.$nextTick(() => {
				document.querySelector('#champ-motdepasse')?.focus()
			})
		},
		verifierMotDePasse () {
			this.chargement = true
			axios.post(this.hote + '/api/verifier-mot-de-passe', {
				pad: this.pad.id,
				acces: this.accesAutorise,
				motdepasse: this.motDePasse
			}).then((reponse) => {
				const donnees = reponse.data
				this.fermerModaleMotDePasse()
				this.chargement = false
				this.accesAutorise = true
				this.modifierCaracteristique(this.identifiant, 'identifiant', donnees.identifiant)
				this.modifierCaracteristique(donnees.identifiant, 'nom', donnees.nom)
				const pads = JSON.parse(JSON.stringify(this.pads))
				if (!pads.includes(parseInt(this.pad.id, 10))) {
					pads.push(parseInt(this.pad.id, 10))
				}
				this.identifiant = donnees.identifiant
				this.nom = donnees.nom
				this.langue = donnees.langue
				this.statut = 'auteur'
				this.pads = pads
				this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
				if (donnees.hasOwnProperty('blocs') && donnees.hasOwnProperty('activite') && donnees.hasOwnProperty('pad')) {
					this.blocs = donnees.blocs
					this.activite = donnees.activite
					this.pad.code = donnees.pad.code
					this.pad.colonnes = donnees.pad.colonnes
					this.pad.affichageColonnes = donnees.pad.affichageColonnes
					if (this.pad.affichage === 'colonnes') {
						this.definirColonnes(this.blocs)
						if (!this.mobile) {
							this.$nextTick(() => {
								this.activerDefilementHorizontal()
							})
						}
					}
					this.afficherBlocURL()
				}
				this.notification = this.$t('padDebloque')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data?.message === 'motdepasse_incorrect') {
					this.message = this.$t('motDePassePasCorrect')
				} else if (err.response?.data?.message === 'tentatives_nombreuses') {
					this.message = this.$t('erreurTentativesNombreuses')
				} else {
					this.message = this.definirMessageErreur(err)
				}
			})
		},
		fermerModaleMotDePasse () {
			this.motDePasse = ''
			this.modale = ''
			this.modificationCode = false
			this.codeVisible = false
			this.gererFocus()
		},
		afficherSeDeconnecterPad () {
			this.messageConfirmation = this.$t('confirmationSeDeconnecterPad')
			this.typeConfirmation = 'deconnecter-pad'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		seDeconnecterPad () {
			this.modaleConfirmation = false
			this.chargement = true
			axios.post(this.hote + '/api/deconnecter-pad', {
				identifiant: this.identifiant
			}).then(() => {
				window.location.reload()
			}).catch((err) => {
				this.chargement = false
				this.message = this.definirMessageErreur(err)
			})
		},
		async actualiserDonneesPad () {
			try {
				const reponse = await axios.post(this.hote + '/api/recuperer-donnees-pad', {
					id: this.pad.id,
					token: this.pad.token
				}, {
					headers: { 'Content-Type': 'application/json' }
				})
				if (reponse && reponse.hasOwnProperty('data') && reponse.data !== 'erreur') {
					this.pad = reponse.data.pad
					this.blocs = reponse.data.blocs
					this.activite = reponse.data.activite
					if (this.pad.affichage === 'colonnes') {
						this.definirColonnes(this.blocs)
					}
				}
			} catch (err) {
				if (err.response?.status === 403) window.location.reload()
			}
		},
		appliquerChangementDroitsAdmin () {
			if (!this.admin && this.pad.acces !== 'public') {
				window.location.reload()
				return
			}
			this.actualiserDonneesPad()
		},
		afficherExporterPad (format) {
			this.messageConfirmation = format === 'web' ? this.$t('confirmationExporterPadWeb') : this.$t('confirmationExporterPad')
			this.typeConfirmation = format === 'web' ? 'exporter-pad-web' : 'exporter-pad'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		exporterPad (format) {
			this.modaleConfirmation = false
			this.chargement = true
			axios.post(this.hote + '/api/exporter-pad', {
				padId: this.pad.id,
				identifiant: this.identifiant,
				admin: '',
				format
			}).then((reponse) => {
				this.chargement = false
				saveAs('/temp/' + reponse.data, 'pad-' + this.pad.id + (format === 'web' ? '-web' : '') + '.zip')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'erreur_export') {
					this.message = this.$t('erreurExportPad')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else if (err.response?.data === 'pad_inexistant') {
					this.message = this.$t('padInexistant')
				} else {
					this.message = this.definirMessageErreur(err)
				}
			})
		},
		afficherViderPad () {
			this.messageConfirmation = this.$t('confirmationViderPad')
			this.typeConfirmation = 'vider-pad'
			this.suppressionColonnes = false
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		viderPad () {
			this.fermerModaleConfirmation()
			this.chargement = true
			const suppressionColonnes = this.pad.affichage === 'colonnes' && this.suppressionColonnes
			const titreColonne = (suppressionColonnes && this.pad.affichage === 'colonnes') ? this.$t('colonneSansTitre') : ''
			axios.post(this.hote + '/api/vider-pad', {
				padId: this.pad.id,
				identifiant: this.identifiant,
				suppressionColonnes: suppressionColonnes,
				titreColonne: titreColonne
			}).then((reponse) => {
				this.chargement = false
				this.activite = []
				this.pad.vues = 0
				this.pad.notification = []
				if (reponse.data && reponse.data.colonnes) {
					this.pad.colonnes = reponse.data.colonnes
					this.pad.affichageColonnes = reponse.data.affichageColonnes
				}
				if (this.pad.affichage === 'colonnes') {
					this.definirColonnes([])
				} else {
					this.blocs = []
				}
				this.commentaires = []
				this.evaluations = []
				this.listeEvaluations = []
				this.messagesChat = []
				this.messageChat = ''
				this.nouveauxMessagesChat = 0
				this.notification = this.$t('padVide')
				this.$socket.emit('viderpad', this.pad.id, this.identifiant)
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'erreur_vidage') {
					this.message = this.$t('erreurVidagePad')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.definirMessageErreur(err)
				}
			})
		},
		afficherSupprimerPad () {
			this.messageConfirmation = this.$t('confirmationSupprimerPad')
			this.typeConfirmation = 'supprimer-pad'
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = true
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		supprimerPad () {
			this.modaleConfirmation = false
			this.chargement = true
			axios.post(this.hote + '/api/supprimer-pad', {
				padId: this.pad.id,
				type: 'pad',
				identifiant: this.identifiant,
				admin: ''
			}).then(() => {
				window.location.replace('/')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'erreur_suppression') {
					this.message = this.$t('erreurSuppressionPad')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.definirMessageErreur(err)
				}
			})
		},
		definirLienFichier (id, media) {
			if (this.mode === 'creation' || (this.mode === 'edition' && this.donneesBloc.media !== media)) {
				if (this.stockage === 'fs') {
					return '/temp/' + media
				} else {
					return this.definirCheminFichiers() + '/temp/' + media
				}
			}
			if (this.donneesBloc.mediaUrl) return this.donneesBloc.mediaUrl
			return this.definirCheminFichiers() + '/' + id + '/' + media
		},
		definirLienFichierHote (id, media) {
			if (this.mode === 'creation' || (this.mode === 'edition' && this.donneesBloc.media !== media)) {
				if (this.stockage === 'fs') {
					return this.hote + '/temp/' + media
				} else {
					return this.definirCheminFichiers() + '/temp/' + media
				}
			} else if (this.mode === 'edition' && this.donneesBloc.media === media) {
				if (this.donneesBloc.mediaUrl) return this.donneesBloc.mediaUrl
				if (this.stockage === 'fs') {
					return this.hote + '/fichiers/' + id + '/' + media
				} else {
					return this.definirCheminFichiers() + '/' + id + '/' + media
				}
			}
		},
		definirLienVignette (id, vignette) {
			if (vignette.substring(0, 5) === '/img/' || (this.verifierURL(vignette) && !this.verifierLienPublicS3(vignette))) {
				return vignette
			} else if ((this.mode === 'creation') || (this.mode === 'edition' && this.definirNomLienFichier(this.donneesBloc.vignette) !== this.definirNomLienFichier(vignette))) {
				if (this.stockage === 'fs') {
					return '/temp/' + vignette
				} else {
					return this.definirCheminFichiers() + '/temp/' + vignette
				}
			}
			if (this.donneesBloc.vignetteUrl) return this.donneesBloc.vignetteUrl
			return this.definirCheminFichiers() + '/' + id + '/' + vignette
		},
		definirCheminFichiers () {
			if (this.stockage === 's3' && this.lienPublicS3 && this.lienPublicS3 !== '') {
				return this.lienPublicS3
			} else {
				return '/fichiers'
			}
		},
		definirCheminFichiersHote () {
			if (this.stockage === 's3' && this.lienPublicS3 && this.lienPublicS3 !== '') {
				return this.lienPublicS3
			} else {
				return this.hote + '/fichiers'
			}
		},
		definirLienVisionneuse (base, url) {
			if (!url) return 'about:blank'
			return base + encodeURIComponent(url)
		},
		async recupererLienFichier (idPad, fichier, telechargement = false, bloc = '', visionneuse = false) {
			const reponse = await axios.post(this.hote + '/api/generer-lien-fichier', { pad: idPad, fichier, telechargement, bloc, visionneuse })
			return reponse.data.url
		},
		async definirLienFichierVisionneuse (item) {
			if (this.stockage !== 'fs' || this.pad.acces === 'public' || !item || !item.media) return null
			try {
				const url = await this.recupererLienFichier(this.pad.id, item.media, false, item.bloc, true)
				return url ? this.hote + url : null
			} catch {
				return null
			}
		},
		async preparerVisionneuse (item) {
			this.urlVisionneuseDocument = ''
			if (this.visionneuse === '' || !item || (item.type !== 'document' && item.type !== 'office')) return
			const url = await this.definirLienFichierVisionneuse(item)
			if (url && this.donneesBloc.bloc === item.bloc) this.urlVisionneuseDocument = url
		},
		definirLienDocumentVisionneuse () {
			if (this.urlVisionneuseDocument !== '') return this.urlVisionneuseDocument
			return this.stockage === 's3' && this.donneesBloc.mediaUrl ? this.donneesBloc.mediaUrl : this.definirCheminFichiersHote() + '/' + this.pad.id + '/' + this.donneesBloc.media
		},
		definirLienModaleVisionneuse () {
			if (!this.verifierFichierTemporaire(this.media) && this.urlVisionneuseDocument !== '') return this.urlVisionneuseDocument
			return this.definirLienFichierHote(this.pad.id, this.media)
		},
		async recupererJetonTeleversement (action, pad = '') {
			const reponse = await axios.post(this.hote + '/api/generer-jeton-televersement', { action, pad })
			return reponse.data.jeton
		},
		verifierLienPublicS3 (url) {
			return typeof this.lienPublicS3 === 'string' && this.lienPublicS3 !== '' && url.startsWith(this.lienPublicS3)
		},
		verifierLienPermanent () {
			return this.stockage !== 's3' || this.pad.acces === 'public'
		},
		verifierFichierDuMur (item, champ) {
			if (champ === 'vignette') {
				const vignette = item.vignette
				if (!vignette || typeof vignette !== 'string') return false
				return !(vignette.substring(0, 5) === '/img/' || (this.verifierURL(vignette) === true && !this.verifierLienPublicS3(vignette)))
			}
			return !['embed', 'lien', 'lien-image'].includes(item.type)
		},
		async rafraichirUrlFichier (item, champ) {
			if (this.stockage !== 's3' || !item) return
			const champUrl = champ === 'vignette' ? 'vignetteUrl' : 'mediaUrl'
			const fichier = champ === 'vignette' ? this.definirNomLienFichier(item.vignette) : item.media
			if (!fichier || !this.verifierFichierDuMur(item, champ)) return
			if (this.verifierLienPermanent() && (!item[champUrl] || item[champUrl] === this.definirCheminFichiers() + '/' + this.pad.id + '/' + fichier)) return
			const cle = fichier + ':' + champ
			const maintenant = Date.now()
			let suivi = this.derniersRenouvellements[cle]
			if (suivi && maintenant - suivi.date > this.delaiOubliRenouvellements) suivi = null
			if (suivi) {
				if (maintenant - suivi.date < this.delaiEntreRenouvellements) return
				if (suivi.tentatives >= this.tentativesMaxRenouvellement) return
				suivi.date = maintenant
				suivi.tentatives++
			} else {
				this.derniersRenouvellements[cle] = { date: maintenant, tentatives: 1 }
			}
			try {
				const url = await this.recupererLienFichier(this.pad.id, fichier, false, item.bloc)
				if (url) item[champUrl] = url
			} catch {}
		},
		async rafraichirUrlFond () {
			const fond = this.pad.fond
			if (this.stockage !== 's3' || !fond || typeof fond !== 'string' || fond === '' || fond.includes('/img/') || fond.substring(0, 1) === '#') return
			try {
				this.pad.fondUrl = await this.recupererLienFichier(this.pad.id, this.definirNomLienFichier(fond))
			} catch {}
		},
		definirLienTelechargement (idPad, item) {
			if (this.stockage === 's3' && item.mediaUrl) return item.mediaUrl
			return this.definirCheminFichiers() + '/' + idPad + '/' + item.media
		},
		async rafraichirMedia (item) {
			if (this.verifierLienPermanent() || !item || !item.media) return
			if (!this.verifierFichierDuMur(item, 'media')) return
			try {
				const url = await this.recupererLienFichier(this.pad.id, item.media, false, item.bloc)
				if (url) item.mediaUrl = url
			} catch {}
		},
		async rafraichirMediaDiaporama () {
			if (!['pdf', 'office', 'document'].includes(this.donneesBloc.type)) return
			await this.rafraichirMedia(this.donneesBloc)
			await this.preparerVisionneuse(this.donneesBloc)
		},
		async envoyerTelechargement (evenement, idPad, media, bloc) {
			evenement.preventDefault()
			try {
				window.location.href = await this.recupererLienFichier(idPad, media, true, bloc)
			} catch (err) {
				this.message = this.definirMessageErreur(err)
			}
		},
		async telechargerFichier (evenement, idPad, item) {
			if (this.verifierLienPermanent()) return
			await this.envoyerTelechargement(evenement, idPad, item.media, item.bloc)
		},
		verifierFichierTemporaire (media) {
			return this.mode === 'creation' || (this.mode === 'edition' && this.donneesBloc.media !== media)
		},
		async telechargerFichierModale (evenement, media) {
			if (this.verifierLienPermanent() || this.verifierFichierTemporaire(media)) return
			await this.envoyerTelechargement(evenement, this.pad.id, media, this.donneesBloc.bloc)
		},
		quitterPage () {
			this.$socket.emit('sortie', this.pad.id, this.identifiant)
		},
		transcoder (aBuffer) {
			const numOfChan = aBuffer.numberOfChannels
			const btwLength = aBuffer.length * numOfChan * 2 + 44
			const btwArrBuff = new ArrayBuffer(btwLength)
			const btwView = new DataView(btwArrBuff)
			const btwChnls = []
			let btwIndex
			let btwSample
			let btwOffset = 0
			let btwPos = 0
			const setUint16 = (data) => { btwView.setUint16(btwPos, data, true); btwPos += 2 }
			const setUint32 = (data) => { btwView.setUint32(btwPos, data, true); btwPos += 4 }
			const wavToMp3 = (channels, sampleRate, left, right = null) => {
				const buffer = []
				const mp3enc = new lamejs.Mp3Encoder(channels, sampleRate, 128)
				let remaining = left.length
				const samplesPerFrame = 1152
				for (let i = 0; remaining >= samplesPerFrame; i += samplesPerFrame) {
					let mp3buf
					if (!right) {
						const mono = left.subarray(i, i + samplesPerFrame)
						mp3buf = mp3enc.encodeBuffer(mono)
					} else {
						const leftChunk = left.subarray(i, i + samplesPerFrame)
						const rightChunk = right.subarray(i, i + samplesPerFrame)
						mp3buf = mp3enc.encodeBuffer(leftChunk, rightChunk)
					}
					if (mp3buf.length > 0) {
						buffer.push(new Int8Array(mp3buf))
					}
					remaining -= samplesPerFrame
				}
				const d = mp3enc.flush()
				if (d.length > 0) {
					buffer.push(new Int8Array(d))
				}
				return new Blob(buffer, { type: 'audio/mpeg' })
			}
			setUint32(0x46464952)
			setUint32(btwLength - 8)
			setUint32(0x45564157)
			setUint32(0x20746d66)
			setUint32(16)
			setUint16(1)
			setUint16(numOfChan)
			setUint32(aBuffer.sampleRate)
			setUint32(aBuffer.sampleRate * 2 * numOfChan)
			setUint16(numOfChan * 2)
			setUint16(16)
			setUint32(0x61746164)
			setUint32(btwLength - btwPos - 4)
			for (btwIndex = 0; btwIndex < aBuffer.numberOfChannels; btwIndex++) {
				btwChnls.push(aBuffer.getChannelData(btwIndex))
			}
			while (btwPos < btwLength) {
				for (btwIndex = 0; btwIndex < numOfChan; btwIndex++) {
					btwSample = Math.max(-1, Math.min(1, btwChnls[btwIndex][btwOffset]))
					btwSample = (btwSample < 0 ? btwSample * 32768 : btwSample * 32767) | 0
					btwView.setInt16(btwPos, btwSample, true)
					btwPos += 2
				}
				btwOffset++
			}
			const wavHdr = lamejs.WavHeader.readHeader(new DataView(btwArrBuff))
			const data = new Int16Array(btwArrBuff, wavHdr.dataOffset, wavHdr.dataLen / 2)
			const leftData = []
			const rightData = []
			for (let i = 0; i < data.length; i += 2) {
				leftData.push(data[i])
				rightData.push(data[i + 1])
			}
			const left = new Int16Array(leftData)
			const right = new Int16Array(rightData)
			let blob
			if (wavHdr.channels === 2) {
				blob = wavToMp3(wavHdr.channels, wavHdr.sampleRate, left, right)
			} else if (wavHdr.channels === 1) {
				blob = wavToMp3(wavHdr.channels, wavHdr.sampleRate, data)
			} else {
				return new Blob([], { type: 'audio/mpeg' })
			}
			return blob
		},
		fermerModale () {
			if (this.codeqr) {
				this.codeqr.clear()
				this.codeqr = null
			}
			this.modale = ''
			this.gererFocus()
		},
		empilerMessage (texte) {
			if (texte === '' || texte === this.message || this.messagesEnAttente.includes(texte)) return
			if (this.message === '') {
				this.message = texte
			} else {
				this.messagesEnAttente.push(texte)
			}
		},
		fermerMessage () {
			const suivant = this.messagesEnAttente.shift()
			if (suivant) {
				this.message = suivant
				return
			}
			this.message = ''
			this.gererFocus()
		},
		definirElementPrecedent (element) {
			this.elementPrecedent = element
		},
		gererDefilement () {
			this.fermerMenuCapsule()
		},
		gererDrag (event) {
			event.preventDefault()
			event.stopPropagation()
		},
		gererDrop (event) {
			event.preventDefault()
			event.stopPropagation()
			if (event.dataTransfer.files && event.dataTransfer.files[0] && this.accesAutorise && !this.recherche && this.pad.fichiers === 'actives' && ((this.admin && this.action !== 'organiser') || (!this.admin && this.pad.contributions !== 'fermees'))) {
				let indexColonne = 0
				if (this.pad.affichage === 'colonnes') {
					this.pad.colonnes.forEach((colonne, index) => {
						if (document.querySelector('#colonne' + index).contains(event.target)) {
							indexColonne = index
						}
					})
				}
				this.ouvrirModaleBloc('creation', '', indexColonne)
				this.ajouterFichier(event.dataTransfer)
			}
		},
		gererMousedown (event) {
			if (((event.target.closest('.titre') !== null && event.target.textContent !== '') || (event.target.closest('.texte') !== null && event.target.textContent !== '')) && this.pad.affichage === 'colonnes') {
				this.desactiverDefilementHorizontal()
			} else {
				const selection = document.getSelection()
				if (selection) {
					selection.removeAllRanges()
				}
			}
		},
		gererMouseup (event) {
			if (event.target.closest('.titre') === null && event.target.closest('.texte') === null && this.pad.affichage === 'colonnes') {
				setTimeout(() => {
					this.activerDefilementHorizontal()
				}, 500)
			}
		},
		gererClic (event) {
			const menuDeroulant = event.target.closest('.menu-deroulant')
			const capsule = menuDeroulant ? menuDeroulant.dataset.menuCapsule : undefined
			if (this.menuColonne !== null && (!menuDeroulant || capsule !== undefined)) {
				this.menuColonne = null
			}
			if (this.menuCapsule !== null && capsule !== this.menuCapsule) {
				this.fermerMenuCapsule()
			}
		},
		gererColler (event) {
			if (event.clipboardData.files && event.clipboardData.files[0] && event.clipboardData.files[0].type.includes('image') && this.accesAutorise && !this.recherche && this.pad.fichiers === 'actives' && ((this.admin && this.action !== 'organiser') || (!this.admin && this.pad.contributions !== 'fermees')) && this.modale === '' && this.menu === '') {
				let indexColonne = 0
				if (this.pad.affichage === 'colonnes') {
					this.pad.colonnes.forEach((colonne, index) => {
						if (document.querySelector('#colonne' + index).contains(event.target)) {
							indexColonne = index
						}
					})
				}
				this.ouvrirModaleBloc('creation', '', indexColonne)
				this.ajouterFichier(event.clipboardData)
			}
		},
		gererClavier (event) {
			if (this.modaleDiaporama && !this.modaleConfirmation && this.modale !== 'evaluations' && this.modale !== 'liste-evaluations') {
				if (this.blocs.length > 1) {
					let input = false
					if (document.querySelector('#commentaire')?.contains(event.target)) {
						input = true
					} else if (document.querySelector('#commentaire-modifie')?.contains(event.target)) {
						input = true
					}
					if (input === false && event.key === 'ArrowLeft') {
						event.preventDefault()
						this.afficherBlocPrecedent()
					} else if (input === false && event.key === 'ArrowRight') {
						event.preventDefault()
						this.afficherBlocSuivant()
					}
				}
				if (event.key === 'Escape') {
					this.fermerModaleDiaporama()
				} else if (event.key === 'Tab') {
					const modale = document.querySelector('#diapositive')
					this.piegerFocus(event, modale)
				}
			} else if (event.key === 'Escape' && this.message !== '') {
				this.fermerMessage()
			} else if (event.key === 'Escape' && this.modaleConfirmation) {
				this.fermerModaleConfirmation()
			} else if (event.key === 'Escape' && this.modale === 'colonne') {
				this.fermerModaleColonne()
			} else if (event.key === 'Escape' && this.modale === 'bloc') {
				this.fermerModaleBloc()
			} else if (event.key === 'Escape' && this.modale === 'admins') {
				this.fermerModaleAdmins()
			} else if (event.key === 'Escape' && this.modale === 'commentaires') {
				this.fermerModaleCommentaires()
			} else if (event.key === 'Escape' && this.modale === 'evaluations') {
				this.fermerModaleEvaluations()
			} else if (event.key === 'Escape' && this.modale === 'liste-evaluations') {
				this.fermerModaleListeEvaluations()
			} else if (event.key === 'Escape' && this.modale === 'modifier-nom') {
				this.fermerModaleModifierNom()
			} else if (event.key === 'Escape' && this.modale === 'mot-de-passe') {
				this.fermerModaleMotDePasse()
			} else if (event.key === 'Escape' && this.modale === 'modifier-mot-de-passe') {
				this.fermerModaleModifierMotDePasse()
			} else if (event.key === 'Escape' && this.modale === 'copier-bloc') {
				this.fermerModaleCopieBloc()
			} else if (event.key === 'Escape' && this.modale !== '' && !this.transcodage && !this.progressionEnregistrement) {
				this.fermerModale()
			} else if (event.key === 'Escape' && this.menu === 'options') {
				this.fermerMenuOptions()
			} else if (event.key === 'Escape' && this.menu !== '') {
				this.fermerMenu()
			} else if (event.key === 'Tab') {
				if (this.message !== '') {
					const modale = document.querySelector('#message')
					this.piegerFocus(event, modale)
				} else if (this.modaleConfirmation || this.modale !== '') {
					const modale = document.querySelector('.modale')
					this.piegerFocus(event, modale)
				} else if (this.menu !== '') {
					const menu = document.querySelector('.menu.ouvert')
					this.piegerFocus(event, menu)
				} else if (this.panneaux.length > 0) {
					let panneau = event.target.closest('.jsPanel')
					if (panneau) {
						this.piegerFocus(event, panneau)
					} else {
						panneau = [...document.querySelectorAll('.jsPanel')].pop()
						if (panneau) {
							panneau.querySelector('.jsPanel-controlbar button').focus()
							this.piegerFocus(event, panneau)
						}
					}
				}
			}
		},
		gererFocus () {
			this.$nextTick(() => {
				if (this.elementPrecedent) {
					this.elementPrecedent.focus()
					this.elementPrecedent = null
				}
			})
		},
		gererFocusCommentaires (event) {
			if (event.target.closest('li') === null) {
				this.focusId = ''
			}
		},
		piegerFocus (event, conteneur) {
			if (!conteneur) return
			const isVisible = el => el.offsetWidth || el.offsetHeight || el.getClientRects().length
			const focusables = Array.from(conteneur.querySelectorAll('a[href], button, textarea, input, select, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.tabIndex >= 0 && isVisible(el))
			if (focusables.length === 0) return
			const premier = focusables[0]
			const dernier = focusables[focusables.length - 1]
			if (event.shiftKey) {
				if (document.activeElement === premier) {
					event.preventDefault()
					dernier.focus()
				}
			} else {
				if (document.activeElement === dernier) {
					event.preventDefault()
					premier.focus()
				}
			}
		},
		gererClavierMenu (event, id) {
			const items = [...document.querySelectorAll('#' + id + ' [role="menuitem"]')]
			if (items.length === 0) return
			const index = items.indexOf(document.activeElement)
			const options = { preventScroll: id.startsWith('menu-capsule-') }
			switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				if (this.menu === 'activite') {
					document.querySelectorAll('.menu-entree').forEach(menu => {
						menu.style.display = 'none'
					})
					if (items[(index + 1) % items.length].closest('.menu-entree')) items[(index + 1) % items.length].closest('.menu-entree').style.display = 'block'
				}
				items[(index + 1) % items.length].focus(options)
				break
			case 'ArrowUp':
				event.preventDefault()
				if (this.menu === 'activite') {
					document.querySelectorAll('.menu-entree').forEach(menu => {
						menu.style.display = 'none'
					})
					if (items[(index - 1 + items.length) % items.length].closest('.menu-entree')) items[(index - 1 + items.length) % items.length].closest('.menu-entree').style.display = 'block'
				}
				items[(index - 1 + items.length) % items.length].focus(options)
				break
			case 'Home':
				event.preventDefault()
				items[0].focus(options)
				break
			case 'End':
				event.preventDefault()
				items[items.length - 1].focus(options)
				break
			case 'Escape':
			case 'Tab':
				if (this.menu !== '') {
					this.menu = ''
				}
				if (this.menuColonne !== null) {
					this.menuColonne = null
				}
				if (this.menuCapsule !== null) {
					this.menuCapsule = null
				}
				this.gererFocus()
				break
			}
		},
		ecouterSocket () {
			this.$socket.io.on('reconnect', () => {
				if (this.accesAutorise && this.pad.hasOwnProperty('id')) {
					this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
				}
			})

			this.$socket.on('connexion', (donnees) => {
				this.definirUtilisateurs(donnees)
			})

			this.$socket.on('deconnexion', (identifiant) => {
				this.utilisateurs = this.utilisateurs.filter((utilisateur) => {
					return utilisateur.identifiant !== identifiant
				})
			})

			this.$socket.on('erreur', () => {
				this.chargement = false
				this.message = this.$t('erreurActionServeur')
			})

			this.$socket.on('colonnesverrouillees', () => {
				this.chargement = false
				this.message = this.$t('verrouColonnes')
			})

			this.$socket.on('titrecolonneexistant', () => {
				this.chargement = false
				this.message = this.$t('erreurTitreColonneExistant')
			})

			this.$socket.on('espacedisque', () => {
				this.chargement = false
				this.message = this.$t('erreurEspaceDisque')
			})

			this.$socket.on('verifieracces', (donnees) => {
				if (donnees.acces === true) {
					this.accesAutorise = true
					this.blocs = donnees.blocs
					this.activite = donnees.activite
					this.pad.colonnes = donnees.pad.colonnes
					this.pad.affichageColonnes = donnees.pad.affichageColonnes
					this.pad.fondUrl = donnees.pad.fondUrl
					if (this.pad.affichage === 'colonnes') {
						this.definirColonnes(this.blocs)
						if (!this.mobile) {
							this.$nextTick(() => {
								this.activerDefilementHorizontal()
							})
						}
					}
					this.afficherBlocURL()
					this.$socket.emit('connexion', { pad: this.pad.id, identifiant: this.identifiant, nom: this.nom })
				} else {
					this.modale = 'code-acces'
					this.$nextTick(() => {
						document.querySelector('#champ-code')?.focus()
					})
				}
			})

			this.$socket.on('ajouterbloc', (donnees) => {
				this.action = 'ajouter'
				this.utilisateur = donnees.identifiant
				if (donnees.visibilite === 'visible' || this.admin || (this.pad.contributions === 'moderees' && (this.utilisateur === this.identifiant))) {
					if (this.pad.affichage === 'colonnes') {
						if (this.pad.ordre === 'decroissant') {
							this.colonnes[donnees.colonne].unshift(donnees)
						} else {
							this.colonnes[donnees.colonne].push(donnees)
						}
					}
					if (this.pad.ordre === 'decroissant') {
						this.blocs.unshift(donnees)
					} else {
						this.blocs.push(donnees)
					}
					if (donnees.hasOwnProperty('activiteId')) {
						this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-ajoute' })
					}
					if (!donnees.hasOwnProperty('texte')) {
						this.recupererBloc(donnees.bloc)
					}
					if (this.admin || this.pad.affichage !== 'colonnes' || (this.pad.affichage === 'colonnes' && this.affichageColonnes[donnees.colonne])) {
						this.$nextTick(() => {
							const bloc = document.querySelector('#' + donnees.bloc)
							bloc.classList.add('anime')
							bloc.addEventListener('animationend', () => {
								bloc.classList.remove('anime')
							})
						})
					}
					if (this.utilisateur === this.identifiant) {
						this.$nextTick(() => {
							const bloc = document.querySelector('#' + donnees.bloc)
							bloc.scrollIntoView()
						})
					}
				}
			})

			this.$socket.on('dupliquerbloc', (donnees) => {
				this.action = 'dupliquer'
				this.utilisateur = donnees.identifiant
				if (this.utilisateur === this.identifiant) {
					this.bloc = donnees.bloc
				}
				if (donnees.visibilite === 'visible' || this.admin || (this.pad.contributions === 'moderees' && (this.utilisateur === this.identifiant))) {
					const inserer = (liste) => {
						const index = liste.findIndex((item) => item.bloc === donnees.blocOrigine)
						if (index === -1) {
							if (this.pad.ordre === 'decroissant') {
								liste.unshift(donnees)
							} else {
								liste.push(donnees)
							}
						} else if (this.pad.ordre === 'decroissant') {
							liste.splice(index, 0, donnees)
						} else {
							liste.splice(index + 1, 0, donnees)
						}
					}
					if (this.pad.affichage === 'colonnes' && this.colonnes[donnees.colonne]) {
						inserer(this.colonnes[donnees.colonne])
					}
					inserer(this.blocs)
					if (donnees.hasOwnProperty('activiteId')) {
						this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-duplique' })
					}
					if (!donnees.hasOwnProperty('texte')) {
						this.recupererBloc(donnees.bloc)
					}
					if (this.admin || this.pad.affichage !== 'colonnes' || (this.pad.affichage === 'colonnes' && this.affichageColonnes[donnees.colonne])) {
						const auteur = (this.utilisateur === this.identifiant)
						this.$nextTick(() => {
							const bloc = document.querySelector('#' + donnees.bloc)
							if (!bloc) return
							bloc.classList.add('anime')
							bloc.addEventListener('animationend', () => {
								bloc.classList.remove('anime')
							})
							if (auteur) {
								bloc.scrollIntoView()
							}
						})
					}
				}
				this.chargement = false
			})

			this.$socket.on('modifierbloc', (donnees) => {
				if (this.blocs.map((e) => { return e.bloc }).includes(donnees.bloc)) {
					this.action = 'modifier'
					const donneesCompletes = donnees.hasOwnProperty('texte')
					if (this.pad.affichage === 'colonnes') {
						let indexColonne = donnees.colonne
						if (indexColonne === undefined || !this.colonnes[indexColonne]) {
							indexColonne = this.colonnes.findIndex((colonne) => colonne.some((item) => item.bloc === donnees.bloc))
						}
						const indexBlocColonne = (indexColonne !== -1 && this.colonnes[indexColonne]) ? this.colonnes[indexColonne].findIndex(item => item.bloc === donnees.bloc) : -1
						if (indexBlocColonne !== -1) {
							const item = this.colonnes[indexColonne][indexBlocColonne]
							if (donnees.visibilite === 'privee' && !this.admin) {
								this.colonnes[indexColonne].splice(indexBlocColonne, 1)
							} else {
								this.colonnes[indexColonne][indexBlocColonne] = { bloc: donnees.bloc, identifiant: item.identifiant, nom: item.nom, titre: donneesCompletes ? donnees.titre : item.titre, texte: donneesCompletes ? donnees.texte : item.texte, media: donneesCompletes ? donnees.media : item.media, mediaUrl: donneesCompletes ? donnees.mediaUrl : item.mediaUrl, alt: donneesCompletes ? donnees.alt : item.alt, iframe: donneesCompletes ? donnees.iframe : item.iframe, type: donneesCompletes ? donnees.type : item.type, source: donneesCompletes ? donnees.source : item.source, vignette: donneesCompletes ? donnees.vignette : item.vignette, vignetteUrl: donneesCompletes ? donnees.vignetteUrl : item.vignetteUrl, date: item.date, modifie: donnees.modifie, couleur: donnees.couleur, etiquettes: donneesCompletes ? donnees.etiquettes : item.etiquettes, commentaires: item.commentaires, commentairesEnAttente: item.commentairesEnAttente, evaluations: item.evaluations, colonne: item.colonne, visibilite: donnees.visibilite, activiteId: item.activiteId }
							}
						}
					}
					const indexBloc = this.blocs.findIndex(item => item.bloc === donnees.bloc)
					if (indexBloc !== -1) {
						const item = this.blocs[indexBloc]
						this.utilisateur = donnees.identifiant
						if (donnees.visibilite === 'privee' && !this.admin) {
							this.blocs.splice(indexBloc, 1)
						} else {
							this.blocs.splice(indexBloc, 1, { bloc: donnees.bloc, identifiant: item.identifiant, nom: item.nom, titre: donneesCompletes ? donnees.titre : item.titre, texte: donneesCompletes ? donnees.texte : item.texte, media: donneesCompletes ? donnees.media : item.media, mediaUrl: donneesCompletes ? donnees.mediaUrl : item.mediaUrl, alt: donneesCompletes ? donnees.alt : item.alt, iframe: donneesCompletes ? donnees.iframe : item.iframe, type: donneesCompletes ? donnees.type : item.type, source: donneesCompletes ? donnees.source : item.source, vignette: donneesCompletes ? donnees.vignette : item.vignette, vignetteUrl: donneesCompletes ? donnees.vignetteUrl : item.vignetteUrl, date: item.date, modifie: donnees.modifie, couleur: donnees.couleur, etiquettes: donneesCompletes ? donnees.etiquettes : item.etiquettes, commentaires: item.commentaires, commentairesEnAttente: item.commentairesEnAttente, evaluations: item.evaluations, colonne: item.colonne, visibilite: donnees.visibilite, activiteId: item.activiteId })
						}
					}
					if (donnees.hasOwnProperty('activiteId')) {
						this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.modifie, type: 'bloc-modifie' })
					}
					if (!donneesCompletes && !(donnees.visibilite === 'privee' && !this.admin)) {
						this.recupererBloc(donnees.bloc)
					}
				}
			})

			this.$socket.on('copierbloc', () => {
				this.chargement = false
				this.notification = this.$t('capsuleCopiee')
			})

			this.$socket.on('recupererbloc', (donnees) => {
				const verifierBloc = (item) => {
					item.titre = donnees.titre
					item.texte = donnees.texte
					item.media = donnees.media
					item.mediaUrl = donnees.mediaUrl
					item.alt = donnees.alt
					item.iframe = donnees.iframe
					item.vignette = donnees.vignette
					item.vignetteUrl = donnees.vignetteUrl
					if (donnees.hasOwnProperty('etiquettes')) item.etiquettes = donnees.etiquettes
				}
				this.mettreAJourBloc(donnees.bloc, verifierBloc)
				if (this.modaleDiaporama && this.donneesBloc.bloc === donnees.bloc) {
					verifierBloc(this.donneesBloc)
				}
				if (this.modale === 'bloc' && this.mode === 'edition' && this.bloc === donnees.bloc && this.texte === undefined) {
					if (!this.texte) {
						this.texte = donnees.texte
						const contenuEditeur = document.querySelector('#texte .contenu-editeur')
						if (contenuEditeur) {
							contenuEditeur.innerHTML = this.formaterHTML(this.texte)
						}
					}
					if (!this.titre) {
						this.titre = donnees.titre
					}
					if (Array.isArray(donnees.etiquettes) && this.etiquettes.length === 0) {
						this.etiquettes = JSON.parse(JSON.stringify(donnees.etiquettes))
					}
					if (!this.media && !this.iframe) {
						this.media = donnees.media
						this.alt = typeof donnees.alt === 'string' ? donnees.alt : ''
						this.iframe = donnees.iframe
						if (donnees.iframe !== '') {
							this.lien = donnees.media
						}
						if (donnees.vignette && typeof donnees.vignette === 'string') {
							this.vignette = donnees.vignette
							this.vignetteDefaut = this.vignette
						}
					}
				}
			})

			this.$socket.on('autoriserbloc', (donnees) => {
				if ((this.pad.contributions === 'moderees' && (donnees.identifiant === this.identifiant)) || this.admin) {
					if (this.pad.affichage === 'colonnes') {
						this.colonnes.forEach((colonne, indexColonne) => {
							colonne.forEach((item, index) => {
								if (item.bloc === donnees.bloc) {
									this.colonnes[indexColonne][index].visibilite = 'visible'
									if (donnees.moderation === 'privee') {
										this.colonnes[indexColonne][index].date = donnees.date
									}
									if (this.colonnes[indexColonne][index].hasOwnProperty('modifie')) {
										delete this.colonnes[indexColonne][index].modifie
									}
								}
							})
						})
					}
					this.blocs.forEach((item, index) => {
						if (item.bloc === donnees.bloc) {
							this.blocs[index].visibilite = 'visible'
							if (donnees.moderation === 'privee') {
								this.blocs[index].date = donnees.date
							}
							if (this.blocs[index].hasOwnProperty('modifie')) {
								delete this.blocs[index].modifie
							}
						}
					})
					this.chargement = false
				} else {
					this.blocs.splice(donnees.indexBloc, 0, donnees)
					if (this.pad.affichage === 'colonnes') {
						this.colonnes[donnees.colonne].splice(donnees.indexBlocColonne, 0, donnees)
					}
				}
				if (donnees.moderation === 'moderee') {
					if (donnees.publication && !this.activite.some((entree) => { return entree.id === donnees.publication.activiteId && entree.type === 'bloc-ajoute' })) {
						this.activite.unshift({ id: donnees.publication.activiteId, bloc: donnees.bloc, identifiant: donnees.publication.identifiant, nom: donnees.publication.nom, titre: donnees.titre, date: donnees.publication.date, type: 'bloc-ajoute' })
					}
					this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.admin, nom: donnees.nomAdmin, titre: donnees.titre, date: donnees.date, type: 'bloc-valide' })
				} else {
					this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-ajoute' })
				}
				this.$nextTick(() => {
					const bloc = document.querySelector('#' + donnees.bloc)
					if (bloc !== null) {
						bloc.classList.add('anime')
						bloc.addEventListener('animationend', () => {
							bloc.classList.remove('anime')
						})
					}
				})
				if (this.admin && this.identifiant === donnees.admin && donnees.moderation === 'moderee') {
					this.notification = this.$t('capsuleValidee')
				} else if (this.admin && this.identifiant === donnees.admin && donnees.moderation === 'privee') {
					this.notification = this.$t('capsuleVisible')
				} else if (!this.admin && donnees.identifiant === this.identifiant) {
					this.notification = this.$t('capsulePubliee', { titre: donnees.titre })
				}
				if (this.modaleDiaporama) {
					this.$nextTick(() => {
						this.chargerDiapositive()
					})
				}
			})

			this.$socket.on('deplacerbloc', (donnees) => {
				this.utilisateur = donnees.identifiant
				const blocActif = document.querySelector('.bloc.actif')
				let blocId = ''
				if (blocActif && this.utilisateur !== this.identifiant) {
					blocId = blocActif.id
				}
				if (this.admin && this.pad.affichage === 'colonnes') {
					this.definirColonnes(donnees.blocs)
				} else if (this.admin && this.pad.affichage !== 'colonnes') {
					this.blocs = donnees.blocs
				} else if (!this.admin) {
					let blocs
					if (this.pad.contributions === 'moderees') {
						blocs = donnees.blocs.filter((element) => {
							return element.visibilite === 'visible' || (element.visibilite === 'masquee' && element.identifiant === this.identifiant)
						})
					} else {
						blocs = donnees.blocs.filter((element) => {
							return element.visibilite !== 'privee'
						})
					}
					if (this.pad.affichage === 'colonnes') {
						this.definirColonnes(blocs)
					} else {
						this.blocs = blocs
					}
				}
				this.$nextTick(() => {
					if (blocActif && this.utilisateur !== this.identifiant && document.querySelector('#' + blocId)) {
						blocActif.classList.remove('actif')
						document.querySelector('#' + blocId).classList.add('actif')
						document.querySelector('#' + blocId)?.focus()
					}
				})
				this.chargement = false
			})

			this.$socket.on('supprimerbloc', (donnees) => {
				this.action = 'supprimer'
				if (this.pad.affichage === 'colonnes') {
					const indexBlocColonne = this.colonnes[donnees.colonne].findIndex(item => item.bloc === donnees.bloc)
					if (indexBlocColonne !== -1) {
						this.colonnes[donnees.colonne].splice(indexBlocColonne, 1)
					}
				}
				const indexBloc = this.blocs.findIndex(item => item.bloc === donnees.bloc)
				if (indexBloc !== -1) {
					this.utilisateur = donnees.identifiant
					this.blocs.splice(indexBloc, 1)
				}
				if (this.modale === 'bloc' && this.bloc === donnees.bloc) {
					this.fermerModaleBloc()
					this.notification = this.$t('capsuleSupprimeeUtilisateur')
				}
				this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-supprime' })
			})

			this.$socket.on('commenterbloc', (donnees) => {
				if (this.blocs.map((e) => { return e.bloc }).includes(donnees.bloc)) {
					this.synchroniserCommentaires(donnees.bloc, donnees.commentaires, donnees.commentairesEnAttente)
					if (this.admin || (this.commentairesVisibles && (donnees.visibilite === 'visible' || donnees.identifiant === this.identifiant))) {
						this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-commente' })
					}
					const modaleOuverte = this.verifierModaleCommentaires(donnees.bloc)
					if (donnees.hasOwnProperty('texte')) {
						if (modaleOuverte) {
							this.commentaires.push({ id: donnees.id, identifiant: donnees.identifiant, nom: donnees.nom, texte: donnees.texte, date: donnees.date, visibilite: donnees.visibilite })
						}
					} else if (modaleOuverte && this.commentairesVisibles) {
						this.rafraichirCommentaires(donnees.bloc)
					}
				}
			})

			this.$socket.on('modifiercommentaire', (donnees) => {
				if (!donnees.hasOwnProperty('texte')) {
					if (this.verifierModaleCommentaires(donnees.bloc) && this.commentairesVisibles) {
						this.rafraichirCommentaires(donnees.bloc)
					}
					return
				}
				if (this.verifierModaleCommentaires(donnees.bloc)) {
					const commentaires = this.commentaires
					commentaires.forEach((commentaire) => {
						if (commentaire.id === donnees.id) {
							commentaire.texte = donnees.texte
						}
					})
					this.commentaires = commentaires
				}
			})

			this.$socket.on('supprimercommentaire', (donnees) => {
				this.synchroniserCommentaires(donnees.bloc, donnees.commentaires, donnees.commentairesEnAttente)
				if (donnees.activitePublication) {
					this.activite = this.activite.filter((entree) => entree.id !== donnees.activitePublication)
				}
				if (!this.verifierModaleCommentaires(donnees.bloc)) return
				const commentaires = this.commentaires
				const indexCommentaire = commentaires.findIndex(commentaire => commentaire.id === donnees.id)
				if (indexCommentaire !== -1) {
					commentaires.splice(indexCommentaire, 1)
				}
				this.commentaires = commentaires
			})

			this.$socket.on('commentaires', (commentaires, type, bloc) => {
				if (type === 'discussion' && this.bloc !== bloc) return
				if (type === 'diapositive' && (!this.donneesBloc || this.donneesBloc.bloc !== bloc)) return
				if (type === 'rafraichir' && !this.verifierModaleCommentaires(bloc)) return
				this.commentaires = commentaires
				if (type === 'rafraichir') {
					return
				}
				if (type === 'discussion') {
					this.chargement = false
					this.elementPrecedent = (document.activeElement || document.body)
					this.modale = 'commentaires'
					this.$nextTick(() => {
						this.genererEditeur()
						setTimeout(() => {
							document.querySelector('#discussion .contenu-editeur-commentaire')?.focus()
							document.querySelector('#discussion').addEventListener('click', this.gererFocusCommentaires)
						}, 0)
					})
				} else {
					this.chargerDiapositive()
				}
			})

			this.$socket.on('evaluerbloc', (donnees) => {
				this.chargement = false
				if (this.blocs.map((e) => { return e.bloc }).includes(donnees.bloc)) {
					if (this.evaluationsVisibles && donnees.hasOwnProperty('evaluation')) {
						const blocs = this.blocs
						blocs.forEach((item) => {
							if (item.bloc === donnees.bloc) {
								item.evaluations.push(donnees.evaluation)
							}
						})
						this.blocs = blocs
						this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'bloc-evalue' })
					}
				}
			})

			this.$socket.on('modifierevaluation', (id, bloc, date, etoiles) => {
				this.chargement = false
				const blocs = this.blocs
				blocs.forEach((item, index) => {
					if (item.bloc === bloc) {
						const evaluations = item.evaluations
						evaluations.forEach((evaluation) => {
							if (evaluation.id === id) {
								evaluation.date = date
								evaluation.etoiles = etoiles
							}
						})
					}
				})
				this.blocs = blocs
			})

			this.$socket.on('supprimerevaluation', (id, bloc) => {
				this.chargement = false
				const blocs = this.blocs
				blocs.forEach((item) => {
					if (item.bloc === bloc) {
						item.evaluations = item.evaluations.filter((evaluation) => {
							return evaluation.id !== id
						})
					}
				})
				this.blocs = blocs
			})

			this.$socket.on('modifiernom', (nom, identifiant) => {
				this.modifierCaracteristique(identifiant, 'nom', nom)
				this.chargement = false
				if (identifiant === this.identifiant) {
					this.nom = nom
					this.notification = this.$t('nomModifie')
				}
			})

			this.$socket.on('modifiertitre', (titre, identifiant) => {
				this.pad.titre = titre
				document.title = titre + ' - Digipad by La Digitale'
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('titrePadModifie')
				}
			})

			this.$socket.on('modifiercodeacces', (code, identifiant) => {
				this.chargement = false
				this.modificationCode = false
				if (this.admin) {
					this.pad.code = code
					if (this.identifiant === identifiant) {
						this.notification = this.$t('codeAccesModifie')
					}
				} else if (this.pad.acces === 'code') {
					this.$socket.emit('sortie', this.pad.id, this.identifiant)
					window.location.reload()
				}
			})

			this.$socket.on('modifieradmins', (admins, identifiant) => {
				const adminAvant = this.admin
				this.pad.admins = admins
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('listeAdminsModifiee')
				}
				if (adminAvant !== this.admin) {
					this.notification = this.admin ? this.$t('droitsAdminAjoutes') : this.$t('droitsAdminRetires')
					this.appliquerChangementDroitsAdmin()
				}
			})

			this.$socket.on('reinitialiservues', (identifiant) => {
				this.pad.vues = 0
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('vuesReinitialisees')
					this.$nextTick(() => {
						if (document.querySelector('#menu-options.ouvert')) {
							document.querySelector('#menu-options .fermer')?.focus()
						}
					})
				}
			})

			this.$socket.on('modifieracces', (acces, code) => {
				this.pad.acces = acces
				this.chargement = false
				this.rafraichirUrlFond()
				if (this.admin) {
					if (acces === 'code') {
						this.pad.code = code
						this.codeVisible = true
					}
					this.notification = this.$t('accesPadModifie')
				} else if (acces !== 'public') {
					this.$socket.emit('sortie', this.pad.id, this.identifiant)
					if (acces === 'prive') {
						window.location.replace('/')
					} else {
						window.location.reload()
					}
				}
			})

			this.$socket.on('erreurevacuation', () => {
				this.chargement = false
				this.empilerMessage(this.$t('erreurEvacuationVisiteurs'))
			})

			this.$socket.on('synchronisationfichiers', (acces) => {
				this.chargement = false
				this.notification = acces === 'public' ? this.$t('synchronisationFichiersEnCours') : this.$t('synchronisationFichiersFermetureEnCours')
			})

			this.$socket.on('erreurfichiers', (nombre) => {
				this.chargement = false
				this.empilerMessage(nombre > 0 ? this.$t('erreurSynchronisationFichiers', { nombre }) : this.$t('erreurSynchronisationFichiersIncomplete'))
			})

			this.$socket.on('modifiercontributions', (contributions, contributionsPrecedentes, identifiant) => {
				this.pad.contributions = contributions
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('statutPadModifie')
				}
				if (!this.admin && contributionsPrecedentes === 'moderees') {
					this.notification = this.$t('rechargerPage')
				}
			})

			this.$socket.on('modifieraffichage', (affichage, colonnes, affichageColonnes, identifiant) => {
				if (colonnes) {
					this.pad.colonnes = colonnes
					this.pad.affichageColonnes = affichageColonnes
				}
				this.pad.affichage = affichage
				this.affichage = affichage
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.action = ''
					this.notification = this.$t('affichagePadModifie')
				}
			})

			this.$socket.on('modifierordre', (ordre, identifiant) => {
				const blocActif = document.querySelector('.bloc.actif')
				let blocId = ''
				if (blocActif) {
					blocId = blocActif.id
				}
				this.pad.ordre = ordre
				this.blocs.reverse()
				if (this.pad.affichage === 'colonnes') {
					this.definirColonnes(this.blocs)
				}
				this.$nextTick(() => {
					if (blocActif) {
						blocActif.classList.remove('actif')
						document.querySelector('#' + blocId).classList.add('actif')
						document.querySelector('#' + blocId)?.focus()
					}
				})
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreOrdreModifie')
				}
			})

			this.$socket.on('modifierlargeur', (largeur, identifiant) => {
				this.pad.largeur = largeur
				if (this.pad.affichage === 'mur') {
					this.pad.affichage = ''
					setTimeout(() => {
						this.pad.affichage = 'mur'
					}, 10)
				}
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreLargeurModifie')
				}
			})

			this.$socket.on('modifierfond', (fond, identifiant, fondUrl) => {
				this.pad.fond = fond
				this.pad.fondUrl = fondUrl
				this.chargerImages('#pad', () => {
					this.chargement = false
					if (this.admin && this.identifiant === identifiant) {
						this.notification = this.$t('arrierePlanModifie')
					}
				})
			})

			this.$socket.on('modifiercouleurfond', (fond, identifiant) => {
				this.pad.fond = fond
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('arrierePlanModifie')
				}
			})

			this.$socket.on('modifierfondrepete', (statut, identifiant) => {
				this.pad.fondRepete = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreFondModifie')
				}
			})

			this.$socket.on('modifieractivite', (statut, identifiant) => {
				this.pad.registreActivite = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreActiviteModifie')
				}
			})

			this.$socket.on('modifierconversation', (statut, identifiant) => {
				this.pad.conversation = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreConversationModifie')
				}
			})

			this.$socket.on('modifiertransfertpropriete', (statut, identifiant) => {
				this.pad.transfertPropriete = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreTransfertProprieteModifie')
				}
			})

			this.$socket.on('modifierlisteutilisateurs', (statut, identifiant) => {
				if (statut === 'desactivee' && this.menu === 'utilisateurs') {
					this.menu = ''
				}
				this.pad.listeUtilisateurs = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreListeUtilisateursModifie')
				}
			})

			this.$socket.on('modifiereditionnom', (statut, identifiant) => {
				this.pad.editionNom = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEditionNomModifie')
				}
			})

			this.$socket.on('modifierfichiers', (statut, identifiant) => {
				this.pad.fichiers = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreFichiersModifie')
				}
			})

			this.$socket.on('modifierenregistrements', (statut, identifiant) => {
				this.pad.enregistrements = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEnregistrementsModifie')
				}
			})

			this.$socket.on('modifierliens', (statut, identifiant) => {
				this.pad.liens = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreLiensModifie')
				}
			})

			this.$socket.on('modifierdocuments', (statut, identifiant) => {
				this.pad.documents = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreDocumentsModifie')
				}
			})

			this.$socket.on('modifiercommentaires', (statut, identifiant) => {
				this.pad.commentaires = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreCommentairesModifie')
				}
			})

			this.$socket.on('modifieretiquettes', (statut, identifiant) => {
				this.pad.etiquettes = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEtiquettesModifie')
				}
			})

			this.$socket.on('modifierevaluations', (statut, identifiant) => {
				this.pad.evaluations = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEvaluationModifie')
				}
			})

			this.$socket.on('modifiervisibilitecommentaires', (visibilite, identifiant) => {
				this.pad.visibiliteCommentaires = visibilite
				if (visibilite === 'admin') {
					this.pad.accesCommentaires = 'admin'
				}
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreCommentairesModifie')
				}
			})

			this.$socket.on('modifieraccescommentaires', (acces, identifiant) => {
				this.pad.accesCommentaires = acces
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreCommentairesModifie')
				}
			})

			this.$socket.on('modifiermoderationcommentaires', (statut, identifiant) => {
				this.pad.commentairesModeration = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreCommentairesModifie')
				}
			})

			this.$socket.on('modifiervisibiliteevaluations', (visibilite, identifiant) => {
				this.pad.visibiliteEvaluations = visibilite
				if (visibilite === 'admin') {
					this.pad.accesEvaluations = 'admin'
				}
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEvaluationModifie')
				}
			})

			this.$socket.on('modifieraccesevaluations', (acces, identifiant) => {
				this.pad.accesEvaluations = acces
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreEvaluationModifie')
				}
			})

			this.$socket.on('autorisercommentaire', (donnees) => {
				this.chargement = false
				const modaleOuverte = this.verifierModaleCommentaires(donnees.bloc)
				if (modaleOuverte && donnees.hasOwnProperty('texte')) {
					const commentaires = this.commentaires
					const indexCommentaire = commentaires.findIndex((commentaire) => { return commentaire.id === donnees.id })
					if (indexCommentaire !== -1) {
						commentaires[indexCommentaire].visibilite = 'visible'
					} else {
						commentaires.push({ id: donnees.id, identifiant: donnees.identifiant, nom: donnees.nom, texte: donnees.texte, date: donnees.date, visibilite: 'visible' })
					}
					this.commentaires = commentaires
				} else if (modaleOuverte && this.commentairesVisibles) {
					this.rafraichirCommentaires(donnees.bloc)
				}
				this.synchroniserCommentaires(donnees.bloc, donnees.commentaires, donnees.commentairesEnAttente)
				if (this.admin || this.pad.visibiliteCommentaires !== 'admin') {
					if (donnees.publication && !this.activite.some((entree) => { return entree.id === donnees.publication.activiteId && entree.type === 'bloc-commente' })) {
						this.activite.unshift({ id: donnees.publication.activiteId, bloc: donnees.bloc, identifiant: donnees.publication.identifiant, nom: donnees.publication.nom, titre: donnees.titre, date: donnees.publication.date, type: 'bloc-commente' })
					}
					this.activite.unshift({ id: donnees.activiteId, bloc: donnees.bloc, identifiant: donnees.admin, nom: donnees.nomAdmin, titre: donnees.titre, date: donnees.dateValidation, type: 'commentaire-valide' })
				}
				if (!this.admin && donnees.identifiant === this.identifiant) {
					this.notification = this.$t('commentairePublie', { titre: donnees.titre })
				}
			})

			this.$socket.on('evaluations', (evaluations, bloc) => {
				this.chargement = false
				if (bloc !== undefined && this.bloc !== bloc) return
				this.listeEvaluations = evaluations
				this.modale = 'liste-evaluations'
				this.$nextTick(() => {
					document.querySelector('.modale .fermer')?.focus()
				})
			})

			this.$socket.on('modifiercopiebloc', (statut, identifiant) => {
				this.pad.copieBloc = statut
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('parametreCopieBlocModifie')
				}
			})

			this.$socket.on('modifiervisionneuse', (visionneuse, identifiant) => {
				this.pad.visionneuse = visionneuse
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('visionneuseModifiee')
				}
			})

			this.$socket.on('message', (message) => {
				message.texte = this.formaterHTML(message.texte)
				this.messagesChat.push(message)
				if (message.identifiant !== this.identifiant && this.menu !== 'chat') {
					this.nouveauxMessagesChat++
				}
			})

			this.$socket.on('reinitialisermessages', (identifiant) => {
				this.messagesChat = []
				this.nouveauxMessagesChat = 0
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('historiqueConversationSupprime')
				}
			})

			this.$socket.on('reinitialiseractivite', (identifiant) => {
				this.activite = []
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('activiteSupprimee')
				}
			})

			this.$socket.on('supprimeractivite', (id, identifiant) => {
				this.activite = this.activite.filter((activite) => {
					return activite.id !== id
				})
				this.chargement = false
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('entreeActiviteSupprimee')
				}
			})

			this.$socket.on('ajoutercolonne', (donnees) => {
				this.menuColonne = null
				this.colonnes.splice(donnees.indexColonne, 0, [])
				this.affichageColonnes.splice(donnees.indexColonne, 0, true)
				const blocs = []
				this.colonnes.forEach((colonne, index) => {
					colonne.forEach((bloc) => {
						bloc.colonne = index
					})
					blocs.push(...colonne)
				})
				this.pad.colonnes = donnees.colonnes
				this.pad.affichageColonnes = donnees.affichageColonnes
				this.blocs = blocs
				if (donnees.hasOwnProperty('activiteId')) {
					this.activite.unshift({ id: donnees.activiteId, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'colonne-ajoutee' })
				}
				if (this.admin && this.identifiant === donnees.identifiant) {
					this.notification = this.$t('colonneAjoutee')
					this.$nextTick(() => {
						const menu = document.querySelectorAll('.menu-deroulant-colonne')[donnees.indexColonne]
						if (menu) menu.querySelector('.bouton-menu')?.focus()
					})
				} else if ((this.modale === 'bloc' || (this.modale === 'colonne' && this.modeColonne === 'edition')) && parseInt(this.colonne, 10) >= parseInt(donnees.indexColonne, 10)) {
					this.colonne = parseInt(this.colonne, 10) + 1
				}
				this.chargement = false
			})

			this.$socket.on('dupliquercolonne', (donnees) => {
				this.menuColonne = null
				const blocsColonne = this.pad.ordre === 'decroissant' ? donnees.blocs.slice().reverse() : donnees.blocs
				this.colonnes.splice(donnees.indexColonne, 0, blocsColonne)
				this.affichageColonnes.splice(donnees.indexColonne, 0, donnees.affichageColonnes[donnees.indexColonne])
				const blocs = []
				this.colonnes.forEach((colonne, index) => {
					colonne.forEach((bloc) => {
						bloc.colonne = index
					})
					blocs.push(...colonne)
				})
				this.pad.colonnes = donnees.colonnes
				this.pad.affichageColonnes = donnees.affichageColonnes
				this.blocs = blocs
				if (donnees.hasOwnProperty('activiteId')) {
					this.activite.unshift({ id: donnees.activiteId, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'colonne-dupliquee' })
				}
				if (this.admin && this.identifiant === donnees.identifiant) {
					this.notification = this.$t('colonneDupliquee')
					this.$nextTick(() => {
						const menu = document.querySelectorAll('.menu-deroulant-colonne')[donnees.indexColonne]
						if (menu) menu.querySelector('.bouton-menu')?.focus()
					})
				} else if ((this.modale === 'bloc' || (this.modale === 'colonne' && this.modeColonne === 'edition')) && parseInt(this.colonne, 10) >= parseInt(donnees.indexColonne, 10)) {
					this.colonne = parseInt(this.colonne, 10) + 1
				}
				this.chargement = false
			})

			this.$socket.on('modifiertitrecolonne', (colonnes, identifiant) => {
				this.pad.colonnes = colonnes
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('nomColonneModifie')
				}
				this.chargement = false
			})

			this.$socket.on('modifieraffichagecolonne', (affichageColonnes, valeur, colonne, identifiant, colonnes) => {
				this.pad.affichageColonnes = affichageColonnes
				if (Array.isArray(colonnes)) {
					this.pad.colonnes = colonnes
				}
				if (this.admin && this.identifiant === identifiant) {
					this.notification = this.$t('affichageColonneModifie')
					this.chargement = false
				} else if (valeur) {
					this.$socket.emit('verifierblocscolonnes', this.pad.id, this.identifiant)
				} else if (valeur === false) {
					const blocs = JSON.parse(JSON.stringify(this.blocs))
					this.blocs = blocs.filter(bloc => parseInt(bloc.colonne, 10) !== parseInt(colonne, 10))
					this.chargement = false
				}
			})

			this.$socket.on('verifierblocscolonnes', (blocs) => {
				this.blocs = blocs
				this.definirColonnes(this.blocs)
				this.chargement = false
			})

			this.$socket.on('vidercolonne', (donnees) => {
				const blocs = JSON.parse(JSON.stringify(this.blocs))
				this.blocs = blocs.filter(bloc => parseInt(bloc.colonne, 10) !== parseInt(donnees.colonne, 10))
				this.definirColonnes(this.blocs)
				if (donnees.hasOwnProperty('activiteId')) {
					this.activite.unshift({ id: donnees.activiteId, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'colonne-videe' })
				}
				if (this.admin && this.identifiant === donnees.identifiant) {
					this.notification = this.$t('colonneVidee')
				}
				this.chargement = false
			})

			this.$socket.on('supprimercolonne', (donnees) => {
				this.menuColonne = null
				this.colonnes.splice(parseInt(donnees.colonne, 10), 1)
				this.affichageColonnes.splice(parseInt(donnees.colonne, 10), 1)
				const blocs = []
				this.colonnes.forEach((colonne, index) => {
					colonne.forEach((bloc) => {
						bloc.colonne = index
					})
					blocs.push(...colonne)
				})
				this.pad.colonnes = donnees.colonnes
				this.pad.affichageColonnes = donnees.affichageColonnes
				this.blocs = blocs
				if (donnees.hasOwnProperty('activiteId')) {
					this.activite.unshift({ id: donnees.activiteId, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'colonne-supprimee' })
				}
				if (this.admin && this.identifiant === donnees.identifiant) {
					this.notification = this.$t('colonneSupprimee')
				} else if (this.modale === 'bloc' && parseInt(this.colonne, 10) === parseInt(donnees.colonne, 10)) {
					this.fermerModaleBloc()
					this.notification = this.$t('colonneActuelleSupprimee')
				} else if (this.modale === 'bloc' && parseInt(this.colonne, 10) > parseInt(donnees.colonne, 10)) {
					this.colonne = parseInt(this.colonne, 10) - 1
				}
				this.chargement = false
			})

			this.$socket.on('deplacercolonne', (donnees) => {
				this.menuColonne = null
				const blocs = []
				const colonne = parseInt(donnees.colonne, 10)
				const donneesColonnes = this.colonnes[colonne]
				const donneesAffichageColonnes = this.affichageColonnes[colonne]
				if (donnees.direction === 'gauche') {
					this.colonnes.splice(colonne - 1, 0, donneesColonnes)
					this.colonnes.splice(colonne + 1, 1)
					this.affichageColonnes.splice(colonne - 1, 0, donneesAffichageColonnes)
					this.affichageColonnes.splice(colonne + 1, 1)
				} else if (donnees.direction === 'droite') {
					const donneesColonneDeplacee = this.colonnes[colonne + 1]
					this.colonnes.splice(colonne + 1, 0, donneesColonnes)
					this.colonnes.splice(colonne, 1, donneesColonneDeplacee)
					this.colonnes.splice(colonne + 2, 1)
					const donneesAffichageColonneDeplacee = this.affichageColonnes[colonne + 1]
					this.affichageColonnes.splice(colonne + 1, 0, donneesAffichageColonnes)
					this.affichageColonnes.splice(colonne, 1, donneesAffichageColonneDeplacee)
					this.affichageColonnes.splice(colonne + 2, 1)
				}
				this.colonnes.forEach((colonne, index) => {
					colonne.forEach((bloc) => {
						bloc.colonne = index
					})
					blocs.push(...colonne)
				})
				this.pad.colonnes = donnees.colonnes
				this.pad.affichageColonnes = donnees.affichageColonnes
				this.blocs = blocs
				if (donnees.hasOwnProperty('activiteId')) {
					this.activite.unshift({ id: donnees.activiteId, identifiant: donnees.identifiant, nom: donnees.nom, titre: donnees.titre, date: donnees.date, type: 'colonne-deplacee' })
				}
				if (this.admin && this.identifiant === donnees.identifiant) {
					this.notification = this.$t('colonneDeplacee')
					const indexDeplacee = donnees.direction === 'gauche' ? colonne - 1 : colonne + 1
					this.$nextTick(() => {
						const menu = document.querySelectorAll('.menu-colonne')[indexDeplacee]
						if (menu) (menu.querySelector('.' + donnees.direction) || menu.querySelector('.bouton'))?.focus()
					})
				} else {
					if (this.modale === 'bloc' && parseInt(this.colonne, 10) === colonne && donnees.direction === 'gauche') {
						this.colonne = colonne - 1
					} else if (this.modale === 'bloc' && parseInt(this.colonne, 10) === colonne && donnees.direction === 'droite') {
						this.colonne = colonne + 1
					} else if (this.modale === 'bloc' && parseInt(this.colonne, 10) === (colonne - 1) && donnees.direction === 'gauche') {
						this.colonne = colonne
					} else if (this.modale === 'bloc' && parseInt(this.colonne, 10) === (colonne + 1) && donnees.direction === 'droite') {
						this.colonne = colonne
					}
				}
				this.chargement = false
			})

			this.$socket.on('viderpad', (colonnes, affichageColonnes) => {
				this.activite = []
				this.pad.vues = 0
				this.pad.notification = []
				this.pad.colonnes = colonnes
				this.pad.affichageColonnes = affichageColonnes
				if (this.pad.affichage === 'colonnes') {
					this.definirColonnes([])
				} else {
					this.blocs = []
				}
				this.commentaires = []
				this.evaluations = []
				this.listeEvaluations = []
				this.messagesChat = []
				this.messageChat = ''
				this.nouveauxMessagesChat = 0
				this.fermerModaleBloc()
				if (this.modaleDiaporama) this.fermerModaleDiaporama()
				this.fermerMenu()
				this.notification = this.$t('padVideAdmin')
			})

			this.$socket.on('modifiernotification', (donnees) => {
				this.pad.notification = donnees
			})

			this.$socket.on('verifiermodifierbloc', (bloc, identifiant) => {
				if (this.modale === 'bloc' && this.bloc === bloc) {
					this.$socket.emit('reponsemodifierbloc', this.pad.id, identifiant, true)
				} else {
					this.$socket.emit('reponsemodifierbloc', this.pad.id, identifiant, false)
				}
			})

			this.$socket.on('reponsemodifierbloc', (identifiant, reponse) => {
				if (this.identifiant === identifiant && reponse === true) {
					this.notification = this.$t('capsuleEnCoursModification')
				}
			})

			this.$socket.on('deconnecte', (sessionExpiree) => {
				this.chargement = false
				this.notification = sessionExpiree === true ? this.$t('sessionExpiree') : this.$t('problemeConnexion')
			})

			this.$socket.on('nonautorise', () => {
				this.chargement = false
				this.message = this.$t('actionNonAutorisee')
			})

			this.$socket.on('maintenance', () => {
				window.location.href = '/maintenance'
			})
		}
	}
}
