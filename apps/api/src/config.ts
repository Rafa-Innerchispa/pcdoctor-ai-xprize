import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const configSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  DEMO_MODE: z
    .enum(["true", "false"])
    .default("true")
    .transform((value) => value === "true"),
  OUTBOUND_ENABLED: booleanString,
  INVOICING_ENABLED: booleanString,
  EVENT_STORE: z.enum(["memory", "firestore"]).default("memory"),
  AUTH_ENABLED: booleanString,
  BOOTSTRAP_OWNER_EMAIL: z.string().email().default("owner@example.invalid"),
  FIREBASE_WEB_API_KEY: z.string().default(""),
  FIREBASE_AUTH_DOMAIN: z.string().default(""),
  FIREBASE_APP_ID: z.string().default(""),
  API_ADMIN_KEY: z.string().default(""),
  GOOGLE_CLOUD_PROJECT: z.string().default(""),
  GOOGLE_CLOUD_LOCATION: z.string().default("global"),
  GEMINI_PROVIDER: z.enum(["vertex", "developer"]).default("vertex"),
  GEMINI_API_KEY: z.string().default(""),
  GEMINI_MODEL: z.string().default("gemini-3.5-flash-lite"),
  GEMINI_MAX_OUTPUT_TOKENS: z.coerce
    .number()
    .int()
    .min(128)
    .max(8_192)
    .default(1_024),
  GEMINI_THINKING_LEVEL: z
    .enum(["minimal", "low", "medium", "high"])
    .default("minimal"),
  GEMINI_INPUT_USD_PER_MILLION: z.coerce
    .number()
    .nonnegative()
    .default(0.3),
  GEMINI_OUTPUT_USD_PER_MILLION: z.coerce
    .number()
    .nonnegative()
    .default(2.5),
  FIRESTORE_DATABASE: z.string().default("(default)"),
  RUC_API_LIVE_ENABLED: booleanString,
  RUC_API_TOKEN_BASE_URL: z.string().default(""),
  RUC_API_LOOKUP_BASE_URL: z.string().default(""),
  RUC_API_USERNAME: z.string().default(""),
  RUC_API_PASSWORD: z.string().default(""),
  RUC_API_TIMEOUT_MS: z.coerce.number().int().min(500).max(30_000).default(8_000),
  RUC_API_CACHE_TTL_MS: z.coerce
    .number()
    .int()
    .min(1_000)
    .max(86_400_000)
    .default(900_000),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(overrides: Partial<Record<keyof AppConfig, unknown>> = {}): AppConfig {
  return configSchema.parse({ ...process.env, ...overrides });
}
