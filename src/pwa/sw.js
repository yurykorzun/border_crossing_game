// Service worker for the built game. vite.config.ts emits it as sw.js with two constants
// above this file: CACHE (named after a hash of the build) and ASSETS (every file the
// build wrote, relative to the scope).
//
// Updates reach players on the next load because:
// - a new build changes CACHE, so sw.js changes and the browser installs the new worker;
// - the page itself is network-first (revalidated past the HTTP cache), so an online load
//   always gets the new index.html;
// - everything else is hashed by Vite, so cache-first never serves an old file under a new name.
/* global CACHE, ASSETS */

const scope = self.registration.scope;
const pageUrl = new URL('./', scope).href;
const pagePaths = [new URL(pageUrl).pathname, new URL('index.html', scope).pathname];
// Servers answer with Vary (vite preview: Origin), and the page's crossorigin script sends an
// Origin header the precache request did not, so a Vary-respecting match always misses.
// Every cached file is static and the same for any Origin, so Vary is safe to ignore.
const MATCH = { ignoreVary: true };

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the HTTP cache, so the precache matches this build and not an older page.
  const urls = [pageUrl, ...ASSETS.map((a) => new URL(a, scope).href)];
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(urls.map((u) => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || !req.url.startsWith(scope)) return;

  if (req.mode === 'navigate') {
    const isPage = pagePaths.includes(new URL(req.url).pathname);
    event.respondWith(
      fetch(req, { cache: 'no-cache' })
        .then((res) => {
          if (res.ok && isPage) {
            const copy = res.clone();
            event.waitUntil(caches.open(CACHE).then((cache) => cache.put(pageUrl, copy)));
          }
          return res;
        })
        .catch(() => caches.match(isPage ? pageUrl : req, MATCH).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  event.respondWith(caches.match(req, MATCH).then((hit) => hit ?? fetch(req)));
});
