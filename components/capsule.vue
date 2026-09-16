<template>
	<div class="contenu">
		<div class="titre" v-if="item.titre !== ''" :style="{'background': parent.eclaircirCouleur(item.couleur)}">
			<span>{{ item.titre }}</span>
			<i class="material-icons" aria-hidden="true" v-if="action === 'organiser'">drag_indicator</i>
		</div>
		<div class="texte" v-if="item.texte" v-html="item.texte" />
		<div class="media" v-if="item.media && action !== 'organiser'">
			<button type="button" class="bouton-image" :disabled="disabledAlt" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-if="item.type === 'image'" @click="parent.afficherVisionneuse(item)"><img :src="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" loading="lazy" :alt="parent.definirTexteAlternatif(item)"></button>
			<button type="button" class="bouton-image" :disabled="disabledAlt" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-else-if="item.type === 'lien-image'" @click="parent.afficherVisionneuse(item)"><img :src="item.media" loading="lazy" :alt="parent.definirTexteAlternatif(item)"></button>
			<button type="button" :disabled="disabledAlt" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-else-if="item.type === 'audio' || item.type === 'video' || (item.type === 'document' && visionneuse !== '') || item.type === 'pdf' || (item.type === 'office' && visionneuse !== '') || item.type === 'embed'" @click="parent.afficherVisionneuse(item)"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></button>
			<a :href="item.media" target="_blank" :title="$t('ouvrirLienNouvelOnglet')" :aria-label="$t('ouvrirLienNouvelOnglet')" v-else-if="item.type === 'lien'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></a>
			<a :href="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" :title="$t('telecharger')" :aria-label="$t('telecharger')" download v-else><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></a>
		</div>
		<div class="media" v-else-if="item.media && action === 'organiser'">
			<img v-if="item.type === 'image'" :src="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" loading="lazy" :alt="parent.definirTexteAlternatif(item)">
			<img v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="parent.definirTexteAlternatif(item)">
			<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
			<span v-else-if="item.type === 'lien'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
			<span v-else><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
		</div>
		<div class="evaluation" v-if="pad.evaluations === 'activees' && item.evaluations && parent.evaluationsVisibles">
			<span class="etoiles" :title="definirEtoiles(item.evaluations)">
				<i class="material-icons" aria-hidden="true" :class="{'evalue': parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in parent.definirEvaluationCapsule(item.evaluations)" :key="'etoilepleine_' + etoile">star</i>
				<i class="material-icons" aria-hidden="true" :class="{'evalue': parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in Math.max(0, 5 - parent.definirEvaluationCapsule(item.evaluations))" :key="'etoilevide_' + etoile">star_outline</i>
				<span>({{ item.evaluations.length }})</span>
			</span>
			<div class="actions-evaluation">
				<button type="button" class="bouton" :disabled="disabled" :title="$t('evaluerCapsule')" :aria-label="$t('evaluerCapsule')" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" v-if="parent.verifierUtilisateurEvaluation(item.evaluations) === false && action !== 'organiser' && parent.evaluationsAutorisees"><i class="material-icons" aria-hidden="true">add_comment</i></button>
				<button type="button" class="bouton" :disabled="disabled" :title="$t('evaluerCapsule')" :aria-label="$t('evaluerCapsule')" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" v-else-if="parent.verifierUtilisateurEvaluation(item.evaluations) === true && action !== 'organiser'"><i class="material-icons" aria-hidden="true">rate_review</i></button>
				<button type="button" class="bouton" :disabled="disabled" :title="$t('listeEvaluations')" :aria-label="$t('listeEvaluations')" @click="parent.ouvrirModaleListeEvaluations(item.bloc)" v-if="admin && action !== 'organiser'"><i class="material-icons" aria-hidden="true">format_list_bulleted</i></button>
			</div>
		</div>
		<div class="action" :style="{'color': item.couleur}">
			<button type="button" class="bouton" :disabled="disabled" :title="$t('commenterCapsule')" :aria-label="$t('commenterCapsule')" @click="parent.ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives' && parent.commentairesVisibles"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></button>
			<button type="button" class="bouton info" :disabled="disabled" :title="$t('informationsCapsule')" :aria-label="$t('informationsCapsule')" :data-description="parent.definirDescription(item)"><i class="material-icons" aria-hidden="true">info</i></button>
			<span class="media-type" v-if="item.media"><i class="material-icons" aria-hidden="true">{{ parent.definirIconeMedia(item) }}</i></span>
			<div class="menu-deroulant menu-deroulant-capsule" :data-menu-capsule="item.bloc" v-if="menuDisponible">
				<button type="button" class="bouton-menu" :id="'bouton-menu-capsule-' + item.bloc" :disabled="disabled" :aria-label="$t('parametresCapsule')" aria-haspopup="true" :aria-expanded="parent.menuCapsule === item.bloc" @click="parent.gererMenuCapsule(item.bloc)"><i class="material-icons" aria-hidden="true">more_vert</i></button>
				<div :id="'menu-capsule-' + item.bloc" class="contenu-menu-deroulant" role="menu" :aria-labelledby="'bouton-menu-capsule-' + item.bloc" @keydown="parent.gererClavierMenu($event, 'menu-capsule-' + item.bloc)" v-show="parent.menuCapsule === item.bloc">
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.ouvrirModaleBloc('edition', item, indexCol)" v-if="modificationAutorisee"><i class="material-icons" aria-hidden="true">edit</i>{{ $t('modifierCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.dupliquerBloc(item.bloc)" v-if="duplicationAutorisee"><i class="material-icons" aria-hidden="true">content_copy</i>{{ $t('dupliquerCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" :disabled="disabled" @click="parent.afficherEnvoyerBloc(item.bloc, item.titre)" v-if="copieAutorisee"><i class="material-icons" aria-hidden="true">send</i>{{ $t('copierCapsule') }}</button>
					<button type="button" role="menuitem" tabindex="-1" class="supprimer" :disabled="disabled" @click="parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" v-if="suppressionAutorisee"><i class="material-icons" aria-hidden="true">delete</i>{{ $t('supprimerCapsule') }}</button>
				</div>
			</div>
		</div>
		<div class="moderation" v-if="item.visibilite === 'privee' && admin">
			<button type="button" class="bouton" :disabled="disabled" @click="parent.autoriserBloc(item, 'privee')">{{ $t('afficherCapsule') }}</button>
		</div>
		<div class="moderation" v-else-if="pad.contributions === 'moderees' && item.visibilite === 'masquee'">
			<button type="button" class="bouton" :disabled="disabled" @click="parent.autoriserBloc(item, 'moderee')" v-if="admin">{{ $t('validerCapsule') }}</button>
			<span class="bouton" v-else-if="item.identifiant === identifiant">{{ $t('enAttenteModeration') }}</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'DigipadCapsule',
	inject: ['parent'],
	props: {
		admin: Boolean,
		identifiant: String,
		item: Object,
		pad: Object,
		indexCol: Number,
		disabled: Boolean,
		disabledAlt: Boolean,
		action: String,
		statut: String,
		viaDigidrive: Boolean,
		visionneuse: String
	},
	computed: {
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
