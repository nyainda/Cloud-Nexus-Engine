import { customFetch } from "@workspace/api-client-react";

const STORAGE_KEY = "greenlink_push_enabled";
const ENDPOINT_KEY = "greenlink_push_endpoint";

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
  return output;
}

export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function getPushPermission(): NotificationPermission | "unsupported" {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission;
}

export async function getActiveSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

export async function subscribeToPush(): Promise<boolean> {
  if (!isPushSupported()) return false;

  // 1. Request notification permission
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  // 2. Fetch VAPID public key from server
  let key: string | null = null;
  try {
    const res = await customFetch<{ key: string | null }>("/api/push/vapid-public-key");
    key = (res as any)?.key ?? null;
  } catch {
    return false;
  }
  if (!key) return false;

  // 3. Subscribe via PushManager
  const reg = await navigator.serviceWorker.ready;
  let sub: PushSubscription;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(key),
    });
  } catch {
    return false;
  }

  // 4. Save subscription to server
  try {
    const json = sub.toJSON();
    await customFetch<any>("/api/push/subscribe", {
      method: "POST",
      body: JSON.stringify({
        endpoint: json.endpoint,
        keys: json.keys,
      }),
    });
  } catch {
    await sub.unsubscribe().catch(() => {});
    return false;
  }

  localStorage.setItem(STORAGE_KEY, "1");
  localStorage.setItem(ENDPOINT_KEY, sub.endpoint);
  return true;
}

export async function unsubscribeFromPush(): Promise<void> {
  const sub = await getActiveSubscription();
  if (sub) {
    try {
      await customFetch<any>("/api/push/subscribe", {
        method: "DELETE",
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
    } catch {}
    await sub.unsubscribe().catch(() => {});
  }
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(ENDPOINT_KEY);
}

export async function sendTestPush(): Promise<void> {
  await customFetch<any>("/api/push/test", { method: "POST" });
}
