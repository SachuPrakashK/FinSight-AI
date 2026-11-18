import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import { config } from "./config.js";

export const randomToken = () => randomBytes(32).toString("base64url");
export const hashToken = (token: string) => createHmac("sha256", config.SESSION_SECRET ?? "development-only-session-secret").update(token).digest("hex");
export const hashRecovery = (token: string) => createHash("sha256").update(token.trim().toUpperCase()).digest("hex");
export const safeEqual = (a: string, b: string) => { const left = Buffer.from(a); const right = Buffer.from(b); return left.length === right.length && timingSafeEqual(left, right); };
export const hashPassword = (password: string) => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash: string, password: string) => argon2.verify(hash, password);

function encryptionKey() {
  const encoded = config.TWO_FACTOR_ENCRYPTION_KEY;
  if (!encoded) throw new Error("TWO_FACTOR_ENCRYPTION_KEY is required to configure two-factor authentication");
  const key = Buffer.from(encoded, /^[0-9a-f]{64}$/i.test(encoded) ? "hex" : "base64");
  if (key.length !== 32) throw new Error("TWO_FACTOR_ENCRYPTION_KEY must encode 32 bytes (64 hex or 44 base64 characters)");
  return key;
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map((part) => part.toString("base64url")).join(".");
}

export function decryptSecret(value: string) {
  const [ivPart, tagPart, encryptedPart] = value.split(".");
  if (!ivPart || !tagPart || !encryptedPart) throw new Error("Encrypted authenticator key is invalid");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(tagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedPart, "base64url")), decipher.final()]).toString("utf8");
}
