import { randomToken, sha256 } from "./session";

const ITERATIONS = 600_000;
const encoder = new TextEncoder();
export async function hashPassword(password: string): Promise<string> {
  const salt = randomToken(16);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
    },
    key,
    256,
  );
  return `pbkdf2-sha256:${ITERATIONS}:${salt}:${Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  const [algorithm, count, salt, expected] = encoded.split(":");
  if (
    algorithm !== "pbkdf2-sha256" ||
    Number(count) !== ITERATIONS ||
    !salt ||
    !expected
  )
    return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const hash = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: ITERATIONS,
    },
    key,
    256,
  );
  const actual = Array.from(new Uint8Array(hash), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let i = 0; i < actual.length; i++)
    difference |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return difference === 0;
}
export { validPassword } from "@whitepoint/types/constants";
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export function newTotpSecret() {
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  let value = 0,
    bits = 0,
    result = "";
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits) result += alphabet[(value << (5 - bits)) & 31];
  return result;
}
export async function encryptTotp(
  secret: string,
  keyValue: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(keyValue), (c) => c.charCodeAt(0)),
    "AES-GCM",
    false,
    ["encrypt"],
  );
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      encoder.encode(secret),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...encrypted));
}
export async function decryptTotp(
  value: string,
  keyValue: string,
): Promise<string> {
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey(
    "raw",
    Uint8Array.from(atob(keyValue), (c) => c.charCodeAt(0)),
    "AES-GCM",
    false,
    ["decrypt"],
  );
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      key,
      bytes.slice(12),
    ),
  );
}
function decodeBase32(input: string): Uint8Array {
  let bits = 0,
    value = 0;
  const out: number[] = [];
  for (const char of input.toUpperCase().replace(/=+$/, "")) {
    const index = alphabet.indexOf(char);
    if (index < 0) return new Uint8Array();
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}
export async function verifyTotp(
  secret: string,
  code: string,
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    decodeBase32(secret),
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"],
  );
  for (let offset = -1; offset <= 1; offset++) {
    const buffer = new ArrayBuffer(8),
      view = new DataView(buffer);
    view.setUint32(4, Math.floor(Date.now() / 30000) + offset);
    const digest = new Uint8Array(
      await crypto.subtle.sign("HMAC", key, buffer),
    );
    const position = digest[digest.length - 1]! & 15;
    const value =
      (((digest[position]! & 127) << 24) |
        (digest[position + 1]! << 16) |
        (digest[position + 2]! << 8) |
        digest[position + 3]!) %
      1_000_000;
    if (String(value).padStart(6, "0") === code) return true;
  }
  return false;
}
export async function issueRecoveryCodes(
  db: D1Database,
  userId: string,
): Promise<string[]> {
  const codes = Array.from({ length: 10 }, () => randomToken(9));
  const hashes = await Promise.all(codes.map(sha256));
  await db.batch([
    db.prepare("DELETE FROM user_recovery_codes WHERE user_id=?").bind(userId),
    ...hashes.map((hash) =>
      db
        .prepare(
          "INSERT INTO user_recovery_codes(user_id,code_hash) VALUES(?,?)",
        )
        .bind(userId, hash),
    ),
  ]);
  return codes;
}
