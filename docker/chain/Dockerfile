# syntax=docker/dockerfile:1
# Nodo Hardhat locale con deploy automatico di ChainCheckRegistry. Build context: root del repo.
#
#   target dev      → usato da docker-compose.dev.yml (contracts/ montato)
#   target runtime  → sorgenti copiati nell'immagine, usato da docker-compose.yml
#
# Debian (glibc) anziché Alpine: i binari nativi di Hardhat/EDR sono più affidabili.

FROM node:22-bookworm-slim AS base
WORKDIR /app
COPY contracts/package.json contracts/package-lock.json ./
RUN npm ci --no-audit --no-fund \
 && sha256sum package-lock.json > node_modules/.deps-hash
COPY docker/chain/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.sh && chmod +x /usr/local/bin/entrypoint.sh
EXPOSE 8545
# Pronto (healthy) solo dopo il deploy del contratto.
HEALTHCHECK --interval=3s --timeout=3s --start-period=120s --retries=3 \
  CMD test -f /tmp/chain-ready || exit 1
ENTRYPOINT ["entrypoint.sh"]

# I sorgenti arrivano dal bind mount di docker-compose.dev.yml.
FROM base AS dev

FROM base AS runtime
COPY contracts/ ./
