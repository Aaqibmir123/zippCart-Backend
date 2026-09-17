import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { createAppError } from "./app-error.js";

export function getStoreKey() {
  const value = process.env.STORE_ENCRYPTION_KEY;
  if (!value || !/^[a-fA-F0-9]{64}$/.test(value)) {
    throw createAppError("Store registration is temporarily unavailable.", 503);
  }
  return Buffer.from(value, "hex");
}

export function encryptStoreData(value, ownerId, key = getStoreKey()) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`store:${ownerId}:v1`));
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);
  return { version: 1, iv, tag: cipher.getAuthTag(), ciphertext };
}

export function decryptStoreData(record, ownerId, key = getStoreKey()) {
  try {
    if (record.version !== 1) throw new Error("Unsupported encryption version");
    const bytes = (value) =>
      Buffer.isBuffer(value) ? value : Buffer.from(value.value());
    const decipher = createDecipheriv("aes-256-gcm", key, bytes(record.iv));
    decipher.setAAD(Buffer.from(`store:${ownerId}:v1`));
    decipher.setAuthTag(bytes(record.tag));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes(record.ciphertext)),
        decipher.final(),
      ]).toString("utf8"),
    );
  } catch {
    throw createAppError(
      "Could not read this registration securely. Please contact support.",
      503,
    );
  }
}
