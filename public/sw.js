// SchoolOS service worker. Kept hand-written and small on purpose.
//
// - Built JS/CSS (/_next/static) is immutable: cache-first.
// - Pages: network-first. Only pages that opt in with the
//   "x-offline-shell: 1" response header are cached, and those pages hold no
//   learner data in their HTML (they read it from IndexedDB on the device).
// - With no network and no cached shell, show /offline.

const VERSION = "v1";
const STATIC_CACHE = `static-${VERSION}`;
const SHELL_CACHE = `shell-${VERSION}`;
const OFFLINE_URL = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(new Request(OFFLINE_URL, { cache: "reload" }))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== STATIC_CACHE && key !== SHELL_CACHE)
          .map((key) => caches.delete(key)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  // Sent when a device is cleared so the next person on a shared laptop
  // starts clean.
  if (event.data === "clear-shells") {
    event.waitUntil(caches.delete(SHELL_CACHE));
  }
  // Sent by offline-capable pages on load: store the page and the scripts it
  // needs, since they were fetched before this worker was in control.
  if (event.data?.type === "cache-page" && typeof event.data.url === "string") {
    event.waitUntil(cachePage(event.data.url));
  }
});

async function cachePage(path) {
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  const response = await fetch(url, { credentials: "same-origin", headers: { accept: "text/html" } });
  if (!response.ok || response.headers.get("x-offline-shell") !== "1") return;
  const html = await response.clone().text();
  await (await caches.open(SHELL_CACHE)).put(url, response);
  const assets = new Set(html.match(/\/_next\/static\/[^"'\s)]+/g) ?? []);
  const staticCache = await caches.open(STATIC_CACHE);
  await Promise.all(
    [...assets].map(async (asset) => {
      if (await staticCache.match(asset)) return;
      const res = await fetch(asset);
      if (res.ok) await staticCache.put(asset, res);
    }),
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(cacheFirst(request));
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(networkFirstPage(request));
  }
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(STATIC_CACHE);
    cache.put(request, response.clone());
  }
  return response;
}

async function networkFirstPage(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(request);
    if (response.ok && response.headers.get("x-offline-shell") === "1") {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await cache.match(request, { ignoreSearch: true });
    return cached ?? (await cache.match(OFFLINE_URL)) ?? Response.error();
  }
}
