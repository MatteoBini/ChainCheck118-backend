import { PrismaClient, Role } from "@prisma/client";

import { hashPassword } from "../src/modules/auth/password.js";

const prisma = new PrismaClient();

const CHECKLIST_ITEMS = [
  "Bombola ossigeno portatile carica",
  "Bombola ossigeno fissa carica",
  "Riduttore e flussometro ossigeno funzionanti",
  "Pallone autoespandibile adulto con reservoir",
  "Pallone autoespandibile pediatrico con reservoir",
  "Maschere ossigeno adulto e pediatriche",
  "Aspiratore portatile funzionante e carico",
  "Sondini di aspirazione di misure assortite",
  "Cannule orofaringee di misure assortite",
  "Defibrillatore DAE con batteria carica",
  "Piastre adulto e pediatriche DAE integre e non scadute",
  "Saturimetro funzionante",
  "Sfigmomanometro e fonendoscopio",
  "Termometro funzionante",
  "Glucometro con strisce non scadute",
  "Collari cervicali di misure assortite",
  "Tavola spinale con ragno e fermacapo",
  "Steccobenda e set immobilizzatori arti",
  "Borsa medicazione completa e materiale emostatico",
  "Contenitore taglienti e kit protezione individuale",
];

const SEED_PASSWORD = process.env.SEED_PASSWORD ?? "password123";

const USERS = [
  { username: "operatore", fullName: "Marco Rossi", role: Role.OPERATORE },
  { username: "soccorritore", fullName: "Giulia Bianchi", role: Role.SOCCORRITORE },
  { username: "ispettore", fullName: "Luca Verdi", role: Role.ISPETTORE },
];

const VEHICLES = [{ plate: "AA111BB" }, { plate: "CC222DD" }];

async function seedChecklistItems() {
  const existing = await prisma.checklistItem.count();
  if (existing > 0) {
    return existing;
  }
  const created = await prisma.checklistItem.createMany({
    data: CHECKLIST_ITEMS.map((description) => ({ description })),
  });
  return created.count;
}

async function seedUsers() {
  for (const user of USERS) {
    const passwordHash = await hashPassword(SEED_PASSWORD);
    await prisma.appUser.upsert({
      where: { username: user.username },
      update: { fullName: user.fullName, role: user.role, passwordHash },
      create: { ...user, passwordHash },
    });
  }
  return USERS.length;
}

async function seedVehicles() {
  for (const vehicle of VEHICLES) {
    await prisma.vehicle.upsert({
      where: { plate: vehicle.plate },
      update: {},
      create: vehicle,
    });
  }
  return VEHICLES.length;
}

async function main() {
  const items = await seedChecklistItems();
  const users = await seedUsers();
  const vehicles = await seedVehicles();
  console.log(`seed completato: ${items} checklist item, ${users} utenti, ${vehicles} mezzi`);
  console.log(`password utenti: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
