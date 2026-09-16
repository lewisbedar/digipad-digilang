<template>
	<div id="page" v-if="identifiant !== '' && statut === 'utilisateur'">
		<header>
			<span id="conteneur-logo">
				<span id="logo" />
			</span>
			<span id="titre">{{ $t('monCompte') }}</span>
		</header>

		<nav id="nav">
			<button type="button" id="compte" :disabled="disabled" :title="$t('parametresCompte')" :aria-label="$t('parametresCompte')" @click="gererMenu"><i class="material-icons" aria-hidden="true">account_circle</i></button>
			<button type="button" id="deconnexion" :disabled="disabled" :title="$t('deconnexion')" :aria-label="$t('deconnexion')" @click="deconnexion"><i class="material-icons" aria-hidden="true">power_settings_new</i></button>
		</nav>

		<div id="menu-utilisateur" class="menu gauche" v-if="menu" role="menu" :aria-label="$t('parametresCompte')" @keydown="gererClavierMenu">
			<div class="en-tete">
				<span class="titre">{{ $t('parametresCompte') }}</span>
				<button type="button" class="fermer" role="menuitem" tabindex="-1" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerMenu"><i class="material-icons" aria-hidden="true">close</i></button>
			</div>
			<div class="contenu ascenseur">
				<div class="conteneur">
					<label>{{ $t('langue') }}</label>
					<div id="langues">
						<button type="button" role="menuitem" tabindex="-1" title="Français" aria-label="Français" :class="{'selectionne': langue === 'fr'}" @click="modifierLangue('fr')">FR</button>
						<button type="button" role="menuitem" tabindex="-1" title="Español" aria-label="Español" :class="{'selectionne': langue === 'es'}" @click="modifierLangue('es')">ES</button>
						<button type="button" role="menuitem" tabindex="-1" title="Italiano" aria-label="Italiano" :class="{'selectionne': langue === 'it'}" @click="modifierLangue('it')">IT</button>
						<button type="button" role="menuitem" tabindex="-1" title="Deutsch" aria-label="Deutsch" :class="{'selectionne': langue === 'de'}" @click="modifierLangue('de')">DE</button>
						<button type="button" role="menuitem" tabindex="-1" title="English" aria-label="English" :class="{'selectionne': langue === 'en'}" @click="modifierLangue('en')">EN</button>
						<button type="button" role="menuitem" tabindex="-1" title="Hrvatski" aria-label="Hrvatski" :class="{'selectionne': langue === 'hr'}" @click="modifierLangue('hr')">HR</button>
					</div>
				</div>
				<div class="conteneur">
					<label for="identifiant">{{ $t('identifiant') }}</label>
					<input id="identifiant" type="text" disabled :value="identifiant">
				</div>
				<div class="conteneur">
					<label for="nom">{{ $t('nom') }}</label>
					<input id="nom" type="text" role="menuitem" tabindex="-1" maxlength="48" :value="nom" @keydown.enter="modifierInformations">
				</div>
				<div class="conteneur">
					<label for="email">{{ $t('email') }}</label>
					<input id="email" type="text" role="menuitem" tabindex="-1" :value="email" @keydown.enter="modifierInformations">
				</div>
				<div class="conteneur conteneur-bouton">
					<button type="button" class="bouton-vert" role="menuitem" tabindex="-1" @click="modifierInformations">{{ $t('enregistrer') }}</button>
				</div>
				<div class="conteneur conteneur-bouton">
					<button type="button" class="bouton-bleu" role="menuitem" tabindex="-1" @click="afficherModaleMotDePasse">{{ $t('modifierMotDePasse') }}</button>
				</div>
				<div class="conteneur conteneur-bouton">
					<button type="button" class="bouton-rouge" role="menuitem" tabindex="-1" @click="afficherModaleConfirmation($event, '', 'supprimer-compte')">{{ $t('supprimerCompte') }}</button>
				</div>
			</div>
		</div>

		<div id="onglets" class="ascenseur">
			<button type="button" class="onglet" :disabled="disabled" :class="{'actif': onglet === 'pads-crees'}" @click="modifierOnglet('pads-crees')">
				<span>{{ $t('padsCrees') }}</span>
				<span class="badge">{{ padsCrees.length }}</span>
			</button>
			<button type="button" class="onglet" :disabled="disabled" :class="{'actif': onglet === 'pads-rejoints'}" @click="modifierOnglet('pads-rejoints')">
				<span>{{ $t('padsRejoints') }}</span>
				<span class="badge">{{ padsRejoints.length }}</span>
			</button>
			<button type="button" class="onglet" :disabled="disabled" :class="{'actif': onglet === 'pads-admins'}" @click="modifierOnglet('pads-admins')">
				<span>{{ $t('padsAdmins') }}</span>
				<span class="badge">{{ padsAdmins.length }}</span>
			</button>
			<button type="button" class="onglet" :disabled="disabled" :class="{'actif': onglet === 'pads-favoris'}" @click="modifierOnglet('pads-favoris')">
				<span>{{ $t('favoris') }}</span>
				<span class="badge">{{ padsFavoris.length }}</span>
			</button>
			<button type="button" class="onglet" :disabled="disabled" v-for="(item, indexItem) in dossiers" :class="{'actif': onglet === item.id}" @click="modifierOnglet(item.id)" @dragover="gererDrag" @dragcenter="gererDrag" @drop="glisserDeplacerPad($event, item.id)" :key="'dossier_' + indexItem">
				<span>{{ item.nom }}</span>
				<span class="badge">{{ item.pads.length }}</span>
				<div class="menu-dossier">
					<button type="button" class="bouton" :disabled="disabled" :title="$t('modifierDossier')" :aria-label="$t('modifierDossier')" @click="afficherModaleModifierDossier($event, item.id)"><i class="material-icons" aria-hidden="true">edit</i></button>
					<button type="button" class="bouton supprimer" :disabled="disabled" :title="$t('supprimerDossier')" :aria-label="$t('supprimerDossier')" @click="afficherModaleConfirmation($event, item.id, 'supprimer-dossier')"><i class="material-icons" aria-hidden="true">delete</i></button>
				</div>
			</button>
			<button type="button" class="onglet" :disabled="disabled" :class="{'actif': onglet === 'pads-corbeille'}" @click="modifierOnglet('pads-corbeille')">
				<span>{{ $t('corbeille') }}</span>
				<span class="badge">{{ padsCorbeille.length }}</span>
			</button>
			<button type="button" class="bouton-ajouter" :disabled="disabled" @click="afficherModaleAjouterDossier">{{ $t('ajouterDossier') }}</button>
		</div>

		<div id="pads" class="ascenseur" :class="affichage">
			<div class="section">
				<div id="boutons">
					<button type="button" id="bouton-creer" :disabled="disabled" :class="{'desactive': padsCrees.length >= limite}" @click="afficherModaleCreerPad">{{ $t('creerPad') }}</button>
					<button type="button" id="bouton-importer" :disabled="disabled" :class="{'desactive': padsCrees.length >= limite}" @click="afficherModaleImporterPad">{{ $t('importerPad') }}</button>
					<button type="button" id="bouton-ajouter" :disabled="disabled" :class="{'desactive': padsCrees.length >= limite}" @click="afficherModaleAjouterPad" v-if="creationPadSansCompte === 1">{{ $t('ajouterPad') }}</button>
				</div>
				<div id="afficher">
					<div class="rechercher" role="search" :aria-label="$t('rechercher')">
						<label for="champ-rechercher" :title="$t('rechercher')" :aria-label="$t('rechercher')"><i class="material-icons" aria-hidden="true">search</i></label>
						<input id="champ-rechercher" type="search" :value="requete" :disabled="disabled" :placeholder="$t('rechercher')" @input="requete = $event.target.value">
					</div>
					<div class="classer">
						<label for="champ-classer" :title="$t('classer')" :aria-label="$t('classer')"><i class="material-icons" aria-hidden="true">sort</i></label>
						<select id="champ-classer" :disabled="disabled" @change="modifierClassement($event.target.value)">
							<option value="date-asc" :selected="classement === 'date-asc'">{{ $t('dateAsc') }}</option>
							<option value="date-desc" :selected="classement === 'date-desc'">{{ $t('dateDesc') }}</option>
							<option value="alpha-asc" :selected="classement === 'alpha-asc'">{{ $t('alphaAsc') }}</option>
							<option value="alpha-desc" :selected="classement === 'alpha-desc'">{{ $t('alphaDesc') }}</option>
						</select>
					</div>
					<div class="afficher">
						<button type="button" :disabled="disabled" :title="$t('affichageListe')" :aria-label="$t('affichageListe')" @click="modifierAffichage('liste')"><i class="material-icons" aria-hidden="true">view_list</i></button>
						<button type="button" :disabled="disabled" :title="$t('affichageMosaique')" :aria-label="$t('affichageMosaique')" @click="modifierAffichage('mosaique')"><i class="material-icons" aria-hidden="true">view_module</i></button>
					</div>
				</div>
				<div id="actions-dossier" v-if="onglet !== 'pads-crees' && onglet !== 'pads-rejoints' && onglet !== 'pads-admins' && onglet !== 'pads-favoris' && onglet !== 'pads-corbeille'">
					<div class="conteneur">
						<label>{{ $t('actionsDossier') }}</label>
						<button type="button" class="bouton" :disabled="disabled" :title="$t('modifierDossier')" :aria-label="$t('modifierDossier')" @click="afficherModaleModifierDossier($event, onglet)"><i class="material-icons" aria-hidden="true">edit</i></button>
						<button type="button" class="bouton supprimer" :disabled="disabled" :title="$t('supprimerDossier')" :aria-label="$t('supprimerDossier')" @click="afficherModaleConfirmation($event, onglet, 'supprimer-dossier')"><i class="material-icons" aria-hidden="true">delete</i></button>
					</div>
				</div>
				<div id="actions-corbeille" v-else-if="onglet === 'pads-corbeille'">
					<button type="button" :disabled="disabled || padsCorbeille.length === 0" @click="afficherModaleConfirmation($event, '', 'vider-corbeille')">{{ $t('viderCorbeille') }}</button>
				</div>
				<div class="pads" aria-live="polite" v-if="pads.length > 0 && requete === ''">
					<template v-for="pad in pads" :key="'pad_' + pad.id">
						<div :id="'pad-' + pad.id" class="pad liste" v-if="affichage === 'liste'">
							<a class="fond" :href="'/p/' + pad.id + '/' + pad.token" :class="{'fond-personnalise': !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#'}" :style="definirFond(pad.fond, pad.id)" />
							<a class="meta" :href="'/p/' + pad.id + '/' + pad.token" @dragstart="definirIdPad($event, pad.id)">
								<span class="mise-a-jour" v-if="pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)" />
								<span class="titre">{{ pad.titre }}</span>
								<span class="dossier" v-if="verifierDossierPad(pad.id) && (onglet === 'pads-crees' || onglet === 'pads-rejoints' || onglet === 'pads-admins' || onglet === 'pads-favoris')"> (📁 {{ verifierTitreDossier(pad.id) }})</span>
								<span class="date">&nbsp;-&nbsp;{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }}</span>
								<span class="auteur" v-if="pad.identifiant !== identifiant">&nbsp;{{ $t('par') }} {{ pad.identifiant }}</span>
								<span class="vues" v-if="pad.hasOwnProperty('vues') && pad.vues > 1"> - {{ pad.vues }} {{ $t('vues') }}</span>
								<span class="vues" v-else-if="pad.hasOwnProperty('vues') && pad.vues < 2"> - {{ pad.vues }} {{ $t('vue') }}</span>
								<span class="vues" v-else-if="!pad.hasOwnProperty('vues')"> - 0 {{ $t('vue') }}</span>
							</a>
							<div class="actions" v-if="pad.identifiant === identifiant">
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else-if="favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0 && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="dupliquer" :disabled="disabled" :title="$t('dupliquerPad')" :aria-label="$t('dupliquerPad')" @click="afficherModaleConfirmation($event, pad.id, 'dupliquer')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">content_copy</i></button>
								<button type="button" class="exporter" :disabled="disabled" :title="$t('exporterPad')" :aria-label="$t('exporterPad')" @click="afficherModaleConfirmation($event, pad.id, 'exporter')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">get_app</i></button>
								<button type="button" class="restaurer" :disabled="disabled" :title="$t('restaurer')" :aria-label="$t('restaurer')" @click="restaurerPad(pad)" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">restore_from_trash</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('mettreCorbeille')" :aria-label="$t('mettreCorbeille')" @click="mettrePadCorbeille(pad)" v-else><i class="material-icons" aria-hidden="true">delete</i></button>
							</div>
							<div class="actions" v-else>
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id)"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="definirTypePad(pad.id) === 'pad-rejoint'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('quitterPad')" :aria-label="$t('quitterPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer-admin')" v-else-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">logout</i></button>
								<span class="admin" :title="$t('admin')" v-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">admin_panel_settings</i></span>
							</div>
						</div>

						<div :id="'pad-' + pad.id" class="pad mosaique" v-else>
							<a class="conteneur" :class="{'fond-personnalise': !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#'}" :style="definirFond(pad.fond, pad.id)" :href="'/p/' + pad.id + '/' + pad.token" @dragstart="definirIdPad($event, pad.id)">
								<div class="meta">
									<span class="titre"><span class="mise-a-jour" v-if="pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)" />{{ pad.titre }} <small v-if="verifierDossierPad(pad.id) && (onglet === 'pads-crees' || onglet === 'pads-rejoints' || onglet === 'pads-admins' || onglet === 'pads-favoris')"> (📁 {{ verifierTitreDossier(pad.id) }})</small></span>
									<span class="date">{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }}</span>
									<span class="auteur" v-if="pad.identifiant !== identifiant">&nbsp;{{ $t('par') }} {{ pad.identifiant }}</span>
									<span class="vues" v-if="pad.hasOwnProperty('vues') && pad.vues > 1"> - {{ pad.vues }} {{ $t('vues') }}</span>
									<span class="vues" v-else-if="pad.hasOwnProperty('vues') && pad.vues < 2"> - {{ pad.vues }} {{ $t('vue') }}</span>
									<span class="vues" v-else-if="!pad.hasOwnProperty('vues')"> - 0 {{ $t('vue') }}</span>
								</div>
							</a>
							<div class="actions" v-if="pad.identifiant === identifiant">
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else-if="favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0 && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="dupliquer" :disabled="disabled" :title="$t('dupliquerPad')" :aria-label="$t('dupliquerPad')" @click="afficherModaleConfirmation($event, pad.id, 'dupliquer')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">content_copy</i></button>
								<button type="button" class="exporter" :disabled="disabled" :title="$t('exporterPad')" :aria-label="$t('exporterPad')" @click="afficherModaleConfirmation($event, pad.id, 'exporter')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">get_app</i></button>
								<button type="button" class="restaurer" :disabled="disabled" :title="$t('restaurer')" :aria-label="$t('restaurer')" @click="restaurerPad(pad)" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">restore_from_trash</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('mettreCorbeille')" :aria-label="$t('mettreCorbeille')" @click="mettrePadCorbeille(pad)" v-else><i class="material-icons" aria-hidden="true">delete</i></button>
							</div>
							<div class="actions" v-else>
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id)"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="definirTypePad(pad.id) === 'pad-rejoint'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('quitterPad')" :aria-label="$t('quitterPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer-admin')" v-else-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">logout</i></button>
								<span class="admin" :title="$t('admin')" v-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">admin_panel_settings</i></span>
							</div>
						</div>
					</template>
				</div>
				<div class="vide" v-else-if="pads.length === 0 && requete === ''">
					<span v-if="onglet === 'pads-crees'">{{ $t('aucunPadCree') }}</span>
					<span v-else-if="onglet === 'pads-rejoints'">{{ $t('aucunPadRejoint') }}</span>
					<span v-else-if="onglet === 'pads-favoris'">{{ $t('aucunFavori') }}</span>
					<span v-else>{{ $t('aucunPadDossier') }}</span>
				</div>
				<div class="pads" v-else-if="resultats.length > 0 && requete !== ''">
					<template v-for="pad in resultats" :key="'resultats_' + pad.id">
						<div :id="'pad-' + pad.id" class="pad liste" v-if="affichage === 'liste'">
							<a class="fond" :href="'/p/' + pad.id + '/' + pad.token" :class="{'fond-personnalise': !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#'}" :style="definirFond(pad.fond, pad.id)" />
							<a class="meta" :href="'/p/' + pad.id + '/' + pad.token" @dragstart="definirIdPad($event, pad.id)">
								<span class="mise-a-jour" v-if="pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)" />
								<span class="titre">{{ pad.titre }}</span>
								<span class="dossier" v-if="verifierDossierPad(pad.id) && (onglet === 'pads-crees' || onglet === 'pads-rejoints' || onglet === 'pads-admins' || onglet === 'pads-favoris')"> (📁 {{ verifierTitreDossier(pad.id) }})</span>
								<span class="date">&nbsp;-&nbsp;{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }}</span>
								<span class="auteur" v-if="pad.identifiant !== identifiant">&nbsp;{{ $t('par') }} {{ pad.identifiant }}</span>
								<span class="vues" v-if="pad.hasOwnProperty('vues') && pad.vues > 1"> - {{ pad.vues }} {{ $t('vues') }}</span>
								<span class="vues" v-else-if="pad.hasOwnProperty('vues') && pad.vues < 2"> - {{ pad.vues }} {{ $t('vue') }}</span>
								<span class="vues" v-else-if="!pad.hasOwnProperty('vues')"> - 0 {{ $t('vue') }}</span>
							</a>
							<div class="actions" v-if="pad.identifiant === identifiant">
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else-if="favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0 && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="dupliquer" :disabled="disabled" :title="$t('dupliquerPad')" :aria-label="$t('dupliquerPad')" @click="afficherModaleConfirmation($event, pad.id, 'dupliquer')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">content_copy</i></button>
								<button type="button" class="exporter" :disabled="disabled" :title="$t('exporterPad')" :aria-label="$t('exporterPad')" @click="afficherModaleConfirmation($event, pad.id, 'exporter')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">get_app</i></button>
								<button type="button" class="restaurer" :disabled="disabled"  :title="$t('restaurer')" :aria-label="$t('restaurer')" @click="restaurerPad(pad)" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">restore_from_trash</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('mettreCorbeille')" :aria-label="$t('mettreCorbeille')" @click="mettrePadCorbeille(pad)" v-else><i class="material-icons" aria-hidden="true">delete</i></button>
							</div>
							<div class="actions" v-else>
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id)"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="definirTypePad(pad.id) === 'pad-rejoint'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('quitterPad')" :aria-label="$t('quitterPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer-admin')" v-else-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">logout</i></button>
								<span class="admin" :title="$t('admin')" v-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">admin_panel_settings</i></span>
							</div>
						</div>

						<div :id="'pad-' + pad.id" class="pad mosaique" v-else>
							<a class="conteneur" :class="{'fond-personnalise': !pad.fond.includes('/img/') && pad.fond.substring(0, 1) !== '#'}" :style="definirFond(pad.fond, pad.id)" :href="'/p/' + pad.id + '/' + pad.token" @dragstart="definirIdPad($event, pad.id)">
								<div class="meta">
									<span class="titre"><span class="mise-a-jour" v-if="pad.hasOwnProperty('notification') && pad.notification.includes(identifiant)" />{{ pad.titre }} <small v-if="verifierDossierPad(pad.id) && (onglet === 'pads-crees' || onglet === 'pads-rejoints' || onglet === 'pads-admins' || onglet === 'pads-favoris')"> (📁 {{ verifierTitreDossier(pad.id) }})</small></span>
									<span class="date">{{ $t('creeLe') }} {{ $formaterDate(pad.date, langue) }}</span>
									<span class="auteur" v-if="pad.identifiant !== identifiant">&nbsp;{{ $t('par') }} {{ pad.identifiant }}</span>
									<span class="vues" v-if="pad.hasOwnProperty('vues') && pad.vues > 1"> - {{ pad.vues }} {{ $t('vues') }}</span>
									<span class="vues" v-else-if="pad.hasOwnProperty('vues') && pad.vues < 2"> - {{ pad.vues }} {{ $t('vue') }}</span>
									<span class="vues" v-else-if="!pad.hasOwnProperty('vues')"> - 0 {{ $t('vue') }}</span>
								</div>
							</a>
							<div class="actions" v-if="pad.identifiant === identifiant">
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else-if="favoris.includes(pad.id) && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0 && onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="dupliquer" :disabled="disabled" :title="$t('dupliquerPad')" :aria-label="$t('dupliquerPad')" @click="afficherModaleConfirmation($event, pad.id, 'dupliquer')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">content_copy</i></button>
								<button type="button" class="exporter" :disabled="disabled" :title="$t('exporterPad')" :aria-label="$t('exporterPad')" @click="afficherModaleConfirmation($event, pad.id, 'exporter')" v-if="onglet !== 'pads-corbeille'"><i class="material-icons" aria-hidden="true">get_app</i></button>
								<button type="button" class="restaurer" :disabled="disabled" :title="$t('restaurer')" :aria-label="$t('restaurer')" @click="restaurerPad(pad)" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">restore_from_trash</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="onglet === 'pads-corbeille'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('mettreCorbeille')" :aria-label="$t('mettreCorbeille')" @click="mettrePadCorbeille(pad)" v-else><i class="material-icons" aria-hidden="true">delete</i></button>
							</div>
							<div class="actions" v-else>
								<button type="button" class="ajouter-favori" :disabled="disabled" :title="$t('ajouterFavori')" :aria-label="$t('ajouterFavori')" @click="ajouterFavori(pad)" v-if="!favoris.includes(pad.id)"><i class="material-icons" aria-hidden="true">star_outline</i></button>
								<button type="button" class="supprimer-favori" :disabled="disabled" :title="$t('supprimerFavori')" :aria-label="$t('supprimerFavori')" @click="supprimerFavori(pad.id)" v-else><i class="material-icons" aria-hidden="true">star</i></button>
								<button type="button" class="deplacer" :disabled="disabled" :title="$t('ajouterDansDossier')" :aria-label="$t('ajouterDansDossier')" @click="afficherModaleDeplacerPad(pad.id)" :class="{'actif': verifierDossierPad(pad.id)}" v-if="dossiers.length > 0"><i class="material-icons" aria-hidden="true">drive_file_move</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('supprimerPad')" :aria-label="$t('supprimerPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer')" v-if="definirTypePad(pad.id) === 'pad-rejoint'"><i class="material-icons" aria-hidden="true">delete</i></button>
								<button type="button" class="supprimer" :disabled="disabled" :title="$t('quitterPad')" :aria-label="$t('quitterPad')" @click="afficherModaleConfirmation($event, pad.id, 'supprimer-admin')" v-else-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">logout</i></button>
								<span class="admin" :title="$t('admin')" v-if="definirTypePad(pad.id) === 'pad-admin'"><i class="material-icons" aria-hidden="true">admin_panel_settings</i></span>
							</div>
						</div>
					</template>
				</div>
				<div class="vide" v-else-if="resultats.length === 0 && requete !== ''">
					{{ $t('aucunResultat') }}
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-if="modale === 'mot-de-passe'">
			<div id="modale-motdepasse" class="modale" role="dialog" aria-modal="true" :aria-label="$t('modifierMotDePasse')">
				<div class="en-tete">
					<span class="titre">{{ $t('modifierMotDePasse') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleMotDePasse"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-motdepasse-actuel">{{ $t('motDePasseActuel') }}</label>
						<input id="champ-motdepasse-actuel" type="password" maxlength="48" :value="motDePasse" :disabled="disabledModale" @input="motDePasse = $event.target.value">
						<label for="champ-nouveau-motdepasse">{{ $t('nouveauMotDePasse') }}</label>
						<input id="champ-nouveau-motdepasse" type="password" maxlength="48" :value="nouveauMotDePasse" :disabled="disabledModale" @input="nouveauMotDePasse = $event.target.value">
						<label for="champ-confirmation-motdepasse">{{ $t('confirmationNouveauMotDePasse') }}</label>
						<input id="champ-confirmation-motdepasse" type="password" maxlength="48" :value="confirmationNouveauMotDePasse" :disabled="disabledModale" @input="confirmationNouveauMotDePasse = $event.target.value" @keydown.enter="modifierMotDePasse">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="modifierMotDePasse">{{ $t('modifier') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'email'">
			<div id="modale-email" class="modale" role="dialog" aria-modal="true" :aria-label="$t('emailManquant')">
				<div class="en-tete">
					<span class="titre">{{ $t('emailManquant') }}</span>
					<button type="button" class="fermer" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleEmail"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<div class="message" v-html="$t('texteEmailManquant')" />
						<div class="actions">
							<button type="button" class="bouton" @click="renseignerEmail">{{ $t('renseignerEmail') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'creer-pad'">
			<div id="creation" class="modale" role="dialog" aria-modal="true" :aria-label="$t('creerPad')">
				<div class="en-tete">
					<span class="titre">{{ $t('creerPad') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale || chargementModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleCreerPad"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-titre-pad">{{ $t('titrePad') }}</label>
						<input id="champ-titre-pad" type="text" maxlength="48" :value="titre" :disabled="disabledModale" @input="titre = $event.target.value" @keydown.enter="creerPad">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="creerPad" v-if="!chargementModale">{{ $t('creer') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'deplacer-pad'">
			<div id="deplacement" class="modale" role="dialog" aria-modal="true" :aria-label="$t('ajouterDansDossier')">
				<div class="en-tete">
					<span class="titre">{{ $t('ajouterDansDossier') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleDeplacerPad"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-dossier-actuel">{{ $t('dossierActuel') }}</label>
						<input id="champ-dossier-actuel" type="text" :value="$t('aucunDossier')" disabled v-if="dossierActuel.id === 'aucun'">
						<input id="champ-dossier-actuel" type="text" :value="dossierActuel.nom" disabled v-else>
						<label for="champ-dossier-pad">{{ $t('dossierDestination') }}</label>
						<select id="champ-dossier-pad" :disabled="disabledModale">
							<option value="aucun" v-if="dossierActuel.id !== 'aucun'">{{ $t('aucunDossier') }}</option>
							<template v-for="(item, indexItem) in dossiers" :key="'dossier_' + indexItem">
								<option v-if="dossierActuel.id !== item.id" :value="item.id">{{ item.nom }}</option>
							</template>
						</select>
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="deplacerPad">{{ $t('valider') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'importer-pad'">
			<div id="import" class="modale" role="dialog" aria-modal="true" :aria-label="$t('importerPad')">
				<div class="en-tete">
					<span class="titre">{{ $t('importerPad') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleImporterPad"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerCommentaires') }}</span>
							<label class="bouton-interrupteur" :tabindex="tabIndexModale" :aria-disabled="disabledModale" @keydown.enter.space.prevent="activerInput('parametre-commentaires')">
								<input id="parametre-commentaires" type="checkbox" :checked="parametresImport.commentaires" :disabled="disabledModale" @change="modifierParametresImport($event, 'commentaires')">
								<span class="barre" />
							</label>
						</div>
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerEvaluations') }}</span>
							<label class="bouton-interrupteur" :tabindex="tabIndexModale" :aria-disabled="disabledModale" @keydown.enter.space.prevent="activerInput('parametre-evaluations')">
								<input id="parametre-evaluations" type="checkbox" :checked="parametresImport.evaluations" :disabled="disabledModale" @change="modifierParametresImport($event, 'evaluations')">
								<span class="barre" />
							</label>
						</div>
						<div class="conteneur-interrupteur" v-if="progressionImport === 0">
							<span>{{ $t('importerActivite') }}</span>
							<label class="bouton-interrupteur" :tabindex="tabIndexModale" :aria-disabled="disabledModale" @keydown.enter.space.prevent="activerInput('parametre-activite')">
								<input id="parametre-activite" type="checkbox" :checked="parametresImport.activite" :disabled="disabledModale" @change="modifierParametresImport($event, 'activite')">
								<span class="barre" />
							</label>
						</div>
						<label for="importer-pad" class="bouton" :tabindex="tabIndexModale" :aria-disabled="disabledModale" @keydown.enter.space.prevent="activerInput('importer-pad')" v-if="progressionImport === 0">{{ $t('selectionnerPad') }}</label>
						<input id="importer-pad" type="file" :disabled="disabledModale" style="display: none" accept=".zip" @change="importerPad" v-if="progressionImport === 0">
						<div class="conteneur-chargement progression" v-if="progressionImport > 0">
							<progress class="barre-progression" max="100" :value="progressionImport" />
							<div class="chargement" />
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'ajouter-pad'">
			<div id="ajout-pad" class="modale" role="dialog" aria-modal="true" :aria-label="$t('ajouterPad')">
				<div class="en-tete">
					<span class="titre">{{ $t('ajouterPad') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale || chargementModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleAjouterPad"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-lien-ajouter-pad">{{ $t('lienPad') }}</label>
						<input id="champ-lien-ajouter-pad" type="text" :value="lienAjouter" :disabled="disabledModale" @input="lienAjouter = $event.target.value">
						<label for="champ-motdepasse-ajouter-pad">{{ $t('motDePassePad') }}</label>
						<input id="champ-motdepasse-ajouter-pad" type="password" :value="motDePasseAjouter" :disabled="disabledModale" @input="motDePasseAjouter = $event.target.value" @keydown.enter="ajouterPad">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="ajouterPad" v-if="!chargementModale">{{ $t('valider') }}</button>
							<div class="conteneur-chargement" v-else>
								<div class="chargement" />
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'ajouter-dossier'">
			<div id="ajout-dossier" class="modale" role="dialog" aria-modal="true" :aria-label="$t('ajouterDossier')">
				<div class="en-tete">
					<span class="titre">{{ $t('ajouterDossier') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleAjouterDossier"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-nom-dossier">{{ $t('nomDossier') }}</label>
						<input id="champ-nom-dossier" type="text" maxlength="48" :value="dossier" :disabled="disabledModale" @input="dossier = $event.target.value" @keydown.enter="ajouterDossier">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="ajouterDossier">{{ $t('valider') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div class="conteneur-modale" v-else-if="modale === 'modifier-dossier'">
			<div id="modification-dossier" class="modale" role="dialog" aria-modal="true" :aria-label="$t('modifierDossier')">
				<div class="en-tete">
					<span class="titre">{{ $t('modifierDossier') }}</span>
					<button type="button" class="fermer" :disabled="disabledModale" :title="$t('fermer')" :aria-label="$t('fermer')" @click="fermerModaleModifierDossier"><i class="material-icons" aria-hidden="true">close</i></button>
				</div>
				<div class="conteneur">
					<div class="contenu">
						<label for="champ-nom-dossier">{{ $t('nomDossier') }}</label>
						<input id="champ-nom-dossier" type="text" maxlength="48" :value="dossier" :disabled="disabledModale" @input="dossier = $event.target.value" @keydown.enter="modifierDossier">
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledModale" @click="modifierDossier">{{ $t('valider') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<div id="conteneur-message" class="conteneur-modale" v-if="modaleConfirmation !== ''">
			<div class="modale" role="dialog" aria-modal="true">
				<div class="conteneur">
					<div class="contenu">
						<div class="message" v-html="$t('confirmationDupliquerPad')" v-if="modaleConfirmation === 'dupliquer'" />
						<div class="message" v-html="$t('confirmationExporterPad')" v-else-if="modaleConfirmation === 'exporter'" />
						<div class="message" v-html="$t('confirmationSupprimerPad')" v-else-if="modaleConfirmation === 'supprimer'" />
						<div class="message" v-html="$t('confirmationSupprimerPadAdmin')" v-else-if="modaleConfirmation === 'supprimer-admin'" />
						<div class="message" v-html="$t('confirmationSupprimerCompte')" v-else-if="modaleConfirmation === 'supprimer-compte'" />
						<div class="message" v-html="$t('confirmationSupprimerDossier')" v-else-if="modaleConfirmation === 'supprimer-dossier'" />
						<div class="message" v-html="$t('confirmationViderCorbeille')" v-else-if="modaleConfirmation === 'vider-corbeille'" />
						<div class="actions">
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="fermerModaleConfirmation">{{ $t('non') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="dupliquerPad" v-if="modaleConfirmation === 'dupliquer'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="exporterPad" v-else-if="modaleConfirmation === 'exporter'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="supprimerPad" v-else-if="modaleConfirmation === 'supprimer'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="supprimerPad" v-else-if="modaleConfirmation === 'supprimer-admin'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="supprimerCompte" v-else-if="modaleConfirmation === 'supprimer-compte'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="supprimerDossier" v-else-if="modaleConfirmation === 'supprimer-dossier'">{{ $t('oui') }}</button>
							<button type="button" class="bouton" :disabled="disabledConfirmation" @click="viderCorbeille" v-else-if="modaleConfirmation === 'vider-corbeille'">{{ $t('oui') }}</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<Notification :notification="notification" @fermer="notification = ''" />

		<Message :message="message" @elementPrecedent="definirElementPrecedent" @fermer="fermerMessage" v-if="message !== ''" />

		<Chargement v-if="chargement" />

		<ChargementPage v-if="chargementPage" />
	</div>
</template>

<script>
import axios from 'axios'
import imagesLoaded from 'imagesloaded'
import fileSaver from 'file-saver'
const { saveAs } = fileSaver
import ChargementPage from '#root/components/chargement-page.vue'
import Chargement from '#root/components/chargement.vue'
import Message from '#root/components/message.vue'
import Notification from '#root/components/notification.vue'

export default {
	name: 'DigipadUtilisateur',
	components: {
		ChargementPage,
		Chargement,
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
			modaleConfirmation: '',
			chargementModale: false,
			menu: false,
			onglet: 'pads-crees',
			titre: '',
			progressionImport: 0,
			padId: '',
			lienAjouter: '',
			motDePasseAjouter: '',
			motDePasse: '',
			nouveauMotDePasse: '',
			confirmationNouveauMotDePasse: '',
			pads: [],
			requete: '',
			resultats: [],
			favoris: [],
			parametresImport: {
				commentaires: false,
				evaluations: false,
				activite: false
			},
			dossier: '',
			dossierId: '',
			dossierActuel: {},
			elementPrecedent: null,
			hote: this.$pageContext.pageProps.hote,
			langues: this.$pageContext.pageProps.langues,
			identifiant: this.$pageContext.pageProps.identifiant,
			nom: this.$pageContext.pageProps.nom,
			email: this.$pageContext.pageProps.email,
			langue: this.$pageContext.pageProps.langue,
			statut: this.$pageContext.pageProps.statut,
			affichage: this.$pageContext.pageProps.affichage,
			classement: this.$pageContext.pageProps.classement,
			limite: 100,
			padsCrees: this.$pageContext.pageProps.padsCrees,
			padsCorbeille: this.$pageContext.pageProps.padsCorbeille,
			padsRejoints: this.$pageContext.pageProps.padsRejoints,
			padsAdmins: this.$pageContext.pageProps.padsAdmins,
			padsFavoris: this.$pageContext.pageProps.padsFavoris,
			dossiers: this.$pageContext.pageProps.dossiers,
			stockage: import.meta.env.VITE_STORAGE,
			lienPublicS3: import.meta.env.VITE_S3_PUBLIC_LINK,
			creationPadSansCompte: 0
		}
	},
	computed : {
		tabIndexModale () {
			return this.message === '' && this.modaleConfirmation === '' ? 0 : -1
		},
		disabled () {
			return this.modale === '' && this.message === '' && this.modaleConfirmation === '' ? false : true
		},
		disabledModale () {
			return this.message === '' && this.modaleConfirmation === '' ? false : true
		},
		disabledConfirmation () {
			return this.message === '' ? false : true
		}
	},
	watch: {
		onglet (onglet) {
			let pads = []
			if (onglet === 'pads-crees') {
				pads = JSON.parse(JSON.stringify(this.padsCrees))
			} else if (onglet === 'pads-rejoints') {
				pads = JSON.parse(JSON.stringify(this.padsRejoints))
			} else if (onglet === 'pads-admins') {
				pads = JSON.parse(JSON.stringify(this.padsAdmins))
			} else if (onglet === 'pads-favoris') {
				pads = JSON.parse(JSON.stringify(this.padsFavoris))
			} else if (onglet === 'pads-corbeille') {
				pads = JSON.parse(JSON.stringify(this.padsCorbeille))
			} else {
				let listePads = []
				this.dossiers.forEach((dossier) => {
					if (dossier.id === onglet) {
						listePads = dossier.pads
					}
				})
				const padsTous = this.padsCrees.concat(this.padsRejoints, this.padsAdmins)
				padsTous.forEach((pad) => {
					if (listePads.includes(pad.id) && !pads.map((e) => { return e.id }).includes(pad.id)) {
						pads.push(pad)
					}
				})
			}
			this.pads = pads
			this.requete = ''
			this.classer(this.classement)
		},
		requete () {
			this.rechercher()
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

		this.pads = JSON.parse(JSON.stringify(this.padsCrees))

		const favoris = []
		this.padsFavoris.forEach((pad) => {
			favoris.push(pad.id)
		})
		this.favoris = favoris

		this.classer(this.classement)

		if (import.meta.env.VITE_WALL_LIMIT && import.meta.env.VITE_WALL_LIMIT !== '') {
			this.limite = parseInt(import.meta.env.VITE_WALL_LIMIT)
		}

		if (import.meta.env.VITE_PAD_WITHOUT_ACCOUNT && import.meta.env.VITE_PAD_WITHOUT_ACCOUNT !== '') {
			this.creationPadSansCompte = parseInt(import.meta.env.VITE_PAD_WITHOUT_ACCOUNT)
		}
	},
	mounted () {
		document.getElementsByTagName('html')[0].setAttribute('lang', this.langue)

		imagesLoaded('#pads', { background: true }, () => {
			this.chargementPage = false
		})

		document.addEventListener('keydown', this.gererClavier, false)

		if (this.email === '') {
			this.afficherModaleEmail()
		}
	},
	beforeUnmount () {
		document.removeEventListener('keydown', this.gererClavier, false)
	},
	methods: {
		gererMenu () {
			if (!this.menu) {
				this.elementPrecedent = (document.activeElement || document.body)
				this.menu = true
				setTimeout(() => {
					document.querySelector('.menu').classList.add('ouvert')
					document.querySelector('.menu .fermer')?.focus()
				}, 0)
			} else {
				this.fermerMenu()
			}
		},
		fermerMenu () {
			this.menu = false
			this.gererFocus()
		},
		modifierOnglet (onglet) {
			this.onglet = onglet
		},
		activerInput (id) {
			document.querySelector('#' + id)?.click()
		},
		definirFond (fond, id) {
			if (fond.substring(0, 1) === '#') {
				return { backgroundColor: fond }
			} else if (fond.includes('/img/')) {
				return { backgroundImage: 'url(' + fond + ')' }
			} else {
				return { backgroundImage: 'url(' + this.definirCheminFichiers() + '/' + id + '/' + this.definirNomLienFichier(fond) + ')' }
			}
		},
		definirNomLienFichier (fichier) {
			return fichier.split('\\').pop().split('/').pop()
		},
		definirCheminFichiers () {
			if (this.stockage === 's3' && this.lienPublicS3 && this.lienPublicS3 !== '') {
				return this.lienPublicS3
			} else {
				return '/fichiers'
			}
		},
		afficherModaleCreerPad () {
			if (this.padsCrees.length < this.limite) {
				this.elementPrecedent = (document.activeElement || document.body)
				this.modale = 'creer-pad'
				this.$nextTick(() => {
					document.querySelector('#creation input')?.focus()
				})
			} else {
				this.message = this.$t('limitePad', { limite: this.limite })
			}
		},
		creerPad () {
			if (this.titre !== '') {
				this.chargementModale = true
				const onglets = ['pads-crees', 'pads-rejoints', 'pads-admins', 'pads-favoris', 'pads-corbeille']
				let dossierId = ''
				if (this.onglet !== '' && !onglets.includes(this.onglet)) {
					dossierId = this.onglet
				}
				axios.post(this.hote + '/api/creer-pad', {
					titre: this.titre,
					identifiant: this.identifiant,
					dossier: dossierId
				}).then((reponse) => {
					const donnees = reponse.data
					window.location.href = '/p/' + donnees.id + '/' + donnees.token
				}).catch((err) => {
					this.chargementModale = false
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'erreur_creation') {
						this.message = this.$t('erreurCreationPad')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		fermerModaleCreerPad () {
			if (this.chargementModale) {
				return
			}
			this.modale = ''
			this.titre = ''
			this.gererFocus()
		},
		afficherModaleImporterPad () {
			if (this.padsCrees.length < this.limite) {
				this.elementPrecedent = (document.activeElement || document.body)
				this.modale = 'importer-pad'
				this.$nextTick(() => {
					document.querySelector('.modale .fermer')?.focus()
				})
			} else {
				this.message = this.$t('limitePad', { limite: this.limite })
			}
		},
		modifierParametresImport (event, type) {
			this.parametresImport[type] = event.target.checked
		},
		importerPad () {
			const champ = document.querySelector('#importer-pad')
			const extension = champ.files && champ.files[0] ? champ.files[0].name.substring(champ.files[0].name.lastIndexOf('.') + 1).toLowerCase() : ''
			if (champ.files && champ.files[0] && extension === 'zip') {
				const formulaire = new FormData()
				formulaire.append('parametres', JSON.stringify(this.parametresImport))
				formulaire.append('fichier', champ.files[0])
				axios.post(this.hote + '/api/importer-pad', formulaire, {
					onUploadProgress: (progression) => {
						const pourcentage = parseInt(Math.round((progression.loaded * 100) / progression.total))
						this.progressionImport = pourcentage
					}
				}).then((reponse) => {
					this.fermerModaleImporterPad()
					const donnees = reponse.data
					this.onglet = 'pads-crees'
					this.pads.push(donnees)
					this.padsCrees.push(donnees)
					this.classer(this.classement)
					this.$nextTick(() => {
						if (this.affichage === 'liste' && document.querySelector('#pad-' + donnees.id + ' a.meta')) {
							document.querySelector('#pad-' + donnees.id + ' a.meta')?.focus()
						} else if (this.affichage === 'mosaique' && document.querySelector('#pad-' + donnees.id + ' a')) {
							document.querySelector('#pad-' + donnees.id + ' a')?.focus()
						}
					})
					this.notification = this.$t('padImporte')
				}).catch((err) => {
					this.fermerModaleImporterPad()
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'erreur_import') {
						this.message = this.$t('erreurImportPad')
					} else if (err.response?.data === 'donnees_corrompues') {
						this.message = this.$t('donneesCorrompuesImportPad')
					} else if (err.response?.data === 'erreur_espace_disque') {
						this.message = this.$t('erreurEspaceDisque')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			} else {
				this.message = this.$t('formatFichierPasAccepte')
				champ.value = ''
			}
		},
		fermerModaleImporterPad () {
			this.modale = ''
			this.parametresImport.commentaires = false
			this.parametresImport.evaluations = false
			this.parametresImport.activite = false
			this.progressionImport = 0
			this.gererFocus()
		},
		afficherModaleAjouterPad () {
			if (this.padsCrees.length < this.limite) {
				this.elementPrecedent = (document.activeElement || document.body)
				this.modale = 'ajouter-pad'
				this.$nextTick(() => {
					document.querySelector('#ajout-pad input')?.focus()
				})
			} else {
				this.message = this.$t('limitePad', { limite: this.limite })
			}
		},
		extraireInfosPad (lien) {
			const resultat = lien.match(/\/p\/(\d+)\/([a-z0-9]+)/i)
			if (resultat) {
				return { padId: resultat[1], token: resultat[2] }
			}
			return null
		},
		ajouterPad () {
			if (this.lienAjouter === '' || this.motDePasseAjouter === '') {
				this.message = this.$t('remplirChamps')
				return
			}
			const infosPad = this.extraireInfosPad(this.lienAjouter)
			if (!infosPad) {
				this.message = this.$t('padInexistant')
				return
			}
			this.chargementModale = true
			axios.post(this.hote + '/api/rattacher-pad-compte', {
				identifiant: this.identifiant,
				padId: infosPad.padId,
				token: infosPad.token,
				motdepasse: this.motDePasseAjouter
			}).then((reponse) => {
				const donnees = reponse.data
				window.location.href = '/p/' + donnees.id + '/' + donnees.token
			}).catch((err) => {
				this.chargementModale = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else if (err.response?.data === 'pad_inexistant') {
					this.message = this.$t('padInexistant')
				} else if (err.response?.data === 'pad_cree_avec_compte') {
					this.message = this.$t('padCreeAvecCompte')
				} else if (err.response?.data === 'motdepasse_incorrect') {
					this.message = this.$t('motDePassePasCorrect')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		fermerModaleAjouterPad () {
			if (this.chargementModale) {
				return
			}
			this.modale = ''
			this.lienAjouter = ''
			this.motDePasseAjouter = ''
			this.gererFocus()
		},
		afficherModaleConfirmation (event, id, type) {
			event.preventDefault()
			event.stopPropagation()
			if (type === 'supprimer-compte') {
				this.fermerMenu()
			} else if (type === 'supprimer-dossier') {
				this.dossierId = id
			} else {
				this.padId = id
			}
			this.elementPrecedent = (document.activeElement || document.body)
			this.modaleConfirmation = type
			this.$nextTick(() => {
				document.querySelector('.modale .bouton')?.focus()
			})
		},
		fermerModaleConfirmation () {
			this.modaleConfirmation = ''
			this.padId = ''
			this.dossierId = ''
			this.gererFocus()
		},
		ajouterFavori (pad) {
			this.chargement = true
			axios.post(this.hote + '/api/ajouter-pad-favoris', {
				padId: pad.id,
				identifiant: this.identifiant
			}).then(() => {
				this.chargement = false
				this.padsFavoris.push(pad)
				this.favoris.push(pad.id)
				this.notification = this.$t('padAjouteFavoris')
				this.$nextTick(() => {
					document.querySelector('#pad-' + pad.id + ' .supprimer-favori')?.focus()
				})
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else {
					this.message = this.$t('erreurAjoutFavoris')
				}
			})
		},
		supprimerFavori (padId) {
			this.chargement = true
			axios.post(this.hote + '/api/supprimer-pad-favoris', {
				padId: padId,
				identifiant: this.identifiant
			}).then((reponse) => {
				this.chargement = false
				this.padsFavoris = this.padsFavoris.filter((pad) => pad.id !== padId)
				this.favoris = this.favoris.filter((favori) => favori !== padId)
				if (this.onglet === 'pads-favoris') {
					this.pads = this.pads.filter((pad) => pad.id !== padId)
					this.resultats = this.resultats.filter((pad) => pad.id !== padId)
				}
				this.notification = this.$t('padSupprimeFavoris')
				this.$nextTick(() => {
					document.querySelector('#pad-' + padId + ' .ajouter-favori')?.focus()
				})
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else {
					this.message = this.$t('erreurSuppressionFavoris')
				}
			})
		},
		verifierDossierPad (padId) {
			let padDansDossier = false
			this.dossiers.forEach((dossier) => {
				if (dossier.pads.includes(padId)) {
					padDansDossier = true
				}
			})
			return padDansDossier
		},
		verifierTitreDossier (padId) {
			let titreDossier = ''
			this.dossiers.forEach((dossier) => {
				if (dossier.pads.includes(padId)) {
					titreDossier = dossier.nom
				}
			})
			return titreDossier
		},
		afficherModaleDeplacerPad (padId) {
			this.padId = padId
			let dossierActuel = { id: 'aucun', nom: '' }
			this.dossiers.forEach((dossier) => {
				if (dossier.pads.includes(this.padId)) {
					dossierActuel = { id: dossier.id, nom: dossier.nom }
				}
			})
			this.dossierActuel = dossierActuel
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'deplacer-pad'
			this.$nextTick(() => {
				document.querySelector('.modale input')?.focus()
			})
		},
		deplacerPad () {
			const destination = document.querySelector('#champ-dossier-pad').value
			if (destination !== this.dossierActuel.id) {
				this.chargement = true
				this.modale = ''
				axios.post(this.hote + '/api/deplacer-pad', {
					padId: this.padId,
					destination: destination,
					identifiant: this.identifiant
				}).then(() => {
					this.chargement = false
					this.dossiers.forEach((dossier, indexDossier) => {
						if (dossier.id === destination && !dossier.pads.includes(this.padId)) {
							this.dossiers[indexDossier].pads.push(this.padId)
						} else if (dossier.pads.includes(this.padId)) {
							this.dossiers[indexDossier].pads = dossier.pads.filter((padId) => padId !== this.padId)
						}
					})
					if (this.onglet === this.dossierActuel.id) {
						this.pads = this.pads.filter((pad) => pad.id !== this.padId)
					}
					this.notification = this.$t('padDeplace')
					this.fermerModaleDeplacerPad()
				}).catch((err) => {
					this.chargement = false
					this.fermerModaleDeplacerPad()
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else {
						this.message = this.$t('erreurDeplacementPad')
					}
				})
			}
		},
		definirIdPad (event, id) {
			event.dataTransfer.setData('id', id)
		},
		gererDrag (event) {
			event.preventDefault()
			event.stopPropagation()
		},
		glisserDeplacerPad (event, destination) {
			let padId = event.dataTransfer.getData('id')
			if (padId !== '') {
				padId = parseInt(padId, 10)
				let dossierActuel = { id: 'aucun', nom: '' }
				this.dossiers.forEach((dossier) => {
					if (dossier.pads.includes(padId)) {
						dossierActuel = { id: dossier.id, nom: dossier.nom }
					}
				})
				if (destination !== dossierActuel.id) {
					this.chargement = true
					axios.post(this.hote + '/api/deplacer-pad', {
						padId: padId,
						destination: destination,
						identifiant: this.identifiant
					}).then(() => {
						this.chargement = false
						this.dossiers.forEach((dossier, indexDossier) => {
							if (dossier.id === destination && !dossier.pads.includes(padId)) {
								this.dossiers[indexDossier].pads.push(padId)
							} else if (dossier.pads.includes(padId)) {
								this.dossiers[indexDossier].pads = dossier.pads.filter((id) => id !== padId)
							}
						})
						if (this.onglet === dossierActuel.id) {
							this.pads = this.pads.filter((pad) => pad.id !== padId)
						}
						this.notification = this.$t('padDeplace')
					}).catch((err) => {
						this.chargement = false
						if (err.response?.data === 'non_connecte') {
							window.location.replace('/')
						} else {
							this.message = this.$t('erreurDeplacementPad')
						}
					})
				}
			}
		},
		fermerModaleDeplacerPad () {
			this.modale = ''
			this.padId = ''
			this.dossierActuel = {}
			this.gererFocus()
		},
		dupliquerPad () {
			this.modaleConfirmation = ''
			if (this.padsCrees.length >= this.limite) {
				this.message = this.$t('limitePad', { limite: this.limite })
				return
			}
			this.chargement = true
			const onglets = ['pads-crees', 'pads-rejoints', 'pads-admins', 'pads-favoris', 'pads-corbeille']
			let dossierId = ''
			if (this.onglet !== '' && !onglets.includes(this.onglet)) {
				dossierId = this.onglet
			}
			axios.post(this.hote + '/api/dupliquer-pad', {
				padId: this.padId,
				identifiant: this.identifiant,
				dossier: dossierId
			}).then((reponse) => {
				this.chargement = false
				const donnees = reponse.data
				this.pads.push(donnees)
				this.padsCrees.push(donnees)
				if (dossierId !== '') {
					this.dossiers.forEach((dossier, indexDossier) => {
						if (dossier.id === dossierId) {
							this.dossiers[indexDossier].pads.push(donnees.id)
						}
					})
				} else {
					this.onglet = 'pads-crees'
				}
				this.classer(this.classement)
				this.$nextTick(() => {
					if (this.affichage === 'liste' && document.querySelector('#pad-' + donnees.id + ' a.meta')) {
						document.querySelector('#pad-' + donnees.id + ' a.meta')?.focus()
					} else if (this.affichage === 'mosaique' && document.querySelector('#pad-' + donnees.id + ' a')) {
						document.querySelector('#pad-' + donnees.id + ' a')?.focus()
					}
				})
				this.notification = this.$t('padDuplique')
				this.padId = ''
			}).catch((err) => {
				this.chargement = false
				this.padId = ''
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'erreur_duplication') {
					this.message = this.$t('erreurDuplicationPad')
				} else if (err.response?.data === 'erreur_espace_disque') {
					this.message = this.$t('erreurEspaceDisque')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		exporterPad () {
			this.modaleConfirmation = ''
			this.chargement = true
			axios.post(this.hote + '/api/exporter-pad', {
				padId: this.padId,
				identifiant: this.identifiant,
				admin: ''
			}).then((reponse) => {
				this.chargement = false
				saveAs('/temp/' + reponse.data, 'pad-' + this.padId + '.zip')
				this.padId = ''
			}).catch((err) => {
				this.chargement = false
				this.padId = ''
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'erreur_export') {
					this.message = this.$t('erreurExportPad')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else if (err.response?.data === 'pad_inexistant') {
					this.message = this.$t('padInexistant')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		restaurerPad (pad) {
			this.chargement = true
			const padId = pad.id
			axios.post(this.hote + '/api/restaurer-pad', {
				padId: padId,
				identifiant: this.identifiant
			}).then(() => {
				this.chargement = false
				this.padsCrees.push(pad)
				this.padsCorbeille = this.padsCorbeille.filter((pad) => {
					if (pad.id === padId) {
						if (pad.favori === true) {
							this.padsFavoris.push(pad)
							this.favoris.push(padId)
						}
						if (pad.dossier !== '') {
							this.dossiers.forEach((dossier, indexDossier) => {
								if (dossier.id === pad.dossier) {
									this.dossiers[indexDossier].pads.push(padId)
								}
							})
						}
						return false
					}
					return true
				})
				this.pads = this.pads.filter((pad) => pad.id !== padId)
				this.resultats = this.resultats.filter((pad) => pad.id !== padId)
				this.classer(this.classement)
				this.notification = this.$t('padRestaure')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		mettrePadCorbeille (pad) {
			this.chargement = true
			const padId = pad.id
			axios.post(this.hote + '/api/mettre-pad-corbeille', {
				padId: padId,
				identifiant: this.identifiant
			}).then(() => {
				this.chargement = false
				pad.favori = false
				pad.dossier = ''
				this.padsFavoris = this.padsFavoris.filter((favori) => {
					if (favori.id === padId) {
						pad.favori = true
						return false
					}
					return true
				})
				this.dossiers.forEach((dossier, index) => {
					if (dossier.pads.includes(padId)) {
						this.dossiers[index].pads = dossier.pads.filter((id) => id !== padId)
						pad.dossier = dossier.id
					}
				})
				this.padsCorbeille.push(pad)
				this.padsCrees = this.padsCrees.filter((pad) => pad.id !== padId)
				this.pads = this.pads.filter((pad) => pad.id !== padId)
				this.favoris = this.favoris.filter((favori) => favori !== padId)
				this.resultats = this.resultats.filter((pad) => pad.id !== padId)
				this.classer(this.classement)
				this.notification = this.$t('padDansCorbeille')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		supprimerPad () {
			this.modaleConfirmation = ''
			this.chargement = true
			const type = this.definirTypePad(this.padId)
			axios.post(this.hote + '/api/supprimer-pad', {
				padId: this.padId,
				type: type,
				identifiant: this.identifiant,
				admin: ''
			}).then(() => {
				this.chargement = false
				this.padsCorbeille = this.padsCorbeille.filter((pad) => pad.id !== this.padId)
				this.padsRejoints = this.padsRejoints.filter((pad) => pad.id !== this.padId)
				this.padsAdmins = this.padsAdmins.filter((pad) => pad.id !== this.padId)
				this.padsFavoris = this.padsFavoris.filter((pad) => pad.id !== this.padId)
				this.favoris = this.favoris.filter((favori) => favori !== this.padId)
				this.pads = this.pads.filter((pad) => pad.id !== this.padId)
				this.resultats = this.resultats.filter((pad) => pad.id !== this.padId)
				this.dossiers.forEach((dossier, indexDossier) => {
					if (dossier.pads.includes(this.padId)) {
						this.dossiers[indexDossier].pads = dossier.pads.filter((id) => id !== this.padId)
					}
				})
				this.notification = this.$t('padSupprime')
				this.padId = ''
			}).catch((err) => {
				this.chargement = false
				this.padId = ''
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else if (err.response?.data === 'erreur_suppression') {
					this.message = this.$t('erreurSuppressionPad')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		viderCorbeille () {
			this.modaleConfirmation = ''
			this.chargement = true
			const pads = this.padsCorbeille.map((pad) => pad.id)
			axios.post(this.hote + '/api/vider-corbeille', {
				pads: pads,
				identifiant: this.identifiant
			}).then(() => {
				this.chargement = false
				this.padsCorbeille = []
				this.pads = this.pads.filter((pad) => !pads.includes(pad.id))
				this.resultats = this.resultats.filter((pad) => !pads.includes(pad.id))
				this.notification = this.$t('corbeilleVidee')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		definirTypePad (padId) {
			let type = ''
			this.padsRejoints.forEach((pad) => {
				if (pad.id === padId) {
					type = 'pad-rejoint'
				}
			})
			this.padsAdmins.forEach((pad) => {
				if (pad.id === padId) {
					type = 'pad-admin'
				}
			})
			return type
		},
		rechercher () {
			let resultats = []
			if (this.requete === '!maj') {
				resultats = this.pads.filter((element) => {
					return element.notification && element.notification.includes(this.identifiant)
				})
			} else {
				resultats = this.pads.filter((element) => {
					return element.titre.toLowerCase().includes(this.requete.toLowerCase())
				})
			}
			this.resultats = resultats
		},
		classer (classement) {
			let pads = this.pads
			if (this.requete !== '') {
				pads = this.resultats
			}
			switch (classement) {
			case 'date-asc':
				pads.sort((a, b) => {
					const dateA = new Date(a.date).getTime()
					const dateB = new Date(b.date).getTime()
					return dateA > dateB ? 1 : -1
				})
				break
			case 'date-desc':
				pads.sort((a, b) => {
					const dateA = new Date(a.date).getTime()
					const dateB = new Date(b.date).getTime()
					return dateA < dateB ? 1 : -1
				})
				break
			case 'alpha-asc':
				pads.sort((a, b) => {
					const a1 = a.titre.toLowerCase()
					const b1 = b.titre.toLowerCase()
					return a1 < b1 ? -1 : a1 > b1 ? 1 : 0
				})
				break
			case 'alpha-desc':
				pads.sort((a, b) => {
					const a1 = a.titre.toLowerCase()
					const b1 = b.titre.toLowerCase()
					return a1 > b1 ? -1 : a1 < b1 ? 1 : 0
				})
				break
			}
			if (this.requete === '') {
				this.pads = pads
			} else {
				this.resultats = pads
			}
		},
		modifierClassement (classement) {
			if (this.classement !== classement) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-classement', {
					identifiant: this.identifiant,
					classement: classement
				}).then(() => {
					this.chargement = false
					this.classer(classement)
					this.classement = classement
					this.notification = this.$t('classementModifie')
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		modifierInformations () {
			const nom = document.querySelector('#nom').value.trim()
			const email = document.querySelector('#email').value.trim()
			if ((nom !== '' && nom !== this.nom) || (email !== this.email)) {
				if (this.email !== '' && email === '') {
					this.message = this.$t('erreurEmailVide')
					return
				}
				if (email !== '' && this.$verifierEmail(email) === false) {
					this.message = this.$t('erreurEmail')
					return
				}
				this.chargement = true
				axios.post(this.hote + '/api/modifier-informations', {
					identifiant: this.identifiant,
					nom: nom,
					email: email
				}).then(() => {
					this.chargement = false
					this.nom = nom
					this.email = email
					this.notification = this.$t('informationsModifiees')
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'email_existe_deja') {
						this.message = this.$t('emailExisteDeja', { email: email })
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		afficherModaleEmail () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'email'
		},
		renseignerEmail () {
			this.modale = ''
			this.menu = true
			setTimeout(() => {
				document.querySelector('.menu').classList.add('ouvert')
				document.querySelector('#email')?.focus()
			}, 0)
		},
		fermerModaleEmail () {
			this.modale = ''
			this.gererFocus()
		},
		afficherModaleMotDePasse () {
			this.menu = false
			this.modale = 'mot-de-passe'
			this.$nextTick(() => {
				document.querySelector('#champ-motdepasse-actuel')?.focus()
			})
		},
		modifierMotDePasse () {
			const motDePasse = this.motDePasse
			const nouveauMotDePasse = this.nouveauMotDePasse.trim()
			const confirmationNouveauMotDePasse = this.confirmationNouveauMotDePasse.trim()
			if (nouveauMotDePasse === confirmationNouveauMotDePasse && nouveauMotDePasse !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/modifier-mot-de-passe', {
					identifiant: this.identifiant,
					motdepasse: motDePasse,
					nouveaumotdepasse: nouveauMotDePasse
				}).then(() => {
					this.chargement = false
					this.notification = this.$t('motDePasseModifie')
					this.fermerModaleMotDePasse()
				}).catch((err) => {
					this.chargement = false
					this.fermerModaleMotDePasse()
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'motdepasse_incorrect') {
						this.message = this.$t('motDePasseActuelPasCorrect')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			} else if (nouveauMotDePasse !== confirmationNouveauMotDePasse) {
				this.message = this.$t('nouveauxMotsDePasseCorrespondentPas')
			}
		},
		fermerModaleMotDePasse () {
			this.modale = ''
			this.motDePasse = ''
			this.nouveauMotDePasse = ''
			this.confirmationNouveauMotDePasse = ''
			this.gererFocus()
		},
		modifierLangue (langue) {
			if (this.langue !== langue) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-langue', {
					identifiant: this.identifiant,
					langue: langue
				}).then((reponse) => {
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
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		modifierAffichage (affichage) {
			if (this.affichage !== affichage) {
				this.chargement = true
				axios.post(this.hote + '/api/modifier-affichage', {
					identifiant: this.identifiant,
					affichage: affichage
				}).then(() => {
					this.chargement = false
					this.affichage = affichage
					this.notification = this.$t('affichageModifie')
				}).catch((err) => {
					this.chargement = false
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		afficherModaleAjouterDossier () {
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'ajouter-dossier'
			this.$nextTick(() => {
				document.querySelector('#ajout-dossier input')?.focus()
			})
		},
		ajouterDossier () {
			if (this.dossier !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/ajouter-dossier', {
					dossier: this.dossier,
					identifiant: this.identifiant
				}).then((reponse) => {
					this.chargement = false
					const donnees = reponse.data
					this.dossiers.push(donnees)
					this.notification = this.$t('dossierAjoute')
					this.dossier = ''
				}).catch((err) => {
					this.chargement = false
					this.dossier = ''
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else if (err.response?.data === 'erreur_ajout_dossier') {
						this.message = this.$t('erreurAjoutDossier')
					} else {
						this.message = this.$t('erreurCommunicationServeur')
					}
				})
			}
		},
		fermerModaleAjouterDossier () {
			this.modale = ''
			this.dossier = ''
			this.gererFocus()
		},
		afficherModaleModifierDossier (event, id) {
			event.preventDefault()
			event.stopPropagation()
			this.dossiers.forEach((dossier) => {
				if (dossier.id === id) {
					this.dossier = dossier.nom
				}
			})
			this.dossierId = id
			this.elementPrecedent = (document.activeElement || document.body)
			this.modale = 'modifier-dossier'
			this.$nextTick(() => {
				document.querySelector('#modification-dossier input')?.focus()
			})
		},
		modifierDossier () {
			if (this.dossier !== '') {
				this.modale = ''
				this.chargement = true
				axios.post(this.hote + '/api/modifier-dossier', {
					dossier: this.dossier,
					dossierId: this.dossierId,
					identifiant: this.identifiant
				}).then(() => {
					this.chargement = false
					this.dossiers.forEach((dossier, index) => {
						if (dossier.id === this.dossierId) {
							this.dossiers[index].nom = this.dossier
						}
					})
					this.notification = this.$t('dossierModifie')
					this.fermerModaleModifierDossier()
				}).catch((err) => {
					this.chargement = false
					this.fermerModaleModifierDossier()
					if (err.response?.data === 'non_connecte') {
						window.location.replace('/')
					} else {
						this.message = this.$t('erreurModificationDossier')
					}
				})
			}
		},
		fermerModaleModifierDossier () {
			this.modale = ''
			this.dossier = ''
			this.dossierId = ''
			this.gererFocus()
		},
		supprimerDossier () {
			this.modaleConfirmation = ''
			this.chargement = true
			axios.post(this.hote + '/api/supprimer-dossier', {
				dossierId: this.dossierId,
				identifiant: this.identifiant
			}).then(() => {
				this.chargement = false
				this.dossiers = this.dossiers.filter((dossier) => dossier.id !== this.dossierId)
				this.onglet = 'pads-crees'
				this.notification = this.$t('dossierSupprime')
				this.dossierId = ''
			}).catch((err) => {
				this.chargement = false
				this.dossierId = ''
				if (err.response?.data === 'non_connecte') {
					window.location.replace('/')
				} else {
					this.message = this.$t('erreurSuppressionDossier')
				}
			})
		},
		supprimerCompte () {
			this.chargement = true
			this.modaleConfirmation = ''
			const identifiant = this.identifiant
			axios.post(this.hote + '/api/supprimer-compte', {
				identifiant: identifiant,
				admin: ''
			}).then(() => {
				this.$socket.emit('deconnexion', identifiant)
				window.location.replace('/')
			}).catch((err) => {
				this.chargement = false
				if (err.response?.data === 'non_autorise') {
					this.message = this.$t('actionNonAutorisee')
				} else {
					this.message = this.$t('erreurCommunicationServeur')
				}
			})
		},
		deconnexion () {
			this.chargement = true
			const identifiant = this.identifiant
			axios.post(this.hote + '/api/deconnexion').then(() => {
				this.$socket.emit('deconnexion', identifiant)
				window.location.replace('/')
			}).catch(() => {
				this.chargement = false
				this.message = this.$t('erreurCommunicationServeur')
			})
		},
		fermerModale () {
			if (this.modale === 'mot-de-passe') {
				this.fermerModaleMotDePasse()
			} else if (this.modale === 'creer-pad') {
				this.fermerModaleCreerPad()
			} else if (this.modale === 'deplacer-pad') {
				this.fermerModaleDeplacerPad()
			} else if (this.modale === 'importer-pad') {
				this.fermerModaleImporterPad()
			} else if (this.modale === 'ajouter-pad') {
				this.fermerModaleAjouterPad()
			} else if (this.modale === 'ajouter-dossier') {
				this.fermerModaleAjouterDossier()
			} else if (this.modale === 'modifier-dossier') {
				this.fermerModaleModifierDossier()
			} else {
				this.modale = ''
				this.gererFocus()
			}
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
			} else if (event.key === 'Escape' && this.modaleConfirmation !== '') {
				this.fermerModaleConfirmation()
			} else if (event.key === 'Escape' && this.modale !== '') {
				this.fermerModale()
			} else if (event.key === 'Escape' && this.menu) {
				this.fermerMenu()
			} else if (event.key === 'Tab') {
				if (this.message !== '') {
					const modale = document.querySelector('#message')
					this.piegerFocus(event, modale)
				} else if (this.modaleConfirmation !== '' || this.modale !== '') {
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
			const focusables = Array.from(conteneur.querySelectorAll('label.bouton-interrupteur, label.bouton, a[href], button, textarea, input:not([type="checkbox"]):not([type="file"]), select, [tabindex]:not([tabindex="-1"])')).filter(el => !el.disabled && el.tabIndex >= 0 && isVisible(el))
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
		gererClavierMenu (event) {
			const items = [...document.querySelectorAll('#menu-utilisateur [role="menuitem"]')]
			if (items.length === 0) return
			const index = items.indexOf(document.activeElement)
			switch (event.key) {
			case 'ArrowDown':
				event.preventDefault()
				items[(index + 1) % items.length].focus()
				break
			case 'ArrowUp':
				event.preventDefault()
				items[(index - 1 + items.length) % items.length].focus()
				break
			case 'Home':
				event.preventDefault()
				items[0].focus()
				break
			case 'End':
				event.preventDefault()
				items[items.length - 1].focus()
				break
			case 'Escape':
				this.fermerMenu()
				break
			case 'Tab':
				this.fermerMenu()
				break
			}
		}
	}
}
</script>

<style scoped>
#page {
	width: 100%;
	height: 100%;
}

#boutons {
	display: flex;
	justify-content: center;
	flex-wrap: wrap;
	column-gap: 1.5rem;
	margin-bottom: 1.5rem;
}

#bouton-importer,
#bouton-creer,
#bouton-ajouter {
	display: inline-flex;
	justify-content: center;
	align-items: center;
	width: 220px;
	line-height: 1;
	font-size: 1.6rem;
	font-weight: 700;
	text-transform: uppercase;
	padding: 0.75em 1em;
	border: 2px solid #00ced1;
	border-radius: 2em;
	margin-bottom: 1.5rem;
	background: #46fbff;
	cursor: pointer;
	transition: all 0.1s ease-in;
	text-align: center;
}

#bouton-importer.desactive,
#bouton-creer.desactive,
#bouton-ajouter.desactive {
	border: 2px solid #777;
	background: #aaa;
	cursor: default;
}

#bouton-importer:not(.desactive):hover,
#bouton-creer:not(.desactive):hover,
#bouton-ajouter:not(.desactive):hover {
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.2);
	background: #fff;
}

#identifiant {
	background: #e9e9e9;
}

#deconnexion {
	color: #ff6259;
	margin-bottom: 3rem;
}

.menu .bouton-rouge,
.menu .bouton-bleu {
	margin-top: 3rem;
}

.menu .bouton-rouge {
	margin-bottom: 3rem;
}

#onglets {
	position: absolute;
	top: 4rem;
	left: 4rem;
	height: calc(100% - 4rem);
	width: 30rem;
	padding: 3rem 1.5rem;
	border-right: 1px solid #ddd;
	overflow: auto;
	-webkit-overflow-scrolling: touch;
}

#onglets .onglet {
	position: relative;
	display: block;
	width: 100%;
	text-align: left;
	padding-bottom: 0.5rem;
	margin-bottom: 2rem;
	font-size: 1.8rem;
	border-bottom: 3px solid transparent;
	cursor: pointer;
}

#onglets .onglet.actif {
	font-weight: 700;
	border-bottom: 3px solid #00ced1;
}

#actions-corbeille button,
#onglets .bouton-ajouter {
	display: inline-block;
	font-weight: 700;
	font-size: 12px;
	text-transform: uppercase;
	height: 32px;
	line-height: 32px;
	padding: 0 20px;
	color: #001d1d;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.1);
	background: #00ced1;
	border-radius: 5px;
	letter-spacing: 1px;
	text-indent: 1px;
	text-align: center;
	transition: all 0.1s ease-in;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	width: 100%;
	margin-bottom: 3rem;
	cursor: pointer;
}

#actions-corbeille button:hover,
#onglets .bouton-ajouter:hover {
	color: #fff;
	background: #001d1d;
}

#actions-corbeille button:disabled,
#actions-corbeille button:disabled:hover {
	color: #001d1d;
	background: #bfbfbf;
}

#onglets .onglet .menu-dossier {
	visibility: hidden;
	position: absolute;
	color: #fff;
	top: 0;
	right: 0;
	line-height: 1;
	font-size: 24px;
	padding: 3px 1rem;
	background: rgba(0, 0, 0, 0.25);
	border-radius: 4px;
	opacity: 0;
	transition: opacity 0.25s ease-in-out;
}

#onglets .onglet:hover .menu-dossier {
	visibility: visible;
	opacity: 1;
}

#onglets .onglet .menu-dossier button.supprimer {
	color: #ff6259;
	cursor: pointer;
}

#onglets .onglet .menu-dossier button + button {
	margin-left: 1rem;
}

#onglets .onglet > span {
	margin-right: 0.7rem;
	vertical-align: middle;
}

#onglets .onglet .badge {
	display: inline-block;
	width: 2rem;
	height: 2rem;
	background: #e32f6c;
	margin-right: 0;
	border-radius: 50%;
	font-size: 1.2rem;
	color: #fff;
	line-height: 2rem;
	text-align: center;
	vertical-align: middle;
}

#pads {
	position: absolute;
	top: 4rem;
	left: 34rem;
	padding: 3rem 1.5rem;
	height: calc(100% - 4rem);
	width: calc(100% - 34rem);
	overflow: auto;
	-webkit-overflow-scrolling: touch;
}

#pads.liste {
	padding: 3rem 1.5rem;
}

#pads.mosaique {
	padding: 3rem 0.75rem;
}

.vide {
	text-align: center;
	font-size: 1.7rem;
	padding: 2.5rem 0;
	border-top: 1px dotted #ddd;
	border-bottom: 1px dotted #ddd;
	margin: 0 0 3rem;
}

#afficher {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	margin-bottom: 3rem;
	width: 100%;
	font-size: 0;
}

.mosaique #actions-dossier,
.mosaique #afficher {
	padding: 0 0.75rem;
}

#afficher .rechercher,
#afficher .classer {
	display: flex;
	align-items: center;
	width: calc(50% - (24px + 2.5rem));
}

#afficher .classer,
#afficher .rechercher {
	margin-right: 2rem;
}

#afficher .afficher button,
#afficher .classer label,
#afficher .rechercher label {
	font-size: 24px;
	margin-right: 1rem;
}

#afficher .afficher button {
	display: inline-block;
	width: 24px;
	height: 24px;
	line-height: 1;
}

#afficher .classer select,
#afficher .rechercher input {
	width: calc(100% - (24px + 1rem));
}

#afficher select,
#afficher input[type="search"] {
	font-size: 16px;
	border: 1px solid #ddd;
	border-radius: 4px;
	padding: 1rem 1.5rem;
	text-align: left;
}

#afficher select {
	background: url('data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="14" viewBox="0 0 29 14" width="29"><path fill="%23000000" d="M9.37727 3.625l5.08154 6.93523L19.54036 3.625" /></svg>') center right no-repeat;
	padding-right: 3rem;
}

#afficher .afficher button {
	cursor: pointer;
}

#afficher .afficher button:last-child {
	margin-right: 0;
}

#actions-corbeille,
#actions-dossier {
	display: flex;
	justify-content: flex-end;
	align-items: center;
	font-size: 16px;
	margin-bottom: 3rem;
}

#actions-dossier .conteneur {
	display: flex;
	justify-content: flex-start;
	align-items: center;
	padding: 3px 1rem;
	background: rgba(0, 0, 0, 0.25);
	border-radius: 4px;
}

#actions-dossier button {
	color: #fff;
	font-size: 24px;
	margin-left: 1.4rem;
}

#actions-corbeille button {
	width: auto;
	margin-bottom: 0;
}

#actions-dossier button.supprimer {
	color: #ff6259;
}

.pads {
	margin-bottom: 3rem;
}

.mosaique .pads {
	display: flex;
	flex-wrap: wrap;
}

.pad.liste {
	border-top: 1px solid #ddd;
	padding: 2rem 0;
	display: flex;
	align-items: center;
}

.pad.liste:last-child {
	border-bottom: 1px solid #ddd;
}

.pad.liste .fond {
	width: 5rem;
	height: 5rem;
	line-height: 5rem;
	border-radius: 50%;
	background-size: cover;
	background-position: center;
	background-repeat: no-repeat;
	margin-right: 2rem;
	flex-shrink: 0;
}

.pad.liste .meta {
	flex-grow: 1;
}

.pad.liste .titre {
	font-size: 1.8rem;
	font-weight: 700;
}

.pad.liste .vues,
.pad.liste .auteur,
.pad.liste .date {
	font-size: 1.2rem;
	color: #777;
}

.pad.liste .actions {
	display: flex;
	margin-left: 0.5rem;
	line-height: 1;
}

.pad.liste .actions button,
.pad.liste .actions span {
	margin-left: 1.5rem;
	font-size: 24px;
	color: #001d1d;
	cursor: pointer;
}

.pad.mosaique .actions button.supprimer-favori,
.pad.liste .actions button.supprimer-favori {
	color: #fdcc33;
}

.pad.mosaique .actions button.deplacer.actif,
.pad.liste .actions button.deplacer.actif {
	color: #e32f6c;
}

.conteneur-pads {
	display: flex;
	flex-wrap: wrap;
	padding: 0 0.75rem;
}

.pad.mosaique {
	padding: 0 0 4rem;
	width: calc(50% - 1.5rem);
	height: 20rem;
	border: 2px solid #001d1d;
	margin: 0 0.75rem 1.5rem;
	position: relative;
	border-radius: 1rem;
}

.pad.mosaique .conteneur {
	display: flex;
	justify-content: center;
	align-items: center;
	padding: 0;
	width: 100%;
	height: 100%;
	cursor: pointer;
	border-top-left-radius: 1rem;
	border-top-right-radius: 1rem;
}

.pad.mosaique .conteneur.fond-personnalise {
	background-size: cover;
	background-repeat: no-repeat;
	background-position: center;
}

.pad.mosaique .meta {
	width: 100%;
	padding: 1.5rem;
	background: rgba(0, 0, 0, 0.7);
	text-align: center;
}

.pad.mosaique .titre {
	display: block;
	color: #fff;
	text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.3);
	font-size: 2rem;
	line-height: 1.4;
	font-weight: 700;
}

.pad.mosaique .vues,
.pad.mosaique .auteur,
.pad.mosaique .date {
	margin-top: 0.5rem;
	color: #ddd;
	font-size: 1.2rem;
	display: inline-block;
}

.pad.mosaique .vues {
	margin-left: 0.35rem;
}

.pad.mosaique .actions {
	position: absolute;
	display: flex;
	justify-content: space-evenly;
	align-items: center;
	height: 4rem;
	left: 0;
	right: 0;
	bottom: 0;
	width: 100%;
	font-size: 24px;
	border-top: 1px dashed #ddd;
	line-height: 1;
}

.pad.mosaique .actions button {
	color: #001d1d;
	cursor: pointer;
	text-align: center;
	display: inline-block;
}

.pad.liste .actions .supprimer,
.pad.mosaique .actions .supprimer {
	color: #ff6259;
}

.pad.liste .actions .admin,
.pad.mosaique .actions .admin {
	color: #00ced1;
}

.pad .mise-a-jour {
	width: 1rem;
	height: 1rem;
	display: inline-block;
	border-radius: 50%;
	background: #e32f6c;
	margin-right: 0.7rem;
}

.pad.mosaique .mise-a-jour {
	margin-right: 5px;
}

#import label:not(.bouton-interrupteur) {
	width: 100%;
	text-align: center;
	margin-top: 10px;
}

.progression .chargement {
	border-top: 0.7rem solid #00ced1;
	margin-top: 1rem;
}

.modale .conteneur-interrupteur {
	display: flex;
	justify-content: space-between;
	margin-bottom: 1rem;
	line-height: 2.2rem;
}

.modale .conteneur-interrupteur > span {
	font-size: 16px;
}

.modale .bouton-interrupteur {
	position: relative;
	display: inline-block!important;
	width: 3.8rem!important;
	height: 2.2rem;
	margin: 0;
}

.modale .bouton-interrupteur input {
	opacity: 0;
	width: 0;
	height: 0;
}

.modale .bouton-interrupteur .barre {
	position: absolute;
	cursor: pointer;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background-color: #ccc;
	transition: 0.2s;
	border-radius: 3rem;
}

.modale .bouton-interrupteur .barre:before {
	position: absolute;
	content: '';
	height: 1.6rem;
	width: 1.6rem;
	left: 0.3rem;
	bottom: 0.3rem;
	background-color: #fff;
	transition: 0.2s;
	border-radius: 50%;
}

.modale .bouton-interrupteur input:checked + .barre {
	background-color: #00ced1;
}

.modale .bouton-interrupteur input:focus + .barre {
	box-shadow: 0 0 1px #00ced1;
}

.modale .bouton-interrupteur input:checked + .barre:before {
	transform: translateX(1.6rem);
}

#modale-email {
	max-width: 500px;
}

#modale-email .message {
	font-size: 18px;
	text-align: center;
	line-height: 1.5;
}

#modale-email .bouton {
	margin-top: 20px;
}

#modale-email .actions {
	font-size: 0;
}

@media screen and (max-width: 479px) {
	#afficher {
		flex-wrap: wrap;
	}

	#afficher .rechercher {
		width: 100%;
		margin-right: 0;
		margin-bottom: 1.5rem;
	}

	#afficher .classer {
		width: 100%;
		margin-right: 0;
		margin-bottom: 1.5rem;
	}

	#afficher .afficher {
		line-height: 1;
	}
}

@media screen and (orientation: landscape) and (max-height: 479px) {
	#modale-motdepasse {
		height: 90%;
	}
}

@media screen and (max-width: 575px) {
	#onglets .onglet {
		font-size: 16px;
	}

	#pads .vide {
		font-size: 16px;
	}

	.pad.liste .titre {
		font-size: 16px;
	}

	.pad.mosaique .titre {
		font-size: 1.7rem;
	}
}

@media screen and (max-width: 599px) {
	.pad.liste {
		flex-wrap: wrap;
		padding: 2rem 0 1rem;
	}

	.pad.liste .fond {
		width: 35px;
		height: 35px;
		line-height: 35px;
		margin-right: 15px;
	}

	.pad.liste .meta {
		width: calc(100% - 50px)!important;
	}

	.pad.liste .actions {
		width: 100%;
		justify-content: space-around;
		margin-left: 0;
		margin-top: 2rem;
		padding-top: 1rem;
		border-top: 1px dotted #ddd;
	}

	.pad.liste .actions button {
		margin-left: 0;
	}
}

@media screen and (max-width: 1023px) {
	#onglets {
		position: absolute;
		top: 4rem;
		left: 4rem;
		height: 5rem;
		width: calc(100% - 4rem);
		display: flex;
		align-items: center;
		padding: 0 1.5rem;
		border-bottom: 1px solid #ddd;
	}

	#onglets .onglet {
		width: auto;
		text-align: left;
		padding-bottom: 0;
		margin-right: 2rem;
		margin-bottom: 0;
		border-bottom: 3px solid transparent;
		flex: 0 0 auto;
	}

	#onglets .onglet:hover .menu-dossier,
	#onglets .onglet .menu-dossier {
		display: none;
	}

	#onglets .bouton-ajouter {
		min-width: 200px;
		max-width: 250px;
		margin-bottom: 0!important;
	}

	#pads {
		position: absolute;
		top: 9rem;
		left: 4rem;
		padding: 3rem 1.5rem;
		height: calc(100% - 9rem);
		width: calc(100% - 4rem);
	}
}

@media screen and (min-width: 1024px) and (max-width: 1439px) {
	#onglets {
		width: 23rem;
	}

	#pads {
		left: 27rem;
		width: calc(100% - 27rem);
	}
}

@media screen and (max-width: 767px) {
	.pad.mosaique {
		width: calc(100% - 1.5rem);
	}
}

@media screen and (min-width: 768px) and (max-width: 1439px) {
	.pad.mosaique {
		width: calc(50% - 1.5rem);
	}
}

@media screen and (min-width: 1440px) {
	.pad.mosaique {
		width: calc(33.333333333% - 1.5rem);
	}
}
</style>

<style>
#modale-email .message p:last-child {
	margin-bottom: 0;
}
</style>
