---
layout: null
---
/* Penanda build Zen Write.
   ------------------------------------------------------------
   Diisi Liquid saat situs dibangun, jadi nilainya berubah setiap
   deploy. File ini ikut di-precache service worker dan dimuat
   bersama main.js: nilai di sini selalu mewakili aset yang benar
   benar sedang berjalan, bukan HTML terbaru dari jaringan.

   version.json membawa angka yang sama dari hasil build terakhir
   di server. Kalau keduanya berbeda, ada aset baru menunggu. */
window.ZenWriteBuild = "{% include build-stamp.html %}";
