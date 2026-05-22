<template>
	<div id="page">
		<div id="accueil" :style="{'background-image': 'url(./img/fond.png)'}">
			<div id="langues">
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="Français" aria-label="Français" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')" @keydown.enter.space.prevent="modifierLangue('fr')">FR</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="Español" aria-label="Español" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')" @keydown.enter.space.prevent="modifierLangue('es')">ES</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="Italiano" aria-label="Italiano" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')" @keydown.enter.space.prevent="modifierLangue('it')">IT</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="Deutsch" aria-label="Deutsch" :class="{'selectionne': langue === 'de'}" @click="modifierLangue('de')" @keydown.enter.space.prevent="modifierLangue('de')">DE</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="English" aria-label="English" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')" @keydown.enter.space.prevent="modifierLangue('en')">EN</span>
				<span class="bouton" role="button" :tabindex="definirTabIndex()" title="Hrvatski" aria-label="Hrvatski" :class="{'selectionne': langue === 'hr'}" @click="modifierLangue('hr')" @keydown.enter.space.prevent="modifierLangue('hr')">HR</span>
			</div>
			<div id="conteneur">
				<div id="contenu">
					<h1>
						<span>Digipad</span> <span>by La Digitale</span>
					</h1>
					<div>
						<p v-html="$t('slogan')" />
						<div id="actions">
							<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleConnexion" @keydown.enter.space.prevent="afficherModaleConnexion">{{ $t('seConnecter') }}</span>
							<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleInscription" @keydown.enter.space.prevent="afficherModaleInscription" v-if="creationCompte === 1">{{ $t('sInscrire') }}</span>
							<div v-if="creationPadSansCompte === 1">
								<span class="bouton" role="button" :tabindex="definirTabIndex()" @click="afficherModaleCreer" @keydown.enter.space.prevent="afficherModaleCreer">{{ $t('creerPad') }}</span>
							</div>
						</div>
					</div>
				</div>
				<div id="credits">
					<p><a :href="mentionsLegales" target="_blank" rel="noreferrer" v-if="mentionsLegales !== ''">{{ $t('mentionsLegales') }}</a> - <a href="https://ladigitale.dev/contribuer.html" target="_blank">{{ $t('soutien') }} ❤️.</a></p>
					<p>{{ new Date().getFullYear() }} - <a href="https://ladigitale.dev" target="_blank" rel="noreferrer">La Digitale</a> - <a href="https://codeberg.org/ladigitale/digipad" target="_blank" rel="noreferrer">{{ $t('codeSource') }}</a> - <a href="https://codeberg.org/ladigitale/digipad/releases" target="_blank" rel="noreferrer">v{{ version }}</a> - <span class="hub" role="button" :tabindex="definirTabIndex()" :title="$t('afficherHub')" :aria-label="$t('afficherHub')" @click="ouvrirHub" @keydown.enter.space.prevent="ouvrirHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#001d1d" width="36px" height="36px" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none" /><path d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z" /></svg></span></p>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modale === 'creer'">
			<div id="creation" class="modale" role="dialog">
				<div class="en-tete">
					<span class="titre">{{ $t('creerPad') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleCreer" @keydown.enter.space.prevent="fermerModaleCreer"><i class="material-icons" aria-hidden="true">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu" role="form" :aria-label="$t('creerPad')">
						<label for="champ-titre-pad">{{ $t('titrePad') }}</label>
						<input id="champ-titre-pad" type="text" maxlength="48" :value="titre" @input="titre = $event.target.value">
						<label for="champ-motdepasse-pad">{{ $t('motDePassePad') }}</label>
						<p class="information">{{ $t('infoMotDePassePad') }}</p>
						<div class="conteneur-motdepasse">
							<input id="champ-motdepasse" type="password" maxlength="48" :value="motDePassePad" @input="motDePassePad = $event.target.value" @keydown.enter="creerPad" v-if="!motDePasseVisible">
							<input id="champ-motdepasse" type="text" maxlength="48" :value="motDePassePad" @input="motDePassePad = $event.target.value" @keydown.enter="creerPad" v-else>
							<span class="icone" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('masquerMotDePasse')" :aria-label="$t('masquerMotDePasse')" @click="modifierMotDePasseVisible(false)" @keydown.enter.space.prevent="modifierMotDePasseVisible(false)" v-if="motDePasseVisible"><i class="material-icons" aria-hidden="true">visibility_off</i></span>
							<span class="icone" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('afficherMotDePasse')" :aria-label="$t('afficherMotDePasse')" @click="modifierMotDePasseVisible(true)" @keydown.enter.space.prevent="modifierMotDePasseVisible(true)" v-else><i class="material-icons" aria-hidden="true">visibility</i></span>
						</div>
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="creerPad" @keydown.enter.space.prevent="creerPad" v-if="!chargement">{{ $t('creer') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'connexion' || modale === 'mot-de-passe-oublie'">
			<div id="connexion" class="modale" role="dialog" v-if="modale === 'connexion'">
				<div class="en-tete">
					<span class="titre">{{ $t('seConnecter') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleConnexion" @keydown.enter.space.prevent="fermerModaleConnexion"><i class="material-icons" aria-hidden="true">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu" role="form" :aria-label="$t('seConnecter')">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<div class="conteneur-motdepasse">
							<input id="champ-motdepasse" type="password" maxlength="48" :value="motDePasse" @input="motDePasse = $event.target.value" @keydown.enter="seConnecter" v-if="!motDePasseVisible">
							<input id="champ-motdepasse" type="text" maxlength="48" :value="motDePasse" @input="motDePasse = $event.target.value" @keydown.enter="seConnecter" v-else>
							<span class="icone" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('masquerMotDePasse')" :aria-label="$t('masquerMotDePasse')" @click="modifierMotDePasseVisible(false)" @keydown.enter.space.prevent="modifierMotDePasseVisible(false)" v-if="motDePasseVisible"><i class="material-icons" aria-hidden="true">visibility_off</i></span>
							<span class="icone" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('afficherMotDePasse')" :aria-label="$t('afficherMotDePasse')" @click="modifierMotDePasseVisible(true)" @keydown.enter.space.prevent="modifierMotDePasseVisible(true)" v-else><i class="material-icons" aria-hidden="true">visibility</i></span>
						</div>
						<div class="mot-de-passe-oublie" role="button" :tabindex="message === '' ? 0 : -1" @click="afficherModaleMotDePasseOublie" @keydown.enter.space.prevent="afficherModaleMotDePasseOublie" v-html="$t('motDePasseOublie')" />
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="seConnecter" @keydown.enter.space.prevent="seConnecter" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div class="modale" role="dialog" v-else-if="modale === 'mot-de-passe-oublie'">
				<div class="en-tete">
					<span class="titre">{{ $t('motDePasseOublie') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleMotDePasseOublie" @keydown.enter.space.prevent="fermerModaleMotDePasseOublie"><i class="material-icons" aria-hidden="true">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu" role="form" :aria-label="$t('motDePasseOublie')">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="text" :value="email" @input="email = $event.target.value" @keydown.enter="envoyerMotDePasse">
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="envoyerMotDePasse" @keydown.enter.space.prevent="envoyerMotDePasse" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'inscription'">
			<div id="inscription" class="modale" role="dialog">
				<div class="en-tete">
					<span class="titre">{{ $t('sInscrire') }}</span>
					<span class="fermer" role="button" :tabindex="message === '' ? 0 : -1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleInscription" @keydown.enter.space.prevent="fermerModaleInscription"><i class="material-icons" aria-hidden="true">close</i></span>
				</div>
				<div class="conteneur">
					<div class="contenu" role="form" :aria-label="$t('sInscrire')">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<p class="information">{{ $t('infoIdentifiant') }}</p>
						<input id="champ-identifiant" type="text" maxlength="48" :value="identifiant" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="text" :value="email" @input="email = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<p class="information">{{ $t('infoMotDePasse') }}</p>
						<input id="champ-motdepasse" type="password" maxlength="48" :value="motDePasse" @input="motDePasse = $event.target.value">
						<label for="champ-confirmation-motdepasse">{{ $t('confirmationMotDePasse') }}</label>
						<input id="champ-confirmation-motdepasse" type="password" maxlength="48" :value="confirmationMotDePasse" @input="confirmationMotDePasse = $event.target.value" @keydown.enter="sInscrire">
						<div class="actions">
							<span class="bouton" role="button" :tabindex="message === '' ? 0 : -1" @click="sInscrire" @keydown.enter.space.prevent="sInscrire" v-if="!chargement">{{ $t('valider') }}</span>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div id="hub" :class="{'ouvert': hub}" :tabindex="hub ? 0 : -1">
			<span role="button" :tabindex="hub ? 0 : -1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerHub" @keydown.enter.space.prevent="fermerHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="36px" height="36px" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none" /><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg></span>
			<iframe src="https://ladigitale.dev/hub.html" title="Le Hub by La Digitale"></iframe>
		</div>

		<Notification :notification="notification" @fermer="notification = ''" />

		<Message :message="message" @elementPrecedent="definirElementPrecedent" @fermer="fermerMessage" v-if="message !== ''" />

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import axios from 'axios'
import ChargementPage from '#root/components/chargement-page.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'

export default {
	name: 'Accueil',
	components: {
		ChargementPage,
		Message,
		Notification
	},
	data () {
		return {
			chargementPage: true,
			chargement: false,
			message: '',
			notification: '',
			modale: '',
			titre: '',
			motDePassePad: '',
			identifiant: '',
			motDePasse: '',
			confirmationMotDePasse: '',
			motDePasseVisible: false,
			email: '',
			hub: false,
			elementPrecedent: null,
			hote: this.$pageContext.pageProps.hote,
			langues: this.$pageContext.pageProps.langues,
			langue: this.$pageContext.pageProps.langue,
			creationCompte: 1,
			creationPadSansCompte: 0,
			version: app_version,
			mentionsLegales: import.meta.env.VITE_LEGAL_TERMS_LINK || ''
		}
	},
	created () {
		const params = this.$pageContext.pageProps.params
		const langueNav = navigator.language.substring(0, 2)
		const langueParam = params.lang
		if (langueParam && langueParam !== '' && this.langues.includes(langueParam) === true) {
			this.langue = langueParam
			localStorage.setItem('digipad_lang', langueParam)
		} else if (!langueParam && langueNav !== '' && this.langues.includes(langueNav) === true) {
			this.langue = langueNav
		} 
		if (localStorage.getItem('digipad_lang')) {
			this.langue = localStorage.getItem('digipad_lang')
		}
		this.$i18n.locale = this.langue
		if (this.langue !== this.$pageContext.pageProps.langue) {
			this.$socket.emit('modifierlangue', this.langue)
		}
		if (import.meta.env.VITE_CREATE_ACCOUNT && import.meta.env.VITE_CREATE_ACCOUNT !== '') {
			this.creationCompte = parseInt(import.meta.env.VITE_CREATE_ACCOUNT)
		}
		if (import.meta.env.VITE_PAD_WITHOUT_ACCOUNT && import.meta.env.VITE_PAD_WITHOUT_ACCOUNT !== '') {
			this.creationPadSansCompte = parseInt(import.meta.env.VITE_PAD_WITHOUT_ACCOUNT)
		}
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

		setTimeout(function () {
			this.chargementPage = false
		}.bind(this), 300)

		document.addEventListener('keydown', this.gererClavier, false)
	},
	beforeUnmount () {
		document.removeEventListener('keydown', this.gererClavier, false)
	},
	methods: {
		definirTabIndex () {
			return this.modale === '' && this.message === '' && !this.hub ? 0 : -1
		},
		modifierMotDePasseVisible (valeur) {
			this.motDePasseVisible = valeur
			this.$nextTick(function () {
				document.querySelector('.conteneur-motdepasse .icone').focus()
			})
		},
		afficherModaleCreer () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'creer'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		creerPad () {
			if (this.titre.trim() !== '' && this.motDePassePad.trim() !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/creer-pad-sans-compte', {
					titre: this.titre.trim(),
					motdepasse: this.motDePassePad.trim()
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'erreur_creation') {
						this.chargement = false
						this.message = this.$t('erreurCreationPad')
					} else {
						window.location.href = '/p/' + donnees.id + '/' + donnees.token
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		fermerModaleCreer () {
			this.modale = ''
			this.titre = ''
			this.motDePassePad = ''
			this.motDePasseVisible = false
			this.gererFocus()
		},
		afficherModaleConnexion () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'connexion'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		seConnecter () {
			if (this.identifiant !== '' && this.motDePasse !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/connexion', {
					identifiant: this.identifiant,
					motdepasse: this.motDePasse
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'erreur_connexion') {
						this.chargement = false
						this.message = this.$t('informationsConnexionIncorrectes')
					} else {
						window.location.href = '/u/' + donnees.identifiant
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		afficherModaleInscription () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'inscription'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		sInscrire () {
			const identifiant = this.identifiant.trim()
			const motdepasse = this.motDePasse.trim()
			const email = this.email.trim()
			if (identifiant !== '' && this.verifierIdentifant(identifiant) === true && motdepasse !== '' && motdepasse === this.confirmationMotDePasse.trim() && email !== '' && this.$verifierEmail(email) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/inscription', {
					identifiant: identifiant,
					motdepasse: motdepasse,
					email: email
				}).then(function (reponse) {
					const donnees = reponse.data
					if (donnees === 'utilisateur_existe_deja') {
						this.chargement = false
						this.message = this.$t('identifiantExisteDeja', { identifiant: identifiant })
					} else if (donnees === 'email_existe_deja') {
						this.chargement = false
						this.message = this.$t('emailExisteDeja', { email: email })
					} else if (donnees === 'identifiant_invalide') {
						this.chargement = false
						this.message = this.$t('identifiantNonConforme')
					} else if (donnees === 'erreur_email') {
						this.chargement = false
						this.message = this.$t('erreurEnvoiEmail')
					} else if (donnees === 'activation_demandee') {
						this.chargement = false
						this.fermerModaleInscription()
						this.message = this.$t('activationEnvoyee')
					} else if (donnees === 'compte_cree') {
						window.location.href = '/u/' + identifiant
					} else {
						this.chargement = false
						this.message = this.$t('erreurCommunicationServeur')
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else if (identifiant === '' || motdepasse === '' || this.confirmationMotDePasse.trim() === '' || email === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.verifierIdentifant(identifiant) === false) {
				this.message = this.$t('identifiantNonConforme')
			} else if (motdepasse !== this.confirmationMotDePasse.trim()) {
				this.message = this.$t('motsDePassePasIdentiques')
			} else if (this.$verifierEmail(email) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		verifierIdentifant (identifiant) {
			let conforme = false
			if (identifiant.match(/^[\w-]+$/)) {
				conforme = true
			}
			if (identifiant.length < 3) {
				conforme = false
			}
			return conforme
		},
		afficherModaleMotDePasseOublie () {
			this.motDePasse = ''
			this.modale = 'mot-de-passe-oublie'
			this.$nextTick(function () {
				document.querySelector('.modale input').focus()
			})
		},
		envoyerMotDePasse () {
			if (this.identifiant.trim() !== '' && this.email.trim() !== '' && this.$verifierEmail(this.email.trim()) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/mot-de-passe-oublie', {
					identifiant: this.identifiant.trim(),
					email: this.email.trim()
				}).then(function (reponse) {
					this.chargement = false
					const donnees = reponse.data
					if (donnees === 'erreur') {
						this.message = this.$t('erreurCommunicationServeur')
					} else if (donnees === 'identifiant_invalide') {
						this.message = this.$t('identifiantNonValide')
					} else if (donnees === 'email_invalide') {
						this.message = this.$t('emailNonValide')
					} else if (donnees === 'erreur_email') {
						this.message = this.$t('erreurEnvoiEmail')
					} else {
						this.fermerModaleMotDePasseOublie()
						this.notification = this.$t('emailEnvoye')
					}
				}.bind(this)).catch(function () {
					this.chargement = false
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			} else if (this.identifiant.trim() === '' || this.email.trim() === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.$verifierEmail(this.email.trim()) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		fermerModaleConnexion () {
			this.modale = ''
			this.identifiant = ''
			this.motDePasse = ''
			this.motDePasseVisible = false
			this.gererFocus()
		},
		fermerModaleInscription () {
			this.modale = ''
			this.identifiant = ''
			this.email = ''
			this.motDePasse = ''
			this.confirmationMotDePasse = ''
			this.gererFocus()
		},
		fermerModaleMotDePasseOublie () {
			this.modale = ''
			this.identifiant = ''
			this.email = ''
			this.gererFocus()
		},
		modifierLangue (langue) {
			if (this.langue !== langue) {
				axios.post(this.hote + '/api/modifier-langue', {
					identifiant: this.identifiant,
					langue: langue
				}).then(function () {
					this.$i18n.locale = langue
					document.getElementsByTagName('html')[0].setAttribute('lang', langue)
					this.langue = langue
					this.notification = this.$t('langueModifiee')
					localStorage.setItem('digipad_lang', langue)
				}.bind(this)).catch(function () {
					this.message = this.$t('erreurCommunicationServeur')
				}.bind(this))
			}
		},
		ouvrirHub () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.hub = true
			this.$nextTick(function () {
				document.querySelector('#hub span').focus()
			})
		},
		fermerHub () {
			this.hub = false
			this.gererFocus()
		},
		fermerMessage () {
			this.message = ''
			this.gererFocus()
		},
		definirElementPrecedent (element) {
			this.elementPrecedent = element
		},
		gererFocus () {
			if (this.elementPrecedent) {
				this.elementPrecedent.focus()
				this.elementPrecedent = null
			}
		},
		gererClavier (event) {
			if (event.key === 'Escape' && this.message !== '') {
				this.fermerMessage()
			} else if (event.key === 'Escape' && this.modale === 'creer') {
				this.fermerModaleCreer()
			} else if (event.key === 'Escape' && this.modale === 'connexion') {
				this.fermerModaleConnexion()
			} else if (event.key === 'Escape' && this.modale === 'mot-de-passe-oublie') {
				this.fermerModaleMotDePasseOublie()
			} else if (event.key === 'Escape' && this.modale === 'inscription') {
				this.fermerModaleInscription()
			} else if (event.key === 'Escape' && this.hub) {
				this.hub = false
				this.gererFocus()
			}
		}
	}
}
</script>

<style scoped>
#page,
#accueil {
	width: 100%;
	height: 100%;
}

#accueil {
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
}

#langues {
	position: fixed;
	display: flex;
	top: 1rem;
	right: 0.5rem;
	z-index: 10;
}

#langues span {
    display: flex;
    justify-content: center;
	align-items: center;
	font-size: 1.4rem;
    width: 3rem;
	height: 3rem;
	background: #fff;
    border-radius: 50%;
    border: 1px solid #ddd;
    margin-right: 1rem;
	cursor: pointer;
}

#langues span.selectionne {
    background: #242f3d;
    color: #fff;
    border: 1px solid #222;
    cursor: default;
}

#conteneur {
	position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
	flex-wrap: wrap;
	overflow: auto;
}

#contenu {
	max-width: 76em;
	text-align: center;
	padding: 12em 1em 6em;
	margin: auto;
}

#conteneur h1 {
    font-family: 'Mona Sans Expanded', sans-serif;
    font-size: 3em;
    margin-bottom: 0.85em;
    line-height: 1.4;
}

#conteneur p {
    font-size: 1.25em;
    line-height: 1.4;
    margin-bottom: 1.5em;
}

#actions {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
}

#actions .bouton {
	display: flex;
	justify-content: center;
	align-items: center;
	width: 180px;
    line-height: 1;
    font-size: 1em;
    font-weight: 700;
    text-transform: uppercase;
	padding: 1em 1.5em;
	margin-right: 1em;
    border: 2px solid #00ced1;
	border-radius: 2em;
    background: #46fbff;
	cursor: pointer;
    transition: all 0.1s ease-in;
	text-align: center;
}

#actions .bouton:hover {
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.2);
	background: #fff;
}

#actions .bouton:last-child {
	margin-right: 0;
}

#credits {
	width: 100%;
	margin: 0 auto 0.75em;
}

#credits p {
    font-size: 1em;
    line-height: 1.2;
    margin-bottom: 1em;
	text-align: center;
}

#credits p:last-child {
	display: flex;
	justify-content: center;
	align-items: center;
}

