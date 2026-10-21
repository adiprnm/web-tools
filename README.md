# tools.adipurnm.com

Perkakas kecil yang berjalan di browser. Dibangun dengan Jekyll.

## Menjalankan secara lokal

```sh
bundle install
bundle exec jekyll serve
```

Buka <http://localhost:4000>.

## Struktur

- `_data/tools.yml` — daftar alat, kelompok, catatan, dan info privasi.
- `_layouts/tool.html` — kerangka bersama untuk semua halaman alat.
- `assets/css/main.css` — sistem visual bersama.
- `assets/js/site.js` — notifikasi dan penyalinan teks bersama.
- `<slug>/` — satu folder per alat.

Setiap alat memakai front matter minimal:

```yaml
---
layout: tool
tool: nama-slug
title: Nama Alat
description: Satu kalimat tentang alat ini.
---
```

Proses dan data berjalan di browser. Tidak ada data alat yang dikirim ke server.
