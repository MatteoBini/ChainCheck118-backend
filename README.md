# ChainCheck118-backend
Certificazione tramite blockchain delle checklist di mezzi di soccorso
Progetto del corso di Tecnologie Internet (unipr - ing IET)

# First Time
docker compose up --build -d
docker compose exec api npx prisma migrate deploy
docker compose exec api npm run seed
docker compose exec chain npx hardhat run scripts/deploy.ts --network localhost
curl localhost:3000/health

# API login
curl -s -X POST localhost:3000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"password"}'

#### response
{"token":"token","user":{"id":1,"username":"admin","fullName":"Utente Test","role":"ISPETTORE"}}
