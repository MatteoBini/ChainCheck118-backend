import assert from "node:assert/strict";
import { test } from "node:test";

import { distanceM, isInAllowedZone } from "../../src/modules/realtime/geo.js";
import { RADIUS_M, TOLERANCE_M, ZONES } from "../../src/modules/realtime/zones.js";

const parma = ZONES.find((zone) => zone.id === "parma")!;

// Punto a `metri` verso nord dal centro (1° di latitudine ≈ 111.195 m con R = 6.371 km).
function northOf(lat: number, metri: number): number {
  return lat + (metri / 6_371_000) * (180 / Math.PI);
}

test("distanceM: zero sullo stesso punto", () => {
  assert.equal(distanceM(parma.lat, parma.lng, parma.lat, parma.lng), 0);
});

test("distanceM: Parma–Bologna circa 87 km", () => {
  const bologna = ZONES.find((zone) => zone.id === "bologna")!;
  const d = distanceM(parma.lat, parma.lng, bologna.lat, bologna.lng);
  assert.ok(d > 85_000 && d < 89_000, `distanza inattesa: ${d}`);
});

test("distanceM: 1 km verso est a lat 44,8° corrisponde a Δlng ≈ 0,01267°", () => {
  const d = distanceM(44.8, 10, 44.8, 10 + 0.01267);
  assert.ok(Math.abs(d - 1000) < 5, `distanza inattesa: ${d}`);
});

test("il centro di ogni zona è consentito", () => {
  for (const zone of ZONES) {
    assert.equal(isInAllowedZone(zone.lat, zone.lng), true, zone.name);
  }
});

test("5,1 km dal centro è consentito grazie alla tolleranza", () => {
  assert.ok(5100 < RADIUS_M + TOLERANCE_M);
  assert.equal(isInAllowedZone(northOf(parma.lat, 5100), parma.lng), true);
});

test("6 km dal centro è fuori zona", () => {
  assert.equal(isInAllowedZone(northOf(parma.lat, 6000), parma.lng), false);
});

test("Roma è fuori zona", () => {
  assert.equal(isInAllowedZone(41.9, 12.5), false);
});

test("NaN, Infinity e coordinate fuori range sono rifiutati", () => {
  for (const [lat, lng] of [
    [Number.NaN, parma.lng],
    [parma.lat, Number.NaN],
    [Number.POSITIVE_INFINITY, parma.lng],
    [parma.lat, Number.NEGATIVE_INFINITY],
    [parma.lat + 360, parma.lng],
  ] as const) {
    assert.equal(isInAllowedZone(lat, lng), false, `${lat}, ${lng}`);
  }
});
