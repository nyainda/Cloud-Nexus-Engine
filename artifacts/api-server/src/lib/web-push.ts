// Web Push (RFC 8292 VAPID + RFC 8291 aes128gcm) for Cloudflare Workers
// Uses only crypto.subtle — zero Node.js dependencies

// ── Module-level caches (survive across requests in the same CF isolate) ──────
// importKey + ECDSA sign are the top CPU consumers. By caching the imported
// CryptoKey and the built JWT we skip both on every warm request.
const _keyCache = new Map<string, CryptoKey>();
const _jwtCache = new Map<string, { jwt: string; exp: number }>();

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  return Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad), (c) =>
    c.charCodeAt(0)
  );
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number
): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt, info },
    base,
    length * 8
  );
  return new Uint8Array(bits);
}

async function buildVapidJwt(
  audience: string,
  subject: string,
  privateKeyJwk: JsonWebKey
): Promise<string> {
  // Return cached JWT if still valid (5-min buffer before expiry)
  const cacheKey = `${audience}:${subject}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = _jwtCache.get(cacheKey);
  if (cached && cached.exp > now + 300) return cached.jwt;

  // Re-use imported CryptoKey across requests in the same isolate
  const jwkId = (privateKeyJwk as any).kid ?? subject;
  let key = _keyCache.get(jwkId);
  if (!key) {
    key = await crypto.subtle.importKey(
      "jwk",
      privateKeyJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign"]
    );
    _keyCache.set(jwkId, key);
  }

  const enc = new TextEncoder();
  const exp = now + 43200; // 12 hours
  const header = b64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const payload = b64url(enc.encode(JSON.stringify({ aud: audience, exp, sub: subject })));
  const input = `${header}.${payload}`;
  const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(input));
  const jwt = `${input}.${b64url(sig)}`;

  _jwtCache.set(cacheKey, { jwt, exp });
  return jwt;
}

async function encryptMessage(
  plaintext: string,
  keys: { p256dh: string; auth: string }
): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const subscriberPub = fromB64url(keys.p256dh);
  const authSecret = fromB64url(keys.auth);

  const recipientKey = await crypto.subtle.importKey(
    "raw",
    subscriberPub,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    []
  );

  const serverKP = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"]
  );
  const serverPub = new Uint8Array(await crypto.subtle.exportKey("raw", serverKP.publicKey));

  const sharedBits = await crypto.subtle.deriveBits(
    { name: "ECDH", public: recipientKey },
    serverKP.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedBits);

  // PRK = HKDF(auth, sharedSecret, "WebPush: info\0" || recipientPub || serverPub)
  const infoLabel = enc.encode("WebPush: info\x00");
  const prkInfo = new Uint8Array(infoLabel.length + subscriberPub.length + serverPub.length);
  prkInfo.set(infoLabel, 0);
  prkInfo.set(subscriberPub, infoLabel.length);
  prkInfo.set(serverPub, infoLabel.length + subscriberPub.length);
  const prk = await hkdf(authSecret, sharedSecret, prkInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, prk, enc.encode("Content-Encoding: aes128gcm\x00"), 16);
  const nonce = await hkdf(salt, prk, enc.encode("Content-Encoding: nonce\x00"), 12);

  // Pad: append 0x02 last-record delimiter (RFC 8188)
  const plain = enc.encode(plaintext);
  const padded = new Uint8Array(plain.length + 1);
  padded.set(plain);
  padded[plain.length] = 2;

  const encKey = await crypto.subtle.importKey("raw", cek, "AES-GCM", false, ["encrypt"]);
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce }, encKey, padded)
  );

  // RFC 8188 record: salt(16) | rs(4 BE) | idlen(1) | serverPub(65) | ciphertext
  const out = new Uint8Array(16 + 4 + 1 + serverPub.length + ciphertext.length);
  let off = 0;
  out.set(salt, off); off += 16;
  new DataView(out.buffer).setUint32(off, 4096, false); off += 4;
  out[off] = serverPub.length; off += 1;
  out.set(serverPub, off); off += serverPub.length;
  out.set(ciphertext, off);
  return out;
}

export interface WebPushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface VapidConfig {
  privateKeyJwk: JsonWebKey;
  publicKeyB64: string;
  subject: string;
}

export async function sendWebPush(
  sub: WebPushSubscription,
  payload: { title: string; body: string; url?: string; type?: string },
  vapid: VapidConfig
): Promise<void> {
  const url = new URL(sub.endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = await buildVapidJwt(audience, vapid.subject, vapid.privateKeyJwk);
  const encrypted = await encryptMessage(JSON.stringify(payload), sub.keys);

  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      Authorization: `vapid t=${jwt},k=${vapid.publicKeyB64}`,
      "Content-Type": "application/octet-stream",
      "Content-Encoding": "aes128gcm",
      TTL: "86400",
      Urgency: "normal",
    },
    body: encrypted,
  });

  if (!res.ok && res.status !== 201) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Push failed ${res.status}: ${text}`);
    if (res.status === 410 || res.status === 404) (err as any).gone = true;
    throw err;
  }
}

// Broadcast a push to every subscription for a shop, silently removing stale ones
export async function broadcastPush(
  db: D1Database,
  shopId: string,
  payload: { title: string; body: string; url?: string; type?: string },
  vapid: VapidConfig
): Promise<void> {
  const { results } = await db
    .prepare("SELECT id, endpoint, keys_p256dh, keys_auth FROM push_subscriptions WHERE shop_id = ?")
    .bind(shopId)
    .all<{ id: string; endpoint: string; keys_p256dh: string; keys_auth: string }>();

  await Promise.allSettled(
    (results ?? []).map(async (row) => {
      try {
        await sendWebPush(
          { endpoint: row.endpoint, keys: { p256dh: row.keys_p256dh, auth: row.keys_auth } },
          payload,
          vapid
        );
      } catch (err: any) {
        if (err.gone) {
          await db.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(row.id).run();
        }
      }
    })
  );
}

// Build VapidConfig from env vars — returns null if not configured (local dev)
export function getVapidConfig(env: {
  VAPID_PRIVATE_KEY_JWK?: string;
  VAPID_PUBLIC_KEY?: string;
}): VapidConfig | null {
  if (!env.VAPID_PRIVATE_KEY_JWK || !env.VAPID_PUBLIC_KEY) return null;
  try {
    return {
      privateKeyJwk: JSON.parse(env.VAPID_PRIVATE_KEY_JWK),
      publicKeyB64: env.VAPID_PUBLIC_KEY,
      subject: "mailto:admin@greenlink.co.ke",
    };
  } catch {
    return null;
  }
}
