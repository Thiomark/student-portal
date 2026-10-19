import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// AES-256-GCM for provider secrets at rest (school_secrets). Stored as JSON
// {iv, tag, value}, all base64.

function key(): Buffer {
  const secret = process.env.SECRETS_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be set (32+ characters)");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const value = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return JSON.stringify({
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    value: value.toString("base64"),
  });
}

export function decryptSecret(stored: string | null | undefined): string | null {
  if (!stored) return null;
  const { iv, tag, value } = JSON.parse(stored) as Record<string, string>;
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(value, "base64")), decipher.final()]).toString("utf8");
}
