var CACHE_NAME = "item-saver-v5";
var ASSETS = [
  "/item-saver/",
  "/item-saver/icon.svg",
  "/item-saver/icon-192.png",
  "/item-saver/icon-512.png",
  "/item-saver/main.js",
  "/item-saver/manifest.json",
  "/assets/css/main.css",
  "/assets/js/site.js",
  "/assets/fonts/archivo-latin.woff2",
  "/assets/fonts/azeret-mono-latin.woff2"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
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

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request).catch(function () {
        return caches.match("/item-saver/");
      })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      return cached || fetch(event.request);
    })
  );
});
