/* public/sw.js
 * GH0ST EMPIRE service worker — deliberately minimal and bricking-proof.
 *
 * The cardinal rule of this SW: NEVER serve stale HTML or JS. A bad service
 * worker can "freeze" a site by serving an old shell forever; we avoid that by
 * design:
 *   - Navigations (HTML) are ALWAYS network-first. Online users always get the
 *     freshest document; the offline page is shown ONLY when the network fails.
 *   - The only things cached cache-first are content-hashed, immutable build
 *     assets (/_next/static/*) and the brand icons. Hashed URLs change whenever
 *     their content changes, so a cache hit can never be stale by construction.
 *   - /api/*, /overlay/* and SSE streams are passed straight to the network,
 *     untouched — OBS overlays and live alert streams must never be intercepted.
 *   - Bumping SW_VERSION purges every old cache on activate.
 */
const SW_VERSION = "v2"; // bumped for the web-push handlers (#533)
const STATIC_CACHE = `ghost-static-${SW_VERSION}`;
const OFFLINE_URL = "/offline";

// Precache just the offline fallback. Keep the SW dumb: the less it caches, the
// less can ever go stale.
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      try {
        await cache.add(OFFLINE_URL);
      } catch {
        /* offline page unreachable at install time — non-fatal, retry next load */
      }
      await self.skipWaiting();
    })(),
  );
});

// Drop every cache that isn't the current version, then take control so the new
// SW governs open tabs immediately (no second reload needed).
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== STATIC_CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever touch same-origin GETs. Everything else (POSTs, cross-origin
  // fonts/analytics, etc.) goes straight to the network.
  if (request.method !== "GET") return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return;

  // HARD BYPASS — never intercept these. APIs, OBS overlays and any SSE stream
  // must reach the network directly and stay live.
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/overlay") ||
    (request.headers.get("accept") || "").includes("text/event-stream")
  ) {
    return;
  }

  // Immutable, content-hashed build output + stable brand icons → cache-first.
  // (Hashed URLs change on every rebuild, so this can never serve stale code.)
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Page navigations (HTML) → network-first, offline page as the ONLY fallback.
  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  // Anything else: let the browser handle it normally (no caching).
});

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch {
    return cached || Response.error();
  }
}

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cache = await caches.open(STATIC_CACHE);
    const offline = await cache.match(OFFLINE_URL);
    return offline || Response.error();
  }
}

/* ----- Web Push (#533) -----------------------------------------------------
 * Show a notification from a pushed payload, and focus/open the target URL on
 * click. Payload shape is produced by lib/web-push buildPushPayload:
 *   { title, body, url, icon, tag }
 * Defensive parsing: a malformed/empty payload still shows a generic note. */
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : "" };
  }
  const title = data.title || "GH0ST EMPIRE";
  const options = {
    body: data.body || "",
    icon: data.icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // Reuse an open tab on this origin if there is one; otherwise open a window.
      for (const c of all) {
        try {
          if (new URL(c.url).origin === self.location.origin) {
            await c.focus();
            if ("navigate" in c) await c.navigate(target);
            return;
          }
        } catch {
          /* ignore an unparseable client url */
        }
      }
      await self.clients.openWindow(target);
    })(),
  );
});
