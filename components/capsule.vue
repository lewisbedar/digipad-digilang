<template>
	<div class="contenu">
		<div class="titre" v-if="item.titre !== ''" :style="{'background': parent.eclaircirCouleur(item.couleur)}">
			<span>{{ item.titre }}</span>
			<i class="material-icons" aria-hidden="true" v-if="action === 'organiser'">drag_indicator</i>
		</div>
		<div class="texte" v-if="item.texte !== ''" v-html="item.texte" />
		<div class="media" v-if="item.media !== '' && action !== 'organiser'">
			<img role="button" :tabindex="tabindex" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-if="item.type === 'image'" :src="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" loading="lazy" :alt="item.media" @click="parent.afficherVisionneuse(item)" @keydown.enter.space.prevent="parent.afficherVisionneuse(item)">
			<img role="button" :tabindex="tabindex" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="item.media" @click="parent.afficherVisionneuse(item)" @keydown.enter.space.prevent="parent.afficherVisionneuse(item)">
			<span role="button" :tabindex="tabindex" :title="$t('afficherDansVisionneuse')" :aria-label="$t('afficherDansVisionneuse')" v-else-if="item.type === 'audio' || item.type === 'video' || (item.type === 'document' && visionneuseDocx && visionneuseDocx !== '' && visionneuseDocx !== null) || item.type === 'pdf' || (item.type === 'office' && visionneuseDocx && visionneuseDocx !== '' && visionneuseDocx !== null) || item.type === 'embed'" @click="parent.afficherVisionneuse(item)" @keydown.enter.space.prevent="parent.afficherVisionneuse(item)"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></span>
			<a :href="item.media" target="_blank" :title="$t('ouvrirLienNouvelOnglet')" :aria-label="$t('ouvrirLienNouvelOnglet')" v-else-if="item.type === 'lien'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></a>
			<a :href="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" :title="$t('telecharger')" :aria-label="$t('telecharger')" download v-else><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" :alt="parent.definirNomLienFichier(parent.definirVignette(item))" loading="lazy"></a>
		</div>
		<div class="media" v-else-if="item.media !== '' && action === 'organiser'">
			<img v-if="item.type === 'image'" :src="parent.definirCheminFichiers() + '/' + pad.id + '/' + item.media" loading="lazy" :alt="item.media">
			<img v-else-if="item.type === 'lien-image'" :src="item.media" loading="lazy" :alt="item.media">
			<span v-else-if="item.type === 'audio' || item.type === 'video' || item.type === 'document' || item.type === 'pdf' || item.type === 'office' || item.type === 'embed'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
			<span v-else-if="item.type === 'lien'"><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
			<span v-else><img :class="{'vignette': parent.definirVignette(item).substring(0, 5) !== '/img/'}" :src="parent.definirVignette(item)" loading="lazy" :alt="parent.definirNomLienFichier(parent.definirVignette(item))"></span>
		</div>
		<div class="evaluation" v-if="pad.evaluations === 'activees'">
			<span class="etoiles" :title="definirEtoiles(item.evaluations)">
				<i class="material-icons" aria-hidden="true" :class="{'evalue': parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in parent.definirEvaluationCapsule(item.evaluations)" :key="'etoilepleine_' + etoile">star</i>
				<i class="material-icons" aria-hidden="true" :class="{'evalue': parent.verifierUtilisateurEvaluation(item.evaluations) === true}" v-for="etoile in (5 - parent.definirEvaluationCapsule(item.evaluations))" :key="'etoilevide_' + etoile">star_outline</i>
				<span>({{ item.evaluations.length }})</span>
			</span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('evaluerCapsule')" :aria-label="$t('evaluerCapsule')" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" @keydown.enter.space.prevent="parent.ouvrirModaleEvaluations(item.bloc, item.titre, '')" v-if="parent.verifierUtilisateurEvaluation(item.evaluations) === false && action !== 'organiser'"><i class="material-icons" aria-hidden="true">add_comment</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('evaluerCapsule')" :aria-label="$t('evaluerCapsule')" @click="parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" @keydown.enter.space.prevent="parent.ouvrirModaleEvaluations(item.bloc, item.titre, item.evaluations)" v-else-if="parent.verifierUtilisateurEvaluation(item.evaluations) === true && action !== 'organiser'"><i class="material-icons" aria-hidden="true">rate_review</i></span>
		</div>
		<div class="action" :style="{'color': item.couleur}">
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('modifierCapsule')" :aria-label="$t('modifierCapsule')" @click="parent.ouvrirModaleBloc('edition', item, indexCol)" @keydown.enter.space.prevent="parent.ouvrirModaleBloc('edition', item, indexCol)" v-if="(item.identifiant === identifiant || admin || pad.contributions === 'modifiables') && action !== 'organiser'"><i class="material-icons" aria-hidden="true">edit</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('commenterCapsule')" :aria-label="$t('commenterCapsule')" @click="parent.ouvrirModaleCommentaires(item.bloc, item.titre)" @keydown.enter.space.prevent="parent.ouvrirModaleCommentaires(item.bloc, item.titre)" v-if="pad.commentaires === 'actives'"><i class="material-icons" aria-hidden="true">comment</i><span class="badge">{{ item.commentaires }}</span></span>
			<span class="bouton info" role="button" :tabindex="tabindex" :title="$t('informationsCapsule')" :aria-label="$t('informationsCapsule')" :data-description="parent.definirDescription(item)"><i class="material-icons" aria-hidden="true">info</i></span>
			<span class="media-type" v-if="item.media !== ''"><i class="material-icons" aria-hidden="true">{{ parent.definirIconeMedia(item) }}</i></span>
			<span class="bouton" role="button" :tabindex="tabindex" :title="$t('copierCapsule')" :aria-label="$t('copierCapsule')" @click="parent.afficherEnvoyerBloc(item.bloc, item.titre)" @keydown.enter.space.prevent="parent.afficherEnvoyerBloc(item.bloc, item.titre)" v-if="admin && pad.copieBloc === 'activee' && (statut === 'utilisateur' || viaDigidrive) && action !== 'organiser'"><i class="material-icons" aria-hidden="true">send</i></span>
			<span class="bouton supprimer" role="button" :tabindex="tabindex" :title="$t('supprimerCapsule')" :aria-label="$t('supprimerCapsule')" @click="parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" @keydown.enter.space.prevent="parent.afficherSupprimerBloc(item.bloc, item.titre, indexCol)" v-if="(item.identifiant === identifiant || admin) && action !== 'organiser'"><i class="material-icons" aria-hidden="true">delete</i></span>
		</div>
		<div class="moderation" v-if="item.visibilite === 'privee' && admin">
			<span class="bouton" role="button" :tabindex="tabindex" @click="parent.autoriserBloc(item, 'privee')" @keydown.enter.space.prevent="parent.autoriserBloc(item, 'privee')">{{ $t('afficherCapsule') }}</span>
		</div>
		<div class="moderation" v-else-if="pad.contributions === 'moderees' && item.visibilite === 'masquee'">
			<span class="bouton" role="button" :tabindex="tabindex" @click="parent.autoriserBloc(item, 'moderee')" @keydown.enter.space.prevent="parent.autoriserBloc(item, 'moderee')" v-if="admin">{{ $t('validerCapsule') }}</span>
			<span class="bouton" v-else-if="item.identifiant === identifiant">{{ $t('enAttenteModeration') }}</span>
		</div>
	</div>
</template>

<script>
export default {
	name: 'Capsule',
	props: {
		admin: Boolean,
		identifiant: String,
		item: Object,
		pad: Object,
		indexCol: Number,
		tabindex: Number,
		action: String,
		statut: String,
		type: String,
		viaDigidrive: Boolean
	},
	data () {
		return {
			parent: '',
			visionneuseDocx: import.meta.env.VITE_DOCX_VIEWER
		}
	},
	created () {
		if (this.type === 'simple') {
			this.parent = this.$parent
		} else {
			this.parent = this.$parent.$parent
		}
	},
	methods: {
		definirEtoiles (evaluations) {
			const etoiles = this.parent.definirEvaluationCapsule(evaluations) > 1 ? this.parent.definirEvaluationCapsule(evaluations) + ' ' + this.$t('etoiles') : this.parent.definirEvaluationCapsule(evaluations) + ' ' + this.$t('etoile')
			return etoiles + ' - ' + evaluations.length + ' ' + this.$t('evaluations').toLowerCase()
		}
	}
}
</script>
