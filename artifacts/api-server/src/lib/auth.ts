import type { SessionData } from "../types";

export async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`greenlink:${pin}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
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
