import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default("8h"),
  CHAIN_RPC_URL: z.string().min(1),
  CHAIN_PRIVATE_KEY: z.string().min(1),
  CHAIN_CONTRACT_ADDRESS: z.string().min(1),
  // Dopo quanti ms senza update la posizione di un utente viene tolta dalla mappa.
  PRESENCE_STALE_MS: z.coerce.number().int().positive().default(10000),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
    .join("\n");
  throw new Error(`Variabili d'ambiente non valide:\n${issues}`);
}

export const env = parsed.data;

export const isProduction = env.NODE_ENV === "production";
