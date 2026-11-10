import { randomBytes } from "node:crypto";

import { logger } from "../../config/logger.js";

export type RecordType = "TURN_CHECK" | "INSPECTION";

export interface ChainRecord {
  recordId: string;
  txHash: string;
  timestamp: Date;
}

/** Segnaposto: recordId e txHash sono simulati finché il contratto non è disponibile. */
export async function writeRecord(type: RecordType, hash: string, linkedHash?: string): Promise<ChainRecord> {
  const record: ChainRecord = {
    recordId: `0x${randomBytes(16).toString("hex")}`,
    txHash: `0x${randomBytes(32).toString("hex")}`,
    timestamp: new Date(),
  };
  logger.info({ type, hash, linkedHash, ...record }, "Record blockchain simulato");
  return record;
}
