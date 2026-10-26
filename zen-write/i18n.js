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
