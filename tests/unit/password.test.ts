import assert from "node:assert/strict";
import { test } from "node:test";

import { hashPassword, verifyPassword } from "../../src/modules/auth/password.js";

test("hash diverso a ogni chiamata per la stessa password", async () => {
  const a = await hashPassword("segreto");
  const b = await hashPassword("segreto");
  assert.notEqual(a, b);
});

test("formato salt:derived in esadecimale", async () => {
  const hash = await hashPassword("segreto");
  assert.match(hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/);
});

test("accetta la password corretta", async () => {
  const hash = await hashPassword("segreto");
  assert.equal(await verifyPassword("segreto", hash), true);
});

test("rifiuta la password sbagliata", async () => {
  const hash = await hashPassword("segreto");
  assert.equal(await verifyPassword("sbagliata", hash), false);
});

test("rifiuta hash malformati senza sollevare", async () => {
  for (const malformato of ["", "senza-due-punti", "aa:bb", ":", "zz:yy"]) {
    assert.equal(await verifyPassword("segreto", malformato), false);
  }
});
