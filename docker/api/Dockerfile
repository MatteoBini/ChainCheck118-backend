# syntax=docker/dockerfile:1
# API ChainCheck118. Build context: root del repo.
#
#   target dev      → usato da docker-compose.dev.yml (sorgenti montati, hot reload, debugger)
#   target build    → compila TypeScript; usato anche dal servizio `migrate` di docker-compose.yml
#   target runtime  → immagine di produzione usata da docker-compose.yml

FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
# Serve a `postinstall: prisma generate`.
COPY prisma ./prisma
RUN npm ci --no-audit --no-fund \
 && sha256sum package-lock.json > node_modules/.deps-hash

FROM base AS dev
ENV NODE_ENV=development
COPY docker/api/entrypoint.dev.sh /usr/local/bin/entrypoint.dev.sh
RUN sed -i 's/\r$//' /usr/local/bin/entrypoint.dev.sh && chmod +x /usr/local/bin/entrypoint.dev.sh
# I sorgenti arrivano dal bind mount di docker-compose.dev.yml.
EXPOSE 3000 9229
ENTRYPOINT ["entrypoint.dev.sh"]
CMD ["npm", "run", "dev"]

FROM base AS build
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache openssl
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=build /app/node_modules/@prisma/client ./node_modules/@prisma/client
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
