# ChainCheck118-backend
Certificazione tramite blockchain delle checklist di mezzi di soccorso
Progetto del corso di Tecnologie Internet (unipr - ing IET)

# Docker
```
docker/
  api/     Dockerfile (target dev | build | runtime), entrypoint.dev.sh
  chain/   Dockerfile (target dev | runtime), entrypoint.sh
docker-compose.dev.yml   sviluppo: sorgenti montati, hot reload, debugger
docker-compose.yml       immagini di produzione
```

## Sviluppo
```sh
docker compose -f docker-compose.dev.yml up --build -d
curl localhost:3000/health
```
All'avvio, in automatico: la chain deploya ChainCheckRegistry, l'API applica le migrazioni,
esegue il seed (idempotente) e parte con `tsx watch` (riavvio a ogni modifica in `src/`).

- Log: `docker compose -f docker-compose.dev.yml logs -f api`
- Debugger: VS Code → "Attach to API (Docker)" (porta 9229)
- Prisma Studio: `docker compose -f docker-compose.dev.yml --profile tools up -d studio` → http://localhost:5555
- Nuova migrazione: `docker compose -f docker-compose.dev.yml exec api npx prisma migrate dev --name <nome>`
- Nuove dipendenze: dopo `npm install <pkg>` basta `docker compose -f docker-compose.dev.yml restart api`
- Contratti modificati: `docker compose -f docker-compose.dev.yml restart chain` (la chain riparte da zero e rideploya)
- Reset del DB: `docker compose -f docker-compose.dev.yml down -v`

## Produzione
```sh
docker compose up --build -d                    # richiede JWT_SECRET nel .env
docker compose run --rm migrate npm run seed    # facoltativo
```

# API login
curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'

#### response
{"token":"token","user":{"id":1,"username":"admin","fullName":"Utente Test","role":"ISPETTORE"}}
