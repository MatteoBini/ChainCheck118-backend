import { type LogDescription, ZeroHash } from "ethers";

import { logger } from "../../config/logger.js";
import { registry } from "./contract.provider.js";

export type RecordType = "TURN_CHECK" | "INSPECTION";

const RECORD_TYPE_INDEX: Record<RecordType, number> = {
  TURN_CHECK: 0,
  INSPECTION: 1,
};

export interface ChainRecord {
  recordId: string;
  txHash: string;
  timestamp: Date;
}

/** hash e linkedHash sono già nel formato bytes32 (0x + 64 esadecimali) prodotto da hashRecord(). */
export async function writeRecord(type: RecordType, hash: string, linkedHash?: string): Promise<ChainRecord> {
  const tx = await registry.writeRecord!(RECORD_TYPE_INDEX[type], hash, linkedHash ?? ZeroHash);
  const receipt = await tx.wait();

  const written = receipt.logs
    .map((log: unknown): LogDescription | null => {
      try {
        return registry.interface.parseLog(log as { topics: readonly string[]; data: string });
      } catch {
        return null;
      }
    })
    .find((parsed: LogDescription | null): parsed is LogDescription => parsed?.name === "RecordWritten");

  if (!written) {
    throw new Error("Transazione confermata ma evento RecordWritten non trovato");
  }

  const record: ChainRecord = {
    recordId: (written.args.recordId as bigint).toString(),
    txHash: receipt.hash,
    timestamp: new Date(),
  };
  logger.info({ type, hash, linkedHash, ...record }, "Record scritto sulla blockchain");
  return record;
}
