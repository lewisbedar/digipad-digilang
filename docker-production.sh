#!/bin/sh
# Déploiement en production avec Traefik
set -eu

cd "$(dirname "$0")/.."

if [ ! -f .env ]; then
	echo "Fichier .env introuvable à la racine du projet." >&2
	exit 1
fi

set -a
. ./.env
set +a

if [ -z "${DOMAIN:-}" ]; then
	echo "DOMAIN n'est pas défini dans .env." >&2
	exit 1
fi

TRAEFIK_HOST=$(printf '%s' "$DOMAIN" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')
export TRAEFIK_HOST

echo "Déploiement pour le domaine : $TRAEFIK_HOST"
docker compose --profile with-traefik up -d --build
