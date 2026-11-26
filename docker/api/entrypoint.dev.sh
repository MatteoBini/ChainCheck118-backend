#!/bin/sh
# Entrypoint di sviluppo dell'API: allinea le dipendenze, prepara il DB, poi avvia il comando.
set -e

# node_modules vive in un volume: se package-lock.json è cambiato sull'host, reinstalla.
current_hash="$(sha256sum package-lock.json)"
if [ "$(cat node_modules/.deps-hash 2>/dev/null)" != "$current_hash" ]; then
  echo "[dev] package-lock.json cambiato: npm install..."
  npm install --no-audit --no-fund
  echo "$current_hash" > node_modules/.deps-hash
fi

if [ "${SKIP_DB_SETUP:-false}" != "true" ]; then
  echo "[dev] prisma generate + migrate deploy + seed"
  npx prisma generate
  npx prisma migrate deploy
  npm run seed
fi

exec "$@"
