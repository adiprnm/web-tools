var CACHE_NAME = "zen-write-v35";
var APP_SHELL = [
  "/zen-write/",
  "/zen-write/build.js",
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

  // version.json adalah pembanding versi: menjawabnya dari cache sama saja
  // dengan bilang "tidak ada pembaruan" selamanya. Biarkan jaringan.
  if (requestUrl.origin === self.location.origin &&
      requestUrl.pathname === "/zen-write/version.json") {
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

  // Serve what is cached, then refresh it in the background. A deploy lands on
  // the next load instead of waiting for someone to bump CACHE_NAME by hand,
  // which is how a fixed script kept being served as the old one.
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var network = fetch(event.request).then(function (response) {
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

      if (cached) {
        event.waitUntil(network.catch(function () {}));
        return cached;
      }

      // No cached copy and the network failed: let it fail rather than answer a
      // script request with the page shell.
      return network;
    })
  );
});
