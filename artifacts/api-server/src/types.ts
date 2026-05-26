export type Env = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  INVOICES?: R2Bucket;
  GEMINI_API_KEY?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY_JWK?: string;
  NODE_ENV?: string;
  DATA_DIR?: string;
};

export type SessionData = {
  shopId: string;
  role: "owner" | "cashier";
  userName: string | null;
  shopName: string;
};

export type Variables = {
  session: SessionData;
};

export type AppEnv = { Bindings: Env; Variables: Variables };
