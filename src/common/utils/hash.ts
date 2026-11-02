import { createHash } from "node:crypto";

import { canonicalJson } from "./canonicalJson.js";

export function sha256Hex(data: string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function hashRecord(value: unknown): string {
  return `0x${sha256Hex(canonicalJson(value))}`;
}