#credits p:last-child a {
	margin: 0 5px;
}

#credits .hub {
	font-size: 0;
	cursor: pointer;
}

#hub {
	position: fixed;
	visibility: hidden;
	opacity: 0;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
	z-index: -1;
}

#hub.ouvert {
	visibility: visible;
	opacity: 1;
    animation: fonduEntrant linear 0.1s;
	z-index: 100000;
}

#hub iframe {
	width: 100%;
    height: 100%;
}

#hub span {
	font-size: 0;
	color: #fff;
	position: absolute;
	top: 15px;
	right: 15px;
	cursor: pointer;
}

#connexion .conteneur-motdepasse {
	margin-bottom: 10px;
}

.modale .contenu .mot-de-passe-oublie {
	font-size: 12px;
    margin-bottom: 20px;
	cursor: pointer;
}

@media screen and (max-width: 359px) {
	#contenu {
		padding: 4em 1em 2em;
	}

	#actions .bouton {
		font-size: 0.75em!important;
		width: 130px;
		padding: 1em 0.5em;
	}
}

@media screen and (orientation: landscape) and (max-height: 479px) {
	#creation,
	#connexion,
	#inscription {
		height: 90%;
	}
}

@media screen and (min-width: 360px) and (max-width: 599px) {
	#contenu {
		padding: 5em 1em 2.5em;
	}

	#actions .bouton {
		width: 145px;
	}
}

