/// <reference lib="webworker" />
import { precacheAndRoute, cleanupOutdatedCaches } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { NetworkFirst, CacheFirst } from "workbox-strategies";
import { ExpirationPlugin } from "workbox-expiration";
import { CacheableResponsePlugin } from "workbox-cacheable-response";

// Augment the SW global scope so TS knows about __WB_MANIFEST injected by VitePWA
declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: { url: string; revision: string | null }[] };

// Precache all assets listed in the manifest injected by VitePWA
precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();

// ── Instant activation — no Chrome flash on reopen ───────────────────────────
// skipWaiting: new SW takes control immediately without waiting for old tabs to close
// clients.claim: SW controls all open clients instantly after activation
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) =>
  e.waitUntil(self.clients.claim())
);

// Network-first for all API calls (5s timeout → serve cached on slow connections)
registerRoute(
  ({ url }) => url.pathname.startsWith("/api/"),
  new NetworkFirst({
    cacheName: "api-cache",
    networkTimeoutSeconds: 5, // bumped from 2s → handles CF Worker cold starts
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 86_400 }),
    ],
  })
);

// Cache-first for webfonts (Google + Fontshare)
registerRoute(
  ({ url }) =>
    url.hostname.includes("fonts.googleapis.com") ||
    url.hostname.includes("fonts.gstatic.com") ||
    url.hostname.includes("api.fontshare.com"),
  new CacheFirst({
    cacheName: "fonts",
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 31_536_000 }),
    ],
  })
);

// ── Push notifications ───────────────────────────────────────────────────────
self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data: { title?: string; body?: string; url?: string; type?: string };
  try {
    data = event.data.json() as typeof data;
  } catch {
    data = { body: event.data.text() };
  }

  const notifOptions: NotificationOptions & { renotify?: boolean } = {
    body: data.body ?? "",
    icon: "/pwa-192x192.png",
    badge: "/pwa-192x192.png",
    tag: data.type ?? "greenlink",
    renotify: true,
    data: { url: data.url ?? "/alerts" },
  };
  event.waitUntil(self.registration.showNotification(data.title ?? "GreenLink OS", notifOptions));
});

// ── Notification click — open/focus the app ──────────────────────────────────
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target: string = (event.notification.data as { url?: string })?.url ?? "/alerts";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const existing = list.find((c) =>
          c.url.startsWith(self.location.origin)
        ) as WindowClient | undefined;
        if (existing) {
          existing.navigate(target);
          return existing.focus();
        }
        return self.clients.openWindow(target);
      })
  );
});
