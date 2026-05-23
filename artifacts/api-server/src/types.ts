export type Env = {
  DB: D1Database;
  SESSIONS: KVNamespace;
  GEMINI_API_KEY?: string;
  NODE_ENV?: string;
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
