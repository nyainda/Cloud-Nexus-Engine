const productionApiBase = "https://greenlink-pos-api.bruce42oyugi.workers.dev";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ||
  (import.meta.env.PROD ? productionApiBase : null);
