import type { SessionData } from "../types";

// Fast hex encoding — lookup table avoids Array.from().map().join() overhead
const HEX = "0123456789abcdef";
function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    s += HEX[b >> 4]! + HEX[b & 0xf]!;
  }
  return s;
}

export async function hashPin(pin: string): Promise<string> {
  const data = new TextEncoder().encode(`greenlink:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return toHex(hash);
}

export async function verifyPin(pin: string, hash: string): Promise<boolean> {
  const hashed = await hashPin(pin);
  return hashed === hash;
}

const SESSION_TTL_SECONDS = 86400;

export async function createSession(kv: KVNamespace, data: SessionData): Promise<string> {
  const token = crypto.randomUUID();
  await kv.put(token, JSON.stringify(data), { expirationTtl: SESSION_TTL_SECONDS });
  return token;
}

export async function getSession(kv: KVNamespace, token: string): Promise<SessionData | null> {
  const raw = await kv.get(token);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionData;
  } catch {
    return null;
  }
}

export async function deleteSession(kv: KVNamespace, token: string): Promise<void> {
  await kv.delete(token);
}
