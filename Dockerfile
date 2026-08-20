# syntax=docker/dockerfile:1

#### Étape 1 : installation des dépendances + build (Vike/Vite) ####
FROM node:24-bookworm-slim AS build
WORKDIR /app

RUN apt-get update \
	&& apt-get install -y --no-install-recommends python3 make g++ git ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

# Force les dépendances Git comme lamejs en HTTPS anonyme
RUN git config --global url."https://github.com/".insteadOf "ssh://git@github.com/"

COPY package.json ./
RUN npm install --allow-git=root

COPY . .

# Vite/vike n'injectent les variables VITE_* dans le bundle client qu'au moment du build : elles doivent être fournies ici (via --build-arg) et pas seullement au conteneur runtime
ARG VITE_ETHERPAD
ARG VITE_PIXABAY_API_KEY
ARG VITE_UPLOAD_LIMIT
ARG VITE_UPLOAD_FILE_TYPES
ARG VITE_PAD_LIMIT
ARG VITE_PAD_WITHOUT_ACCOUNT
ARG VITE_CREATE_ACCOUNT
ARG VITE_MATOMO
ARG VITE_MATOMO_SITE_ID
ARG VITE_STORAGE
ARG VITE_S3_PUBLIC_LINK
ARG VITE_DOCX_VIEWER
ARG VITE_DOCX_VIEWER_ALT
ARG VITE_LEGAL_TERMS_LINK
ENV VITE_ETHERPAD=${VITE_ETHERPAD} \
	VITE_PIXABAY_API_KEY=${VITE_PIXABAY_API_KEY} \
	VITE_UPLOAD_LIMIT=${VITE_UPLOAD_LIMIT} \
	VITE_UPLOAD_FILE_TYPES=${VITE_UPLOAD_FILE_TYPES} \
	VITE_PAD_LIMIT=${VITE_PAD_LIMIT} \
	VITE_PAD_WITHOUT_ACCOUNT=${VITE_PAD_WITHOUT_ACCOUNT} \
	VITE_CREATE_ACCOUNT=${VITE_CREATE_ACCOUNT} \
	VITE_MATOMO=${VITE_MATOMO} \
	VITE_MATOMO_SITE_ID=${VITE_MATOMO_SITE_ID} \
	VITE_STORAGE=${VITE_STORAGE} \
	VITE_S3_PUBLIC_LINK=${VITE_S3_PUBLIC_LINK} \
	VITE_DOCX_VIEWER=${VITE_DOCX_VIEWER} \
	VITE_DOCX_VIEWER_ALT=${VITE_DOCX_VIEWER_ALT} \
	VITE_LEGAL_TERMS_LINK=${VITE_LEGAL_TERMS_LINK}

RUN npm run build && npm prune --omit=dev --allow-git=root

#### Étape 2 : construction de l'image ####
FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app

# GraphicsMagick + Ghostscript (traitement des images/PDF) et LibreOffice (conversion des documents en PDF)
RUN apt-get update && apt-get install -y --no-install-recommends \
		graphicsmagick ghostscript libreoffice curl \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY public ./public
COPY static ./static

# Dossiers de stockage des fichiers utilisateurs / fichiers temporaires
RUN mkdir -p static/fichiers static/temp && chown -R node:node /app

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD curl -fs http://localhost:${PORT:-3000}/ || exit 1

CMD ["node", "server/app.js"]