@media screen and (max-width: 399px) {
	#conteneur h1 span {
		display: block;
	}
}

@media screen and (max-width: 599px) {
	#conteneur h1 {
		font-size: 2em;
		margin-bottom: 1em;
	}

	#conteneur p {
		font-size: 1em;
		margin-bottom: 1.2em;
	}

	#actions .bouton {
		font-size: 0.85em;
	}

	#credits p {
		font-size: 0.85em;
	}

	#hub span {
		top: 5px;
		right: 5px;
	}

	#hub span svg {
		width: 24px;
		height: 24px;
	}
}

@media screen and (max-width: 767px) {
	#actions .bouton:last-of-type {
		margin-right: 0;
	}

	#actions div {
		width: 100%;
		margin-top: 1em;
	}

	#actions div .bouton {
		margin: auto!important;
	}
}

@media screen and (max-width: 599px) and (orientation: landscape) {
	#contenu {
		padding: 2em 1em 1.5em!important;
	}
}

@media screen and (min-width: 600px) and (max-width: 820px) and (orientation: landscape) {
	#contenu {
		padding: 3em 1em 1.5em!important;
	}
}

@media screen and (max-width: 820px) and (orientation: landscape) {
	#conteneur p {
		font-size: 1em!important;
	}

	#credits p {
		font-size: 0.85em!important;
		margin-bottom: 0.85em!important;
	}
}

@media screen and (max-width: 1023px) and (orientation: landscape) {
	#contenu {
		padding: 7em 1em 3.5em;
	}
}

@media screen and (max-width: 850px) and (max-height: 500px) {
	#conteneur h1 {
		font-size: 2em;
		margin-bottom: 1em;
	}

	#conteneur p {
		font-size: 1em;
		margin-bottom: 1.2em;
	}

	#credits p {
		font-size: 0.85em!important;
	}

	#actions .bouton {
		font-size: 0.85em!important;
	}
}
</style>
