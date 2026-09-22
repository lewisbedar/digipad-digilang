# Digipad

Digipad est une application en ligne pour créer des murs collaboratifs. 

Elle est publiée sous licence GNU AGPLv3.
Sauf les fontes Roboto Slab et Material Icons (Apache License Version 2.0) et la fonte Mona Sans Expanded (Sil Open Font Licence 1.1), jsPanel4 (https://github.com/Flyer53/jsPanel4 - MIT), pdf.js (https://github.com/mozilla/pdf.js - Apache License Version 2.0), JavaScript-flexImages (https://github.com/Pixabay/JavaScript-flexImages - MIT), panzoom (https://github.com/timmywil/panzoom - MIT)

## Prérequis
Node.js 22+, Redis 7+, GraphicsMagick, Ghostscript, Libre Office

## Préparation et installation des dépendances
```
npm install --allow-git=root
```

## Lancement du serveur de développement sur localhost:3000
```
npm run dev
```

## Variables d'environnement (fichier .env à créer à la racine du dossier)
```
DOMAIN (protocole + domaine. ex : https://digipad.app / seulement utilisée en production)
PORT (port du serveur local / 3000 par défaut)
REVERSE_PROXY (utilisation d'un reverse proxy qui permet de servir les fichiers statiques à la place d'Express (Nginx par exemple) / 0 ou 1 / 0 par défaut)
X_ACCEL_REDIRECT (délégation à Nginx de l'envoi des fichiers des pads après contrôle d'accès par Express / 0 ou 1 / 0 par défaut / nécessite la location « /fichiers-internes/ » décrite plus bas)
FILE_CACHE_PUBLIC (durée de cache navigateur des fichiers d'un pad public, en secondes / 86400 par défaut, soit 24 h)
FILE_CACHE_PROTECTED (durée de cache navigateur des fichiers d'un pad en accès protégé ou privé, en secondes / 300 par défaut / au-delà, le navigateur revalide et repasse par le contrôle d'accès, à raison d'une requête par fichier affiché)
NODE_CLUSTER (utilisation de node.js en cluster / 0 ou 1 / 0 par défaut)
EARLY_HINTS (utilisation par le serveur des early hints et du code de statut 103 / 0 ou 1 / 0 par défaut)
DB_HOST (IP du serveur de base de données Redis / localhost par défaut)
DB_PWD (mot de passe de la base de données Redis)
DB_PORT (port de la base de données Redis / 6379 par défaut)
SESSION_KEY (clé de session Express Session)
SESSION_DURATION (durée de la session de connexion des utilisateurs en millisecondes)
COOKIE_SECURE (cookie de session en Secure + SameSite=None en production / 0 ou 1 / 1 par défaut / mettre à 0 uniquement pour tester en HTTP local avec Docker)
VITE_ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
ETHERPAD_API_KEY (clé API Etherpad)
VITE_PIXABAY_API_KEY (clé API Pixabay)
VITE_UPLOAD_LIMIT (taille maximale de téléversement des fichiers en Mo / 20 Mo par défaut)
VITE_UPLOAD_FILE_TYPES (types de fichiers autorisés pour le téléversement / par défaut : .jpg,.jpeg,.png,.gif,.mp4,.m4v,.mp3,.m4a,.ogg,.wav,.pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.ods,.odg,.xls,.xlsx)
VITE_PAD_LIMIT (nombre maximum de pads par compte utilisateur / 100 par défaut)
VITE_PAD_WITHOUT_ACCOUNT (0 ou 1 / pour autoriser la création de pads sans compte)
VITE_CREATE_ACCOUNT (0 ou 1 / pour autoriser la création de comptes)
VITE_DEFAULT_LANGUAGE (de, en, es, fr, hr ou it / fr par défaut)
ADMIN_PASSWORD (mot de passe pour accéder à la page d'administration /admin)
CRON_TASK_DATE (régularité de la tâche cron pour supprimer les fichiers temporaires / 0 1 */2 * * par défaut, soit tous les 2 jours à 1h du matin)
SMTP_HOST (hôte SMTP pour l'envoi d'e-mails)
SMTP_USER (utilisateur SMTP)
SMTP_PASSWORD (mot de passe de l'utilisateur SMTP)
SMTP_PORT (port SMTP pour l'envoi d'e-mails)
SMTP_SECURE (1 ou 0 / mettre à 0 pour le port 587)
EMAIL_ADDRESS (adresse utilisée pour l'envoi d'e-mails)
VITE_MATOMO (lien vers un serveur Matomo pour l'analyse de trafic)
VITE_MATOMO_SITE_ID (id de site sur le serveur Matomo / 1 par défaut)
UMAMI_SCRIPT_URL (lien vers le script fourni par Umami pour l'analyse de trafic)
UMAMI_WEBSITE_ID (id de site sur le serveur Umami)
AUTHORIZED_DOMAINS (domaines autorisés pour api serveur. ex : ladigitale.dev,example.com / par défaut *)
ALERT_AVAILABLE_SPACE (pourcentage d'espace libre en dessous duquel une alerte est affichée et le téléversement de fichiers empêché / 10 par défaut)
VITE_STORAGE (type de stockage pour les fichiers - fs ou s3 / fs - filestorage par défaut)
VITE_S3_PUBLIC_LINK (lien public vers les contenus du conteneur d'objets S3)
S3_SERVER_TYPE (aws ou minio / aws par défaut)
S3_ENDPOINT (endpoint S3)
S3_ACCESS_KEY (clé d'accès S3)
S3_SECRET_KEY (clé secrète d'accès S3)
S3_REGION (région du conteneur S3)
S3_BUCKET (nom du conteneur s3)
S3_MAX_SOCKETS (nombre maximum de sockets pour httpsAgent du client S3)
VITE_DOCX_VIEWER (lien vers une visionneuse pour les documents MS Office / téléchargement du fichier par défaut)
VITE_DOCX_VIEWER_ALT (lien vers une visionneuse alternative pour les documents MS Office)
UPLOAD_HOST (lien vers un serveur externe pour le traitement des téléversements / équivalent à DOMAIN par défaut)
UPLOAD_TOKEN_SECRET (secret partagé avec un serveur de téléversement externe (UPLOAD_HOST) pour signer les jetons d'autorisation de téléversement / obligatoire en production dès qu'UPLOAD_HOST est utilisé, doit être identique sur les deux serveurs)
ENCRYPTION_KEY (clé pour decrypter les données Digidrive / uniquement nécessaire si Digidrive est utilisé)
VITE_LEGAL_TERMS_LINK (lien vers les mentions légales)
ACCOUNT_VALIDATION (validation de l'inscription par email / 0 ou 1 / 0 par défaut)
RATE_LIMIT_AUTH (nombre max de requêtes en échec par IP sur 15 min pour mot de passe / identifiant oubliés / 10 par défaut)
RATE_LIMIT_SIGNUP (nombre max de requêtes en échec par IP sur 15 min, appliqué séparément à l'inscription et à la création de pad sans compte / 50 par défaut)
RATE_LIMIT_SIGNUP_EMAIL (nombre max de tentatives d'inscription par adresse e-mail sur 15 min / 4 par défaut)
RATE_LIMIT_LOGIN (nombre max d'échecs d'authentification par IP sur 15 min pour la connexion / 30 par défaut)
RATE_LIMIT_LOGIN_USERNAME (nombre max d'échecs de connexion sur 15 min pour un couple identifiant + IP, fenêtre fixe non prolongée / 10 par défaut)
RATE_LIMIT_SENSITIVE (nombre max de tentatives en échec sur 15 min pour un couple identifiant + IP, pour le rattachement d'un pad et le transfert des pads d'un compte / 10 par défaut)
RATE_LIMIT_CODE (nombre max d'échecs de saisie du code d'accès sur 15 min pour un couple IP + pad, fenêtre fixe non prolongée, remise à zéro dès qu'un code correct est saisi / 100 par défaut)
RATE_LIMIT_PASSWORD (nombre max d'échecs de saisie du mot de passe d'un pad sur 15 min pour un couple IP + pad, fenêtre fixe non prolongée, remise à zéro dès qu'un mot de passe correct est saisi / 10 par défaut)
RATE_LIMIT_API (nombre max de requêtes en échec par IP sur 15 min, tous appels /api/ confondus hors lien de fichier / 100 par défaut / à relever pour une instance dont les utilisateurs partagent une même adresse publique)
RATE_LIMIT_FILE_LINK (nombre max de requêtes en échec par IP sur 15 min pour la génération de liens de fichiers / 300 par défaut)
TRUST_PROXY (configuration Express « trust proxy » : true, false, un entier = nombre de proxies de confiance ou une liste d'IP / sous-réseaux / 1 par défaut)
```

## Fichiers (stockage S3)

Le conteneur d'objets est servi depuis un autre domaine que l'application. Les images, vidéos et sons s'affichent sans configuration particulière, mais la visionneuse pdf.js télécharge le document en fetch, ce qui en fait une requête soumise aux règles d'origine croisée.

Côté conteneur, une règle CORS autorisant le domaine de l'application en lecture est nécessaire :

```json
[
  {
    "AllowedOrigins": ["https://digipad.app"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600
  }
]
```

Sans cette règle, le navigateur bloque la requête et le document reste vide, alors même que son URL est valide et qu'un accès direct depuis la barre d'adresse fonctionne.

### Migration des fichiers

Les ACL ne sont posées qu'à l'écriture d'un objet et lors d'un changement d'accès. Sur un conteneur existant, dont tous les objets ont été déposés en `public-read` par les versions précédentes, les fichiers des pads privés et en accès protégé restent donc lisibles par leur lien permanent tant que le script suivant n'a pas été exécuté :

```bash
npm run migrate-acl -- --simulation   # aucune modification, pour vérifier le volume concerné
npm run migrate-acl
```

Le script parcourt le conteneur, relit l'accès de chaque pad dans la base de données et repasse chaque objet en `public-read` ou `private` en conséquence.

Si un CDN est placé devant le conteneur, purgez son cache à la fin du script.

## Fichiers (stockage disque)

Cette section ne concerne que `VITE_STORAGE=fs` (avec `VITE_STORAGE=s3`, le contrôle d'accès est assuré par les URLs signées et les ACL des objets, et `/fichiers` n'est plus utilisé par l'application).

Les fichiers téléversés dans un pad sont servis sous `/fichiers/<id du pad>/<fichier>`. Ce chemin est contrôlé : un pad public garde un lien permanent, ouvert à tous et partageable hors de l'application, tandis que les fichiers d'un pad en accès protégé ou privé ne sont servis qu'aux personnes qui ont le droit de lire ce pad.

Ce contrôle est fait par Express. Si un reverse proxy sert `/fichiers` directement depuis `static/fichiers`, il court-circuite le contrôle et les fichiers des pads privés redeviennent accessibles à tous. `/fichiers` doit donc être transmis à Express comme le reste de l'application :

```nginx
location /fichiers/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

### Cache

Les noms de fichiers portent un suffixe aléatoire : une URL donnée désigne toujours les mêmes octets. Les fichiers d'un pad public sont donc servis avec `Cache-Control: public, max-age=86400, immutable`, ce qui évite qu'un navigateur redemande chaque image à chaque affichage de la page. Ceux d'un pad en accès protégé ou privé sont servis en `private, max-age=300` : ils ne sont conservés que par le navigateur qui les a déjà obtenus, et pour cinq minutes.

Conséquence à connaître : un pad repassé en privé reste lisible, pendant ces durées, depuis les caches qui détiennent déjà ses fichiers.

Les durées de cache peuvent être personnalisées avec `FILE_CACHE_PUBLIC` et `FILE_CACHE_PROTECTED`.

### Délégation de l'envoi des fichiers à Nginx

Par défaut, Express envoie lui-même les octets. `X_ACCEL_REDIRECT=1` confie cet envoi à Nginx sans rien retirer au contrôle d'accès — Express vérifie le droit de lire le fichier, puis répond un corps vide accompagné d'un en-tête `X-Accel-Redirect` désignant le fichier, que Nginx sert alors avec `sendfile` et sa gestion native des requêtes `Range`.

La location visée doit être déclarée `internal` : elle n'est joignable que par cette redirection interne, jamais directement depuis l'extérieur.

```nginx
location /fichiers-internes/ {
    internal;
    alias /chemin/vers/digipad/static/fichiers/;
}
```

Le bloc `location /fichiers/` de la section précédente reste indispensable : c'est lui qui transmet la requête à Express pour le contrôle d'accès. Les deux cohabitent.

Sans reverse proxy devant l'application, cette variable doit rester à 0. Elle est sans objet avec `VITE_STORAGE=s3`, où `/fichiers` n'est plus utilisé.

### Visionneuse de documents externe

Pour une visionneuse externe (`VITE_DOCX_VIEWER`), c'est le navigateur qui transmet l'adresse du fichier et la visionneuse sert ensuite ce fichier depuis ses propres serveurs, sans jamais voir le cookie du visiteur.

Digipad joint à ce lien un jeton signé valable une heure (`?jeton=…`), qui porte l'autorisation dans l'URL comme le fait la signature d'une URL S3. Il est délivré par `/api/generer-lien-fichier` après vérification de l'accès au pad et du rattachement du fichier à une capsule visible (= autorisation accordée) par le demandeur.

## Serveur de téléversement externe (UPLOAD_HOST)

`UPLOAD_HOST` permet de confier le traitement des téléversements à un autre serveur, pour ne pas occuper l'application principale pendant l'optimisation des images ou la conversion des documents. Sans cette variable, tout reste sur le serveur applicatif et cette section ne s'applique pas.

Les requêtes de téléversement partent alors vers un autre domaine et ne portent pas le cookie de session : le serveur externe n'a aucun moyen de savoir qui téléverse. C'est le rôle du jeton signé. L'application principale le délivre à une personne connectée, le navigateur l'ajoute à la requête de téléversement et le serveur externe vérifie la signature avec le secret partagé `UPLOAD_TOKEN_SECRET`.

Le serveur externe doit donc implémenter la vérification du jeton : elle ne se trouve pas dans ce dépôt, qui n'en produit que l'émission (`genererJetonTeleversement` dans `server/fonctions.js`).

### Obtention du jeton

`POST /api/generer-jeton-televersement` sur l'application principale, avec `{ action, pad }`. La route exige une session (`401 non_connecte`), refuse une action inconnue (`422 erreur`) et renvoie `{ "jeton": "<charge>.<signature>" }`.

Le navigateur le transmet ensuite dans l'en-tête `x-jeton-televersement` de la requête de téléversement.

### Format du jeton

```
<charge>.<signature>

charge     = base64url(JSON.stringify({ action, pad, exp }))
signature  = base64url(HMAC-SHA256(UPLOAD_TOKEN_SECRET, charge))
exp        = horodatage d'expiration en millisecondes (Date.now() + 120 000)
```

La clé HMAC est la valeur brute d'`UPLOAD_TOKEN_SECRET`. La signature porte sur la chaîne base64url de la charge : il faut la vérifier sur cette chaîne reçue, sans la décoder puis la réencoder. En développement, sans `UPLOAD_TOKEN_SECRET`, les deux côtés retombent sur `cle-par-defaut-dev`.

### Ce que chaque action garantit

| Action | Route de destination | Contrôle effectué avant émission |
| --- | --- | --- |
| `fichier` | `/api/televerser-fichier` | session uniquement |
| `vignette` | `/api/televerser-vignette` | session uniquement |
| `icone` | `/api/recuperer-icone` | session uniquement (jeton émis sans pad) |
| `audio` | `/api/televerser-audio` | accès en lecture au pad |
| `fond` | `/api/televerser-fond` | administration du pad |

### Implémentation de référence

```js
import { createHmac, timingSafeEqual } from 'crypto'

const actionsJetonTeleversement = ['fichier', 'vignette', 'icone', 'audio', 'fond']

function comparerChaines (c1, c2) {
	if (typeof c1 !== 'string' || typeof c2 !== 'string') return false
	const tampon1 = Buffer.from(c1)
	const tampon2 = Buffer.from(c2)
	if (tampon1.length !== tampon2.length) return false
	return timingSafeEqual(tampon1, tampon2)
}

function verifierJetonTeleversement (secret, jeton, action) {
	if (!secret || typeof jeton !== 'string' || jeton === '') return false
	if (!actionsJetonTeleversement.includes(action)) return false
	const separateur = jeton.lastIndexOf('.')
	if (separateur === -1) return false
	const charge = jeton.substring(0, separateur)
	const signature = jeton.substring(separateur + 1)
	const signatureAttendue = createHmac('sha256', secret).update(charge).digest('base64url')
	if (!comparerChaines(signature, signatureAttendue)) return false
	let donnees
	try {
		donnees = JSON.parse(Buffer.from(charge, 'base64url').toString())
	} catch {
		return false
	}
	if (!donnees || typeof donnees !== 'object') return false
	if (donnees.action !== action) return false
	return typeof donnees.exp === 'number' && donnees.exp > Date.now()
}
```

### Vérification avant la lecture du corps de la requête

```js
app.post('/api/televerser-fichier', (req, res) => {
	if (!verifierJetonTeleversement(process.env.UPLOAD_TOKEN_SECRET, req.headers['x-jeton-televersement'], 'fichier')) {
		return res.status(403).send('non_autorise')
	}
	// … lecture du fichier par la suite
})
```

L'en-tête est disponible dès l'ouverture de la requête, et `exp` est comparé au moment de la vérification.

### Déploiement

Le serveur externe dépose les fichiers dans `temp/`, où l'application principale vient les chercher pour les rattacher à un pad. Les deux serveurs doivent donc partager cet emplacement : le même conteneur avec `VITE_STORAGE=s3` (préfixe `temp/`, mêmes identifiants S3), le même système de fichiers avec `VITE_STORAGE=fs` (`static/temp`). Sans partage, les fichiers téléversés n'atteignent jamais les pads. La purge des fichiers temporaires de plus de six heures est assurée par la tâche cron de l'application principale (`CRON_TASK_DATE`).

L'en-tête `x-jeton-televersement` étant un en-tête personnalisé, le navigateur envoie d'abord une requête `OPTIONS` de préflight. Le serveur externe doit y répondre en autorisant cet en-tête et l'origine de l'application. Côté application, rien à faire : `UPLOAD_HOST` est déjà déclaré dans la directive `connect-src` de la politique de sécurité de contenu.

## Compilation et minification des fichiers pour la production
```
npm run build
```

## Avec PM2
```
pm2 start ecosystem.config.cjs --env production
```

## Avec Docker

Le dépôt fournit un `Dockerfile` (build multi-étapes : compilation Vite/Vike puis image de production) ainsi que deux fichiers `docker-compose` : `docker-compose.yml` (Traefik + app + Redis) et `docker-compose.override.yml`, chargé automatiquement en complément pour adapter la configuration à un test en local.

Dans les deux cas, un fichier `.env` doit être créé à la racine du dossier avec au minimum les variables `DB_PWD` et `SESSION_KEY` pour un test en local et `DOMAIN`, `DB_PWD`, `SESSION_KEY` et `ACME_EMAIL` (adresse e-mail utilisée pour la génération des certificats Let's Encrypt) pour un déploiement en production.

### Test local

```
docker compose up --build
```

L'override désactive Traefik, expose directement l'application sur `http://localhost:3000` et force `COOKIE_SECURE=0` pour permettre de tester la connexion à un compte en HTTP local.

### Production

En production, Traefik gère les certificats HTTPS (Let's Encrypt) et dirige les requêtes vers l'application.

Lancer le déploiement avec le profil Traefik activé :
```
./docker-production.sh
```

Les fichiers utilisateurs (`static/fichiers`) et les données Redis sont conservés dans les volumes Docker `digipad_temp`, `digipad_fichiers` et `digipad_redis`, qui persistent entre les redéploiements.

Les variables `VITE_*` utilisées côté client sont injectées au moment de la construction de l'image : toute modification de ces variables dans `.env` nécessite de reconstruire l'image pour être prise en compte.

## Démo
https://digipad.app

## Comment contribuer ?
Pour signaler des bugs, proposer des améliorations ou de nouvelles fonctionnalités, vous pouvez ouvrir un ticket sur ce dépôt, publier un message sur [ce mur](https://digipad.app/p/8/64dab892e6eab) ou m'envoyer un e-mail.

Les demandes d'ajouts (Pull Requests) ne sont pas acceptées pour le moment. En effet, une contribution au code nécessite souvent plusieurs heures pour être révisée et commentée et ce n'est pas toujours compatible avec les priorités et le temps que je peux consacrer au projet.

Il est possible de soutenir financièrement le projet via [Liberapay](https://liberapay.com/ladigitale/), [Open Collective](https://opencollective.com/ladigitale) ou [Stripe](https://donate.stripe.com/4gweWveqf2sc6KAcMO).

Vous trouverez d'autres idées de contribution sur [cette page](https://ladigitale.dev/contribuer.html).

Merci pour votre soutien ! N'hésitez pas à me contacter si vous avez des questions.

## Remerciements et crédits
Traduction en italien par [Paolo Mauri](https://gitlab.com/maupao) et @nilocram (Roberto Marcolin)

Traduction en espagnol par [Fernando S. Delgado Trujillo](https://gitlab.com/fersdt)

Traduction en croate par [Ksenija Lekić](https://gitlab.com/Ksenija66L)

Traduction en allemand par Alexander Weller (ZUM.de)
