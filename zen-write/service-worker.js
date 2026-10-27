---
layout: null
---
{%- comment -%}
  Skrip dan gaya diminta dengan penanda build di URL-nya. Itu yang
  mencegah HTML baru bertemu main.js lama dari cache: setiap build punya
  URL sendiri, jadi tidak ada versi yang bisa tertukar. Nama cache ikut
  memakai penanda yang sama supaya cache lama dibuang saat activate.
{%- endcomment -%}
{%- capture build_stamp -%}{% include build-stamp.html %}{%- endcapture -%}
var CACHE_NAME = "zen-write-{{ build_stamp }}";
var APP_SHELL = [
  "/zen-write/",
  "/zen-write/build.js?v={{ build_stamp }}",
  "/zen-write/i18n.js?v={{ build_stamp }}",
  "/zen-write/main.js?v={{ build_stamp }}",
  "/zen-write/sync.js?v={{ build_stamp }}",
  "/assets/js/qrcode.js?v={{ build_stamp }}",
  "/zen-write/manifest.json",
  "/zen-write/icon.svg",
  "/zen-write/icon-180.png",
  "/zen-write/icon-192.png",
  "/zen-write/icon-512.png",
  "/zen-write/icon-maskable-512.png",
  "/assets/css/main.css?v={{ build_stamp }}",
  "/assets/js/site.js?v={{ build_stamp }}",
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
      // no-store: GitHub Pages mengirim max-age=600 untuk HTML, dan cache HTTP
      // itu yang membuat tombol pembaruan terasa tidak melakukan apa-apa —
      // navigasi tetap memutar dokumen lama walau cache aset sudah dihapus.
      fetch(event.request, { cache: "no-store" }).then(function (response) {
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
