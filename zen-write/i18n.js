/* Zen Write localization
   ------------------------------------------------------------
   Dimuat sebelum main.js supaya teks halaman sudah diterjemahkan
   saat pertama kali dilukis (tidak ada kedipan bahasa). Bahasa
   disimpan di localStorage bersama setelan lain, dan defaultnya
   adalah bahasa Inggris.

   Penanda di HTML:
     data-i18n              -> textContent
     data-i18n-aria-label   -> aria-label
     data-i18n-title        -> title
     data-i18n-placeholder  -> placeholder
   ------------------------------------------------------------ */

(function (global) {
  "use strict";

  var DEFAULT_LANG = "en";
  var SUPPORTED = ["en", "id"];
  var SETTINGS_KEY = "zen-write:settings:v1";

  var MONTHS = {
    en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
    id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
  };

  var DICT = {
    en: {
      "lang.label": "Language",
      "lang.toggle": "Language: English. Switch to Indonesian.",

      "toolbar.show": "Show writing tools",
      "toolbar.hide": "Hide writing tools",
      "focus.group": "Focus mode",
      "focus.off": "Focus off",
      "focus.sentence": "Sentence focus",
      "focus.paragraph": "Paragraph focus",
      "font.button": "Typeface",
      "theme.button": "Appearance theme",
      "actions.group": "Writing actions",

      "preview.open": "Preview markdown",
      "preview.openTitle": "Preview markdown",
      "preview.edit": "Back to writing",
      "preview.empty": "Nothing to preview yet.",

      "editor.placeholder": "Start writing…",
      "editor.label": "Writing area",
      "stats.words": "words",
      "stats.chars": "characters",
      "stats.minutes": "min read",
      "donate.link": "Enjoying Zen Write? Buy me a coffee",

      "notes.open": "Notes list",
      "notes.openTitle": "Notes list (Ctrl+K)",
      "notes.panel": "Notes list",
      "notes.title": "Notes",
      "notes.titleTrash": "Trash",
      "notes.close": "Close list",
      "notes.closeTitle": "Close",
      "notes.search": "Search title or content…",
      "notes.searchLabel": "Search notes",
      "notes.new": "New note",
      "notes.export": "Export all notes",
      "notes.exportTitle": "Export all (.json)",
      "notes.import": "Import notes",
      "notes.importTitle": "Import (.json)",
      "notes.trash": "Trash",
      "notes.emptyInitial": "No notes yet.",
      "notes.emptyTrash": "Trash is empty.",
      "notes.emptySearch": "No notes match your search.",
      "notes.emptyAll": "No notes yet. Start writing — everything is saved automatically.",
      "notes.more": "Showing {shown} of {total} notes. Narrow your search to see the rest.",
      "notes.clearTrash": "Empty trash",
      "notes.renameLabel": "Note title",
      "note.restore": "Restore",
      "note.purge": "Delete permanently",
      "note.pin": "Pin",
      "note.unpin": "Unpin",
      "note.rename": "Rename",
      "note.delete": "Move to trash",

      "dialog.close": "Close",
      "font.dialog": "Typeface",
      "font.group.sans": "Sans serif",
      "font.group.serif": "Serif",
      "font.group.mono": "Monospace",
      "font.preview": "Writing quietly in the morning.",
      "font.current": "Typeface: {name}",
      "theme.dialog": "Theme",
      "theme.paper": "Paper",
      "theme.paper.desc": "Light, neutral",
      "theme.warm": "Warm",
      "theme.warm.desc": "Cream, like old paper",
      "theme.dusk": "Dusk",
      "theme.dusk.desc": "Warm dark",
      "theme.night": "Night",
      "theme.night.desc": "Neutral dark",

      "copy.button": "Copy writing",
      "download.button": "Download as .md",
      "download.title": "Download .md",
      "new.button": "New note",
      "fullscreen.enter": "Full screen",
      "fullscreen.exit": "Exit full screen",

      "saved.ready": "Ready",
      "saved.saving": "Saving",
      "saved.saved": "Saved",
      "saved.restored": "Draft restored",
      "saved.created": "New note",
      "saved.titled": "Title saved",
      "saved.failed": "Couldn't save",
      "saved.unavailable": "Storage unavailable",

      "time.now": "just now",
      "time.minutes": "{n} min ago",
      "time.hours": "{n} hr ago",
      "time.days": "{n} d ago",

      "doc.untitled": "Untitled",
      "meta.words": "{n} word|{n} words",
      "meta.deleted": " · deleted {time}",

      "toast.movedToTrash": "Note moved to trash.",
      "toast.restored": "Note restored.",
      "toast.purged": "Note deleted permanently.",
      "toast.trashEmptied": "Trash emptied.",
      "toast.pinned": "Note pinned.",
      "toast.unpinned": "Pin removed.",
      "toast.exported": "Notes exported.",
      "toast.importUnknown": "Unrecognized file.",
      "toast.importEmpty": "No notes to import.",
      "toast.importRead": "Couldn't read the file.",
      "toast.imported": "{n} note imported.|{n} notes imported.",
      "toast.indexeddb": "IndexedDB is unavailable, so notes are stored in localStorage.",
      "toast.noStorage": "Browser storage is unavailable; writing only lasts while this tab is open.",
      "toast.copyEmpty": "Nothing to copy yet.",
      "toast.downloadEmpty": "Nothing to download yet.",
      "toast.downloaded": "Writing downloaded.",
      "toast.newNote": "New note",

      "sync.open": "Sync and backup",
      "sync.title": "Sync & backup",
      "sync.soonLead": "Sync and backup are still invite-only while they are being prepared.",
      "sync.soonNote": "Notes stay on this device by default. Sync is optional, end-to-end encrypted, and needs approval.",
      "sync.requestOpen": "Request access",
      "sync.haveCode": "I have a code",
      "sync.contact": "Contact",
      "sync.contactPlaceholder": "email, Telegram, or WhatsApp",
      "sync.contactHint": "So I can send you the access code.",
      "sync.noteLabel": "What will you write?",
      "sync.optional": "Optional",
      "sync.send": "Send request",
      "sync.requested": "Your request is in. I read these by hand, so it may take a while.",
      "sync.requestPending": "Still waiting for approval.",
      "sync.requestApproved": "Approved. Ask me for the access code.",
      "sync.requestRejected": "This request was declined.",
      "sync.checkAgain": "Check again",
      "sync.claimLead": "Paste the access code you received. It works once.",
      "sync.code": "Access code",
      "sync.activate": "Activate",
      "sync.claimFailed": "That code is not valid or has expired.",
      "sync.recoveryLead": "Save this recovery key somewhere safe.",
      "sync.recoveryNote": "It is the only way back if you lose every device. It is never sent to the server and cannot be recovered or reset.",
      "sync.copy": "Copy",
      "sync.download": "Download",
      "sync.continue": "I saved it",
      "sync.now": "Sync now",
      "sync.devices": "Devices",
      "sync.pairHeading": "Add a device",
      "sync.pairNote": "Show a code here, then scan it with the camera on your other device. The code expires in five minutes.",
      "sync.showPair": "Show pairing code",
      "sync.copyLink": "Copy link",
      "sync.keyHeading": "Recovery key",
      "sync.showKey": "Show recovery key",
      "sync.revoke": "Sign out this device",
      "sync.statusIdle": "Up to date",
      "sync.statusSyncing": "Syncing…",
      "sync.statusOffline": "Offline",
      "sync.statusError": "Sync failed",
      "sync.statusExpired": "Access ended",
      "sync.errorGeneric": "Couldn't sync. It will try again.",
      "sync.errorAuth": "This device is no longer signed in.",
      "sync.errorExpired": "Sync has stopped because access ended.",
      "sync.conflictSuffix": "(conflicted copy)",
      "sync.deviceThis": "This device",
      "sync.deviceRevoked": "Signed out",
      "sync.devicesEmpty": "No devices yet.",
      "sync.pairInvalid": "That pairing code is not valid or has expired.",
      "sync.pairConfirm": "Pair this device with the account from the link?",
      "sync.pairReady": "Pairing code ready.",
      "sync.toastActivated": "Sync is active on this device.",
      "sync.toastPaired": "This device is paired.",
      "sync.toastSynced": "Notes synced.",
      "sync.toastRequestSent": "Request sent.",
      "sync.toastRevoked": "This device was signed out.",
      "sync.toastNoKey": "The recovery key is not stored on this device.",
      "sync.revokeConfirm": "Sign out this device? You can pair it again with the recovery key.",
      "sync.deviceFallback": "Device",

      "confirm.purge": "Delete this note permanently? This can't be undone.",
      "confirm.emptyTrash": "Empty the trash? {n} note will be deleted permanently.|Empty the trash? {n} notes will be deleted permanently.",

      "file.exportPrefix": "zen-write-notes-",
      "file.untitled": "untitled"
    },

    id: {
      "lang.label": "Bahasa",
      "lang.toggle": "Bahasa: Indonesia. Ganti ke English.",

      "toolbar.show": "Tampilkan alat tulis",
      "toolbar.hide": "Sembunyikan alat tulis",
      "focus.group": "Mode fokus",
      "focus.off": "Fokus mati",
      "focus.sentence": "Fokus kalimat",
      "focus.paragraph": "Fokus paragraf",
      "font.button": "Jenis huruf",
      "theme.button": "Tema tampilan",
      "actions.group": "Aksi tulisan",

      "preview.open": "Pratinjau markdown",
      "preview.openTitle": "Pratinjau markdown",
      "preview.edit": "Kembali menulis",
      "preview.empty": "Belum ada yang bisa dipratinjau.",

      "editor.placeholder": "Mulai menulis…",
      "editor.label": "Area tulisan",
      "stats.words": "kata",
      "stats.chars": "karakter",
      "stats.minutes": "menit baca",
      "donate.link": "Suka Zen Write? Traktir saya jajan",

      "notes.open": "Daftar catatan",
      "notes.openTitle": "Daftar catatan (Ctrl+K)",
      "notes.panel": "Daftar catatan",
      "notes.title": "Catatan",
      "notes.titleTrash": "Sampah",
      "notes.close": "Tutup daftar",
      "notes.closeTitle": "Tutup",
      "notes.search": "Cari judul atau isi…",
      "notes.searchLabel": "Cari catatan",
      "notes.new": "Catatan baru",
      "notes.export": "Ekspor semua catatan",
      "notes.exportTitle": "Ekspor semua (.json)",
      "notes.import": "Impor catatan",
      "notes.importTitle": "Impor (.json)",
      "notes.trash": "Sampah",
      "notes.emptyInitial": "Belum ada catatan.",
      "notes.emptyTrash": "Sampah kosong.",
      "notes.emptySearch": "Tidak ada catatan yang cocok.",
      "notes.emptyAll": "Belum ada catatan. Mulai menulis — semuanya tersimpan otomatis.",
      "notes.more": "Menampilkan {shown} dari {total} catatan. Persempit pencarian untuk melihat sisanya.",
      "notes.clearTrash": "Kosongkan sampah",
      "notes.renameLabel": "Judul catatan",
      "note.restore": "Pulihkan",
      "note.purge": "Hapus permanen",
      "note.pin": "Sematkan",
      "note.unpin": "Lepas sematan",
      "note.rename": "Ubah judul",
      "note.delete": "Pindahkan ke sampah",

      "dialog.close": "Tutup",
      "font.dialog": "Jenis huruf",
      "font.group.sans": "Sans serif",
      "font.group.serif": "Serif",
      "font.group.mono": "Monospace",
      "font.preview": "Menulis tenang di pagi hari.",
      "font.current": "Jenis huruf: {name}",
      "theme.dialog": "Tema",
      "theme.paper": "Kertas",
      "theme.paper.desc": "Terang, netral",
      "theme.warm": "Hangat",
      "theme.warm.desc": "Krem, seperti kertas tua",
      "theme.dusk": "Senja",
      "theme.dusk.desc": "Gelap kehangatan",
      "theme.night": "Malam",
      "theme.night.desc": "Gelap netral",

      "copy.button": "Salin tulisan",
      "download.button": "Unduh sebagai .md",
      "download.title": "Unduh .md",
      "new.button": "Catatan baru",
      "fullscreen.enter": "Layar penuh",
      "fullscreen.exit": "Keluar layar penuh",

      "saved.ready": "Siap",
      "saved.saving": "Menyimpan",
      "saved.saved": "Tersimpan",
      "saved.restored": "Draf dipulihkan",
      "saved.created": "Catatan baru",
      "saved.titled": "Judul disimpan",
      "saved.failed": "Tidak bisa menyimpan",
      "saved.unavailable": "Penyimpanan tidak tersedia",

      "time.now": "baru saja",
      "time.minutes": "{n} mnt lalu",
      "time.hours": "{n} jm lalu",
      "time.days": "{n} hr lalu",

      "doc.untitled": "Tanpa judul",
      "meta.words": "{n} kata",
      "meta.deleted": " · dihapus {time}",

      "toast.movedToTrash": "Catatan dipindah ke sampah.",
      "toast.restored": "Catatan dipulihkan.",
      "toast.purged": "Catatan dihapus permanen.",
      "toast.trashEmptied": "Sampah dikosongkan.",
      "toast.pinned": "Catatan disematkan.",
      "toast.unpinned": "Sematan dilepas.",
      "toast.exported": "Catatan diekspor.",
      "toast.importUnknown": "Berkas tidak dikenali.",
      "toast.importEmpty": "Tidak ada catatan untuk diimpor.",
      "toast.importRead": "Gagal membaca berkas.",
      "toast.imported": "{n} catatan diimpor.",
      "toast.indexeddb": "IndexedDB tidak tersedia; catatan disimpan di localStorage.",
      "toast.noStorage": "Penyimpanan browser tidak tersedia; tulisan hanya bertahan selama tab terbuka.",
      "toast.copyEmpty": "Belum ada tulisan untuk disalin.",
      "toast.downloadEmpty": "Belum ada tulisan untuk diunduh.",
      "toast.downloaded": "Tulisan diunduh.",
      "toast.newNote": "Catatan baru",

      "sync.open": "Sync dan cadangan",
      "sync.title": "Sync & cadangan",
      "sync.soonLead": "Sync dan cadangan masih khusus undangan sementara disiapkan.",
      "sync.soonNote": "Catatan tetap di perangkat ini. Sync bersifat opsional, terenkripsi end-to-end, dan perlu persetujuan.",
      "sync.requestOpen": "Minta akses",
      "sync.haveCode": "Saya punya kode",
      "sync.contact": "Kontak",
      "sync.contactPlaceholder": "email, Telegram, atau WhatsApp",
      "sync.contactHint": "Supaya saya bisa mengirim kode akses.",
      "sync.noteLabel": "Mau menulis apa?",
      "sync.optional": "Opsional",
      "sync.send": "Kirim permintaan",
      "sync.requested": "Permintaanmu sudah masuk. Saya membacanya satu per satu, jadi bisa agak lama.",
      "sync.requestPending": "Masih menunggu persetujuan.",
      "sync.requestApproved": "Disetujui. Minta kode aksesnya ke saya.",
      "sync.requestRejected": "Permintaan ini ditolak.",
      "sync.checkAgain": "Periksa lagi",
      "sync.claimLead": "Tempel kode akses yang kamu terima. Kode ini hanya berlaku sekali.",
      "sync.code": "Kode akses",
      "sync.activate": "Aktifkan",
      "sync.claimFailed": "Kode itu tidak valid atau sudah kedaluwarsa.",
      "sync.recoveryLead": "Simpan recovery key ini di tempat aman.",
      "sync.recoveryNote": "Ini satu-satunya jalan kembali kalau semua perangkat hilang. Kunci ini tidak pernah dikirim ke server dan tidak bisa dipulihkan atau direset.",
      "sync.copy": "Salin",
      "sync.download": "Unduh",
      "sync.continue": "Sudah saya simpan",
      "sync.now": "Sync sekarang",
      "sync.devices": "Perangkat",
      "sync.pairHeading": "Tambah perangkat",
      "sync.pairNote": "Tampilkan kode di sini, lalu pindai dengan kamera di perangkat lain. Kode berlaku lima menit.",
      "sync.showPair": "Tampilkan kode pairing",
      "sync.copyLink": "Salin tautan",
      "sync.keyHeading": "Recovery key",
      "sync.showKey": "Tampilkan recovery key",
      "sync.revoke": "Keluar dari perangkat ini",
      "sync.statusIdle": "Sudah sinkron",
      "sync.statusSyncing": "Menyinkronkan…",
      "sync.statusOffline": "Luring",
      "sync.statusError": "Sync gagal",
      "sync.statusExpired": "Akses berakhir",
      "sync.errorGeneric": "Gagal sync. Akan dicoba lagi.",
      "sync.errorAuth": "Perangkat ini tidak lagi masuk.",
      "sync.errorExpired": "Sync berhenti karena akses berakhir.",
      "sync.conflictSuffix": "(salinan konflik)",
      "sync.deviceThis": "Perangkat ini",
      "sync.deviceRevoked": "Sudah keluar",
      "sync.devicesEmpty": "Belum ada perangkat.",
      "sync.pairInvalid": "Kode pairing tidak valid atau sudah kedaluwarsa.",
      "sync.pairConfirm": "Sambungkan perangkat ini dengan akun dari tautan itu?",
      "sync.pairReady": "Kode pairing siap.",
      "sync.toastActivated": "Sync aktif di perangkat ini.",
      "sync.toastPaired": "Perangkat ini sudah tersambung.",
      "sync.toastSynced": "Catatan tersinkron.",
      "sync.toastRequestSent": "Permintaan terkirim.",
      "sync.toastRevoked": "Perangkat ini sudah keluar.",
      "sync.toastNoKey": "Recovery key tidak tersimpan di perangkat ini.",
      "sync.revokeConfirm": "Keluar dari perangkat ini? Kamu bisa menyambungkannya lagi dengan recovery key.",
      "sync.deviceFallback": "Perangkat",

      "confirm.purge": "Hapus catatan ini permanen? Tindakan ini tidak bisa dibatalkan.",
      "confirm.emptyTrash": "Kosongkan sampah? {n} catatan akan dihapus permanen.",

      "file.exportPrefix": "zen-write-catatan-",
      "file.untitled": "tanpa-judul"
    }
  };

  var current = DEFAULT_LANG;

  function normalize(code) {
    var value = String(code || "").trim().toLowerCase().split("-")[0];
    return SUPPORTED.indexOf(value) >= 0 ? value : null;
  }

  function storedLang() {
    try {
      var settings = JSON.parse(global.localStorage.getItem(SETTINGS_KEY) || "null");
      if (settings && typeof settings === "object") return normalize(settings.lang);
    } catch (error) {
      // setelan rusak atau localStorage diblokir; pakai deteksi browser
    }
    return null;
  }

  function browserLang() {
    var list = global.navigator
      ? (global.navigator.languages && global.navigator.languages.length
        ? global.navigator.languages
        : [global.navigator.language])
      : [];

    for (var i = 0; i < list.length; i += 1) {
      var code = normalize(list[i]);
      if (code) return code;
    }

    return null;
  }

  function detect() {
    return storedLang() || browserLang() || DEFAULT_LANG;
  }

  function lookup(key) {
    var value = DICT[current] ? DICT[current][key] : undefined;
    if (value === undefined) value = DICT[DEFAULT_LANG][key];
    return value === undefined ? key : value;
  }

  function interpolate(text, vars) {
    if (!vars) return text;
    return text.replace(/\{(\w+)\}/g, function (match, name) {
      return vars[name] === undefined ? match : String(vars[name]);
    });
  }

  function t(key, vars) {
    return interpolate(lookup(key), vars);
  }

  // Bentuk jamak dipisah dengan "|": "1 word|2 words". Bahasa Indonesia
  // hanya punya satu bentuk, jadi cukup satu.
  function plural(key, count, vars) {
    var text = lookup(key);
    var forms = text.split("|");
    if (forms.length === 1) return interpolate(forms[0], Object.assign({ n: count, count: count }, vars));

    var values = {
      n: count,
      count: count
    };
    if (vars) {
      Object.keys(vars).forEach(function (name) { values[name] = vars[name]; });
    }

    return interpolate(Number(count) === 1 ? forms[0] : forms[1], values);
  }

  function apply(root) {
    var scope = root || document;
    if (!scope || typeof scope.querySelectorAll !== "function") return;

    scope.querySelectorAll("[data-i18n]").forEach(function (element) {
      element.textContent = t(element.getAttribute("data-i18n"));
    });

    [
      ["data-i18n-aria-label", "aria-label"],
      ["data-i18n-title", "title"],
      ["data-i18n-placeholder", "placeholder"]
    ].forEach(function (pair) {
      scope.querySelectorAll("[" + pair[0] + "]").forEach(function (element) {
        element.setAttribute(pair[1], t(element.getAttribute(pair[0])));
      });
    });
  }

  function setLang(code) {
    current = normalize(code) || DEFAULT_LANG;
    if (typeof document !== "undefined") {
      document.documentElement.lang = current;
      apply();
    }
    return current;
  }

  function lang() {
    return current;
  }

  function months() {
    return MONTHS[current] || MONTHS[DEFAULT_LANG];
  }

  global.ZenWriteI18n = {
    DEFAULT_LANG: DEFAULT_LANG,
    SUPPORTED: SUPPORTED,
    detect: detect,
    normalize: normalize,
    lang: lang,
    months: months,
    setLang: setLang,
    apply: apply,
    t: t,
    plural: plural
  };

  // Terapkan sedini mungkin: skrip ini sinkron dan berada setelah markup,
  // jadi bahasa tersimpan sudah dipakai sebelum halaman dilukis.
  setLang(detect());
})(window);
