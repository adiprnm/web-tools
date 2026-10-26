var CACHE_NAME = "zen-write-v32";
var APP_SHELL = [
  "/zen-write/",
  "/zen-write/i18n.js",
  "/zen-write/main.js",
  "/zen-write/sync.js",
  "/assets/js/qrcode.js",
  "/zen-write/manifest.json",
  "/zen-write/icon.svg",
  "/zen-write/icon-180.png",
  "/zen-write/icon-192.png",
  "/zen-write/icon-512.png",
  "/zen-write/icon-maskable-512.png",
  "/assets/css/main.css",
  "/assets/js/site.js",
  "/assets/fonts/archivo-latin.woff2",
  "/assets/fonts/azeret-mono-latin.woff2",
  "/assets/fonts/lora-latin.woff2",
  "/assets/favicon.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(APP_SHELL);
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (key) {
          return key !== CACHE_NAME;
        }).map(function (key) {
          return caches.delete(key);
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;

  // API sync tidak boleh masuk cache: responsnya bergantung pada sesi dan
  // cursor, dan service worker ini menyajikan GET same-origin dari cache.
  var requestUrl = new URL(event.request.url);
  if (requestUrl.origin === self.location.origin &&
      (requestUrl.pathname === "/zen-write/api" || requestUrl.pathname.indexOf("/zen-write/api/") === 0)) {
    return;
  }

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).then(function (response) {
        var copy = response.clone();
        event.waitUntil(
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put(event.request, copy);
          })
        );
        return response;
      }).catch(function () {
        return caches.match("/zen-write/");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) return cached;

      return fetch(event.request).then(function (response) {
        if (response.ok && event.request.url.indexOf(self.location.origin) === 0) {
          var copy = response.clone();
          event.waitUntil(
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, copy);
            })
          );
        }
        return response;
      });
    })
  );
});
