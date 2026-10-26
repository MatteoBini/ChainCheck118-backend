import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const derived = await derive(password, salt);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [saltHex, derivedHex] = stored.split(":");
  if (!saltHex || !derivedHex) {
    return false;
  }

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(derivedHex, "hex");
  if (salt.length !== SALT_BYTES || expected.length !== KEY_BYTES) {
    return false;
  }

  const actual = await derive(password, salt);
  return timingSafeEqual(actual, expected);
}
