import { randomBytes } from "node:crypto";

import { logger } from "../../config/logger.js";

export type RecordType = "TURN_CHECK" | "INSPECTION";

export interface ChainRecord {
  recordId: string;
  txHash: string;
  timestamp: Date;
}

/**
 * Scrive l'hash di un record sulla blockchain.
 * Segnaposto: il contratto non è ancora disponibile, quindi recordId e txHash
 * sono simulati. La firma resta la stessa quando arriverà contract.provider.ts.
 */
export async function writeRecord(type: RecordType, hash: string, linkedHash?: string): Promise<ChainRecord> {
  const record: ChainRecord = {
    recordId: `0x${randomBytes(16).toString("hex")}`,
    txHash: `0x${randomBytes(32).toString("hex")}`,
    timestamp: new Date(),
  };
  logger.info({ type, hash, linkedHash, ...record }, "Record blockchain simulato");
  return record;
}
