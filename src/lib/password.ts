import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);
const N = 16384, r = 8, p = 1, KEYLEN = 64;

export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = (await scryptAsync(plain, salt, KEYLEN, { N, r, p })) as Buffer;
  return `scrypt$${N}$${r}$${p}$${salt.toString("base64")}$${dk.toString("base64")}`;
}

export async function verifyPassword(plain: string, stored: string): Promise<boolean> {
  try {
    const [scheme, n, rr, pp, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64");
    const expected = Buffer.from(hashB64, "base64");
    const dk = (await scryptAsync(plain, salt, expected.length, {
      N: Number(n), r: Number(rr), p: Number(pp),
    })) as Buffer;
    return dk.length === expected.length && timingSafeEqual(dk, expected);
  } catch {
    return false;
  }
}
