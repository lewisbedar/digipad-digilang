# Digipad

Digipad est une application en ligne pour créer des murs collaboratifs. 

Elle est publiée sous licence GNU AGPLv3.
Sauf les fontes Roboto Slab et Material Icons (Apache License Version 2.0) et la fonte Mona Sans Expanded (Sil Open Font Licence 1.1), jsPanel4 (https://github.com/Flyer53/jsPanel4 - MIT), pdf.js (https://github.com/mozilla/pdf.js - Apache License Version 2.0), JavaScript-flexImages (https://github.com/Pixabay/JavaScript-flexImages - MIT), panzoom (https://github.com/timmywil/panzoom - MIT)

### Prérequis
Node.js 20+, Redis 6+, GraphicsMagick, Ghostscript, Libre Office

### Préparation et installation des dépendances
```
npm install
```

### Lancement du serveur de développement sur localhost:3000
```
npm run dev
```

### Compilation, minification des fichiers et lancement du serveur de production
```
npm run prod
```

### Avec PM2
```
npm run build
pm2 start ecosystem.config.cjs --env production
```

### Variables d'environnement pour la mise en production (fichier .env à créer à la racine du dossier)
```
DOMAIN (protocole + domaine. ex : https://digipad.app / seulement utilisée en production)
PORT (port du serveur local / 3000 par défaut)
REVERSE_PROXY (utilisation d'un reverse proxy / 0 ou 1 / 0 par défaut)
NODE_CLUSTER (utilisation de node.js en cluster / 0 ou 1 / 0 par défaut)
EARLY_HINTS (utilisation par le serveur des early hints et du code de statut 103 / 0 ou 1 / 0 par défaut)
DB_HOST (IP du serveur de base de données Redis / localhost par défaut)
DB_PWD (mot de passe de la base de données Redis)
DB_PORT (port de la base de données Redis / 6379 par défaut)
SESSION_KEY (clé de session Express Session)
SESSION_DURATION (durée de la session de connexion des utilisateurs en millisecondes)
VITE_ETHERPAD (lien vers un serveur Etherpad pour les documents collaboratifs)
VITE_ETHERPAD_API_KEY (clé API Etherpad)
VITE_PIXABAY_API_KEY (clé API Pixabay)
VITE_UPLOAD_LIMIT (taille maximale de téléversement des fichiers en Mo)
VITE_UPLOAD_FILE_TYPES (types de fichiers autorisés pour le téléversement / par défaut : .jpg,.jpeg,.png,.gif,.mp4,.m4v,.mp3,.m4a,.ogg,.wav,.pdf,.ppt,.pptx,.odp,.doc,.docx,.odt,.ods,.odg,.xls,.xlsx)
VITE_PAD_LIMIT (nombre maximum de pads par compte utilisateur)
VITE_PAD_WITHOUT_ACCOUNT (0 ou 1 / pour autoriser la création de pads sans compte)
VITE_CREATE_ACCOUNT (0 ou 1 / pour autoriser la création de comptes)
ADMIN_PASSWORD (mot de passe pour accéder à la page d'administration /admin)
CRON_TASK_DATE (régularité de la tâche cron pour supprimer les fichiers temporaires / 59 23 * * Saturday par défaut)
EMAIL_HOST (hôte pour l'envoi d'e-mails)
EMAIL_ADDRESS (adresse pour l'envoi d'e-mails)
EMAIL_PASSWORD (mot de passe de l'adresse email)
EMAIL_PORT (port pour l'envoi d'e-mails)
EMAIL_SECURE (true ou false)
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
UPLOAD_HOST (lien vers un serveur externe pour le traitement des téléversements / équivalent à DOMAIN par défaut)
ENCRYPTION_KEY (clé pour decrypter les données Digidrive / uniquement nécessaire si Digidrive est utilisé)
VITE_LEGAL_TERMS_LINK (lien vers les mentions légales)
ACCOUNT_VALIDATION (validation de l'inscription par email / 0 ou 1 / 0 par défaut)
```

### Projet Vue (Vue.js 3 et Vike) avec serveur Node.js (Express) et base de données Redis

### Démo
https://digipad.app

### Comment contribuer ?
Tout d'abord, merci de vouloir contribuer ! Voici quelques idées :
- faire une contribution avec contrepartie pour obtenir un [code d'invitation Digidrive](https://ladigitale.dev/blog/digidrive-pour-creer-et-gerer-les-contenus-generes-sur-la-digitale) ;
- soutenir le projet sur [Open Collective](https://opencollective.com/ladigitale) ou [LiberaPay](https://liberapay.com/ladigitale/) ;
- signaler des bogues ou proposer des fonctionnalités en ouvrant un ticket ;
- faire la promotion des services libres de La Digitale auprès de vos collègues, lors d'événements éducatifs, etc. ;
- publier des articles avec des pistes pédagogiques / des idées d'activités pour proposer des exemples concrets d'utilisation des outils ;
- participer à la traduction des services multilingues sur [Codeberg Translate](https://translate.codeberg.org/projects/la-digitale/#components).

Les demandes d'ajouts (Pull Requests) ne sont pas acceptées pour le moment. En effet, une contribution au code nécessite souvent plusieurs heures pour être révisée et commentée et ce n'est pas toujours compatible avec les priorités et le temps que je peux consacrer au projet.

N'hésitez pas à me contacter si vous avez des questions.

### Remerciements et crédits
Traduction en italien par [Paolo Mauri](https://gitlab.com/maupao) et @nilocram (Roberto Marcolin)

Traduction en espagnol par [Fernando S. Delgado Trujillo](https://gitlab.com/fersdt)

Traduction en croate par [Ksenija Lekić](https://gitlab.com/Ksenija66L)

Traduction en allemand par Alexander Weller (ZUM.de)

