<template>
	<div id="page">
		<div id="accueil" :inert="hub || null" :style="{'background-image': 'url(./img/fond.png)'}">
			<div id="langues" role="group" :aria-label="$t('langue')">
				<button type="button" class="bouton" :disabled="disabled" title="Français" aria-label="FR, Français" lang="fr" :aria-pressed="langue === 'fr' ? 'true' : 'false'" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')">FR</button>
				<button type="button" class="bouton" :disabled="disabled" title="Español" aria-label="ES, Español" lang="es" :aria-pressed="langue === 'es' ? 'true' : 'false'" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')">ES</button>
				<button type="button" class="bouton" :disabled="disabled" title="Italiano" aria-label="IT, Italiano" lang="it" :aria-pressed="langue === 'it' ? 'true' : 'false'" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')">IT</button>
				<button type="button" class="bouton" :disabled="disabled" title="Deutsch" aria-label="DE, Deutsch" lang="de" :aria-pressed="langue === 'de' ? 'true' : 'false'" :class="{'selectionne': langue === 'de'}" @click="modifierLangue('de')">DE</button>
				<button type="button" class="bouton" :disabled="disabled" title="English" aria-label="EN, English" lang="en" :aria-pressed="langue === 'en' ? 'true' : 'false'" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')">EN</button>
				<button type="button" class="bouton" :disabled="disabled" title="Hrvatski" aria-label="HR, Hrvatski" lang="hr" :aria-pressed="langue === 'hr' ? 'true' : 'false'" :class="{'selectionne': langue === 'hr'}" @click="modifierLangue('hr')">HR</button>
			</div>
			<div id="conteneur">
				<div id="contenu">
					<h1>
						<span>Digipad</span> <span>by La Digitale</span>
					</h1>
					<div>
						<p v-html="$t('slogan')" />
						<div id="actions">
							<button type="button" class="bouton" :disabled="disabled" @click="afficherModaleConnexion">{{ $t('seConnecter') }}</button>
							<button type="button" class="bouton" :disabled="disabled" @click="afficherModaleInscription" v-if="creationCompte === 1">{{ $t('sInscrire') }}</button>
							<div v-if="creationPadSansCompte === 1">
								<button type="button" class="bouton" :disabled="disabled" @click="afficherModaleCreer">{{ $t('creerPad') }}</button>
							</div>
						</div>
					</div>
				</div>
				<div id="credits">
					<p><a :href="mentionsLegales" target="_blank" rel="noreferrer" v-if="mentionsLegales !== ''">{{ $t('mentionsLegales') }}<span class="lecteur-ecran"> ({{ $t('nouvelOnglet') }})</span></a><span aria-hidden="true"> - </span><a href="https://ladigitale.dev/contribuer.html" target="_blank" rel="noreferrer">{{ $t('soutien') }} <span aria-hidden="true">❤️</span>.<span class="lecteur-ecran"> ({{ $t('nouvelOnglet') }})</span></a></p>
					<p>{{ new Date().getFullYear() }}<span aria-hidden="true"> - </span><a href="https://ladigitale.dev" target="_blank" rel="noreferrer">La Digitale<span class="lecteur-ecran"> ({{ $t('nouvelOnglet') }})</span></a><span aria-hidden="true"> - </span><a href="https://codeberg.org/ladigitale/digipad" target="_blank" rel="noreferrer">{{ $t('codeSource') }}<span class="lecteur-ecran"> ({{ $t('nouvelOnglet') }})</span></a><span aria-hidden="true"> - </span><a href="https://codeberg.org/ladigitale/digipad/releases" target="_blank" rel="noreferrer">v{{ version }}<span class="lecteur-ecran"> ({{ $t('nouvelOnglet') }})</span></a><span aria-hidden="true"> - </span><a class="doc" href="https://doc.ladigitale.dev/doku.php?id=digipad" target="_blank" rel="noreferrer" :title="$t('voirDocumentation') + ' (' + $t('nouvelOnglet') + ')'" :aria-label="$t('voirDocumentation') + ' (' + $t('nouvelOnglet') + ')'"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="30px" height="30px" fill="#1f2937" aria-hidden="true"><path d="M511.83-256.83Q524-269 524-286.67q0-17.66-12.17-29.83-12.16-12.17-29.83-12.17-17.67 0-29.83 12.17Q440-304.33 440-286.67q0 17.67 12.17 29.84 12.16 12.16 29.83 12.16 17.67 0 29.83-12.16Zm-65.16-136.5h64q0-28.34 6.83-49 6.83-20.67 41.17-50.34 29.33-26 43-50.5 13.66-24.5 13.66-55.5 0-54-36.66-85.33-36.67-31.33-93.34-31.33-51.66 0-88.5 26.33Q360-662.67 344-620l57.33 22q9-24.67 29.5-42t52.5-17.33q33.34 0 52.67 18.16 19.33 18.17 19.33 44.5 0 21.34-12.66 40.17-12.67 18.83-35.34 37.83-34.66 30.34-47.66 54-13 23.67-13 69.34ZM480-80q-82.33 0-155.33-31.5-73-31.5-127.34-85.83Q143-251.67 111.5-324.67T80-480q0-83 31.5-156t85.83-127q54.34-54 127.34-85.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82.33-31.5 155.33-31.5 73-85.5 127.34Q709-143 636-111.5T480-80Zm0-66.67q139.33 0 236.33-97.33t97-236q0-139.33-97-236.33t-236.33-97q-138.67 0-236 97-97.33 97-97.33 236.33 0 138.67 97.33 236 97.33 97.33 236 97.33ZM480-480Z"/></svg></a><span aria-hidden="true"> - </span><button type="button" class="hub" :disabled="disabled" :title="$t('afficherHub')" :aria-label="$t('afficherHub')" @click="ouvrirHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -960 960 960" width="30px" height="30px" fill="#1f2937" aria-hidden="true"><path d="M180.5-180.5Q160-201 160-230.67q0-29.66 20.5-50.16 20.5-20.5 50.17-20.5 29.66 0 50.16 20.5 20.5 20.5 20.5 50.16 0 29.67-20.5 50.17T230.67-160q-29.67 0-50.17-20.5Zm249.33 0q-20.5-20.5-20.5-50.17 0-29.66 20.5-50.16 20.5-20.5 50.17-20.5t50.17 20.5q20.5 20.5 20.5 50.16 0 29.67-20.5 50.17T480-160q-29.67 0-50.17-20.5Zm249.34 0q-20.5-20.5-20.5-50.17 0-29.66 20.5-50.16 20.5-20.5 50.16-20.5 29.67 0 50.17 20.5t20.5 50.16q0 29.67-20.5 50.17T729.33-160q-29.66 0-50.16-20.5ZM180.5-429.83Q160-450.33 160-480t20.5-50.17q20.5-20.5 50.17-20.5 29.66 0 50.16 20.5 20.5 20.5 20.5 50.17t-20.5 50.17q-20.5 20.5-50.16 20.5-29.67 0-50.17-20.5Zm249.33 0q-20.5-20.5-20.5-50.17t20.5-50.17q20.5-20.5 50.17-20.5t50.17 20.5q20.5 20.5 20.5 50.17t-20.5 50.17q-20.5 20.5-50.17 20.5t-50.17-20.5Zm249.34 0q-20.5-20.5-20.5-50.17t20.5-50.17q20.5-20.5 50.16-20.5 29.67 0 50.17 20.5T800-480q0 29.67-20.5 50.17t-50.17 20.5q-29.66 0-50.16-20.5ZM180.5-679.17q-20.5-20.5-20.5-50.16 0-29.67 20.5-50.17t50.17-20.5q29.66 0 50.16 20.5 20.5 20.5 20.5 50.17 0 29.66-20.5 50.16-20.5 20.5-50.16 20.5-29.67 0-50.17-20.5Zm249.33 0q-20.5-20.5-20.5-50.16 0-29.67 20.5-50.17T480-800q29.67 0 50.17 20.5t20.5 50.17q0 29.66-20.5 50.16-20.5 20.5-50.17 20.5t-50.17-20.5Zm249.34 0q-20.5-20.5-20.5-50.16 0-29.67 20.5-50.17t50.16-20.5q29.67 0 50.17 20.5t20.5 50.17q0 29.66-20.5 50.16-20.5 20.5-50.17 20.5-29.66 0-50.16-20.5Z"/></svg></button></p>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modale === 'creer'">
			<div id="creation" class="modale" role="dialog" aria-modal="true" :aria-label="$t('creerPad')">
				<div class="en-tete">
					<span class="titre">{{ $t('creerPad') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleCreer"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-titre-pad">{{ $t('titrePad') }}</label>
						<input id="champ-titre-pad" type="text" maxlength="48" :value="titre" :disabled="disabledModale" @input="titre = $event.target.value">
						<label for="champ-motdepasse-pad">{{ $t('motDePassePad') }}</label>
						<p id="info-motdepasse-pad" class="information">{{ $t('infoMotDePassePad') }}</p>
						<p id="info-motdepasse" class="information">{{ $t('infoMotDePasse') }}</p>
						<div class="conteneur-motdepasse">
							<input id="champ-motdepasse-pad" type="password" autocomplete="new-password" aria-describedby="info-motdepasse-pad info-motdepasse" maxlength="48" :value="motDePassePad" :disabled="disabledModale" @input="motDePassePad = $event.target.value" @keydown.enter="creerPad" v-if="!motDePasseVisible">
							<input id="champ-motdepasse-pad-texte" type="text" autocomplete="off" aria-describedby="info-motdepasse-pad info-motdepasse" maxlength="48" :value="motDePassePad" :disabled="disabledModale" @input="motDePassePad = $event.target.value" @keydown.enter="creerPad" v-else>
							<button type="button" class="icone" :disabled="disabledModale" :title="$t('masquerMotDePasse')" :aria-label="$t('masquerMotDePasse')" @click="modifierMotDePasseVisible(false)" v-if="motDePasseVisible"><i class="material-icons" aria-hidden="true">visibility_off</i></button>
							<button type="button" class="icone" :disabled="disabledModale" :title="$t('afficherMotDePasse')" :aria-label="$t('afficherMotDePasse')" @click="modifierMotDePasseVisible(true)" v-else><i class="material-icons" aria-hidden="true">visibility</i></button>
						</div>
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="creerPad" v-if="!chargement">{{ $t('creer') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'connexion' || modale === 'mot-de-passe-oublie' || modale === 'identifiant-oublie'">
			<div id="connexion" class="modale" role="dialog" aria-modal="true" :aria-label="$t('seConnecter')" v-if="modale === 'connexion'">
				<div class="en-tete">
					<span class="titre">{{ $t('seConnecter') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleConnexion"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" autocomplete="username" maxlength="48" :value="identifiant" :disabled="disabledModale" @input="identifiant = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<div class="conteneur-motdepasse">
							<input id="champ-motdepasse" type="password" autocomplete="current-password" maxlength="48" :value="motDePasse" :disabled="disabledModale" @input="motDePasse = $event.target.value" @keydown.enter="seConnecter" v-if="!motDePasseVisible">
							<input id="champ-motdepasse-texte" type="text" autocomplete="off" maxlength="48" :value="motDePasse" :disabled="disabledModale" @input="motDePasse = $event.target.value" @keydown.enter="seConnecter" v-else>
							<button type="button" class="icone" :disabled="disabledModale" :title="$t('masquerMotDePasse')" :aria-label="$t('masquerMotDePasse')" @click="modifierMotDePasseVisible(false)" v-if="motDePasseVisible"><i class="material-icons" aria-hidden="true">visibility_off</i></button>
							<button type="button" class="icone" :disabled="disabledModale" :title="$t('afficherMotDePasse')" :aria-label="$t('afficherMotDePasse')" @click="modifierMotDePasseVisible(true)" v-else><i class="material-icons" aria-hidden="true">visibility</i></button>
						</div>
						<button type="button" class="mot-de-passe-oublie" :disabled="disabledModale" @click="afficherModaleMotDePasseOublie" v-html="$t('motDePasseOublie')" />
						<button type="button" class="identifiant-oublie" :disabled="disabledModale" @click="afficherModaleIdentifiantOublie" v-html="$t('identifiantOublie')" />
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="seConnecter" v-if="!chargement">{{ $t('valider') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div id="motdepasse-oublie" class="modale" role="dialog" aria-modal="true" :aria-label="$t('motDePasseOublie')" v-else-if="modale === 'mot-de-passe-oublie'">
				<div class="en-tete">
					<span class="titre">{{ $t('motDePasseOublie') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleMotDePasseOublie"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<input id="champ-identifiant" type="text" autocomplete="username" maxlength="48" :value="identifiant" :disabled="disabledModale" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="email" autocomplete="email" :value="email" :disabled="disabledModale" @input="email = $event.target.value" @keydown.enter="envoyerMotDePasse">
						<button type="button" class="identifiant-oublie" :disabled="disabledModale" @click="afficherModaleIdentifiantOublie" v-html="$t('identifiantOublie')" />
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="envoyerMotDePasse" v-if="!chargement">{{ $t('valider') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
			<div id="identifiant-oublie" class="modale" role="dialog" aria-modal="true" :aria-label="$t('identifiantOublie')" v-else-if="modale === 'identifiant-oublie'">
				<div class="en-tete">
					<span class="titre">{{ $t('identifiantOublie') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleIdentifiantOublie"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="email" autocomplete="email" :value="email" :disabled="disabledModale" @input="email = $event.target.value" @keydown.enter="envoyerIdentifiant">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="envoyerIdentifiant" v-if="!chargement">{{ $t('valider') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'inscription'">
			<div id="inscription" class="modale" role="dialog" aria-modal="true" :aria-label="$t('sInscrire')">
				<div class="en-tete">
					<span class="titre">{{ $t('sInscrire') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleInscription"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-identifiant">{{ $t('identifiant') }}</label>
						<p id="info-identifiant" class="information">{{ $t('infoIdentifiant') }}</p>
						<input id="champ-identifiant" type="text" autocomplete="username" aria-describedby="info-identifiant" maxlength="48" :value="identifiant" :disabled="disabledModale" @input="identifiant = $event.target.value">
						<label for="champ-email">{{ $t('email') }}</label>
						<input id="champ-email" type="email" autocomplete="email" :value="email" :disabled="disabledModale" @input="email = $event.target.value">
						<label for="champ-motdepasse">{{ $t('motDePasse') }}</label>
						<p id="info-motdepasse" class="information">{{ $t('infoMotDePasse') }}</p>
						<input id="champ-motdepasse" type="password" autocomplete="new-password" aria-describedby="info-motdepasse" maxlength="48" :value="motDePasse" :disabled="disabledModale" @input="motDePasse = $event.target.value">
						<label for="champ-confirmation-motdepasse">{{ $t('confirmationMotDePasse') }}</label>
						<input id="champ-confirmation-motdepasse" type="password" autocomplete="new-password" maxlength="48" :value="confirmationMotDePasse" :disabled="disabledModale" @input="confirmationMotDePasse = $event.target.value" @keydown.enter="sInscrire">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="sInscrire" v-if="!chargement">{{ $t('valider') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div id="hub" :class="{'ouvert': hub}" role="dialog" aria-modal="true" aria-label="Le Hub by La Digitale" :aria-hidden="!hub" :inert="!hub">
			<button type="button" :disabled="!hub" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerHub"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#fff" width="36px" height="36px" aria-hidden="true"><path d="M0 0h24v24H0z" fill="none" /><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" /></svg></button>
			<iframe src="https://ladigitale.dev/hub.html" title="Le Hub by La Digitale"></iframe>
		</div>

		<Notification :notification="notification" @fermer="notification = ''" />

		<Message :message="message" @elementPrecedent="definirElementPrecedent" @fermer="fermerMessage" v-if="message !== ''" />

		<ChargementPage :chargement="chargementPage" />
	</div>
</template>

<script>
import axios from 'axios'
import ChargementPage from '#root/components/chargement-page.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'

export default {
	name: 'DigipadAccueil',
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
	computed: {
		tabIndex () {
			return this.modale === '' && this.message === '' && !this.hub ? 0 : -1
		},
		tabIndexModale () {
			return this.message === '' ? 0 : -1
		},
		disabled () {
			return this.modale === '' && this.message === '' && !this.hub ? false : true
		},
		disabledModale () {
			return this.message === '' ? false : true
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
		this.chargementPage = false
		document.addEventListener('keydown', this.gererClavier, false)
		window.addEventListener('message', this.gererMessageHub, false)
	},
	beforeUnmount () {
		document.removeEventListener('keydown', this.gererClavier, false)
		window.removeEventListener('message', this.gererMessageHub, false)
	},
	methods: {
		modifierMotDePasseVisible (valeur) {
			this.motDePasseVisible = valeur
			this.$nextTick(() => {
				document.querySelector('.conteneur-motdepasse .icone')?.focus()
			})
		},
		afficherModaleCreer () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'creer'
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		creerPad () {
			if (this.titre.trim() !== '' && this.motDePassePad.trim() !== '' && this.motDePassePad.trim().length < 8) {
				this.message = this.$t('motDePasseTropCourt')
				return
			}
			if (this.titre.trim() !== '' && this.motDePassePad.trim() !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/creer-pad-sans-compte', {
					titre: this.titre.trim(),
					motdepasse: this.motDePassePad.trim()
				}).then((reponse) => {
					const donnees = reponse.data
					window.location.href = '/p/' + donnees.id + '/' + donnees.token
				}).catch((err) => {
					this.chargement = false
					if (err.response?.status === 429) {
						this.message = this.$t('erreurTentativesNombreuses')
					} else if (err.response?.data === 'motdepasse_trop_court') {
						this.message = this.$t('motDePasseTropCourt')
					} else if (err.response?.data === 'titre_invalide' || err.response?.data === 'motdepasse_invalide') {
						this.message = this.$t('remplirChamps')
					} else if (err.response?.data === 'erreur_creation') {
						this.message = this.$t('erreurCreationPad')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
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
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		seConnecter () {
			const identifiant = this.identifiant.trim()
			const motdepasse = this.motDePasse.trim()
			if (identifiant !== '' && motdepasse !== '') {
				this.chargement = true
				axios.post(this.hote + '/api/connexion', {
					identifiant: identifiant,
					motdepasse: motdepasse
				}).then((reponse) => {
					window.location.href = '/u/' + reponse.data.identifiant
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'erreur_tentatives_identifiant') {
						this.message = this.$t('erreurTentativesIdentifiant')
					} else if (err.response?.status === 429) {
						this.message = this.$t('erreurTentativesNombreuses')
					} else if (err.response?.data === 'erreur_connexion') {
						this.message = this.$t('informationsConnexionIncorrectes')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			} else {
				this.message = this.$t('remplirChamps')
			}
		},
		afficherModaleInscription () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'inscription'
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		sInscrire () {
			const identifiant = this.identifiant.trim()
			const motdepasse = this.motDePasse.trim()
			const email = this.email.trim()
			if (identifiant !== '' && motdepasse !== '' && motdepasse.length < 8) {
				this.message = this.$t('motDePasseTropCourt')
				return
			}
			if (identifiant !== '' && this.verifierIdentifiant(identifiant) === true && motdepasse !== '' && motdepasse === this.confirmationMotDePasse.trim() && email !== '' && this.$verifierEmail(email) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/inscription', {
					identifiant: identifiant,
					motdepasse: motdepasse,
					email: email
				}).then((reponse) => {
					const donnees = reponse.data
					if (donnees === 'activation_demandee') {
						this.chargement = false
						this.fermerModaleInscription()
						setTimeout(() => {
							this.message = this.$t('activationEnvoyee')
						}, 100)
					} else if (donnees === 'compte_cree') {
						window.location.href = '/u/' + identifiant
					}
				}).catch((err) => {
					this.chargement = false
					if (err.response?.status === 429) {
						this.message = this.$t('erreurTentativesNombreuses')
					} else if (err.response?.data === 'utilisateur_existe_deja') {
						this.message = this.$t('identifiantExisteDeja', { identifiant: identifiant })
					} else if (err.response?.data === 'email_existe_deja') {
						this.message = this.$t('emailExisteDeja', { email: email })
					} else if (err.response?.data === 'motdepasse_trop_court') {
						this.message = this.$t('motDePasseTropCourt')
					} else if (err.response?.data === 'identifiant_invalide') {
						this.message = this.$t('identifiantNonConforme')
					} else if (err.response?.data === 'email_invalide') {
						this.message = this.$t('erreurEmail')
					} else if (err.response?.data === 'erreur_email') {
						this.message = this.$t('erreurEnvoiEmail')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			} else if (identifiant === '' || motdepasse === '' || this.confirmationMotDePasse.trim() === '' || email === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.verifierIdentifiant(identifiant) === false) {
				this.message = this.$t('identifiantNonConforme')
			} else if (motdepasse !== this.confirmationMotDePasse.trim()) {
				this.message = this.$t('motsDePassePasIdentiques')
			} else if (this.$verifierEmail(email) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		verifierIdentifiant (identifiant) {
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
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		envoyerMotDePasse () {
			if (this.identifiant.trim() !== '' && this.email.trim() !== '' && this.$verifierEmail(this.email.trim()) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/mot-de-passe-oublie', {
					identifiant: this.identifiant.trim(),
					email: this.email.trim()
				}).then(() => {
					this.chargement = false
					this.fermerModaleMotDePasseOublie()
					setTimeout(() => {
						this.message = this.$t('emailEnvoye')
					}, 100)
				}).catch((err) => {
					this.chargement = false
					if (err.response?.status === 429) {
						this.message = this.$t('erreurTentativesNombreuses')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
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
		afficherModaleIdentifiantOublie () {
			this.email = ''
			this.modale = 'identifiant-oublie'
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		envoyerIdentifiant () {
			if (this.email.trim() !== '' && this.$verifierEmail(this.email.trim()) === true) {
				this.chargement = true
				axios.post(this.hote + '/api/identifiant-oublie', {
					email: this.email.trim()
				}).then(() => {
					this.chargement = false
					this.fermerModaleIdentifiantOublie()
					setTimeout(() => {
						this.message = this.$t('identifiantEnvoye')
					}, 100)
				}).catch((err) => {
					this.chargement = false
					if (err.response?.status === 429) {
						this.message = this.$t('erreurTentativesNombreuses')
					} else {
						this.message = this.definirMessageErreur(err)
					}
				})
			} else if (this.email.trim() === '') {
				this.message = this.$t('remplirChamps')
			} else if (this.$verifierEmail(this.email.trim()) === false) {
				this.message = this.$t('erreurEmail')
			}
		},
		fermerModaleIdentifiantOublie () {
			this.modale = ''
			this.email = ''
			this.gererFocus()
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
		ouvrirHub () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.hub = true
			this.$nextTick(() => {
				document.querySelector('#hub button')?.focus()
			})
		},
		gererMessageHub (event) {
			if (event.origin !== 'https://ladigitale.dev') return
			if (typeof event.data !== 'object' || event.data === null) return
			if (event.data.message === 'fermer-hub') {
				this.fermerHub()
			}
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
		gererClavier (event) {
			if (event.key === 'Escape' && this.message !== '') {
				this.fermerMessage()
			} else if (event.key === 'Escape' && this.modale === 'creer') {
				this.fermerModaleCreer()
			} else if (event.key === 'Escape' && this.modale === 'connexion') {
				this.fermerModaleConnexion()
			} else if (event.key === 'Escape' && this.modale === 'mot-de-passe-oublie') {
				this.fermerModaleMotDePasseOublie()
			} else if (event.key === 'Escape' && this.modale === 'identifiant-oublie') {
				this.fermerModaleIdentifiantOublie()
			} else if (event.key === 'Escape' && this.modale === 'inscription') {
				this.fermerModaleInscription()
			} else if (event.key === 'Escape' && this.hub) {
				this.hub = false
				this.gererFocus()
			} else if (event.key === 'Tab') {
				if (this.message !== '') {
					const modale = document.querySelector('#message')
					this.piegerFocus(event, modale)
				} else if (this.modale !== '') {
					const modale = document.querySelector('.modale')
					this.piegerFocus(event, modale)
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

#langues button {
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

#langues button.selectionne {
    background: #1F7A70;
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
    font-family: 'Figtree', sans-serif;
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
    border: 2px solid #1F7A70;
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

#credits p:last-child > span:first-child {
	margin-left: 5px;
}

#credits p:last-child a.doc,
#credits .hub {
	display: inline-flex;
	font-size: 0;
	line-height: 0;
}

#credits p:last-child a.doc {
	margin: 0 3px;
}

#credits .hub {
	margin-left: 3px;
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

#hub button {
	font-size: 0;
	color: #fff;
	position: absolute;
	top: 15px;
	right: 15px;
	cursor: pointer;
}

#motdepasse-oublie #champ-email,
#connexion .conteneur-motdepasse {
	margin-bottom: 10px;
}

.modale .contenu .mot-de-passe-oublie,
.modale .contenu .identifiant-oublie {
	font-size: 12px;
	cursor: pointer;
	background: none;
	border: none;
	padding: 0;
	display: block;
	width: 100%;
	text-align: left;
	font-family: inherit;
	color: inherit;
}

.modale .contenu .mot-de-passe-oublie {
	margin-bottom: 4px;
}

.modale .contenu .identifiant-oublie {
	margin-bottom: 20px;
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

	#hub button {
		top: 5px;
		right: 5px;
	}

	#hub button svg {
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
