<template>
	<div class="contenu">
		<div class="titre" role="heading" :aria-level="pad.affichage === 'colonnes' ? 3 : 2" v-if="item.titre !== ''" :style="{'background': couleurEclaircie}">
			<span>{{ item.titre }}</span>
			<i class="material-icons" aria-hidden="true" v-if="action === 'organiser'">drag_indicator</i>
		</div>
		<span class="lecteur-ecran" :id="'statut-' + item.bloc" aria-hidden="true" v-if="statutCapsule !== ''">{{ statutCapsule }}</span>
		<span class="lecteur-ecran" :id="'action-' + item.bloc" aria-hidden="true" v-if="item.media && action !== 'organiser'">{{ actionMedia }}</span>
		<span class="lecteur-ecran" :id="'description-' + item.bloc" aria-hidden="true">{{ description }}</span>
		<div class="texte" v-if="item.texte" v-html="item.texte" />
		<div class="media" v-if="item.media && action !== 'organiser'">
			<button type="button" class="bouton-image" :title="libelleMedia" :aria-label="libelleMedia" v-if="item.type === 'image'" @click="parent.afficherVisionneuse(item)"><img :src="parent.stockage === 's3' && item.mediaUrl ? item.mediaUrl : cheminFichiers + '/' + pad.id + '/' + item.media" loading="lazy" alt="" @error="parent.rafraichirUrlFichier(item, 'media')"></button>
			<button type="button" class="bouton-image" :title="libelleMedia" :aria-label="libelleMedia" v-else-if="item.type === 'lien-image'" @click="parent.afficherVisionneuse(item)"><img :src="item.media" loading="lazy" alt=""></button>
			<button type="button" :title="libelleMedia" :aria-label="libelleMedia" v-else-if="item.type === 'audio' || item.type === 'video' || (item.type === 'document' && visionneuse !== '') || item.type === 'pdf' || (item.type === 'office' && visionneuse !== '') || item.type === 'embed'" @click="parent.afficherVisionneuse(item)"><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" alt="" loading="lazy" @error="parent.rafraichirUrlFichier(item, 'vignette')"></button>
			<a :href="item.media" target="_blank" :title="libelleMedia" :aria-label="libelleMedia" v-else-if="item.type === 'lien'"><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" alt="" loading="lazy" @error="parent.rafraichirUrlFichier(item, 'vignette')"></a>
			<a :href="lienTelechargement" :title="libelleMedia" :aria-label="libelleMedia" download v-else @click="parent.telechargerFichier($event, pad.id, item)"><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" alt="" loading="lazy" @error="parent.rafraichirUrlFichier(item, 'vignette')"></a>
		</div>
		<div class="media" v-else-if="item.media && action === 'organiser'">
			<img v-if="item.type === 'image'" :src="parent.stockage === 's3' && item.mediaUrl ? item.mediaUrl : cheminFichiers + '/' + pad.id + '/' + item.media" loading="lazy" :alt="texteAlternatif" @error="parent.rafraichirUrlFichier(item, 'media')">
			<img v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="texteAlternatif">
			<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'"><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" loading="lazy" :alt="nomMedia" @error="parent.rafraichirUrlFichier(item, 'vignette')"></span>
			<span v-else-if="item.type === 'lien'"><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" loading="lazy" :alt="nomMedia" @error="parent.rafraichirUrlFichier(item, 'vignette')"></span>
			<span v-else><img :class="{'vignette': vignette.substring(0, 5) !== '/img/'}" :src="vignette" loading="lazy" :alt="nomMedia" @error="parent.rafraichirUrlFichier(item, 'vignette')"></span>
		</div>
		<div class="etiquettes" v-if="pad.etiquettes === 'activees' && item.etiquettes && item.etiquettes.length > 0">
			<span class="etiquette" v-for="(etiquette, indexEtiquette) in item.etiquettes" :style="{'background': parent.eclaircirCouleur(etiquette.couleur), 'border-color': etiquette.couleur, 'color': etiquette.couleur}" :key="'etiquette_' + indexEtiquette">{{ etiquette.nom }}</span>
		</div>
		<div class="evaluation" v-if="pad.evaluations === 'activees' && item.evaluations && parent.evaluationsVisibles">
			<span class="etoiles" role="img" :title="definirEtoiles(item.evaluations)" :aria-label="definirEtoiles(item.evaluations)">
				<i class="material-icons" aria-hidden="true" :class="{'evalue': capsuleEvalueeParUtilisateur === true}" v-for="etoile in evaluationCapsule" :key="'etoilepleine_' + etoile">star</i>
				<i class="material-icons" aria-hidden="true" :class="{'evalue': capsuleEvalueeParUtilisateur === true}" v-for="etoile in Math.max(0, 5 - evaluationCapsule)" :key="'etoilevide_' + etoile">star_outline</i>
				<span>({{ item.evaluations.length }})</span>
			</span>
			<div class="actions-evaluation">
				<button type="button" class="bouton" :disabled="disabled" :title="$t('libelleCible', { action: $t('evaluerCapsule'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('evaluerCapsule'), cible: titreCapsule })" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" v-if="capsuleEvalueeParUtilisateur === false && action !== 'organiser' && parent.evaluationsAutorisees"><i class="material-icons" aria-hidden="true">add_comment</i></button>
				<button type="button" class="bouton" :disabled="disabled" :title="$t('libelleCible', { action: $t('evaluerCapsule'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('evaluerCapsule'), cible: titreCapsule })" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" v-else-if="capsuleEvalueeParUtilisateur === true && action !== 'organiser'"><i class="material-icons" aria-hidden="true">rate_review</i></button>
				<button type="button" class="bouton" :disabled="disabled" :title="$t('libelleCible', { action: $t('listeEvaluations'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('listeEvaluations'), cible: titreCapsule })" @click="parent.ouvrirModaleListeEvaluations(item.bloc)" v-if="admin && action !== 'organiser'"><i class="material-icons" aria-hidden="true">format_list_bulleted</i></button>
			</div>
		</div>
		<div class="action" :style="{'color': item.couleur}">
			<button type="button" class="bouton" :disabled="disabled" :title="$t('libelleCible', { action: $t('commenterCapsule'), cible: titreCapsule }) + ', ' + $t('libelleCible', { action: $t('commentaires'), cible: item.commentaires })" :aria-label="$t('libelleCible', { action: $t('commenterCapsule'), cible: titreCapsule }) + ', ' + $t('libelleCible', { action: $t('commentaires'), cible: item.commentaires })" @click="parent.ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives' && parent.commentairesVisibles"><i class="material-icons" aria-hidden="true">comment</i><span class="badge" aria-hidden="true">{{ item.commentaires }}</span></button>
			<button type="button" class="bouton info" :disabled="disabled" :title="$t('libelleCible', { action: $t('informationsCapsule'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('informationsCapsule'), cible: titreCapsule })" :aria-describedby="'description-' + item.bloc" :data-description="description"><i class="material-icons" aria-hidden="true">info</i></button>
			<template v-if="action === 'organiser'">
				<button type="button" class="bouton deplacer" data-direction="avant" :disabled="disabled || !parent.verifierDeplacementBloc(item, 'avant')" :title="$t('libelleCible', { action: $t('deplacerAvant'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('deplacerAvant'), cible: titreCapsule })" @click="parent.deplacerBlocPosition(item, 'avant', true)"><i class="material-icons" aria-hidden="true">{{ pad.affichage === 'mur' ? 'arrow_back' : 'arrow_upward' }}</i></button>
				<button type="button" class="bouton deplacer" data-direction="apres" :disabled="disabled || !parent.verifierDeplacementBloc(item, 'apres')" :title="$t('libelleCible', { action: $t('deplacerApres'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('deplacerApres'), cible: titreCapsule })" @click="parent.deplacerBlocPosition(item, 'apres', true)"><i class="material-icons" aria-hidden="true">{{ pad.affichage === 'mur' ? 'arrow_forward' : 'arrow_downward' }}</i></button>
				<template v-if="pad.affichage === 'colonnes' && pad.colonnes.length > 1">
					<button type="button" class="bouton deplacer" data-direction="gauche" :disabled="disabled || !parent.verifierDeplacementBloc(item, 'gauche')" :title="$t('libelleCible', { action: $t('deplacerColonnePrecedente'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('deplacerColonnePrecedente'), cible: titreCapsule })" @click="parent.deplacerBlocPosition(item, 'gauche', true)"><i class="material-icons" aria-hidden="true">arrow_back</i></button>
					<button type="button" class="bouton deplacer" data-direction="droite" :disabled="disabled || !parent.verifierDeplacementBloc(item, 'droite')" :title="$t('libelleCible', { action: $t('deplacerColonneSuivante'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('deplacerColonneSuivante'), cible: titreCapsule })" @click="parent.deplacerBlocPosition(item, 'droite', true)"><i class="material-icons" aria-hidden="true">arrow_forward</i></button>
				</template>
			</template>
			<span class="media-type" v-if="item.media"><i class="material-icons" aria-hidden="true">{{ iconeMedia }}</i></span>
			<div class="menu-deroulant menu-deroulant-capsule" :data-menu-capsule="item.bloc" v-if="menuDisponible">
				<button type="button" class="bouton-menu" :id="'bouton-menu-capsule-' + item.bloc" :disabled="disabled" :title="$t('libelleCible', { action: $t('parametresCapsule'), cible: titreCapsule })" :aria-label="$t('libelleCible', { action: $t('parametresCapsule'), cible: titreCapsule })" aria-haspopup="true" :aria-expanded="menuOuvert" @click="parent.gererMenuCapsule(item.bloc)"><i class="material-icons" aria-hidden="true">more_vert</i></button>
				<div :id="'menu-capsule-' + item.bloc" class="contenu-menu-deroulant" role="menu" :aria-labelledby="'bouton-menu-capsule-' + item.bloc" @keydown="parent.gererClavierMenu($event, 'menu-capsule-' + item.bloc)" v-if="menuOuvert">
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.ouvrirModaleBloc('edition', item, indexCol)" v-if="modificationAutorisee"><i class="material-icons" aria-hidden="true">edit</i>{{ $t('modifierCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.dupliquerBloc(item.bloc)" v-if="duplicationAutorisee"><i class="material-icons" aria-hidden="true">content_copy</i>{{ $t('dupliquerCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.afficherEnvoyerBloc(item.bloc, item.titre)" v-if="copieAutorisee"><i class="material-icons" aria-hidden="true">send</i>{{ $t('copierCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" class="supprimer" :disabled="disabled" @click="parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" v-if="suppressionAutorisee"><i class="material-icons" aria-hidden="true">delete</i>{{ $t('supprimerCapsule') }}</button>
				</div>
			</div>
		</div>
		<div class="moderation" v-if="item.visibilite === 'privee' && admin">
			<button type="button" class="bouton" :disabled="disabled" @click="parent.autoriserBloc(item, 'privee')" :aria-label="$t('libelleCible', { action: $t('afficherCapsule'), cible: titreCapsule })">{{ $t('afficherCapsule') }}</button>
		</div>
		<div class="moderation" v-else-if="pad.contributions === 'moderees' && item.visibilite === 'masquee'">
			<button type="button" class="bouton" :disabled="disabled" @click="parent.autoriserBloc(item, 'moderee')" :aria-label="$t('libelleCible', { action: $t('validerCapsule'), cible: titreCapsule })" v-if="admin">{{ $t('validerCapsule') }}</button>
			<span class="bouton" v-else-if="item.identifiant === identifiant">{{ $t('enAttenteModeration') }}</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'DigipadCapsule',
	inject: ['parent'],
	data () {
		return {
			menuOuvert: false
		}
	},
	watch: {
		'parent.menuCapsule' (bloc) {
			this.menuOuvert = (bloc === this.item.bloc)
		},
		'item.bloc' (bloc) {
			this.menuOuvert = (this.parent.menuCapsule === bloc)
		}
	},
	props: {
		admin: Boolean,
		identifiant: String,
		item: Object,
		pad: Object,
		indexCol: Number,
		disabled: Boolean,
		action: String,
		statut: String,
		viaDigidrive: Boolean,
		visionneuse: String
	},
	computed: {
		vignette () {
			return this.parent.definirVignette(this.item)
		},
		titreCapsule () {
			return this.item.titre || this.parent.definirAriaLabelBloc(this.item)
		},
		statutCapsule () {
			if (this.item.visibilite === 'privee') {
				return this.$t('capsulePrivee')
			} else if (this.item.visibilite === 'masquee') {
				return this.$t('enAttenteModeration')
			}
			return ''
		},
		nomMedia () {
			return this.parent.definirNomMedia(this.item)
		},
		actionMedia () {
			return this.parent.definirActionMedia(this.item)
		},
		libelleMedia () {
			return this.parent.definirLibelleMedia(this.item)
		},
		description () {
			return this.parent.definirDescription(this.item)
		},
		iconeMedia () {
			return this.parent.definirIconeMedia(this.item)
		},
		texteAlternatif () {
			return this.parent.definirTexteAlternatif(this.item)
		},
		cheminFichiers () {
			return this.parent.definirCheminFichiers()
		},
		evaluationCapsule () {
			return this.parent.definirEvaluationCapsule(this.item.evaluations)
		},
		couleurEclaircie () {
			return this.parent.eclaircirCouleur(this.item.couleur)
		},
		capsuleEvalueeParUtilisateur () {
			return this.parent.verifierUtilisateurEvaluation(this.item.evaluations)
		},
		lienTelechargement () {
			return this.parent.definirLienTelechargement(this.pad.id, this.item)
		},
		modificationAutorisee () {
			return (this.item.identifiant === this.identifiant || this.admin || (this.pad.contributions === 'modifiables' && this.item.visibilite !== 'masquee' && this.item.visibilite !== 'privee')) && this.action !== 'organiser'
		},
		duplicationAutorisee () {
			return this.admin && this.action !== 'organiser'
		},
		copieAutorisee () {
			return this.admin && this.pad.copieBloc === 'activee' && (this.statut === 'utilisateur' || this.viaDigidrive) && this.action !== 'organiser'
		},
		suppressionAutorisee () {
			return (this.item.identifiant === this.identifiant || this.admin) && this.action !== 'organiser'
		},
		menuDisponible () {
			return this.modificationAutorisee || this.duplicationAutorisee || this.copieAutorisee || this.suppressionAutorisee
		}
	},
	methods: {
		definirEtoiles (evaluations) {
			if (!evaluations) return ''
			const nombreEvaluations = this.parent.definirEvaluationCapsule(evaluations)
			const etoiles = nombreEvaluations > 1 ? nombreEvaluations + ' ' + this.$t('etoiles') : nombreEvaluations + ' ' + this.$t('etoile')
			return etoiles + ' - ' + evaluations.length + ' ' + this.$t('evaluations').toLowerCase()
		}
	}
}
</script>
