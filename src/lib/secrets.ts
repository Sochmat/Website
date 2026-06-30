import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

function key(): Buffer {
  const b64 = process.env.KITCHENOS_SECRET_KEY;
  if (!b64) throw new Error("KITCHENOS_SECRET_KEY is not set");
  const k = Buffer.from(b64, "base64");
  if (k.length !== 32) throw new Error("KITCHENOS_SECRET_KEY must be 32 bytes (base64)");
  return k;
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(blob: string): string {
  const [v, ivB64, tagB64, dataB64] = blob.split(":");
  if (v !== "v1") throw new Error("unsupported secret version");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
