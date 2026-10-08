// Charger strings langues
import t from './lang.js'

function genererHTML (pad, blocs, langue) {
	return `
	<!DOCTYPE html>
	<html lang="` + langue + `">
		<head>
			<meta charset="utf-8">
			<meta name="viewport" content="width=device-width, height=device-height, viewport-fit=cover, initial-scale=1.0, minimum-scale=1.0, maximum-scale=5.0, user-scalable=yes">
			<meta name="description" content="Digipad permet de créer des murs multimédias collaboratifs.">
			<meta name="robots" content="index, nofollow">
			<meta name="theme-color" content="#00ced1">
			<meta property="og:title" content="Digipad by La Digitale">
			<meta property="og:description" content="Digipad permet de créer des murs multimédias collaboratifs.">
			<meta property="og:type" content="website">
			<meta property="og:locale" content="fr_FR">
			<title>Digipad by La Digitale</title>
			<link rel="icon" type="image/png" href="./static/img/favicon.png">
			<link rel="stylesheet" href="./static/css/destyle.css">
			<link rel="stylesheet" href="./static/css/main.css">
			<link rel="stylesheet" href="./static/css/pad.css">
			<link rel="stylesheet" href="./static/css/jspanel.css">
			<script src="./static/js/vue.js" type="text/javascript"></script>
			<script src="./static/js/vue-masonry-css.js" type="text/javascript"></script>
			<script src="./static/js/jspanel.js" type="text/javascript"></script>
		</head>
		<body>
			<noscript>
				<strong>Veuillez activer Javascript dans votre navigateur pour afficher ce contenu.</strong>
			</noscript>
			<div id="app">
				<main id="page" :class="pad.affichage">
					<header v-if="!chargement">
						<span id="titre">{{ pad.titre }}</span>
					</header>

					<div id="pad" :class="{'fond-personnalise': pad.fond.substring(0, 1) !== '#' && !pad.fond.includes('/img/') && (!pad.hasOwnProperty('fondRepete') || pad.fondRepete === 'desactive'), 'fond-personnalise-repete': pad.fond.substring(0, 1) !== '#' && !pad.fond.includes('/img/') && pad.hasOwnProperty('fondRepete') && pad.fondRepete === 'active'}" :style="definirFond(pad.fond)" v-if="!chargement">
						<!-- Affichage mur -->
						<masonry id="blocs" class="mur" :cols="definirLargeurCapsules()" :gutter="0" v-if="pad.affichage === 'mur'">
							<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
								<div class="contenu">
									<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
										<span>{{ item.titre }}</span>
									</div>
									<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
									<div class="media" v-if="item.media !== ''">
										<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-if="item.type === 'image'" @click="afficherVisionneuse(item)"><img :src="'./fichiers/' + item.media" :alt="definirTexteAlternatif(item)"></button>
										<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'lien-image'" @click="afficherVisionneuse(item)"><img :src="item.media" :alt="definirTexteAlternatif(item)"></button>
										<button type="button" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'embed'" @click="afficherVisionneuse(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
										<button type="button" :disabled="disabled" title="` + t[langue].ouvrirDocumentNouvelOnglet + '" aria-label="' + t[langue].ouvrirDocumentNouvelOnglet + `" v-else-if="item.type === 'document' || item.type === 'pdf' || item.type === 'office'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
										<a :href="item.media" title="` + t[langue].ouvrirLienNouvelOnglet + '" aria-label="' + t[langue].ouvrirLienNouvelOnglet + `" target="_blank" v-else-if="item.type === 'lien'"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
										<a :href="'./fichiers/' + item.media" title="` + t[langue].telecharger + '" aria-label="' + t[langue].telecharger + `" download v-else><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
									</div>
									<div class="etiquettes" v-if="pad.etiquettes === 'activees' && item.etiquettes && item.etiquettes.length > 0">
										<span class="etiquette" v-for="(etiquette, indexEtiquette) in item.etiquettes" :style="{'background': eclaircirCouleur(etiquette.couleur), 'border-color': etiquette.couleur, 'color': etiquette.couleur}" :key="'etiquette_' + indexEtiquette">{{ etiquette.nom }}</span>
									</div>
									<div class="evaluation" v-if="pad.evaluations === 'activees' && definirEvaluationCapsule(item.listeEvaluations) > 0">
										<span class="etoiles" :title="definirEtoiles(item.listeEvaluations)">
											<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
											<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
											<span>({{ item.listeEvaluations.length }})</span>
										</span>
									</div>
									<div class="action" :style="{'color': item.couleur}">
										<button type="button" :disabled="disabled" title="` + t[langue].afficherCommentaires + '" aria-label="' + t[langue].afficherCommentaires + `" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives' && item.commentaires > 0"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></button>
										<button type="button" :disabled="disabled" title="` + t[langue].informationsCapsule + '" aria-label="' + t[langue].informationsCapsule + `" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></button>
										<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
									</div>
								</div>
							</div>
						</masonry>
						<!-- Affichage flux vertical -->
						<div id="blocs" class="flux-vertical" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-else-if="pad.affichage === 'flux-vertical'">
							<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in blocs" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
								<div class="contenu">
									<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
										<span>{{ item.titre }}</span>
									</div>
									<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
									<div class="media" v-if="item.media !== ''">
										<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-if="item.type === 'image'" @click="afficherVisionneuse(item)"><img :src="'./fichiers/' + item.media" :alt="definirTexteAlternatif(item)"></button>
										<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'lien-image'" @click="afficherVisionneuse(item)"><img :src="item.media" :alt="definirTexteAlternatif(item)"></button>
										<button type="button" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'embed'" @click="afficherVisionneuse(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
										<button type="button" :disabled="disabled" title="` + t[langue].ouvrirDocumentNouvelOnglet + '" aria-label="' + t[langue].ouvrirDocumentNouvelOnglet + `" v-else-if="item.type === 'document' || item.type === 'pdf' || item.type === 'office'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
										<a :href="item.media" target="_blank" title="` + t[langue].ouvrirLienNouvelOnglet + '" aria-label="' + t[langue].ouvrirLienNouvelOnglet + `" v-else-if="item.type === 'lien'"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
										<a :href="'./fichiers/' + item.media" title="` + t[langue].telecharger + '" aria-label="' + t[langue].telecharger + `" download v-else><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
									</div>
									<div class="etiquettes" v-if="pad.etiquettes === 'activees' && item.etiquettes && item.etiquettes.length > 0">
										<span class="etiquette" v-for="(etiquette, indexEtiquette) in item.etiquettes" :style="{'background': eclaircirCouleur(etiquette.couleur), 'border-color': etiquette.couleur, 'color': etiquette.couleur}" :key="'etiquette_' + indexEtiquette">{{ etiquette.nom }}</span>
									</div>
									<div class="evaluation" v-if="pad.evaluations === 'activees' && definirEvaluationCapsule(item.listeEvaluations) > 0">
										<span class="etoiles" :title="definirEtoiles(item.listeEvaluations)">
											<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
											<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
											<span>({{ item.listeEvaluations.length }})</span>
										</span>
									</div>
									<div class="action" :style="{'color': item.couleur}">
										<button type="button" :disabled="disabled" title="` + t[langue].afficherCommentaires + '" aria-label="' + t[langue].afficherCommentaires + `" class="bouton" @click="ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives' && item.commentaires > 0"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></button>
										<button type="button" :disabled="disabled" title="` + t[langue].informationsCapsule + '" aria-label="' + t[langue].informationsCapsule + `" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></button>
										<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
									</div>
								</div>
							</div>
						</div>
						<!-- Affichage colonne -->
						<div id="blocs" class="colonnes" v-else-if="pad.affichage === 'colonnes'">
							<section :id="'colonne' + indexCol" class="colonne" :class="{'large': pad.hasOwnProperty('largeur') && pad.largeur === 'large'}" v-for="(col, indexCol) in pad.colonnes" :key="'colonne' + indexCol">
								<div class="bloc haut">
									<div class="titre-colonne">
										<span>{{ col }}</span>
									</div>
								</div>
								<div class="conteneur-colonne ascenseur" v-if="colonnes[indexCol].length > 0">
									<div :id="item.bloc" class="bloc" v-for="(item, indexItem) in colonnes[indexCol]" :style="{'border-color': item.couleur}" :data-bloc="item.bloc" :key="'bloc' + indexItem">
										<div class="contenu">
											<div class="titre" v-if="item.titre !== ''" :style="{'background': eclaircirCouleur(item.couleur)}">
												<span>{{ item.titre }}</span>
											</div>
											<div class="texte" v-if="item.texte !== ''" v-html="item.texte"></div>
											<div class="media" v-if="item.media !== ''">
												<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-if="item.type === 'image'" @click="afficherVisionneuse(item)"><img :src="'./fichiers/' + item.media" :alt="definirTexteAlternatif(item)"></button>
												<button type="button" class="bouton-image" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'lien-image'" @click="afficherVisionneuse(item)"><img :src="item.media" :alt="definirTexteAlternatif(item)"></button>
												<button type="button" :disabled="disabled" title="` + t[langue].afficherDansVisionneuse + '" aria-label="' + t[langue].afficherDansVisionneuse + `" v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'embed'" @click="afficherVisionneuse(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
												<button type="button" :disabled="disabled" title="` + t[langue].ouvrirDocumentNouvelOnglet + '" aria-label="' + t[langue].ouvrirDocumentNouvelOnglet + `" v-else-if="item.type === 'document' || item.type === 'pdf' || item.type === 'office'" @click="afficherMedia(item)"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></button>
												<a :href="item.media" target="_blank" title="` + t[langue].ouvrirLienNouvelOnglet + '" aria-label="' + t[langue].ouvrirLienNouvelOnglet + `" v-else-if="item.type === 'lien'"><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
												<a :href="'./fichiers/' + item.media" title="` + t[langue].telecharger + '" aria-label="' + t[langue].telecharger + `" download v-else><img :class="{'vignette': definirVignette(item).substring(0, 9) !== './static/'}" :src="definirVignette(item)"></a>
											</div>
											<div class="etiquettes" v-if="pad.etiquettes === 'activees' && item.etiquettes && item.etiquettes.length > 0">
												<span class="etiquette" v-for="(etiquette, indexEtiquette) in item.etiquettes" :style="{'background': eclaircirCouleur(etiquette.couleur), 'border-color': etiquette.couleur, 'color': etiquette.couleur}" :key="'etiquette_' + indexEtiquette">{{ etiquette.nom }}</span>
											</div>
											<div class="evaluation" v-if="pad.evaluations === 'activees' && definirEvaluationCapsule(item.listeEvaluations) > 0">
												<span class="etoiles" :title="definirEtoiles(item.listeEvaluations)">
													<i class="material-icons" aria-hidden="true" v-for="etoile in definirEvaluationCapsule(item.listeEvaluations)" :key="'etoilepleine_' + etoile">star</i>
													<i class="material-icons" aria-hidden="true" v-for="etoile in (5 - definirEvaluationCapsule(item.listeEvaluations))" :key="'etoilevide_' + etoile">star_outline</i>
													<span>({{ item.listeEvaluations.length }})</span>
												</span>
											</div>
											<div class="action" :style="{'color': item.couleur}">
												<button type="button" :disabled="disabled" title="` + t[langue].afficherCommentaires + '" aria-label="' + t[langue].afficherCommentaires + `" class="bouton" @click="ouvrirModaleCommentaires(item.bloc)" v-if="pad.commentaires === 'actives' && item.commentaires > 0"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></button>
												<button type="button" :disabled="disabled" title="` + t[langue].informationsCapsule + '" aria-label="' + t[langue].informationsCapsule + `" class="bouton info" :data-description="item.info"><i class="material-icons" aria-hidden="true">info</i></button>
												<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ definirIconeMedia(item) }}</i></span>
											</div>
										</div>
									</div>
								</div>
							</section>
						</div>
					</div>

					<div class="conteneur-modale" v-if="modaleCommentaires">
						<div id="discussion" class="modale" role="dialog" aria-modal="true" :aria-label="titre">
							<div class="en-tete">
								<span class="titre">{{ titre }}</span>
								<button type="button" title="` + t[langue].fermer + '" aria-label="' + t[langue].fermer + `" class="fermer" @click="fermerModaleCommentaires"><i class="material-icons" aria-hidden="true">close</i></span>
							</div>
							<ul class="commentaires ascenseur">
								<li v-for="(entreeCommentaire, indexEntreeCommentaire) in commentaires" :key="indexEntreeCommentaire">
									<span class="meta">// {{ noms[entreeCommentaire.identifiant] }}</span>
									<div class="texte" v-html="entreeCommentaire.texte"></div>
								</li>
							</ul>
						</div>
					</div>
					
					<div id="conteneur-chargement" v-if="chargement">
						<div id="chargement">
							<div class="spinner">
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
								<div></div>
							</div>
						</div>
					</div>

					<div id="masque"></div>
				</main>
			</div>
			
			<script type="text/javascript">
				var vm = new Vue({
					el: '#app',
					data: {
						chargement: true,
						modaleCommentaires: false,
						pad: ` + JSON.stringify(pad).replace(/<\//g, '<\\/') + `,
						blocs: ` + JSON.stringify(blocs).replace(/<\//g, '<\\/') + `,
						colonnes: [],
						commentaires: [],
						panneaux: [],
						noms: {},
						nom: '',
						titre: '',
						defilement: false,
						depart: 0,
						distance: 0,
						elementPrecedent: null
					},
					computed: {
						disabled () {
							return this.modaleCommentaires ? true : false
						}
					},
					created () {
						if (this.pad.ordre === 'decroissant') {
							this.blocs.reverse()
						}
						if (this.pad.affichage === 'colonnes') {
							this.definirColonnes(this.blocs)
						}
					},
					mounted () {
						this.nom = this.genererPseudo()
						const noms = {}
						this.blocs.forEach((bloc) => {
							if (bloc.hasOwnProperty('couleur') === false || bloc.couleur === null || typeof bloc.couleur !== 'string') {
								bloc.couleur = '#242f3d'
							}
							if (noms.hasOwnProperty(bloc.identifiant) === false) {
								noms[bloc.identifiant] = bloc.nom
							}
							bloc.listeCommentaires.forEach((commentaire) => {
								if (noms.hasOwnProperty(commentaire.identifiant) === false) {
									noms[commentaire.identifiant] = this.genererPseudo()
								}
							})
						})
						this.noms = noms
						document.title = this.pad.titre + ' - Digipad by La Digitale'
						this.chargement = false
						if (this.pad.affichage === 'colonnes') {
							this.$nextTick(() => {
								this.activerDefilementHorizontal()
							})
						}
						document.addEventListener('keydown', this.gererClavier, false)
					},
					beforeDestroy () {
						this.desactiverDefilementHorizontal()
						document.removeEventListener('keydown', this.gererClavier, false)
					},
					methods: {
						ouvrirModaleCommentaires (bloc) {
							let commentaires = []
							let titre = ''
							this.blocs.forEach((item) => {
								if (item.bloc === bloc) {
									commentaires = item.listeCommentaires
									titre = item.titre
								}
							})
							if (commentaires.length > 0) {
								this.elementPrecedent = (document.activeElement || document.body)
								this.commentaires = commentaires
								this.titre = titre
								this.modaleCommentaires = true
								this.$nextTick(() => {
									document.querySelector('.modale .fermer')?.focus()
								})
							}
						},
						fermerModaleCommentaires () {
							this.modaleCommentaires = false
							this.commentaires = []
							this.titre = ''
							this.gererFocus()
						},
						gererFocus () {
							this.$nextTick(() => {
								if (this.elementPrecedent) {
									this.elementPrecedent.focus()
									this.elementPrecedent = null
								}
							})
						},
						definirFond (fond) {
							if (fond.substring(0, 1) === '#') {
								return { backgroundColor: fond }
							} else if (fond.includes('/img/')) {
								return { backgroundImage: 'url(./static/' + fond + ')' }
							} else {
								return { backgroundImage: 'url(./fichiers/' + fond.split('/').pop() + ')' }
							}
						},
						definirLargeurCapsules () {
							switch (this.pad.largeur) {
								case 'large':
									return { default: 4, 1729: 4, 1449: 3, 1365: 2, 899: 2, 499: 1 }
								default:
									return { default: 5, 1729: 5, 1449: 4, 1365: 3, 899: 2, 499: 1 }
							}
						},
						definirColonnes (blocs) {
							const colonnes = []
							if (this.pad.colonnes && JSON.parse(this.pad.colonnes).length > 0) {
								this.pad.colonnes = JSON.parse(this.pad.colonnes)
								this.pad.colonnes.forEach(() => {
									colonnes.push([])
								})
								blocs.forEach((bloc, index) => {
									if (bloc.colonne !== undefined) {
										colonnes[parseInt(bloc.colonne, 10)].push(bloc)
									} else {
										blocs[index].colonne = 0
										colonnes[bloc.colonne].push(bloc)
									}
								})
							} else {
								this.pad.colonnes.push('Colonne sans titre')
								colonnes.push([])
								blocs.forEach((bloc, index) => {
									blocs[index].colonne = 0
									colonnes[0].push(bloc)
								})
							}
							this.blocs = blocs
							this.colonnes = colonnes
						},
						afficherMedia (item) {
							let lien
							if (this.verifierURL(item.media) === true) {
								lien = item.media
							} else {
								lien = './fichiers/' + item.media
							}
							window.open(lien, '_blank')
						},
						echapperAttribut (texte) {
							return String(texte).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
						},
						definirTexteAlternatif (item) {
							if (item && typeof item.alt === 'string') {
								return item.alt
							}
							return ''
						},
						definirVignette (item) {
							let vignette
							if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && String(item.vignette).includes('/img/')) {
								vignette = './static/img/' + item.vignette.split('/').pop()
							} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === false && !String(item.vignette).includes('/img/')) {
								vignette = './fichiers/' + item.vignette.split('/').pop()
							} else if (item.vignette && item.vignette !== '' && this.verifierURL(item.vignette) === true) {
								vignette = item.vignette
							}
							return vignette
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
								case 'embed':
									if (item.source === 'youtube' || item.source === 'vimeo' || item.source === 'dailymotion' || item.source === 'digiview') {
										icone = 'movie'
									} else if (item.source === 'slideshare' || item.media.includes('wikipedia.org') || item.media.includes('drive.google.com') || item.media.includes('docs.google.com')) {
										icone = 'description'
									} else if (item.source === 'flickr') {
										icone = 'image'
									} else if (item.source === 'soundcloud' || item.media.includes('vocaroo.com') || item.media.includes('voca.ro')) {
										icone = 'volume_up'
									} else if (item.media.includes('google.com/maps')) {
										icone = 'place'
									} else if (item.source === 'etherpad' || item.media.includes('framapad.org')) {
										icone = 'group_work'
									} else {
										icone = 'web'
									}
									break
								default:
									icone = 'save_alt'
									break
							}
							return icone
						},
						afficherVisionneuse (item) {
							if (this.panneaux.map((e) => { return e.id }).includes('panneau_' + item.bloc) === false) {
								this.elementPrecedent = (document.activeElement || document.body)
								const imageId = 'image-' + Date.now()
								let html = ''
								switch (item.type) {
									case 'image':
										html = '<span id="' + imageId + '" class="image"><img src="./fichiers/' + item.media + '" alt="' + this.echapperAttribut(this.definirTexteAlternatif(item)) + '"></span>'
										break
									case 'lien-image':
										html = '<span id="' + imageId + '" class="image"><img src="' + item.media + '" alt="' + this.echapperAttribut(this.definirTexteAlternatif(item)) + '"></span>'
										break
									case 'audio':
										html = '<audio controls preload="metadata" src="./fichiers/' + item.media + '"></audio>'
										break
									case 'video':
										html = '<video controls playsinline crossOrigin="anonymous" src="./fichiers/' + item.media + '"></video>'
										break
									case 'embed':
										if (item.source === 'etherpad') {
											html = '<iframe src="' + item.media + '?userName=' + this.nom + '" allowfullscreen></iframe>'
										} else if (this.verifierURL(item.iframe) === true) {
											html = '<iframe src="' + item.iframe + '" allowfullscreen></iframe>'
										} else {
											html = '<div class="html">' + item.iframe + '</div>'
										}
										break
								}
								this.$nextTick(() => {
									let largeurPanneau = '320px'
									let hauteurPanneau = '312px'
									let position = 'center'
									if (document.querySelector('#page').offsetWidth > 1023) {
										largeurPanneau = '948px'
										hauteurPanneau = '940px'
										position = { my: 'center', at: 'center', offsetX: 0, offsetY: this.convertirRem(2) }
									} else if (document.querySelector('#page').offsetWidth < 1024 && document.querySelector('#page').offsetWidth > 359) {
										largeurPanneau = document.querySelector('#page').offsetWidth - this.convertirRem(3) + 'px'
										hauteurPanneau = '500px'
										if (parseInt(largeurPanneau, 10) < 328) {
											largeurPanneau = '328px'
										}
										position = { my: 'center', at: 'center', offsetX: 0, offsetY: this.convertirRem(2) }
									}
									if (parseInt(hauteurPanneau, 10) > document.querySelector('#page').offsetHeight - this.convertirRem(7)) {
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
										headerTitle: this.echapperAttribut(item.titre),
										position: 'center',
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
											} else if (item.type === 'audio') {
												panel.resize({
													width: largeurPanneau,
													height: '150px'
												}).reposition()
											}
											if (panel.querySelector('.jsPanel-btn-smallify')) {
												panel.querySelector('.jsPanel-btn-smallify').title = '` + t[langue].plier + `'
												panel.querySelector('.jsPanel-btn-smallify').ariaLabel = '` + t[langue].plier + `'
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
												panel.querySelector('.jsPanel-btn-normalize').title = '` + t[langue].normaliser + `'
												panel.querySelector('.jsPanel-btn-normalize').ariaLabel = '` + t[langue].normaliser + `'
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
												panel.querySelector('.jsPanel-btn-maximize').title = '` + t[langue].maximiser + `'
												panel.querySelector('.jsPanel-btn-maximize').ariaLabel = '` + t[langue].maximiser + `'
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
												panel.querySelector('.jsPanel-btn-close').title = '` + t[langue].fermer + `'
												panel.querySelector('.jsPanel-btn-close').ariaLabel = '` + t[langue].fermer + `'
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
											const panneaux = document.querySelectorAll('.jsPanel')
											if (document.querySelector('#masque') && panneaux.length === 1) {
												document.querySelector('#masque').classList.remove('ouvert')
											}
											const indexPanneau = this.panneaux.findIndex(panneau => panneau.id === panel.id)
											if (indexPanneau !== -1) {
												this.panneaux.splice(indexPanneau, 1)
											}
											if (this.panneaux.length === 0) {
												this.gererFocus()
											} else {
												this.$nextTick(() => {
													const id = this.panneaux[this.panneaux.length - 1].id
													if (id) {
														this.elementPrecedent = document.querySelector('#' + id.replace('panneau_', '') + ' .media')?.firstElementChild || document.body
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
						convertirRem (rem) {
							return rem * parseFloat(getComputedStyle(document.documentElement).fontSize)
						},
						definirEtoiles (evaluations) {
							const etoiles = this.definirEvaluationCapsule(evaluations) > 1 ? this.definirEvaluationCapsule(evaluations) + ' ` + t[langue].etoiles + '\' : this.definirEvaluationCapsule(evaluations) + \' ' + t[langue].etoile + `'
							return etoiles + ' - ' + evaluations.length + ' ` + t[langue].evaluations + `'
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
						verifierURL (lien) {
							let url
							try {
								url = new URL(lien)
							} catch {
								return false
							}
							return url.protocol === 'http:' || url.protocol === 'https:'
						},
						genererPseudo () {
							const caracteres = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
							const nom = caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + caracteres.charAt(Math.floor(Math.random() * caracteres.length)) + Math.floor(Math.random() * (9999 - 1000) + 1000)
							return nom
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
							if (!this.defilement) return
							event.preventDefault()
							const pad = document.querySelector('#pad')
							const x = event.pageX - pad.offsetLeft
							const delta = (x - this.depart) * 1.5
							pad.scrollLeft = this.distance - delta
						},
						gererClavier (event) {
							if (event.key === 'Escape' && this.modaleCommentaires) {
								this.fermerModaleCommentaires()
							} else if (event.key === 'Tab') {
								if (this.modaleCommentaires) {
									const modale = document.querySelector('.modale')
									this.piegerFocus(event, modale)
								} else if (this.panneaux.length > 0) {
									const panneau = event.target.closest('.jsPanel') || document.body.querySelectorAll('.jsPanel')[0]
									if (panneau) {
										this.piegerFocus(event, panneau)
									}
								}
							}
						},
						piegerFocus (event, conteneur) {
							if (!conteneur) return
							const isVisible = el => el.offsetWidth || el.offsetHeight || el.getClientRects().length
							const focusables = Array.from(conteneur.querySelectorAll('a[href], button, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.tabIndex >= 0 && isVisible(el))
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
				})
			</script>
		</body>
	</html>`
}
	
export default genererHTML
