import { z } from "zod";

const optional = z.string().optional().transform((value) => value?.trim() || undefined);
export const config = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: optional,
  SESSION_SECRET: optional,
  TWO_FACTOR_ENCRYPTION_KEY: optional,
  FRONTEND_ORIGIN: z.string().url().default("http://localhost:5173"),
  GOOGLE_CLIENT_ID: optional,
  GOOGLE_CLIENT_SECRET: optional,
  EMAIL_HOST: optional,
  EMAIL_PORT: z.coerce.number().int().default(587),
  EMAIL_USER: optional,
  EMAIL_PASSWORD: optional,
  EMAIL_FROM: optional,
}).parse(process.env);

if (config.NODE_ENV === "production") {
  if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required in production");
  if (!config.SESSION_SECRET || config.SESSION_SECRET.length < 32) throw new Error("SESSION_SECRET must contain at least 32 characters in production");
}

export const hasEmailProvider = Boolean(config.EMAIL_HOST && config.EMAIL_USER && config.EMAIL_PASSWORD && config.EMAIL_FROM);
