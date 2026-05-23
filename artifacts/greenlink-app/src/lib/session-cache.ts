const SESSION_CACHE_KEY = "greenlink_session_cache";

export function getCachedSession() {
  try {
    const raw = localStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setCachedSession(data: object | null) {
  if (data) {
    localStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(data));
  } else {
    localStorage.removeItem(SESSION_CACHE_KEY);
  }
}
