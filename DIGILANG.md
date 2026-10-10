# Digipad pour DigiLang (« Mur », DigiLang Board)

Ce dépôt est une copie de [Digipad](https://codeberg.org/ladigitale/digipad), logiciel libre de
[La Digitale](https://ladigitale.dev) publié sous licence AGPL-3.0. Il fait tourner
`https://board.digilang.fr`, où les enseignants de DigiLang créent leurs murs (outil « Mur » de DigiLang).

- `master` : copie fidèle de Digipad (La Digitale), sans modification.
- `digilang` : nos modifications, déployées sur le serveur. Ce code source modifié est public (article 13 de l'AGPL) ;
  chaque mur affiche « Propulsé par Digipad, logiciel libre (AGPL) de La Digitale » et un lien vers ce dépôt.

## Ce que change la branche `digilang`

- Couleurs de DigiLang : `#00ced1` → teal `#1F7A70`, `#d1245e` → terracotta `#C7431D`, `#001d1d` → teal foncé
  `#17605A` en fond et encre `#1f2937` en texte, en-tête `#242f3d` → teal, barre de gauche `#2c2d30` → teal foncé.
  Texte blanc sur les boutons devenus teal (contraste AA), icône de déconnexion `#FFC9BC` sur la barre foncée.
- Police Figtree (SIL OFL, `public/fonts/Figtree-*.woff2`) à la place de Mona Sans et Roboto Slab.
- Logo de DigiLang dans l'en-tête (`public/img/digilang.png`), favicon et icônes de l'application (`public/img/icones`),
  image de partage `public/img/digilang-og.png`, `manifest.json` (« DigiLang Board »).
- Titres d'onglet « … - DigiLang » au lieu de « … - Digipad by La Digitale », métadonnées.
- Fond uni `#F4F6F5` pour un nouveau mur (`server/fonctions-db.js`) ; les fonds de Digipad restent proposés.
- Mention de La Digitale et lien vers le code source dans le menu des paramètres du mur (enseignant) et dans le menu
  des langues (élèves) : `.credit-digilang` dans `pages/p/pad.html` et `pad.css`, clé `creditDigipad` dans
  `renderer/lang/*.json`.

## Mettre à jour Digipad

```
git remote add upstream https://codeberg.org/ladigitale/digipad.git
git fetch upstream
git checkout master
git merge --ff-only upstream/master
git checkout digilang
git merge master
```

En cas de conflit, garder la version de La Digitale puis réappliquer le changement décrit ci-dessus. Vérifier ensuite
`npx vike build`, puis déployer sur le VPS (`docs/vps/04-digilang-board.md` dans le dépôt DigiLang).
