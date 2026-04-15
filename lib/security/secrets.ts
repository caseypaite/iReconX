import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

export function getEffectiveEncryptionSecret(encryptionSecret = process.env.ENCRYPTION_SECRET, jwtSecret = process.env.JWT_SECRET) {
  const secret = encryptionSecret || jwtSecret;

  if (!secret) {
    throw new Error("ENCRYPTION_SECRET or JWT_SECRET must be set.");
  }

  return secret;
}

function getEncryptionKey(secret = getEffectiveEncryptionSecret()) {
  return createHash("sha256").update(secret).digest();
}

export function encryptJson(value: Record<string, unknown>, secret = getEffectiveEncryptionSecret()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(secret), iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, ciphertext]).toString("base64url");
}

export function decryptJson<T>(payload: string, secret = getEffectiveEncryptionSecret()) {
  const buffer = Buffer.from(payload, "base64url");
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getEncryptionKey(secret), iv);

  decipher.setAuthTag(tag);

  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  return JSON.parse(plaintext) as T;
}
