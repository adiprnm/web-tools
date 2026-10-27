(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/zen-write/service-worker.js").catch(function () {
        // PWA offline mode tidak tersedia; alat tetap bisa dipakai.
      });
    });
  }

  var SAVE_DELAY = 500;
  var MIN_SAVING_DISPLAY = 400;
  var DB_NAME = "zen-write";
  var DB_VERSION = 1;
  var DB_STORE = "documents";
  var SETTINGS_KEY = "zen-write:settings:v1";
  var FALLBACK_KEY = "zen-write:docs-fallback:v1";
  var LEGACY_BACKUP_KEY = "zen-write:draf-lama:v1";
  var MIGRATED_KEY = "zen-write:migrasi:v1";
  var LEGACY_KEYS = ["zen-write:v1", "tulis-tenang:v1"];
  var MAX_ROWS = 300;
  var WORDS_PER_MINUTE = 200;
  var TOOLBAR_HIDE_DELAY = 2800;
  var TOOLBAR_HINT_DELAY = 2000;
  var SCROLL_SETTLE_DELAY = 140;
  var SWIPE_MIN_DISTANCE = 60;
  var SWIPE_MAX_DURATION = 700;
  var SWIPE_WHEEL_WINDOW = 260;
  var SWIPE_WHEEL_DISTANCE = 90;
  var FOCUS_MODES = ["off", "sentence", "paragraph"];
  var FONT_MODES = [
    "sans", "inter", "sourcesans",
    "serif", "garamond", "literata",
    "mono", "plex", "jetbrains"
  ];
  var FONT_LABELS = {
    sans: "Archivo",
    inter: "Inter",
    sourcesans: "Source Sans 3",
    serif: "Lora",
    garamond: "EB Garamond",
    literata: "Literata",
    mono: "Azeret Mono",
    plex: "IBM Plex Mono",
    jetbrains: "JetBrains Mono"
  };
  var isFirefoxMobile = /Firefox|FxiOS/i.test(navigator.userAgent) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  var canHover = !!(window.matchMedia && window.matchMedia("(hover: hover)").matches);

  var i18n = window.ZenWriteI18n || null;

  function t(key, vars) {
    return i18n ? i18n.t(key, vars) : key;
  }

  function tn(key, count, vars) {
    return i18n ? i18n.plural(key, count, vars) : key;
  }

  function activeLang() {
    return i18n ? i18n.lang() : "en";
  }

  // Pemecah kalimat mengikuti bahasa aktif: aturan tanda baca dan
  // singkatan berbeda antara Inggris dan Indonesia.
  var sentenceSegmenter = null;

  function setSentenceLanguage(lang) {
    sentenceSegmenter = null;
    try {
      if (typeof Intl !== "undefined" && Intl.Segmenter) {
        sentenceSegmenter = new Intl.Segmenter(lang, { granularity: "sentence" });
      }
    } catch (error) {
      sentenceSegmenter = null;
    }
  }

  setSentenceLanguage(activeLang());

  document.addEventListener("DOMContentLoaded", function () {
    var area = document.getElementById("writing-area");
    if (!area) return;

    var room = document.getElementById("writing-room");
    var roomInner = room ? room.querySelector(".writing-room-inner") : null;
    var toolbar = document.getElementById("writing-toolbar");
    var toolbarTrigger = document.getElementById("writing-toolbar-trigger");
    var stage = document.getElementById("writing-stage");
    var mirror = document.getElementById("writing-mirror");
    var wordsEl = document.getElementById("writing-words");
    var minutesEl = document.getElementById("writing-minutes");
    var savedEl = document.getElementById("writing-saved");
    var fullscreenButton = document.getElementById("writing-fullscreen");
    var copyButton = document.getElementById("writing-copy");
    var downloadButton = document.getElementById("writing-download");
    var newButton = document.getElementById("writing-new");
    var focusButtons = Array.prototype.slice.call(document.querySelectorAll("[data-focus]"));
    var fontButton = document.getElementById("writing-font-button");
    var fontDialog = document.getElementById("writing-font-dialog");
    var fontCloseButton = document.getElementById("writing-font-close");
    var langButton = document.getElementById("writing-lang");
    var langCodeEl = document.getElementById("writing-lang-code");
    var donateLink = document.getElementById("writing-donate");
    var notesPanel = document.getElementById("writing-notes");
    var notesScrim = document.getElementById("writing-notes-scrim");
    var notesList = document.getElementById("writing-notes-list");
    var notesEmpty = document.getElementById("writing-notes-empty");
    var notesSearch = document.getElementById("writing-notes-search");
    var notesCount = document.getElementById("writing-notes-count");
    var notesHeading = document.getElementById("writing-notes-title");
    var notesToggle = document.getElementById("writing-notes-toggle");
    var notesTrigger = document.getElementById("writing-notes-trigger");
    var notesClose = document.getElementById("writing-notes-close");
    var notesNew = document.getElementById("writing-notes-new");
    var notesExport = document.getElementById("writing-notes-export");
    var notesImport = document.getElementById("writing-notes-import");
    var notesTrashButton = document.getElementById("writing-notes-trash");
    var notesFile = document.getElementById("writing-notes-file");
    var syncButton = document.getElementById("writing-notes-sync");
    var syncDialog = document.getElementById("writing-sync");
    var syncClose = document.getElementById("writing-sync-close");
    var syncRequestForm = document.getElementById("writing-sync-request-form");
    var syncContact = document.getElementById("writing-sync-contact");
    var syncNoteField = document.getElementById("writing-sync-note");
    var syncWebsite = document.getElementById("writing-sync-website");
    var syncRequestError = document.getElementById("writing-sync-request-error");
    var syncRequestStatus = document.getElementById("writing-sync-request-status");
    var syncClaimForm = document.getElementById("writing-sync-claim-form");
    var syncClaimCode = document.getElementById("writing-sync-code");
    var syncClaimError = document.getElementById("writing-sync-claim-error");
    var syncRecoveryEl = document.getElementById("writing-sync-recovery");
    var syncStatusEl = document.getElementById("writing-sync-status");
    var syncStatusDot = document.getElementById("writing-sync-dot");
    var syncErrorEl = document.getElementById("writing-sync-error");
    var syncDevicesEl = document.getElementById("writing-sync-devices");
    var syncPairBox = document.getElementById("writing-sync-pair-box");
    var syncQrEl = document.getElementById("writing-sync-qr");
    var syncPairCodeEl = document.getElementById("writing-sync-pair-code");
    var syncRevealKeyEl = document.getElementById("writing-sync-reveal-key");
    var previewDialog = document.getElementById("writing-preview");
    var previewContent = document.getElementById("writing-preview-content");
    var previewBody = document.getElementById("writing-preview-body");
    var previewEmpty = document.getElementById("writing-preview-empty");
    var previewTrigger = document.getElementById("writing-preview-trigger");
    var previewToggle = document.getElementById("writing-preview-toggle");
    var previewEdit = document.getElementById("writing-preview-edit");
    var fontChoices = Array.prototype.slice.call(document.querySelectorAll('input[name="writing-font"]'));

    var state = { focus: "off", font: "sans" };
    var lastSavedKey = "ready";
    var saveTimer = null;
    var savingHoldTimer = null;
    var renderFrame = null;
    var ensureFrame = null;
    var caretGuardUntil = 0;
    var caretKickTimers = [];
    var scrollSettleTimer = null;
    var viewportBox = { top: 0, left: 0, width: 0, height: 0 };
    var toolbarHideTimer = null;
    var zenHintTimer = null;

    function toast(message) {
      if (window.Perkakas) window.Perkakas.toast(message);
    }

    var SAVED_STATES = {
      ready: { label: "saved.ready" },
      saving: { label: "saved.saving", icon: "i-spinner" },
      saved: { label: "saved.saved", icon: "i-check" },
      restored: { label: "saved.restored", icon: "i-check" },
      created: { label: "saved.created", icon: "i-check" },
      titled: { label: "saved.titled", icon: "i-check" },
      failed: { label: "saved.failed", tone: "error" },
      unavailable: { label: "saved.unavailable", tone: "error" }
    };

    // Status simpan tampil sebagai ikon supaya baris statistik tetap sunyi;
    // teksnya pindah ke tooltip dan pembaca layar lewat label tersembunyi.
    function setSaved(state) {
      var key = SAVED_STATES[state] ? state : "ready";
      var spec = SAVED_STATES[key];
      var label = t(spec.label);

      lastSavedKey = key;
      savedEl.textContent = "";
      savedEl.dataset.state = key;
      savedEl.title = label;

      if (spec.tone) savedEl.dataset.tone = spec.tone;
      else delete savedEl.dataset.tone;

      if (spec.icon) {
        var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.setAttribute("class", "icon writing-saved-icon");
        svg.setAttribute("aria-hidden", "true");

        var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
        use.setAttribute("href", "#" + spec.icon);
        svg.appendChild(use);
        savedEl.appendChild(svg);
      }

      var text = document.createElement("span");
      text.className = spec.icon ? "visually-hidden" : "writing-saved-text";
      text.textContent = label;
      savedEl.appendChild(text);
    }

    /* -------------------------------------------------------------
       Penyimpanan catatan

       Isi catatan ada di IndexedDB; localStorage hanya menyimpan
       setelan kecil (huruf, mode fokus, catatan terakhir). Semua
       catatan dibaca ke memori saat aplikasi dibuka supaya
       berpindah catatan terasa instan. Kalau IndexedDB tidak
       tersedia, penyimpanan jatuh ke localStorage dengan bentuk
       data yang sama agar fiturnya tidak hilang.
       ------------------------------------------------------------- */

    var docs = [];
    var current = null;
    var store = null;
    var storePromise = null;
    var writeChain = Promise.resolve();
    var writeSeq = 0;
    var pendingSave = false;
    var showingTrash = false;
    var renamingId = null;

    function newId() {
      try {
        if (window.crypto && typeof window.crypto.randomUUID === "function") {
          return window.crypto.randomUUID();
        }
      } catch (error) {
        // jatuh ke id buatan sendiri
      }
      return "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
    }

    function cloneDoc(doc) {
      return {
        id: doc.id,
        title: doc.title || "",
        body: typeof doc.body === "string" ? doc.body : "",
        createdAt: Number(doc.createdAt) || Date.now(),
        updatedAt: Number(doc.updatedAt) || Date.now(),
        pinned: !!doc.pinned,
        deletedAt: Number(doc.deletedAt) || null
      };
    }

    function normalizeDoc(raw) {
      if (!raw || typeof raw !== "object") return null;
      var createdAt = Number(raw.createdAt) || Date.now();
      return {
        id: typeof raw.id === "string" && raw.id ? raw.id : newId(),
        title: typeof raw.title === "string" ? raw.title.slice(0, 120) : "",
        body: typeof raw.body === "string" ? raw.body : "",
        createdAt: createdAt,
        updatedAt: Number(raw.updatedAt) || createdAt,
        pinned: !!raw.pinned,
        deletedAt: Number(raw.deletedAt) || null
      };
    }

    function openDatabase() {
      return new Promise(function (resolve, reject) {
        if (!window.indexedDB) {
          reject(new Error("indexeddb-unavailable"));
          return;
        }

        var request;
        try {
          request = window.indexedDB.open(DB_NAME, DB_VERSION);
        } catch (error) {
          reject(error);
          return;
        }

        request.onupgradeneeded = function () {
          var db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) {
            var objectStore = db.createObjectStore(DB_STORE, { keyPath: "id" });
            objectStore.createIndex("updatedAt", "updatedAt", { unique: false });
          }
        };
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error("indexeddb-error")); };
        request.onblocked = function () { reject(new Error("indexeddb-blocked")); };
      });
    }

    function indexedDbStore(db) {
      function run(mode, work) {
        return new Promise(function (resolve, reject) {
          var transaction;
          var request;

          try {
            transaction = db.transaction(DB_STORE, mode);
            request = work(transaction.objectStore(DB_STORE));
          } catch (error) {
            reject(error);
            return;
          }

          transaction.oncomplete = function () {
            resolve(request ? request.result : undefined);
          };
          transaction.onerror = function () {
            reject(transaction.error || (request && request.error) || new Error("indexeddb-write"));
          };
          transaction.onabort = function () {
            reject(transaction.error || new Error("indexeddb-abort"));
          };
        });
      }

      return {
        mode: "indexeddb",
        all: function () {
          return run("readonly", function (objectStore) { return objectStore.getAll(); })
            .then(function (rows) { return Array.isArray(rows) ? rows : []; });
        },
        put: function (doc) {
          var snapshot = cloneDoc(doc);
          return run("readwrite", function (objectStore) { return objectStore.put(snapshot); })
            .then(function () {});
        },
        remove: function (id) {
          return run("readwrite", function (objectStore) { return objectStore.delete(id); })
            .then(function () {});
        }
      };
    }

    function fallbackStore() {
      var cache = null;

      function read() {
        if (cache) return cache;
        cache = [];
        try {
          var parsed = JSON.parse(localStorage.getItem(FALLBACK_KEY) || "[]");
          if (Array.isArray(parsed)) cache = parsed;
        } catch (error) {
          cache = [];
        }
        return cache;
      }

      function flush() {
        try {
          localStorage.setItem(FALLBACK_KEY, JSON.stringify(read()));
          return true;
        } catch (error) {
          return false;
        }
      }

      return {
        mode: "localstorage",
        all: function () {
          return Promise.resolve(read().map(cloneDoc));
        },
        put: function (doc) {
          var list = read();
          var stored = cloneDoc(doc);
          var replaced = false;

          for (var i = 0; i < list.length; i += 1) {
            if (list[i] && list[i].id === stored.id) {
              list[i] = stored;
              replaced = true;
              break;
            }
          }

          if (!replaced) list.push(stored);
          return flush() ? Promise.resolve() : Promise.reject(new Error("localstorage-quota"));
        },
        remove: function (id) {
          cache = read().filter(function (doc) { return doc && doc.id !== id; });
          return flush() ? Promise.resolve() : Promise.reject(new Error("localstorage-quota"));
        }
      };
    }

    function ensureStore() {
      if (!storePromise) {
        storePromise = openDatabase()
          .then(function (db) { return indexedDbStore(db); })
          .catch(function () { return fallbackStore(); })
          .then(function (activeStore) {
            store = activeStore;
            return store;
          });
      }
      return storePromise;
    }

    function readSettings() {
      try {
        var parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
        if (parsed && typeof parsed === "object") return parsed;
      } catch (error) {
        // setelan rusak, mulai dari kosong
      }
      return {};
    }

    function saveSettings(patch) {
      var settings = readSettings();

      if (patch) {
        Object.keys(patch).forEach(function (key) {
          settings[key] = patch[key];
        });
      }

      try {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
      } catch (error) {
        // setelan bersifat opsional; gagal menyimpan bukan masalah besar
      }
    }

    function findDoc(id) {
      if (!id) return null;
      for (var i = 0; i < docs.length; i += 1) {
        if (docs[i].id === id) return docs[i];
      }
      return null;
    }

    function newestDoc() {
      var best = null;
      docs.forEach(function (doc) {
        if (doc.deletedAt || isPristine(doc)) return;
        if (!best || doc.updatedAt > best.updatedAt) best = doc;
      });
      return best;
    }

    function activeDoc(id) {
      var doc = findDoc(id);
      if (doc && !doc.deletedAt) return doc;
      return newestDoc();
    }

    function createDoc(body) {
      var now = Date.now();
      var doc = {
        id: newId(),
        title: "",
        body: typeof body === "string" ? body : "",
        createdAt: now,
        updatedAt: now,
        pinned: false,
        deletedAt: null
      };
      docs.push(doc);
      return doc;
    }

    function isPristine(doc) {
      return !!doc && !doc.deletedAt && !doc.title && !String(doc.body || "").trim();
    }

    function firstLine(body) {
      var lines = String(body || "").split("\n");

      for (var i = 0; i < lines.length; i += 1) {
        var line = lines[i].trim();
        if (!line) continue;
        return line
          .replace(/^(?:#{1,6}|>|[-*+]|\d+[.)])\s+/, "")
          .replace(/[*_`~]/g, "")
          .trim();
      }

      return "";
    }

    function docTitle(doc) {
      var manual = String(doc.title || "").trim();
      var text = manual || firstLine(doc.body);
      if (!text) return t("doc.untitled");
      return text.length > 90 ? text.slice(0, 90).trim() + "…" : text;
    }

    function docPreview(doc) {
      var lines = String(doc.body || "").split("\n");
      var start = 0;

      if (!String(doc.title || "").trim()) {
        while (start < lines.length && !lines[start].trim()) start += 1;
        start += 1;
      } else {
        start = -1;
      }

      var rest = (start < 0 ? lines : lines.slice(start)).join(" ").replace(/\s+/g, " ").trim();
      if (!rest) return "";
      return rest.length > 120 ? rest.slice(0, 120).trim() + "…" : rest;
    }

    function countWords(text) {
      var trimmed = String(text || "").trim();
      return trimmed ? trimmed.split(/\s+/).length : 0;
    }

    function pad2(value) {
      return (value < 10 ? "0" : "") + value;
    }

    function relativeTime(timestamp) {
      var now = Date.now();
      var value = Number(timestamp) || now;
      var diff = now - value;

      if (diff < 45000) return t("time.now");
      if (diff < 3600000) return t("time.minutes", { n: Math.max(1, Math.round(diff / 60000)) });
      if (diff < 86400000) return t("time.hours", { n: Math.round(diff / 3600000) });
      if (diff < 604800000) return t("time.days", { n: Math.round(diff / 86400000) });

      var date = new Date(value);
      var months = i18n ? i18n.months() : [];
      var label = date.getDate() + " " + (months[date.getMonth()] || "");
      if (date.getFullYear() !== new Date(now).getFullYear()) label += " " + date.getFullYear();
      return label;
    }

    function metaText(doc) {
      var label = tn("meta.words", countWords(doc.body));
      if (doc.deletedAt) return label + t("meta.deleted", { time: relativeTime(doc.deletedAt) });
      return label + " · " + relativeTime(doc.updatedAt);
    }

    /* Semua tulisan masuk ke satu antrean supaya perubahan yang
       datang beruntun tidak saling menimpa di IndexedDB. */

    function enqueueWrite(doc) {
      markSyncDirty(doc);

      var snapshot = cloneDoc(doc);
      var seq = ++writeSeq;
      var shownAt;

      // Spinner menyala saat penulisan dimulai (yaitu setelah debounce
      // 500ms), bukan saat mengetik. Karena IndexedDB biasanya selesai
      // dalam hitungan milidetik, tampilannya ditahan sebentar supaya
      // tidak sekadar berkedip.
      window.clearTimeout(savingHoldTimer);
      savingHoldTimer = null;
      setSaved("saving");
      shownAt = Date.now();

      writeChain = writeChain
        .then(function () {
          return ensureStore().then(function (activeStore) {
            return activeStore.put(snapshot);
          });
        })
        .then(function () {
          if (seq !== writeSeq) return;

          var remaining = MIN_SAVING_DISPLAY - (Date.now() - shownAt);
          if (remaining <= 0) {
            setSaved("saved");
            return;
          }

          savingHoldTimer = window.setTimeout(function () {
            savingHoldTimer = null;
            if (seq === writeSeq) setSaved("saved");
          }, remaining);
        })
        .catch(function () {
          if (seq !== writeSeq) return;
          window.clearTimeout(savingHoldTimer);
          savingHoldTimer = null;
          setSaved("failed");
        });

      return writeChain;
    }

    function commitCurrent() {
      window.clearTimeout(saveTimer);
      saveTimer = null;

      if (!current) return false;

      var text = area.value;
      var changed = pendingSave || text !== current.body;
      current.body = text;
      if (!changed) return false;

      pendingSave = false;
      current.updatedAt = Date.now();
      enqueueWrite(current);
      updateListItem(current);

      return true;
    }

    function queueSave() {
      pendingSave = true;
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(function () {
        saveTimer = null;
        commitCurrent();
      }, SAVE_DELAY);
    }

    function openDoc(doc, options) {
      options = options || {};
      if (!doc) return;
      if (current && current.id !== doc.id && !options.skipFlush) commitCurrent();

      current = doc;
      area.value = typeof doc.body === "string" ? doc.body : "";
      area.scrollTop = 0;
      pendingSave = false;

      updateStats();
      grow();
      renderMirror();
      scheduleRender();
      saveSettings({ activeId: doc.id });
      setSaved(String(doc.body || "").trim() ? "restored" : "ready");
      markActiveItem();

      if (!options.silent) {
        area.focus({ preventScroll: true });
        kickCaret();
      }
    }

    function markActiveItem() {
      if (!notesList) return;

      for (var i = 0; i < notesList.children.length; i += 1) {
        var row = notesList.children[i];
        var isActive = !!current && row.getAttribute("data-id") === current.id;
        row.classList.toggle("is-active", isActive);
      }
    }

    function updateListItem(doc) {
      if (!notesList || renamingId || !isPanelOpen()) return;

      var row = null;
      for (var i = 0; i < notesList.children.length; i += 1) {
        if (notesList.children[i].getAttribute("data-id") === doc.id) {
          row = notesList.children[i];
          break;
        }
      }
      if (!row) return;

      var titleEl = row.querySelector(".note-title");
      var metaEl = row.querySelector(".note-meta");
      var previewEl = row.querySelector(".note-preview");
      if (titleEl) titleEl.textContent = docTitle(doc);
      if (metaEl) metaEl.textContent = metaText(doc);
      if (previewEl) previewEl.textContent = docPreview(doc);
    }

    function deleteDoc(doc) {
      if (current && current.id === doc.id) commitCurrent();

      doc.deletedAt = Date.now();
      enqueueWrite(doc);

      if (current && current.id === doc.id) {
        openDoc(newestDoc() || createDoc(""), { silent: true, skipFlush: true });
      }

      renderPanel();
      toast(t("toast.movedToTrash"));
    }

    function restoreDoc(doc) {
      doc.deletedAt = null;
      doc.updatedAt = Date.now();
      enqueueWrite(doc);
      renderPanel();
      toast(t("toast.restored"));
    }

    function purgeDoc(doc) {
      if (!window.confirm(t("confirm.purge"))) return;

      delete syncDirty[doc.id];
      docs = docs.filter(function (item) { return item.id !== doc.id; });
      writeChain = writeChain
        .then(function () {
          return ensureStore().then(function (activeStore) { return activeStore.remove(doc.id); });
        })
        .catch(function () {});

      if (current && current.id === doc.id) {
        current = null;
        openDoc(newestDoc() || createDoc(""), { silent: true, skipFlush: true });
      }

      renderPanel();
      toast(t("toast.purged"));
    }

    function emptyTrash() {
      var trashed = docs.filter(function (doc) { return !!doc.deletedAt; });
      if (!trashed.length) return;

      if (!window.confirm(tn("confirm.emptyTrash", trashed.length))) return;

      docs = docs.filter(function (doc) { return !doc.deletedAt; });
      trashed.forEach(function (doc) {
        delete syncDirty[doc.id];
        writeChain = writeChain
          .then(function () {
            return ensureStore().then(function (activeStore) { return activeStore.remove(doc.id); });
          })
          .catch(function () {});
      });

      renderPanel();
      toast(t("toast.trashEmptied"));
    }

    function togglePin(doc) {
      doc.pinned = !doc.pinned;
      enqueueWrite(doc);
      renderPanel();
      toast(doc.pinned ? t("toast.pinned") : t("toast.unpinned"));
    }

    function beginRename(row, doc) {
      if (!row || renamingId) return;

      var titleEl = row.querySelector(".note-title");
      if (!titleEl) return;

      renamingId = doc.id;

      var input = document.createElement("input");
      input.type = "text";
      input.className = "note-rename";
      input.maxLength = 120;
      input.value = String(doc.title || "").trim() || firstLine(doc.body);
      input.setAttribute("aria-label", t("notes.renameLabel"));
      titleEl.replaceWith(input);
      input.focus();
      input.select();

      var settled = false;

      function finish(commit) {
        if (settled) return;
        settled = true;
        renamingId = null;

        if (commit) {
          var value = input.value.trim().slice(0, 120);
          doc.title = value && value !== firstLine(doc.body) ? value : "";
          doc.updatedAt = Date.now();
          enqueueWrite(doc);
          if (current && current.id === doc.id) setSaved("titled");
        }

        renderPanel();
      }

      input.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(false);
        }
      });
      input.addEventListener("blur", function () { finish(true); });
    }

    /* Daftar catatan
       ---------------------------------------------------------- */

    function isPanelOpen() {
      return document.body.classList.contains("is-notes-open");
    }

    /* Panel mengunci gulir halaman supaya scrim tidak bisa ditembus roda
       mouse. Scrollbar yang hilang membuat lebar halaman bertambah, jadi
       padding kanan diisi selebar scrollbar agar isi tidak bergeser. */

    var lockedPadding = null;

    function lockPageScroll() {
      var gap = window.innerWidth - document.documentElement.clientWidth;
      if (gap <= 0) return;
      lockedPadding = document.body.style.paddingRight || "";
      document.body.style.paddingRight = gap + "px";
    }

    function unlockPageScroll() {
      if (lockedPadding === null) return;
      document.body.style.paddingRight = lockedPadding;
      lockedPadding = null;
    }

    function visibleDocs() {
      var query = notesSearch ? notesSearch.value.trim().toLowerCase() : "";

      return docs.filter(function (doc) {
        if (showingTrash !== !!doc.deletedAt) return false;
        if (!showingTrash && isPristine(doc)) return false;
        if (!query) return true;
        return (docTitle(doc) + "\n" + doc.body).toLowerCase().indexOf(query) >= 0;
      }).sort(function (a, b) {
        if (showingTrash) return (b.deletedAt || 0) - (a.deletedAt || 0);
        if (!!b.pinned !== !!a.pinned) return b.pinned ? 1 : -1;
        return (b.updatedAt || 0) - (a.updatedAt || 0);
      });
    }

    function noteTool(action, icon, label) {
      var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      var use = document.createElementNS("http://www.w3.org/2000/svg", "use");
      var button = document.createElement("button");

      svg.setAttribute("class", "icon");
      svg.setAttribute("aria-hidden", "true");
      use.setAttribute("href", icon);
      svg.appendChild(use);

      button.type = "button";
      button.className = "note-tool";
      button.setAttribute("data-act", action);
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
      button.appendChild(svg);
      return button;
    }

    function noteTools(doc, trashed) {
      var tools = document.createElement("div");
      tools.className = "note-tools";

      if (trashed) {
        tools.appendChild(noteTool("restore", "#i-arrow-left", t("note.restore")));
        tools.appendChild(noteTool("purge", "#i-trash", t("note.purge")));
        return tools;
      }

      var pin = noteTool("pin", "#i-bookmark", doc.pinned ? t("note.unpin") : t("note.pin"));
      if (doc.pinned) pin.classList.add("is-on");
      pin.setAttribute("aria-pressed", String(!!doc.pinned));
      tools.appendChild(pin);
      tools.appendChild(noteTool("rename", "#i-pencil", t("note.rename")));
      tools.appendChild(noteTool("delete", "#i-trash", t("note.delete")));
      return tools;
    }

    function noteItem(doc) {
      var trashed = !!doc.deletedAt;
      var item = document.createElement("li");
      var open = document.createElement("button");
      var title = document.createElement("span");
      var preview = document.createElement("span");
      var meta = document.createElement("span");
      var previewText = docPreview(doc);

      item.className = "note-item";
      item.setAttribute("data-id", doc.id);
      if (!trashed && doc.pinned) item.classList.add("is-pinned");
      if (!trashed && current && current.id === doc.id) item.classList.add("is-active");

      open.type = "button";
      open.className = "note-open";
      open.setAttribute("data-act", "open");
      open.disabled = trashed;

      title.className = "note-title";
      title.textContent = docTitle(doc);
      open.appendChild(title);

      if (previewText) {
        preview.className = "note-preview";
        preview.textContent = previewText;
        open.appendChild(preview);
      }

      meta.className = "note-meta";
      meta.textContent = metaText(doc);
      open.appendChild(meta);

      item.appendChild(open);
      item.appendChild(noteTools(doc, trashed));
      return item;
    }

    function renderPanel() {
      if (!notesList || renamingId) return;

      var rows = visibleDocs();
      var total = docs.filter(function (doc) {
        return showingTrash === !!doc.deletedAt;
      }).length;

      notesList.textContent = "";
      rows.slice(0, MAX_ROWS).forEach(function (doc) {
        notesList.appendChild(noteItem(doc));
      });

      if (rows.length > MAX_ROWS) {
        var moreRow = document.createElement("li");
        moreRow.className = "notes-empty";
        moreRow.textContent = t("notes.more", { shown: MAX_ROWS, total: rows.length });
        notesList.appendChild(moreRow);
      }

      if (showingTrash && rows.length) {
        var clearRow = document.createElement("li");
        var clearButton = document.createElement("button");
        clearRow.className = "notes-clear-row";
        clearButton.type = "button";
        clearButton.className = "notes-clear";
        clearButton.setAttribute("data-act", "empty-trash");
        clearButton.textContent = t("notes.clearTrash");
        clearRow.appendChild(clearButton);
        notesList.appendChild(clearRow);
      }

      if (notesHeading) notesHeading.textContent = showingTrash ? t("notes.titleTrash") : t("notes.title");
      if (notesCount) notesCount.textContent = String(total);
      if (notesTrashButton) notesTrashButton.setAttribute("aria-pressed", String(showingTrash));
      if (notesNew) notesNew.hidden = showingTrash;

      if (notesEmpty) {
        notesEmpty.hidden = rows.length > 0;
        if (!rows.length) {
          notesEmpty.textContent = showingTrash
            ? t("notes.emptyTrash")
            : notesSearch && notesSearch.value.trim()
              ? t("notes.emptySearch")
              : t("notes.emptyAll");
        }
      }
    }

    function openPanel(options) {
      options = options || {};
      if (!notesPanel) return;

      if (isPanelOpen()) {
        if (options.focusSearch && notesSearch) {
          notesSearch.focus();
          notesSearch.select();
        }
        return;
      }

      // Tulis dulu perubahan yang masih menunggu debounce, supaya catatan
      // yang baru saja diketik tidak tampil kosong atau kedaluwarsa.
      commitCurrent();
      showingTrash = false;
      if (notesSearch) notesSearch.value = "";
      renderPanel();

      // Di ponsel keyboard harus turun lebih dulu: panel ini fixed, jadi
      // akan tergencet visual viewport kalau keyboard masih terbuka.
      if (document.activeElement === area) area.blur();

      lockPageScroll();
      document.body.classList.add("is-notes-open");
      notesPanel.setAttribute("aria-hidden", "false");
      if (notesToggle) notesToggle.setAttribute("aria-expanded", "true");
      if (notesTrigger) notesTrigger.setAttribute("aria-expanded", "true");

      // Di layar sempit fokus ke pencarian akan memunculkan keyboard dan
      // menutupi daftar; biarkan pengguna memilih sendiri.
      if (options.focusSearch && notesSearch && window.innerWidth > 720) {
        notesSearch.focus();
        notesSearch.select();
      }
    }

    function closePanel() {
      if (!notesPanel || !isPanelOpen()) return;

      document.body.classList.remove("is-notes-open");
      unlockPageScroll();
      notesPanel.setAttribute("aria-hidden", "true");
      if (notesToggle) notesToggle.setAttribute("aria-expanded", "false");
      if (notesTrigger) notesTrigger.setAttribute("aria-expanded", "false");
    }

    function toggleTrashView() {
      showingTrash = !showingTrash;
      if (notesSearch) notesSearch.value = "";
      renderPanel();
    }

    function downloadBlob(blob, filename) {
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");

      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function exportAll() {
      commitCurrent();

      var stamp = new Date();
      var payload = {
        app: "zen-write",
        version: 1,
        exportedAt: new Date().toISOString(),
        settings: { font: state.font, focus: state.focus },
        documents: docs.filter(function (doc) { return !doc.deletedAt; }).map(cloneDoc)
      };
      var name = t("file.exportPrefix")
        + stamp.getFullYear() + "-" + pad2(stamp.getMonth() + 1) + "-" + pad2(stamp.getDate())
        + ".json";

      downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), name);
      toast(t("toast.exported"));
    }

    function importFile(file) {
      if (!file) return;

      var reader = new FileReader();

      reader.onload = function () {
        var payload = null;
        try {
          payload = JSON.parse(String(reader.result || ""));
        } catch (error) {
          payload = null;
        }

        var rows = payload && Array.isArray(payload.documents)
          ? payload.documents
          : Array.isArray(payload) ? payload : null;

        if (!rows) {
          toast(t("toast.importUnknown"));
          return;
        }

        commitCurrent();

        var imported = 0;
        rows.forEach(function (raw) {
          var doc = normalizeDoc(raw);
          if (!doc) return;
          if (findDoc(doc.id)) doc.id = newId();
          doc.deletedAt = null;
          docs.push(doc);
          enqueueWrite(doc);
          imported += 1;
        });

        if (!imported) {
          toast(t("toast.importEmpty"));
          return;
        }

        if (isPristine(current)) {
          openDoc(newestDoc() || current, { silent: true, skipFlush: true });
        }

        renderPanel();
        toast(tn("toast.imported", imported));
      };

      reader.onerror = function () { toast(t("toast.importRead")); };
      reader.readAsText(file);
    }

    function migrateLegacy(settings) {
      // Migrasi hanya sekali per browser: dua tab yang terbuka bersamaan
      // tidak boleh membuat dua salinan dari draf yang sama.
      try {
        if (localStorage.getItem(MIGRATED_KEY)) return null;
      } catch (error) {
        // localStorage diblokir; migrasi tetap dicoba
      }

      var raw = null;

      for (var i = 0; i < LEGACY_KEYS.length; i += 1) {
        try {
          raw = localStorage.getItem(LEGACY_KEYS[i]);
        } catch (error) {
          raw = null;
        }
        if (raw) break;
      }

      if (!raw) return null;

      try {
        localStorage.setItem(MIGRATED_KEY, "1");
      } catch (error) {
        // penanda gagal ditulis; risiko terburuk adalah migrasi ganda
      }

      var legacy = null;
      try {
        legacy = JSON.parse(raw);
      } catch (error) {
        legacy = null;
      }

      // Draf lama tetap disimpan sebagai arsip mentah sebelum kuncinya
      // dibersihkan, sekadar jaring pengaman kalau migrasi salah baca.
      try {
        localStorage.setItem(LEGACY_BACKUP_KEY, raw);
        LEGACY_KEYS.forEach(function (key) { localStorage.removeItem(key); });
      } catch (error) {
        // tidak bisa membersihkan; biarkan saja
      }

      if (!legacy) return null;

      if (!settings.focus && FOCUS_MODES.indexOf(legacy.focus) >= 0) {
        state.focus = legacy.focus;
        syncFocusButtons();
        saveSettings({ focus: state.focus });
      }

      if (!settings.font && FONT_MODES.indexOf(legacy.font) >= 0) {
        state.font = legacy.font;
        applyFont(state.font, { silent: true, persist: false });
        saveSettings({ font: state.font });
      }

      var body = typeof legacy.body === "string" ? legacy.body : "";
      if (!body.trim()) return null;

      var doc = createDoc(body);
      enqueueWrite(doc);
      return doc;
    }

    function requestPersistence() {
      if (!navigator.storage || typeof navigator.storage.persist !== "function") return;

      var granted = typeof navigator.storage.persisted === "function"
        ? navigator.storage.persisted()
        : Promise.resolve(false);

      granted
        .then(function (already) { return already ? true : navigator.storage.persist(); })
        .catch(function () {});
    }


    /* Sync dan cadangan
       ------------------------------------------------------------
       Server hanya menyimpan ciphertext. Kunci enkripsi diturunkan
       dari recoveryKey di perangkat dan tidak pernah dikirim.
       ---------------------------------------------------------- */

    var Sync = window.ZenWriteSync || null;
    var syncSession = Sync ? Sync.loadSession() : null;
    var syncKey = null;
    var syncDirty = {};
    var syncRunning = false;
    var syncApplying = false;
    var syncTimer = null;
    var syncStatus = "idle";
    var syncView = "soon";
    var syncPairUrl = "";

    function syncReady() {
      return !!(Sync && syncSession && syncSession.accountId && syncSession.encKey);
    }

    function syncToken() {
      return syncSession ? syncSession.deviceToken : null;
    }

    function saveSyncSession() {
      if (Sync && syncSession) Sync.saveSession(syncSession);
    }

    function syncDeviceLabel() {
      return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ? "Phone" : "Computer";
    }

    // Antrean dirty hanya hidup di memori. Kalau tab ditutup sebelum push,
    // bandingkan waktu ubah dengan yang terakhir tersinkron agar edit itu
    // dikirim saat aplikasi dibuka lagi, bukan tertinggal atau tertimpa.
    function markUnsyncedDocs() {
      if (!syncReady()) return;

      docs.forEach(function (doc) {
        if (isPristine(doc)) return;
        var syncedAt = Number(syncSession.lastSynced[doc.id] || 0);
        if (Number(doc.updatedAt) > syncedAt) syncDirty[doc.id] = true;
      });
    }

    function markSyncDirty(doc) {
      if (!syncReady() || syncApplying || !doc) return;
      syncDirty[doc.id] = true;
      scheduleSync(8000);
    }

    function scheduleSync(delay) {
      if (!syncReady() || syncStatus === "expired") return;
      window.clearTimeout(syncTimer);
      syncTimer = window.setTimeout(function () {
        syncTimer = null;
        syncNow();
      }, delay || 60000);
    }

    function setSyncView(view) {
      syncView = view;
      if (!syncDialog) return;

      var sections = syncDialog.querySelectorAll("[data-sync-view]");
      Array.prototype.forEach.call(sections, function (section) {
        section.hidden = section.getAttribute("data-sync-view") !== view;
      });
    }

    var SYNC_STATUS_KEYS = {
      idle: "sync.statusIdle",
      syncing: "sync.statusSyncing",
      offline: "sync.statusOffline",
      error: "sync.statusError",
      expired: "sync.statusExpired"
    };

    function setSyncStatus(status, message) {
      syncStatus = status;
      if (syncStatusDot) syncStatusDot.setAttribute("data-state", status);
      if (syncStatusEl) syncStatusEl.textContent = t(SYNC_STATUS_KEYS[status] || "sync.statusIdle");
      if (syncErrorEl) {
        var text = message || "";
        syncErrorEl.textContent = text;
        syncErrorEl.hidden = !text;
      }
    }

    function updateSyncStatusText() {
      if (syncStatusEl) syncStatusEl.textContent = t(SYNC_STATUS_KEYS[syncStatus] || "sync.statusIdle");
      if (syncStatus === "expired" && syncErrorEl) syncErrorEl.textContent = t("sync.errorExpired");
      if (syncStatus === "error" && syncErrorEl) syncErrorEl.textContent = t("sync.errorGeneric");
    }

    async function ensureSyncKey() {
      if (syncKey) return syncKey;
      if (!syncSession || !syncSession.encKey) throw new Error("sync_no_key");
      syncKey = await Sync.importEncKey(syncSession.encKey);
      return syncKey;
    }

    function handleSyncError(error) {
      if (error && error.code === "entitlement_required") {
        setSyncStatus("expired", t("sync.errorExpired"));
        return;
      }
      if (error && (error.status === 401 || error.code === "unauthenticated")) {
        setSyncStatus("error", t("sync.errorAuth"));
        return;
      }
      if (error && error.name === "TypeError") {
        setSyncStatus("offline", "");
        return;
      }
      setSyncStatus("error", t("sync.errorGeneric"));
    }

    async function syncNow(options) {
      options = options || {};
      if (!syncReady() || syncRunning || syncStatus === "expired") return;

      commitCurrent();
      syncRunning = true;
      setSyncStatus("syncing");

      try {
        await syncPush();
        await syncPull();
        setSyncStatus("idle");
        if (options.toast) toast(t("sync.toastSynced"));
        renderPanel();
      } catch (error) {
        handleSyncError(error);
      } finally {
        syncRunning = false;
        if (syncStatus !== "expired" && syncStatus !== "error") scheduleSync(60000);
      }
    }

    async function syncPush() {
      var key = await ensureSyncKey();
      var pending = [];

      Object.keys(syncDirty).forEach(function (id) {
        var doc = findDoc(id);
        if (!doc) {
          delete syncDirty[id];
          return;
        }
        if (isPristine(doc)) {
          delete syncDirty[id];
          return;
        }
        pending.push(doc);
      });

      for (var start = 0; start < pending.length; start += 40) {
        var chunk = pending.slice(start, start + 40);
        var payload = [];
        var sentAt = {};

        for (var i = 0; i < chunk.length; i += 1) {
          var doc = chunk[i];
          var baseRev = Number(syncSession.baseRevs[doc.id] || 0);
          var encrypted = await Sync.encryptNote(key, {
            id: doc.id,
            rev: baseRev + 1,
            title: doc.title,
            body: doc.body
          });

          payload.push({
            id: doc.id,
            baseRev: baseRev,
            updatedAt: doc.updatedAt,
            deletedAt: doc.deletedAt || null,
            iv: encrypted.iv,
            ciphertext: encrypted.ciphertext
          });
          sentAt[doc.id] = doc.updatedAt;
        }

        var result = await Sync.api("/sync/push", {
          method: "POST",
          token: syncToken(),
          body: { notes: payload }
        });

        result.applied.forEach(function (id) {
          syncSession.baseRevs[id] = Number(syncSession.baseRevs[id] || 0) + 1;
          var currentDoc = findDoc(id);
          if (!currentDoc || sentAt[id] === currentDoc.updatedAt) delete syncDirty[id];
          syncSession.lastSynced[id] = sentAt[id];
        });

        for (var c = 0; c < result.conflicts.length; c += 1) {
          await applyServerNote(result.conflicts[c], true);
        }

        saveSyncSession();
      }
    }

    async function syncPull() {
      var key = await ensureSyncKey();
      var since = Number(syncSession.cursor || 0);

      for (var page = 0; page < 10; page += 1) {
        var result = await Sync.api("/sync/pull?since=" + encodeURIComponent(since), {
          token: syncToken()
        });

        for (var i = 0; i < result.notes.length; i += 1) {
          await applyServerNote(result.notes[i], false, key);
        }

        since = result.cursor;
        syncSession.cursor = since;
        saveSyncSession();

        if (!result.hasMore) break;
      }

      // Di perangkat baru, catatan pertama dari server harus menggantikan
      // draf kosong yang terbuka saat aplikasi dimuat.
      if (isPristine(current)) {
        var newest = newestDoc();
        if (newest) openDoc(newest, { silent: true, skipFlush: true });
      }
    }

    async function decryptServerNote(serverNote, key) {
      if (serverNote.deletedAt || !serverNote.ciphertext) return null;
      try {
        return await Sync.decryptNote(key, serverNote);
      } catch (error) {
        return null;
      }
    }

    async function applyServerNote(serverNote, isConflict, key) {
      var local = findDoc(serverNote.id);
      var knownRev = Number(syncSession.baseRevs[serverNote.id] || 0);
      var dirty = !!syncDirty[serverNote.id];

      if (!isConflict && local && dirty && serverNote.rev > knownRev) {
        await applyServerNote(serverNote, true);
        return;
      }

      var resolvedKey = key || await ensureSyncKey();
      var content = await decryptServerNote(serverNote, resolvedKey);

      if (isConflict && local) {
        var copy = createDoc(local.body);
        var base = String(local.title || firstLine(local.body) || "").trim();
        copy.title = (base ? base + " " : "") + t("sync.conflictSuffix");
        copy.updatedAt = Date.now();
        enqueueWrite(copy);
      }

      if (!local) {
        if (serverNote.deletedAt || !content) {
          syncSession.baseRevs[serverNote.id] = serverNote.rev;
          return;
        }

        local = {
          id: serverNote.id,
          title: content.title,
          body: content.body,
          createdAt: serverNote.updatedAt,
          updatedAt: serverNote.updatedAt,
          pinned: false,
          deletedAt: null
        };
        docs.push(local);
      } else {
        syncApplying = true;
        if (content) {
          local.title = content.title;
          local.body = content.body;
        }
        local.updatedAt = serverNote.updatedAt;
        local.deletedAt = serverNote.deletedAt || null;
        syncApplying = false;
      }

      syncApplying = true;
      enqueueWrite(local);
      syncApplying = false;

      syncSession.baseRevs[serverNote.id] = serverNote.rev;
      syncSession.lastSynced[serverNote.id] = serverNote.updatedAt;
      delete syncDirty[serverNote.id];

      if (current && current.id === local.id && document.activeElement !== area) {
        openDoc(local, { silent: true, skipFlush: true });
      }
    }

    function formatRecoveryKey(value) {
      return String(value || "").replace(/(.{4})/g, "$1 ").trim();
    }

    async function loadDevices() {
      if (!syncDevicesEl || !syncReady()) return;

      try {
        var result = await Sync.api("/auth/devices", { token: syncToken() });
        syncDevicesEl.textContent = "";

        if (!result.devices || !result.devices.length) {
          var empty = document.createElement("li");
          empty.className = "sync-device sync-device--muted";
          empty.textContent = t("sync.devicesEmpty");
          syncDevicesEl.appendChild(empty);
          return;
        }

        result.devices.forEach(function (device) {
          var row = document.createElement("li");
          row.className = "sync-device";

          var name = document.createElement("span");
          name.className = "sync-device-name";
          name.textContent = device.label || t("sync.deviceFallback");
          if (device.id === syncSession.deviceId) {
            name.textContent += " · " + t("sync.deviceThis");
          }

          var meta = document.createElement("span");
          meta.className = "sync-device-meta";
          meta.textContent = device.revoked_at
            ? t("sync.deviceRevoked")
            : relativeTime(device.last_seen_at || device.created_at);

          row.appendChild(name);
          row.appendChild(meta);
          syncDevicesEl.appendChild(row);
        });
      } catch (error) {
        handleSyncError(error);
      }
    }

    async function checkRequestStatus() {
      if (!Sync || !syncSession || !syncSession.requestId || !syncRequestStatus) return;

      try {
        var result = await Sync.api("/access/status?id=" + encodeURIComponent(syncSession.requestId));
        var keys = {
          pending: "sync.requestPending",
          approved: "sync.requestApproved",
          rejected: "sync.requestRejected"
        };
        syncRequestStatus.textContent = t(keys[result.status] || "sync.requestPending");
      } catch (error) {
        syncRequestStatus.textContent = "";
      }
    }

    async function sendAccessRequest() {
      var contact = syncContact ? syncContact.value.trim() : "";
      if (contact.length < 3) {
        if (syncContact) syncContact.focus();
        return;
      }

      if (syncRequestError) syncRequestError.textContent = "";

      try {
        var result = await Sync.api("/access/request", {
          method: "POST",
          body: {
            contact: contact,
            note: syncNoteField ? syncNoteField.value.trim() : "",
            website: syncWebsite ? syncWebsite.value : ""
          }
        });

        syncSession = Sync.loadSession();
        syncSession.requestId = result.id;
        saveSyncSession();
        setSyncView("requested");
        checkRequestStatus();
        toast(t("sync.toastRequestSent"));
      } catch (error) {
        if (syncRequestError) syncRequestError.textContent = t("sync.errorGeneric");
      }
    }

    async function claimAccessCode(code) {
      if (syncClaimError) syncClaimError.textContent = "";

      try {
        var recoveryKey = Sync.randomRecoveryKey();
        var keys = await Sync.deriveKeys(recoveryKey);
        var result = await Sync.api("/auth/claim", {
          method: "POST",
          body: { code: code, authProof: keys.authProof, label: syncDeviceLabel() }
        });

        syncSession = Sync.loadSession();
        syncSession.accountId = result.accountId;
        syncSession.deviceId = result.deviceId;
        syncSession.deviceToken = result.deviceToken;
        syncSession.recoveryKey = recoveryKey;
        syncSession.encKey = keys.encKey;
        syncSession.cursor = 0;
        syncSession.baseRevs = {};
        syncSession.lastSynced = {};
        syncSession.requestId = null;
        saveSyncSession();

        syncKey = await Sync.importEncKey(keys.encKey);
        docs.forEach(function (doc) {
          if (!isPristine(doc)) syncDirty[doc.id] = true;
        });

        if (syncRecoveryEl) syncRecoveryEl.textContent = formatRecoveryKey(recoveryKey);
        setSyncView("recovery");
        setSyncStatus("idle");
        toast(t("sync.toastActivated"));
        scheduleSync(1200);
      } catch (error) {
        if (syncClaimError) {
          syncClaimError.textContent = error && error.code === "claim_invalid"
            ? t("sync.claimFailed")
            : t("sync.errorGeneric");
        }
      }
    }

    async function startPairing() {
      if (!syncReady()) return;

      try {
        var result = await Sync.api("/auth/pair/start", { method: "POST", token: syncToken() });
        var payload = Sync.encodePairPayload({
          a: syncSession.accountId,
          c: result.code,
          k: syncSession.encKey
        });

        syncPairUrl = location.origin + "/zen-write/#pair=" + payload;
        if (syncPairCodeEl) syncPairCodeEl.textContent = result.code;
        if (syncPairBox) syncPairBox.hidden = false;
        Sync.renderQr(syncQrEl, syncPairUrl);
        toast(t("sync.pairReady"));
      } catch (error) {
        handleSyncError(error);
      }
    }

    function readPairHash() {
      var match = /^#pair=(.+)$/.exec(location.hash || "");
      if (!match) return null;

      var payload = Sync.decodePairPayload(match[1]);
      try {
        history.replaceState(null, "", location.pathname + location.search);
      } catch (error) {
        // abaikan
      }
      return payload;
    }

    async function pairFromPayload(payload) {
      if (!payload) return;
      if (!window.confirm(t("sync.pairConfirm"))) return;

      try {
        var result = await Sync.api("/auth/pair", {
          method: "POST",
          body: { code: payload.code, label: syncDeviceLabel() }
        });

        syncSession = Sync.loadSession();
        syncSession.accountId = result.accountId;
        syncSession.deviceId = result.deviceId;
        syncSession.deviceToken = result.deviceToken;
        syncSession.encKey = payload.encKey;
        syncSession.recoveryKey = null;
        syncSession.cursor = 0;
        syncSession.baseRevs = {};
        syncSession.lastSynced = {};
        saveSyncSession();

        syncKey = await Sync.importEncKey(payload.encKey);
        docs.forEach(function (doc) {
          if (!isPristine(doc)) syncDirty[doc.id] = true;
        });

        setSyncStatus("idle");
        setSyncView("active");
        toast(t("sync.toastPaired"));
        scheduleSync(800);
      } catch (error) {
        toast(t("sync.pairInvalid"));
      }
    }

    async function revokeThisDevice() {
      if (!window.confirm(t("sync.revokeConfirm"))) return;

      try {
        await Sync.api("/auth/revoke", { method: "POST", token: syncToken() });
      } catch (error) {
        // tetap bersihkan sesi lokal
      }

      Sync.clearSession();
      syncSession = Sync.loadSession();
      syncKey = null;
      syncDirty = {};
      syncStatus = "idle";
      setSyncStatus("idle");
      setSyncView("soon");
      toast(t("sync.toastRevoked"));
    }

    function openSyncDialog() {
      if (!syncDialog) return;

      if (syncReady()) {
        setSyncView("active");
        updateSyncStatusText();
        loadDevices();
        if (syncStatus !== "expired" && syncStatus !== "error") syncNow();
      } else if (syncSession && syncSession.requestId) {
        setSyncView("requested");
        checkRequestStatus();
      } else {
        setSyncView("soon");
      }

      if (syncRequestForm) syncRequestForm.hidden = true;
      if (syncClaimError) syncClaimError.textContent = "";

      if (typeof syncDialog.showModal === "function") syncDialog.showModal();
      else syncDialog.setAttribute("open", "");
    }

    function closeSyncDialog() {
      if (!syncDialog) return;
      if (typeof syncDialog.close === "function") syncDialog.close();
      else syncDialog.removeAttribute("open");
    }

    function initSync() {
      if (!Sync) return;

      var pair = readPairHash();
      if (pair) {
        pairFromPayload(pair);
        return;
      }

      if (!syncReady()) {
        setSyncStatus("idle");
        return;
      }

      ensureSyncKey()
        .then(function () {
          markUnsyncedDocs();
          setSyncStatus("idle");
          scheduleSync(1200);
        })
        .catch(function () {
          setSyncStatus("error", t("sync.errorGeneric"));
        });
    }

    function boot() {
      var settings = readSettings();

      syncLanguage();
      state.focus = FOCUS_MODES.indexOf(settings.focus) >= 0 ? settings.focus : "off";
      state.font = FONT_MODES.indexOf(settings.font) >= 0 ? settings.font : "sans";
      syncFocusButtons();
      applyFont(state.font, { silent: true, persist: false });

      ensureStore()
        .then(function (activeStore) { return activeStore.all(); })
        .then(function (rows) {
          docs = [];
          rows.forEach(function (raw) {
            var doc = normalizeDoc(raw);
            if (doc) docs.push(doc);
          });

          var migrated = migrateLegacy(settings);
          var restored = migrated || activeDoc(settings.activeId);
          openDoc(restored || createDoc(""), { silent: true, skipFlush: true });

          if (store && store.mode === "localstorage") {
            toast(t("toast.indexeddb"));
          }

          requestPersistence();
          initSync();
        })
        .catch(function () {
          openDoc(createDoc(""), { silent: true, skipFlush: true });
          setSaved("unavailable");
          toast(t("toast.noStorage"));
          initSync();
        });
    }

    function updateStats() {
      var text = area.value;
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;

      wordsEl.textContent = words;
      minutesEl.textContent = words ? Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) : 0;
    }

    function grow() {
      area.style.height = "auto";
      area.style.height = area.scrollHeight + "px";
    }

    function appendText(text, className) {
      if (!text) return;
      if (className) {
        var span = document.createElement("span");
        span.className = className;
        span.textContent = text;
        mirror.appendChild(span);
      } else {
        mirror.appendChild(document.createTextNode(text));
      }
    }

    function makeProbe() {
      var probe = document.createElement("span");
      probe.className = "writing-caret-probe";
      probe.setAttribute("aria-hidden", "true");
      // Zero-width no-break space: memberi kotak setinggi baris untuk
      // mengukur posisi caret tanpa menambah peluang pindah baris.
      probe.textContent = "\uFEFF";
      return probe;
    }

    function lineRange(text, position) {
      var start = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
      var end = text.indexOf("\n", position);
      if (end === -1) end = text.length;
      return [start, end];
    }

    function paragraphRange(text, position) {
      if (text.indexOf("\n\n") === -1) return lineRange(text, position);

      var start = text.lastIndexOf("\n\n", Math.max(0, position - 1));
      start = start === -1 ? 0 : start + 2;

      var end = text.indexOf("\n\n", position);
      if (end === -1) end = text.length;

      if (start <= position && position <= end) return [start, end];
      return lineRange(text, position);
    }

    function sentenceRange(text, position) {
      if (sentenceSegmenter) {
        var last = [0, text.length];
        var segments = sentenceSegmenter.segment(text);
        for (var part of segments) {
          var end = part.index + part.segment.length;
          last = [part.index, end];
          if (position >= part.index && position < end) return last;
        }
        return last;
      }

      var start = position;
      while (start > 0 && text[start - 1] !== "\n" && !/[.!?…]/.test(text[start - 1])) start--;

      var end = position;
      while (end < text.length && text[end] !== "\n" && !/[.!?…]/.test(text[end])) end++;
      if (end < text.length) end++;
      while (end < text.length && /["'”’)\]]/.test(text[end])) end++;

      while (start < position && /\s/.test(text[start])) start++;
      return [start, end];
    }

    /* Markdown awareness
       ----------------------------------------------------------
       In focus mode the mirror layer renders the active sentence or
       paragraph. The textarea underneath still owns the caret, the
       selection, and click-to-position, so the mirror has to stay on
       the exact same character grid. Every syntax marker therefore
       stays in place (quietly styled) and every format is
       metric-neutral: faux bold via text-stroke, italic via the
       synthetic oblique face, code via a tint instead of a monospace
       swap. No glyph advance changes, so the caret never drifts. */

    var markdownCache = { text: null, model: null };
    var ESCAPABLE = "\\`*_{}[]()#-.!~<>";

    // A list line: optional blockquote prefix, up to any indentation, a bullet
    // (- * +) or an ordered marker (1. 1)), then at least one space or the end
    // of the line. The same expression drives both the quiet marker styling
    // and the Enter-to-continue behaviour, so the two never disagree.
    var LIST_LINE = /^((?:[ \t]*>[ \t]?)*)([ \t]*)([-*+]|\d{1,9}[.)])([ \t]+|$)/;
    var TASK_BOX = /^\[[ xX]\](?:[ \t]+|$)/;

    function repeatChar(char, count) {
      return new Array(count + 1).join(char);
    }

    function isWordChar(char) {
      return !!char && /[\w\u00C0-\u024F]/.test(char);
    }

    function paragraphLimit(text, from, to) {
      var blank = text.indexOf("\n\n", from);
      return blank === -1 || blank > to ? to : blank;
    }

    function safeUrl(url) {
      if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
      if (/^[./#]/.test(url)) return url;
      return null;
    }

    function fenceRanges(text) {
      var ranges = [];
      var position = 0;
      var open = null;

      while (position <= text.length) {
        var newline = text.indexOf("\n", position);
        var lineEnd = newline === -1 ? text.length : newline;
        var match = /^ {0,3}(`{3,}|~{3,})/.exec(text.slice(position, lineEnd));

        if (match) {
          var mark = match[1].charAt(0);
          if (!open) {
            open = { start: position, mark: mark, length: match[1].length };
          } else if (mark === open.mark && match[1].length >= open.length) {
            ranges.push({ start: open.start, end: lineEnd });
            open = null;
          }
        }

        if (newline === -1) break;
        position = newline + 1;
      }

      if (open) ranges.push({ start: open.start, end: text.length });
      return ranges;
    }

    function scanHeadings(text, fences) {
      var overlays = [];
      var position = 0;
      var fenceIndex = 0;

      while (position <= text.length) {
        var newline = text.indexOf("\n", position);
        var lineEnd = newline === -1 ? text.length : newline;

        while (fenceIndex < fences.length && fences[fenceIndex].end <= position) fenceIndex += 1;

        var inFence = fenceIndex < fences.length
          && fences[fenceIndex].start <= position
          && position < fences[fenceIndex].end;

        if (!inFence) {
          var match = /^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(text.slice(position, lineEnd));

          if (match) {
            var markerEnd = position + match[0].length;
            overlays.push({ start: position, end: markerEnd, classes: ["md-marker"] });
            if (lineEnd > markerEnd) {
              // The level class only grades the stroke weight: the mirror has to
              // keep the same character grid as the textarea.
              overlays.push({
                start: markerEnd,
                end: lineEnd,
                classes: ["md-heading", "md-h" + match[1].length]
              });
            }
          }
        }

        if (newline === -1) break;
        position = newline + 1;
      }

      return overlays;
    }

    function scanQuotes(text, fences) {
      var overlays = [];
      var position = 0;
      var fenceIndex = 0;
      var QUOTE_LINE = /^ {0,3}((?:>[ \t]?)+)/;

      while (position <= text.length) {
        var newline = text.indexOf("\n", position);
        var lineEnd = newline === -1 ? text.length : newline;

        while (fenceIndex < fences.length && fences[fenceIndex].end <= position) fenceIndex += 1;

        var inFence = fenceIndex < fences.length
          && fences[fenceIndex].start <= position
          && position < fences[fenceIndex].end;

        if (!inFence) {
          var match = QUOTE_LINE.exec(text.slice(position, lineEnd));

          if (match) {
            var markerEnd = position + match[0].length;

            overlays.push({ start: position, end: markerEnd, classes: ["md-marker"] });

            if (lineEnd > markerEnd) {
              overlays.push({ start: markerEnd, end: lineEnd, classes: ["md-quote"] });
            }
          }
        }

        if (newline === -1) break;
        position = newline + 1;
      }

      return overlays;
    }

    function matchListLine(line) {
      var match = LIST_LINE.exec(line);

      if (!match) return null;

      return {
        quote: match[1],
        indent: match[2],
        marker: match[3],
        markerOffset: match[1].length + match[2].length,
        contentOffset: match[0].length
      };
    }

    function scanLists(text, fences) {
      var overlays = [];
      var position = 0;
      var fenceIndex = 0;

      while (position <= text.length) {
        var newline = text.indexOf("\n", position);
        var lineEnd = newline === -1 ? text.length : newline;

        while (fenceIndex < fences.length && fences[fenceIndex].end <= position) fenceIndex += 1;

        var inFence = fenceIndex < fences.length
          && fences[fenceIndex].start <= position
          && position < fences[fenceIndex].end;

        if (!inFence) {
          var line = text.slice(position, lineEnd);
          var item = matchListLine(line);

          if (item) {
            var markerStart = position + item.markerOffset;
            var contentStart = position + item.contentOffset;

            overlays.push({ start: markerStart, end: contentStart, classes: ["md-marker"] });

            var box = TASK_BOX.exec(line.slice(item.contentOffset));
            if (box) {
              overlays.push({
                start: contentStart,
                end: contentStart + box[0].replace(/[ \t]+$/, "").length,
                classes: ["md-marker"]
              });
            }
          }
        }

        if (newline === -1) break;
        position = newline + 1;
      }

      return overlays;
    }

    function pushRun(runs, start, end, classes) {
      if (end <= start) return;

      var last = runs[runs.length - 1];
      if (last && last.end === start && last.classes.join(" ") === classes.join(" ")) {
        last.end = end;
        return;
      }

      runs.push({ start: start, end: end, classes: classes });
    }

    function findEmphasisClose(text, from, limit, marker) {
      var char = marker.charAt(0);
      var position = from;

      while (position < limit) {
        var current = text.charAt(position);

        if (current === "\\") {
          position += 2;
          continue;
        }

        // Never close emphasis inside an inline code span.
        if (current === "`") {
          var run = 0;
          while (text.charAt(position + run) === "`") run += 1;

          var codeClose = text.indexOf(repeatChar("`", run), position + run);
          position = codeClose !== -1 && codeClose + run <= limit ? codeClose + run : position + run;
          continue;
        }

        if (text.substr(position, marker.length) === marker) {
          var before = text.charAt(position - 1);
          var after = text.charAt(position + marker.length);
          var insideRun = after === char && marker.length > 1;

          if (before && !/\s/.test(before) && !insideRun && (char !== "_" || !isWordChar(after))) {
            return position;
          }
        }

        position += 1;
      }

      return -1;
    }

    function matchEmphasis(text, start, to, marker, classes) {
      var limit = paragraphLimit(text, start, to);
      var innerStart = start + marker.length;

      if (innerStart >= limit) return null;

      var next = text.charAt(innerStart);
      if (!next || /\s/.test(next)) return null;
      if (marker.charAt(0) === "_" && isWordChar(text.charAt(start - 1))) return null;

      var close = findEmphasisClose(text, innerStart, limit, marker);
      if (close === -1 || close === innerStart) return null;

      return {
        kind: "inline",
        end: close + marker.length,
        openStart: start,
        openEnd: innerStart,
        innerStart: innerStart,
        innerEnd: close,
        closeStart: close,
        closeEnd: close + marker.length,
        classes: classes
      };
    }

    function matchCode(text, start, to) {
      var length = 0;
      while (text.charAt(start + length) === "`") length += 1;

      var marker = repeatChar("`", length);
      var close = text.indexOf(marker, start + length);

      if (close === -1 || close + length > to) return null;
      if (close === start + length) return null;
      if (text.slice(start + length, close).indexOf("\n\n") !== -1) return null;

      return {
        kind: "code",
        end: close + length,
        openStart: start,
        openEnd: start + length,
        innerStart: start + length,
        innerEnd: close,
        closeStart: close,
        closeEnd: close + length,
        classes: ["md-code"]
      };
    }

    function matchLink(text, start, to) {
      var limit = paragraphLimit(text, start, to);
      var labelEnd = text.indexOf("](", start + 1);

      if (labelEnd === -1 || labelEnd + 2 > limit) return null;

      var urlEnd = text.indexOf(")", labelEnd + 2);
      if (urlEnd === -1 || urlEnd >= limit) return null;

      var label = text.slice(start + 1, labelEnd);
      var url = text.slice(labelEnd + 2, urlEnd);

      if (!label || label.indexOf("\n") !== -1) return null;
      if (!url || /\s/.test(url)) return null;

      return {
        kind: "link",
        href: safeUrl(url),
        end: urlEnd + 1,
        openStart: start,
        openEnd: start + 1,
        innerStart: start + 1,
        innerEnd: labelEnd,
        closeStart: labelEnd,
        closeEnd: labelEnd + 2,
        urlStart: labelEnd + 2,
        urlEnd: urlEnd,
        urlCloseStart: urlEnd,
        urlCloseEnd: urlEnd + 1,
        classes: ["md-link"]
      };
    }

    function matchToken(text, start, to) {
      var char = text.charAt(start);

      if (char === "`") return matchCode(text, start, to);
      if (char === "[") return matchLink(text, start, to);

      if (char === "~" && text.charAt(start + 1) === "~") {
        return matchEmphasis(text, start, to, "~~", ["md-strike"]);
      }

      if (char === "*" || char === "_") {
        if (text.charAt(start + 1) === char && text.charAt(start + 2) === char) {
          var triple = matchEmphasis(text, start, to, repeatChar(char, 3), ["md-strong", "md-em"]);
          if (triple) return triple;
        }

        if (text.charAt(start + 1) === char) {
          var pair = matchEmphasis(text, start, to, repeatChar(char, 2), ["md-strong"]);
          if (pair) return pair;
        }

        return matchEmphasis(text, start, to, char, ["md-em"]);
      }

      return null;
    }

    function renderToken(text, token, classes, runs) {
      pushRun(runs, token.openStart, token.openEnd, classes.concat("md-marker"));

      if (token.kind === "link") {
        var labelStart = runs.length;
        parseInline(text, token.innerStart, token.innerEnd, classes.concat("md-link"), runs);
        for (var i = labelStart; i < runs.length; i += 1) runs[i].href = token.href;

        pushRun(runs, token.closeStart, token.closeEnd, classes.concat("md-marker"));
        pushRun(runs, token.urlStart, token.urlEnd, classes.concat("md-url"));
        pushRun(runs, token.urlCloseStart, token.urlCloseEnd, classes.concat("md-marker"));
        return;
      }

      if (token.kind === "inline") {
        parseInline(text, token.innerStart, token.innerEnd, classes.concat(token.classes), runs);
      } else {
        pushRun(runs, token.innerStart, token.innerEnd, classes.concat(token.classes));
      }

      pushRun(runs, token.closeStart, token.closeEnd, classes.concat("md-marker"));
    }

    function parseInline(text, from, to, classes, runs) {
      var position = from;
      var plainStart = from;

      while (position < to) {
        var char = text.charAt(position);

        if (char === "\\" && position + 1 < to && ESCAPABLE.indexOf(text.charAt(position + 1)) !== -1) {
          position += 2;
          continue;
        }

        var token = matchToken(text, position, to);

        if (!token) {
          position += 1;
          continue;
        }

        pushRun(runs, plainStart, position, classes);
        renderToken(text, token, classes, runs);
        position = token.end;
        plainStart = position;
      }

      pushRun(runs, plainStart, to, classes);
    }

    function inlineRuns(text, fences) {
      var runs = [];
      var position = 0;

      fences.forEach(function (fence) {
        if (fence.start > position) parseInline(text, position, fence.start, [], runs);
        pushRun(runs, fence.start, fence.end, ["md-code"]);
        position = fence.end;
      });

      if (position < text.length) parseInline(text, position, text.length, [], runs);

      return runs;
    }

    function markdownModel(text) {
      if (markdownCache.text === text && markdownCache.model) return markdownCache.model;

      var fences = fenceRanges(text);
      var model = {
        runs: inlineRuns(text, fences),
        overlays: scanHeadings(text, fences)
          .concat(scanQuotes(text, fences))
          .concat(scanLists(text, fences))
      };

      markdownCache.text = text;
      markdownCache.model = model;
      return model;
    }

    function uniqueClasses(classes) {
      var unique = [];
      classes.forEach(function (name) {
        if (unique.indexOf(name) === -1) unique.push(name);
      });
      return unique;
    }

    function splitByOverlays(out, run, start, end, overlays) {
      var cuts = [start, end];

      overlays.forEach(function (overlay) {
        if (overlay.start > start && overlay.start < end) cuts.push(overlay.start);
        if (overlay.end > start && overlay.end < end) cuts.push(overlay.end);
      });

      cuts.sort(function (a, b) { return a - b; });

      for (var i = 0; i < cuts.length - 1; i += 1) {
        var sliceStart = cuts[i];
        var sliceEnd = cuts[i + 1];

        if (sliceEnd <= sliceStart) continue;

        var classes = run.classes.slice();
        overlays.forEach(function (overlay) {
          if (overlay.start <= sliceStart && overlay.end >= sliceEnd) {
            classes = classes.concat(overlay.classes);
          }
        });

        out.push({
          start: sliceStart,
          end: sliceEnd,
          classes: uniqueClasses(classes),
          href: run.href || null
        });
      }
    }

    function mergeSegments(segments) {
      var merged = [];

      segments.forEach(function (segment) {
        var last = merged[merged.length - 1];

        if (last
          && last.end === segment.start
          && last.href === segment.href
          && last.classes.join(" ") === segment.classes.join(" ")) {
          last.end = segment.end;
          return;
        }

        merged.push(segment);
      });

      return merged;
    }

    function styleSegments(text, from, to) {
      var model = markdownModel(text);
      var overlays = model.overlays.filter(function (overlay) {
        return overlay.end > from && overlay.start < to;
      });
      var segments = [];
      var cursor = from;

      for (var index = 0; index < model.runs.length; index += 1) {
        var run = model.runs[index];

        if (run.end <= from) continue;
        if (run.start >= to) break;

        var start = Math.max(run.start, from);
        var end = Math.min(run.end, to);

        if (start > cursor) {
          segments.push({ start: cursor, end: start, classes: [], href: null });
        }

        splitByOverlays(segments, run, start, end, overlays);
        cursor = Math.max(cursor, end);
      }

      if (cursor < to) {
        segments.push({ start: cursor, end: to, classes: [], href: null });
      }

      return mergeSegments(segments);
    }

    function renderActiveRange(text, from, to, position, activeClass) {
      var segments = styleSegments(text, from, to);
      var caret = Math.max(from, Math.min(position, to));
      var probeInserted = false;

      if (activeClass === undefined) activeClass = "writing-active";

      segments.forEach(function (segment) {
        // With the focus modes off every run is active, so plain text can stay a
        // bare text node. That keeps the mirror cheap to rebuild on long drafts.
        var classes = (activeClass ? [activeClass] : []).concat(segment.classes).join(" ");

        if (!probeInserted && caret >= segment.start && caret <= segment.end) {
          appendText(text.slice(segment.start, caret), classes);
          mirror.appendChild(makeProbe());
          appendText(text.slice(caret, segment.end), classes);
          probeInserted = true;
          return;
        }

        appendText(text.slice(segment.start, segment.end), classes);
      });

      if (!probeInserted) mirror.appendChild(makeProbe());
    }

    function hrefAt(position) {
      var runs = markdownModel(area.value).runs;

      for (var i = 0; i < runs.length; i += 1) {
        var run = runs[i];

        if (run.start > position) break;
        if (run.href && position >= run.start && position <= run.end) return run.href;
      }

      return null;
    }

    function renderMirror() {
      var text = area.value;
      var position = Math.max(0, Math.min(area.selectionStart, text.length));
      var isFocus = state.focus !== "off" && text.length > 0;

      stage.classList.toggle("is-focus", isFocus);
      stage.classList.toggle("is-empty", text.length === 0);

      mirror.textContent = "";
      if (!text.length) return;

      // Focus off: markdown still gets rendered, but across the whole document
      // instead of one active sentence or paragraph.
      if (!isFocus) {
        renderActiveRange(text, 0, text.length, position, "");
        return;
      }

      var range = state.focus === "sentence"
        ? sentenceRange(text, position)
        : paragraphRange(text, position);

      if (position < range[0] || position > range[1]) range = [position, position];

      appendText(text.slice(0, range[0]), "writing-dim");
      renderActiveRange(text, range[0], range[1], position);
      appendText(text.slice(range[1]), "writing-dim");
    }

    /* Markdown preview
       ----------------------------------------------------------
       A small renderer kept in-house so the preview needs no network
       dependency. Text is escaped before any markup is added and links
       only accept safe schemes, so pasted HTML cannot run. */

    var MD_ESCAPABLE = "\\`*_{}[]()#+-.!>~|";

    function mdEscape(text) {
      return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    function mdSafeUrl(url, image) {
      var value = String(url || "").trim();

      if (!value) return "";
      if (image && /^data:image\//i.test(value)) return value;
      if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
      // Any other scheme (javascript:, vbscript:, data: for links) is dropped.
      if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
      return value;
    }

    function mdPlainText(text) {
      return String(text).replace(/[*_~+`\\]/g, "");
    }

    function mdFindCodeSpan(text, start) {
      var end = text.indexOf("`", start + 1);
      if (end === -1 || end === start + 1) return null;
      return { content: text.slice(start + 1, end), end: end + 1 };
    }

    function mdFindLink(text, start) {
      // start points at the opening bracket of [label](target).
      var depth = 0;
      var index = start;

      for (; index < text.length; index += 1) {
        var char = text.charAt(index);

        if (char === "\\") {
          index += 1;
          continue;
        }

        if (char === "[") {
          depth += 1;
        } else if (char === "]") {
          depth -= 1;
          if (depth === 0) break;
        }
      }

      if (depth !== 0 || text.charAt(index + 1) !== "(") return null;

      var close = text.indexOf(")", index + 2);
      if (close === -1) return null;

      var target = text.slice(index + 2, close).trim();
      var title = "";
      var titled = /^(\S+)(?:\s+["'(](.*)["')])?$/.exec(target);

      if (titled) {
        target = titled[1];
        title = titled[2] || "";
      }

      return {
        label: text.slice(start + 1, index),
        target: target,
        title: title,
        end: close + 1
      };
    }

    var MD_EMPHASIS = [
      { marker: "***", open: "<strong><em>", close: "</em></strong>" },
      { marker: "___", open: "<strong><em>", close: "</em></strong>" },
      { marker: "**", open: "<strong>", close: "</strong>" },
      { marker: "__", open: "<strong>", close: "</strong>" },
      { marker: "~~", open: "<del>", close: "</del>" },
      { marker: "*", open: "<em>", close: "</em>" },
      { marker: "_", open: "<em>", close: "</em>" }
    ];

    function mdMatchEmphasis(text, start) {
      for (var i = 0; i < MD_EMPHASIS.length; i += 1) {
        var spec = MD_EMPHASIS[i];
        var marker = spec.marker;

        if (text.slice(start, start + marker.length) !== marker) continue;

        var before = start > 0 ? text.charAt(start - 1) : "";
        var after = text.charAt(start + marker.length);

        // The opening marker needs text after it, and underscores do not
        // open inside a word (snake_case stays literal).
        if (after === "" || /\s/.test(after)) continue;
        if (marker.charAt(0) === "_" && /[A-Za-z0-9]/.test(before)) continue;

        var close = text.indexOf(marker, start + marker.length + 1);
        if (close === -1) continue;
        if (/\s/.test(text.charAt(close - 1))) continue;
        if (marker.charAt(0) === "_" && /[A-Za-z0-9]/.test(text.charAt(close + marker.length))) continue;

        return {
          content: text.slice(start + marker.length, close),
          open: spec.open,
          close: spec.close,
          end: close + marker.length
        };
      }

      return null;
    }

    function mdInline(text) {
      var out = "";
      var index = 0;
      var plainStart = 0;

      function flush(end) {
        if (end > plainStart) out += mdEscape(text.slice(plainStart, end));
      }

      while (index < text.length) {
        var char = text.charAt(index);

        if (char === "\\" && MD_ESCAPABLE.indexOf(text.charAt(index + 1)) !== -1) {
          flush(index);
          out += mdEscape(text.charAt(index + 1));
          index += 2;
          plainStart = index;
          continue;
        }

        if (char === "`") {
          var code = mdFindCodeSpan(text, index);

          if (code) {
            flush(index);
            out += "<code>" + mdEscape(code.content) + "</code>";
            index = code.end;
            plainStart = index;
            continue;
          }
        }

        if (char === "!" && text.charAt(index + 1) === "[") {
          var image = mdFindLink(text, index + 1);
          var imageUrl = image ? mdSafeUrl(image.target, true) : "";

          if (imageUrl) {
            flush(index);
            out += '<img src="' + mdEscape(imageUrl) + '" alt="' + mdEscape(mdPlainText(image.label)) + '"'
              + (image.title ? ' title="' + mdEscape(image.title) + '"' : "")
              + ' loading="lazy">';
            index = image.end;
            plainStart = index;
            continue;
          }
        }

        if (char === "[") {
          var link = mdFindLink(text, index);
          var linkUrl = link ? mdSafeUrl(link.target, false) : "";

          if (linkUrl) {
            var external = /^(https?:)?\/\//i.test(linkUrl) || /^mailto:/i.test(linkUrl);

            flush(index);
            out += '<a href="' + mdEscape(linkUrl) + '"'
              + (link.title ? ' title="' + mdEscape(link.title) + '"' : "")
              + (external ? ' target="_blank" rel="noopener noreferrer"' : "")
              + ">" + mdInline(link.label) + "</a>";
            index = link.end;
            plainStart = index;
            continue;
          }
        }

        var emphasis = mdMatchEmphasis(text, index);

        if (emphasis) {
          flush(index);
          out += emphasis.open + mdInline(emphasis.content) + emphasis.close;
          index = emphasis.end;
          plainStart = index;
          continue;
        }

        index += 1;
      }

      flush(text.length);
      return out;
    }

    var MD_HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
    var MD_HR = /^\s{0,3}(?:(?:\*\s*){3,}|(?:-\s*){3,}|(?:_\s*){3,})$/;
    var MD_FENCE = /^\s{0,3}(`{3,}|~{3,})\s*(.*?)\s*$/;
    var MD_QUOTE = /^\s{0,3}>/;
    var MD_LIST = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
    var MD_TASK = /^\[([ xX])\]\s+(.*)$/;

    function mdIsBlank(line) {
      return /^\s*$/.test(line);
    }

    function mdIsTableSeparator(line) {
      return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(line);
    }

    function mdSplitRow(line) {
      var row = line.trim();
      var cells = [];
      var current = "";

      if (row.charAt(0) === "|") row = row.slice(1);
      if (row.charAt(row.length - 1) === "|") row = row.slice(0, -1);

      for (var i = 0; i < row.length; i += 1) {
        var char = row.charAt(i);

        if (char === "\\" && row.charAt(i + 1) === "|") {
          current += "|";
          i += 1;
          continue;
        }

        if (char === "|") {
          cells.push(current.trim());
          current = "";
          continue;
        }

        current += char;
      }

      cells.push(current.trim());
      return cells;
    }

    function mdAlignments(separator) {
      return mdSplitRow(separator).map(function (cell) {
        var left = cell.charAt(0) === ":";
        var right = cell.charAt(cell.length - 1) === ":";

        if (left && right) return "center";
        if (right) return "right";
        if (left) return "left";
        return "";
      });
    }

    function mdTable(lines, start) {
      var header = mdSplitRow(lines[start]);
      var aligns = mdAlignments(lines[start + 1]);
      var index = start + 2;
      var html = "<table><thead><tr>";

      function cell(tag, text, column) {
        var align = aligns[column] ? ' style="text-align:' + aligns[column] + '"' : "";
        return "<" + tag + align + ">" + mdInline(text) + "</" + tag + ">";
      }

      for (var c = 0; c < header.length; c += 1) html += cell("th", header[c], c);
      html += "</tr></thead><tbody>";

      while (index < lines.length && !mdIsBlank(lines[index]) && lines[index].indexOf("|") !== -1) {
        var row = mdSplitRow(lines[index]);

        html += "<tr>";
        for (var r = 0; r < header.length; r += 1) {
          html += cell("td", row[r] === undefined ? "" : row[r], r);
        }
        html += "</tr>";
        index += 1;
      }

      html += "</tbody></table>";
      return { html: html, end: index };
    }

    function mdFence(lines, start) {
      var open = MD_FENCE.exec(lines[start]);
      var marker = open[1];
      var char = marker.charAt(0);
      var minimum = marker.length;
      var info = open[2] || "";
      var body = [];
      var index = start + 1;
      var close = new RegExp("^\\s{0,3}" + (char === "`" ? "`" : "~") + "{" + minimum + ",}\\s*$");

      while (index < lines.length) {
        if (close.test(lines[index])) {
          index += 1;
          break;
        }
        body.push(lines[index]);
        index += 1;
      }

      var language = info.split(/\s+/)[0].replace(/[^\w-]/g, "");
      var className = language ? ' class="language-' + mdEscape(language) + '"' : "";

      return {
        html: "<pre><code" + className + ">" + mdEscape(body.join("\n")) + "</code></pre>",
        end: index
      };
    }

    function mdQuote(lines, start) {
      var body = [];
      var index = start;

      while (index < lines.length && MD_QUOTE.test(lines[index])) {
        body.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index += 1;
      }

      return { html: "<blockquote>" + mdBlocks(body) + "</blockquote>", end: index };
    }

    function mdList(lines, start) {
      var first = MD_LIST.exec(lines[start]);
      var ordered = /\d/.test(first[2]);
      var baseIndent = first[1].length;
      var startNumber = ordered ? parseInt(first[2], 10) : 1;
      var items = [];
      var lastItem = null;
      var index = start;
      var indentCut = new RegExp("^\\s{0," + baseIndent + "}");

      while (index < lines.length) {
        var match = MD_LIST.exec(lines[index]);

        if (match && match[1].length === baseIndent && /\d/.test(match[2]) === ordered) {
          lastItem = [match[3]];
          items.push(lastItem);
          index += 1;
          continue;
        }

        // Continuation lines and nested lists belong to the current item.
        if (lastItem && (mdIsBlank(lines[index]) || /^\s+/.test(lines[index]))) {
          lastItem.push(lines[index].replace(indentCut, ""));
          index += 1;
          continue;
        }

        break;
      }

      var html = ordered
        ? "<ol" + (startNumber !== 1 ? ' start="' + startNumber + '"' : "") + ">"
        : "<ul>";

      items.forEach(function (itemLines) {
        var firstLine = itemLines[0];
        var task = MD_TASK.exec(firstLine);
        var prefix = "";

        if (task) {
          prefix = '<input type="checkbox" disabled' + (task[1].toLowerCase() === "x" ? " checked" : "") + ">";
          firstLine = task[2];
        }

        html += '<li' + (task ? ' class="task"' : "") + ">" + prefix
          + mdInline(firstLine) + mdBlocks(itemLines.slice(1)) + "</li>";
      });

      html += ordered ? "</ol>" : "</ul>";
      return { html: html, end: index };
    }

    function mdStartsBlock(lines, index) {
      var line = lines[index];

      return MD_HEADING.test(line)
        || MD_HR.test(line)
        || MD_FENCE.test(line)
        || MD_QUOTE.test(line)
        || MD_LIST.test(line)
        || (line.indexOf("|") !== -1 && index + 1 < lines.length && mdIsTableSeparator(lines[index + 1]));
    }

    function mdBlocks(lines) {
      var html = "";
      var index = 0;

      while (index < lines.length) {
        var line = lines[index];

        if (mdIsBlank(line)) {
          index += 1;
          continue;
        }

        var fence = MD_FENCE.exec(line);
        if (fence) {
          var code = mdFence(lines, index);
          html += code.html;
          index = code.end;
          continue;
        }

        var heading = MD_HEADING.exec(line);
        if (heading) {
          var level = heading[1].length;
          html += "<h" + level + ">" + mdInline(heading[2]) + "</h" + level + ">";
          index += 1;
          continue;
        }

        if (MD_HR.test(line)) {
          html += "<hr>";
          index += 1;
          continue;
        }

        if (MD_QUOTE.test(line)) {
          var quote = mdQuote(lines, index);
          html += quote.html;
          index = quote.end;
          continue;
        }

        if (line.indexOf("|") !== -1 && index + 1 < lines.length && mdIsTableSeparator(lines[index + 1])) {
          var table = mdTable(lines, index);
          html += table.html;
          index = table.end;
          continue;
        }

        if (MD_LIST.test(line)) {
          var list = mdList(lines, index);
          html += list.html;
          index = list.end;
          continue;
        }

        var paragraph = [line];
        index += 1;

        while (index < lines.length && !mdIsBlank(lines[index]) && !mdStartsBlock(lines, index)) {
          paragraph.push(lines[index]);
          index += 1;
        }

        html += "<p>" + paragraph.map(mdInline).join("<br>") + "</p>";
      }

      return html;
    }

    function renderMarkdown(text) {
      var source = String(text || "").replace(/\r\n?/g, "\n");
      if (!source.trim()) return "";
      return mdBlocks(source.split("\n"));
    }

    function previewIsOpen() {
      return !!previewDialog && (previewDialog.open || previewDialog.hasAttribute("open"));
    }

    function syncPreviewTriggers(open) {
      [previewTrigger, previewToggle].forEach(function (button) {
        if (button) button.setAttribute("aria-expanded", String(open));
      });
    }

    function renderPreview() {
      if (!previewContent) return;

      var html = renderMarkdown(area.value);

      previewContent.innerHTML = html;
      previewContent.hidden = !html;
      if (previewEmpty) previewEmpty.hidden = !!html;
    }

    function openPreview() {
      if (!previewDialog) return;

      window.clearTimeout(toolbarHideTimer);
      toolbarHideTimer = null;
      renderPreview();

      if (typeof previewDialog.showModal === "function") {
        if (!previewDialog.open) previewDialog.showModal();
      } else {
        previewDialog.setAttribute("open", "");
      }

      syncPreviewTriggers(true);
      if (previewBody) {
        // Focusing the scroll container puts the reading position at the top
        // and lets Page Down work without reaching for the mouse.
        previewBody.scrollTop = 0;
        previewBody.focus({ preventScroll: true });
      } else if (previewEdit) {
        previewEdit.focus({ preventScroll: true });
      }
    }

    function handlePreviewClosed() {
      syncPreviewTriggers(false);
      area.focus({ preventScroll: true });
      kickCaret();
      scheduleRender();
      if (isToolbarRevealed()) armToolbarHide();
    }

    function closePreview() {
      if (!previewDialog || !previewIsOpen()) return;

      if (typeof previewDialog.close === "function") {
        previewDialog.close();
        return;
      }

      previewDialog.removeAttribute("open");
      handlePreviewClosed();
    }

    function isZenActive() {
      return document.body.classList.contains("is-zen") || document.body.classList.contains("is-zen-flow");
    }

    function isToolbarRevealed() {
      return document.body.classList.contains("is-toolbar-revealed");
    }

    function armToolbarHide(delay) {
      window.clearTimeout(toolbarHideTimer);
      toolbarHideTimer = window.setTimeout(function () {
        toolbarHideTimer = null;
        if (hasOpenDialog()) {
          armToolbarHide(1200);
          return;
        }
        if (canHover && toolbar.matches(":hover")) {
          armToolbarHide(1200);
          return;
        }
        if (toolbar.contains(document.activeElement) && document.activeElement !== area) {
          area.focus({ preventScroll: true });
        }
        setToolbarRevealed(false);
      }, typeof delay === "number" ? delay : TOOLBAR_HIDE_DELAY);
    }

    function toolbarTriggerLabel() {
      return isToolbarRevealed() ? t("toolbar.hide") : t("toolbar.show");
    }

    // Dipakai saat bahasa berganti: label saja, tanpa menyentuh timer
    // sembunyi-sendiri milik bilah alat.
    function syncToolbarLabel() {
      if (!toolbarTrigger) return;
      var label = toolbarTriggerLabel();
      toolbarTrigger.setAttribute("aria-label", label);
      toolbarTrigger.setAttribute("title", label);
    }

    function setToolbarRevealed(revealed, hideDelay) {
      var next = Boolean(revealed) && isZenActive();

      document.body.classList.toggle("is-toolbar-revealed", next);
      if (toolbarTrigger) {
        var label = toolbarTriggerLabel();

        toolbarTrigger.setAttribute("aria-expanded", String(next));
        toolbarTrigger.setAttribute("aria-label", label);
        toolbarTrigger.setAttribute("title", label);
        // Keep the grip out of the tab order while the toolbar is open, but let
        // it keep focus so keyboard users can close the toolbar with Enter.
        if (next) {
          toolbarTrigger.setAttribute("tabindex", "-1");
        } else {
          toolbarTrigger.removeAttribute("tabindex");
        }
      }

      window.clearTimeout(toolbarHideTimer);
      toolbarHideTimer = null;
      if (next) armToolbarHide(hideDelay);
      syncFormatBar();
    }

    function revealToolbar() {
      window.clearTimeout(zenHintTimer);
      zenHintTimer = null;
      hideBubble();
      setToolbarRevealed(true);
    }

    // The room is the fixed frame; the column inside it is what scrolls, so
    // that the formatting bar stays outside the scroll flow.
    function scrollContainer() {
      return document.body.classList.contains("is-zen") ? roomInner : null;
    }

    function instantScrollBy(delta) {
      var container = scrollContainer();
      var root = document.documentElement;
      var previous = root.style.scrollBehavior;
      root.style.scrollBehavior = "auto";

      if (container) {
        var previousContainer = container.style.scrollBehavior;
        container.style.scrollBehavior = "auto";
        container.scrollBy(0, delta);
        container.style.scrollBehavior = previousContainer;
      } else {
        window.scrollBy(0, delta);
      }

      root.style.scrollBehavior = previous;
    }

    function ensureCaretVisible() {
      if (document.activeElement !== area) return;

      var probe = mirror.querySelector(".writing-caret-probe");
      if (!probe) return;

      var rect = probe.getBoundingClientRect();
      if (!rect || (!rect.width && !rect.height)) return;

      var viewport = window.visualViewport;
      var viewTop = viewport ? viewport.offsetTop : 0;
      var viewBottom = viewport
        ? Math.min(viewport.offsetTop + viewport.height, window.innerHeight)
        : window.innerHeight;
      var toolbarRect = toolbar.getBoundingClientRect();
      var safeTop = Math.max(viewTop + 12, toolbarRect.bottom + 16);
      var safeBottom = viewBottom - 32;
      var delta = 0;

      // The mobile formatting bar sits on the top edge of the keyboard, so the
      // caret has to stop below it instead of sliding underneath.
      if (formatBar && !formatBar.hidden) {
        safeBottom = Math.min(safeBottom, formatBar.getBoundingClientRect().top - 16);
      }

      if (rect.top < safeTop) {
        delta = rect.top - safeTop;
      } else if (rect.bottom > safeBottom) {
        delta = rect.bottom - safeBottom;
      }

      if (delta) instantScrollBy(delta);
    }

    function scheduleRender() {
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(function () {
        renderFrame = null;
        renderMirror();
        ensureCaretVisible();
      });
    }

    function scheduleEnsureVisible() {
      if (ensureFrame) return;
      ensureFrame = window.requestAnimationFrame(function () {
        ensureFrame = null;
        ensureCaretVisible();
      });
    }

    function armCaretGuard() {
      caretGuardUntil = Date.now() + 1600;
    }

    function kickCaret() {
      armCaretGuard();
      caretKickTimers.forEach(function (timer) { window.clearTimeout(timer); });
      caretKickTimers = [80, 300, 700, 1200].map(function (delay) {
        return window.setTimeout(scheduleEnsureVisible, delay);
      });
    }

    function handleCaretScroll() {
      if (Date.now() >= caretGuardUntil || document.activeElement !== area) return;

      // Scrolling fires per frame. Reading the caret probe needs a layout, which
      // is expensive now that the mirror draws the whole document, so wait for
      // the gesture to settle before nudging the caret back into view.
      window.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = window.setTimeout(function () {
        scrollSettleTimer = null;
        if (Date.now() < caretGuardUntil && document.activeElement === area) {
          scheduleEnsureVisible();
        }
      }, SCROLL_SETTLE_DELAY);
    }

    // A real scroll gesture wins: otherwise the caret guard would pull the page
    // back under the reader's finger. Keyboard changes still come through the
    // visualViewport resize handler.
    function releaseCaretGuard() {
      caretGuardUntil = 0;
      caretKickTimers.forEach(function (timer) { window.clearTimeout(timer); });
      caretKickTimers = [];
      window.clearTimeout(scrollSettleTimer);
      scrollSettleTimer = null;
    }

    function syncFontChoices() {
      fontChoices.forEach(function (input) {
        input.checked = input.value === state.font;
      });

      if (fontButton) {
        var label = t("font.current", { name: FONT_LABELS[state.font] || FONT_LABELS.sans });
        fontButton.setAttribute("aria-label", label);
        fontButton.setAttribute("title", label);
      }
    }

    function isFontDialogOpen() {
      return !!fontDialog && (fontDialog.open || fontDialog.hasAttribute("open"));
    }

    // Dialog tema dikelola site.js, tetapi bilah alat perlu tahu supaya tidak
    // menyembunyikan dirinya sendiri selagi dialog masih terbuka.
    function hasOpenDialog() {
      return !!document.querySelector("dialog[open]");
    }

    function openFontDialog() {
      if (!fontDialog) return;
      window.clearTimeout(toolbarHideTimer);
      toolbarHideTimer = null;
      syncFontChoices();

      if (typeof fontDialog.showModal === "function") {
        if (!fontDialog.open) fontDialog.showModal();
      } else {
        fontDialog.setAttribute("open", "");
      }

      var current = fontDialog.querySelector('input[name="writing-font"]:checked');
      if (current) current.focus({ preventScroll: true });
    }

    function closeFontDialog() {
      if (!fontDialog) return;

      if (typeof fontDialog.close === "function") {
        if (fontDialog.open) fontDialog.close();
      } else {
        fontDialog.removeAttribute("open");
      }
    }

    function handleFontDialogClosed() {
      area.focus({ preventScroll: true });
      kickCaret();
      grow();
      scheduleRender();
      if (isToolbarRevealed()) armToolbarHide();
    }

    function syncFocusButtons() {
      focusButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-focus") === state.focus));
      });
    }

    function applyFont(mode, options) {
      options = options || {};
      state.font = FONT_MODES.indexOf(mode) >= 0 ? mode : "sans";
      stage.setAttribute("data-font", state.font);
      syncFontChoices();

      if (!options.silent) {
        area.focus({ preventScroll: true });
        kickCaret();
        grow();
        scheduleRender();
      }

      if (options.persist !== false) saveSettings({ font: state.font });
    }

    function applyFocus(mode) {
      state.focus = FOCUS_MODES.indexOf(mode) >= 0 ? mode : "off";
      syncFocusButtons();
      area.focus({ preventScroll: true });
      kickCaret();
      scheduleRender();
      saveSettings({ focus: state.focus });
    }

    /* Bahasa
       ----------------------------------------------------------
       i18n.js sudah memilih dan menerapkan bahasa sebelum skrip ini
       berjalan (supaya tidak ada kedipan teks). Di sini hanya label
       yang dibuat dinamis yang perlu diselaraskan: tombol bilah alat,
       status simpan, nama huruf, dan pemecah kalimat. */

    function syncLangButton() {
      if (!langButton) return;

      var code = activeLang();
      var label = t("lang.toggle");

      if (langCodeEl) langCodeEl.textContent = code.toUpperCase();
      langButton.setAttribute("aria-label", label);
      langButton.setAttribute("title", label);
    }

    // Tautan traktir mengikuti bahasa antarmuka: pembaca Indonesia ke
    // halaman Traktir, pembaca lain ke Buy Me a Coffee.
    function syncDonateLink() {
      if (!donateLink) return;

      var href = donateLink.getAttribute(activeLang() === "id" ? "data-donate-id" : "data-donate-en");
      if (href) donateLink.setAttribute("href", href);
    }

    function syncLanguage() {
      setSentenceLanguage(activeLang());
      area.setAttribute("lang", activeLang());
      syncLangButton();
      syncDonateLink();
      syncToolbarLabel();
      updateFullscreenButton();
      syncFontChoices();
      syncFormatTitles();
      setSaved(lastSavedKey);
    }

    function applyLanguage(code) {
      if (!i18n) return;

      i18n.setLang(code);
      syncLanguage();
      updateSyncStatusText();
      renderPanel();
      saveSettings({ lang: activeLang() });

      // Tombol bahasa tinggal di panel catatan: jangan tarik fokus kembali
      // ke area tulis selagi panel masih terbuka.
      if (!isPanelOpen()) {
        area.focus({ preventScroll: true });
        kickCaret();
        grow();
        scheduleRender();
      }
    }

    function copy() {
      var text = area.value;
      if (!text.trim()) {
        toast(t("toast.copyEmpty"));
        return;
      }

      if (window.Perkakas) {
        window.Perkakas.copy(text);
      } else if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      }
    }

    function download() {
      var text = area.value;
      if (!text.trim()) {
        toast(t("toast.downloadEmpty"));
        return;
      }

      var name = (current ? docTitle(current) : t("file.untitled"))
        .trim()
        .slice(0, 60)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      var blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
      downloadBlob(blob, (name || t("file.untitled")) + ".md");
      toast(t("toast.downloaded"));
    }

    function startNew() {
      commitCurrent();
      closePanel();

      // Jangan menumpuk catatan kosong: kalau yang terbuka memang masih
      // kosong dan belum punya judul, pakai catatan itu saja.
      if (isPristine(current)) {
        setSaved("created");
        area.focus();
        kickCaret();
        scheduleRender();
        return;
      }

      var doc = createDoc("");
      enqueueWrite(doc);
      openDoc(doc);
      setSaved("created");
      toast(t("toast.newNote"));
    }

    function updateFullscreenButton() {
      var active = isZenActive();
      var label = active ? t("fullscreen.exit") : t("fullscreen.enter");
      var iconUse = fullscreenButton.querySelector("use");

      fullscreenButton.setAttribute("aria-label", label);
      fullscreenButton.setAttribute("title", label);
      if (iconUse) iconUse.setAttribute("href", active ? "#i-fullscreen-exit" : "#i-fullscreen");
    }

    // Keyboard on-screen: it is the one thing that shortens the visual viewport
    // while the layout viewport keeps its height. A pinched page shortens it
    // too, by a lot, so the height is read back in layout pixels first — without
    // that, a zoomed page would look like a keyboard forever and the caret space
    // would never go away.
    var KEYBOARD_MIN_INSET = 120;

    function syncKeyboard() {
      var viewport = window.visualViewport;
      if (!viewport) return;

      var covered = viewport.height * (viewport.scale || 1);
      var inset = document.documentElement.clientHeight - covered;
      document.body.classList.toggle("has-keyboard", inset > KEYBOARD_MIN_INSET);
    }

    function syncZenViewport() {
      if (!document.body.classList.contains("is-zen")) return;

      var viewport = window.visualViewport;
      var box = viewport
        ? { top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height }
        : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

      // visualViewport can scroll every frame; rewriting the same box would
      // invalidate layout each time, so only touch the styles when they move.
      // The inline styles are checked too: the cached box alone would never
      // notice a frame that drifted away from it, and everything anchored to
      // the frame would silently follow it off the edge.
      if (box.top === viewportBox.top
        && box.left === viewportBox.left
        && box.width === viewportBox.width
        && box.height === viewportBox.height
        && room.style.top === box.top + "px"
        && room.style.left === box.left + "px"
        && room.style.width === box.width + "px"
        && room.style.height === box.height + "px") {
        return;
      }

      viewportBox = box;
      room.style.top = box.top + "px";
      room.style.left = box.left + "px";
      room.style.width = box.width + "px";
      room.style.height = box.height + "px";
      room.style.right = "auto";
      room.style.bottom = "auto";
    }

    function setZen(enabled) {
      var useFlow = enabled && isFirefoxMobile;

      document.body.classList.toggle("is-zen", enabled && !useFlow);
      document.body.classList.toggle("is-zen-flow", useFlow);
      if (!enabled) document.body.classList.remove("zen-boot");

      setToolbarRevealed(false);
      window.clearTimeout(zenHintTimer);
      zenHintTimer = null;

      if (!enabled || useFlow) {
        room.style.top = "";
        room.style.left = "";
        room.style.width = "";
        room.style.height = "";
        room.style.right = "";
        room.style.bottom = "";
      }

      if (enabled && !useFlow) syncZenViewport();
      updateFullscreenButton();

      window.setTimeout(function () {
        if (useFlow) {
          var top = room.getBoundingClientRect().top + window.scrollY;
          var root = document.documentElement;
          var previous = root.style.scrollBehavior;
          root.style.scrollBehavior = "auto";
          window.scrollTo(0, top);
          root.style.scrollBehavior = previous;
        }

        syncZenViewport();
        grow();
        scheduleRender();
        kickCaret();
      }, 50);

      if (enabled) {
        window.clearTimeout(zenHintTimer);
        zenHintTimer = window.setTimeout(function () {
          zenHintTimer = null;
          if (!isZenActive() || isToolbarRevealed() || isPanelOpen() || document.activeElement === area) return;
          setToolbarRevealed(true, TOOLBAR_HINT_DELAY);
        }, 400);
      } else {
        window.clearTimeout(zenHintTimer);
        zenHintTimer = null;
      }
    }

    function toggleFullscreen() {
      setZen(!isZenActive());
    }

    /* List continuation
       ----------------------------------------------------------
       Enter inside a list line writes the next marker for us: the same
       bullet, the next number, a fresh unchecked task box, and the
       blockquote depth plus indentation of the current line. An empty
       item ends the list instead. The edit runs through execCommand so
       the browser keeps its own undo stack (setRangeText would flatten
       it); only when that is unavailable do we splice by hand and fire
       a synthetic input event. */

    function parseListLine(text, position) {
      var range = lineRange(text, position);
      var line = text.slice(range[0], range[1]);
      var item = matchListLine(line);

      if (!item) return null;

      return {
        start: range[0],
        quote: item.quote,
        indent: item.indent,
        marker: item.marker,
        contentStart: range[0] + item.contentOffset,
        content: line.slice(item.contentOffset)
      };
    }

    function parseQuoteLine(text, position) {
      var range = lineRange(text, position);
      var line = text.slice(range[0], range[1]);
      var match = /^((?:[ \t]*>[ \t]?)+)(.*)$/.exec(line);

      if (!match) return null;

      return {
        start: range[0],
        quote: match[1],
        quoteEnd: range[0] + match[1].length,
        content: match[2]
      };
    }

    function nextListMarker(marker) {
      var ordered = /^(\d{1,9})([.)])$/.exec(marker);

      if (!ordered) return marker;
      return (parseInt(ordered[1], 10) + 1) + ordered[2];
    }

    function listEdit(text, position) {
      var item = parseListLine(text, position);

      // The caret has to sit after the marker; inside it, Enter stays native.
      if (!item || position < item.contentStart) return null;

      var box = TASK_BOX.exec(item.content);
      var rest = box ? item.content.slice(box[0].length) : item.content;

      // An empty item ends the list: the marker (and its task box) goes away
      // and the caret drops back to the line itself. A blockquote prefix, if
      // any, stays so the quote keeps going.
      if (rest.trim() === "") {
        return {
          from: item.start + item.quote.length,
          to: item.contentStart + (box ? box[0].length : 0),
          insert: ""
        };
      }

      // Task items always continue unchecked; a mid-line Enter splits the item
      // because the text after the caret simply slides to the new line.
      var marker = box ? item.marker + " [ ]" : nextListMarker(item.marker);

      return {
        from: position,
        to: position,
        insert: "\n" + item.quote + item.indent + marker + " "
      };
    }

    function quoteEdit(text, position) {
      var line = parseQuoteLine(text, position);

      if (!line || position < line.quoteEnd) return null;

      if (line.content.trim() === "") {
        return { from: line.start, to: line.quoteEnd, insert: "" };
      }

      return { from: position, to: position, insert: "\n" + line.quote };
    }

    function replaceRange(from, to, insert) {
      var applied = false;

      area.setSelectionRange(from, to);

      try {
        applied = insert
          ? document.execCommand("insertText", false, insert)
          : document.execCommand("delete", false, null);
      } catch (error) {
        applied = false;
      }

      if (!applied) {
        var caret = from + insert.length;

        area.value = area.value.slice(0, from) + insert + area.value.slice(to);
        area.setSelectionRange(caret, caret);
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }

      kickCaret();
      scheduleRender();
    }

    /* Markdown formatting
       ----------------------------------------------------------
       The editor is a plain <textarea> and the mirror draws the markdown, so
       a formatting command only has to write the markers. Every command goes
       through one native insertion, which keeps the browser's undo history at
       one step per press instead of one step per marker.

       There are two shapes for the same four commands:
         - a bubble that hangs off the selection, for a mouse or a pen
         - a bar above the virtual keyboard, for a finger
       A touch screen brings its own selection menu and it cannot be turned
       off, so on a finger the buttons get out of its way instead of racing it
       for the space above the selection. */

    var formatBubble = document.getElementById("writing-format-bubble");
    var formatBubbleLink = document.getElementById("writing-format-link");
    var formatBubbleInput = document.getElementById("writing-format-link-input");
    var formatBar = document.getElementById("writing-format-bar");
    var formatBarLink = document.getElementById("writing-format-bar-link");
    var formatBarInput = document.getElementById("writing-format-bar-link-input");
    var formatButtons = Array.prototype.slice.call(document.querySelectorAll("[data-format]"));
    var formatMenu = document.getElementById("writing-format-menu");
    var formatBarMenu = document.getElementById("writing-format-menu-bar");
    var formatMenuItems = Array.prototype.slice.call(document.querySelectorAll("[data-level]"));

    var HEADING_PREFIX = /^ {0,3}(#{1,6})(?:[ \t]+|$)/;
    var LINK_PATTERN = /\[[^\]\n]*\]\([^)\s]*\)/g;
    var IMAGE_PATTERN = /!\[[^\]\n]*\]\([^)\s]*\)/g;
    var imageMode = false;

    var rememberedRange = { from: 0, to: 0 };
    var bubbleTimer = null;
    var bubbleFrame = 0;
    var bubbleFallback = 0;
    var FORMAT_SETTLE_DELAYS = [60, 180, 360, 700];
    var FORMAT_KEYBOARD_SHOW = 140;
    var FORMAT_KEYBOARD_HIDE = 80;

    // The last pointer decides, not the user agent: a tablet with a trackpad
    // gets the bubble, a laptop with a touch screen gets the bar the moment a
    // finger lands on it.
    var lastPointerType = window.matchMedia && window.matchMedia("(pointer: coarse)").matches
      ? "touch"
      : "mouse";

    document.addEventListener("pointerdown", function (event) {
      if (event.pointerType) lastPointerType = event.pointerType;

      // Tapping the writing surface re-measures right away so the bar is there
      // before the keyboard finishes animating in.
      if (!formatBar) return;

      var target = event.target;
      if (!target) return;

      // A menu that was left open should not survive a tap somewhere else.
      if (headingMenuOpen()
        && !(target.closest && target.closest(".writing-format-menu"))
        && !(target.closest && target.closest('[data-format="heading"]'))) {
        closeHeadingMenu();
      }

      if (!area.contains(target) && !(stage && stage.contains(target))) return;
      if (!formatBar.hidden) syncFormatBar();
    }, true);

    function usesTouchUI() {
      return lastPointerType === "touch";
    }

    /* "Is the keyboard open?" has no answer on the web. The only usable signal
       is the visual viewport shrinking below the layout viewport, and it is a
       guess: a hardware keyboard shows nothing, a split keyboard changes
       nothing, and a pinch zoom looks exactly like a keyboard. Pinch zoom is
       filtered out by scale, and the two thresholds give the show/hide decision
       some hysteresis so it does not flicker while the keyboard animates.
       When the guess is wrong the bar simply falls back to the focus rule. */

    var keyboardWasOpen = false;

    function keyboardIsOpen() {
      var viewport = window.visualViewport;

      if (!viewport) return false;
      if (viewport.scale > 1.01) {
        keyboardWasOpen = false;
        return false;
      }

      var inset = window.innerHeight - (viewport.offsetTop + viewport.height);

      keyboardWasOpen = keyboardWasOpen
        ? inset > FORMAT_KEYBOARD_HIDE
        : inset > FORMAT_KEYBOARD_SHOW;

      return keyboardWasOpen;
    }

    function shortcutName() {
      var platform = (navigator.userAgentData && navigator.userAgentData.platform)
        || navigator.platform
        || navigator.userAgent;
      return /Mac|iPhone|iPad|iPod/i.test(platform) ? "⌘" : "Ctrl";
    }

    /* Selection memory
       Tapping a button outside the textarea blurs it, and a blur takes the
       selection with it. The range is remembered while typing and put back
       before a command runs, so the buttons work even when the browser has
       already dropped the highlight. */

    function rememberRange() {
      if (document.activeElement !== area) return;
      rememberedRange.from = area.selectionStart;
      rememberedRange.to = area.selectionEnd;
    }

    function commandRange() {
      var blurred = document.activeElement !== area;

      if (blurred) area.focus({ preventScroll: true });
      if (blurred && rememberedRange.to > rememberedRange.from) {
        area.setSelectionRange(rememberedRange.from, rememberedRange.to);
      }

      return { from: area.selectionStart, to: area.selectionEnd };
    }

    function applyEdit(from, to, insert, selFrom, selTo) {
      var applied = false;

      area.setSelectionRange(from, to);

      try {
        applied = insert
          ? document.execCommand("insertText", false, insert)
          : document.execCommand("delete", false, null);
      } catch (error) {
        applied = false;
      }

      if (!applied) {
        area.value = area.value.slice(0, from) + insert + area.value.slice(to);
        area.dispatchEvent(new Event("input", { bubbles: true }));
      }

      if (selFrom === undefined || selFrom === null) selFrom = from + insert.length;
      if (selTo === undefined || selTo === null) selTo = selFrom;

      area.setSelectionRange(selFrom, selTo);
      rememberedRange.from = selFrom;
      rememberedRange.to = selTo;

      kickCaret();
      scheduleRender();
      syncFormatState();
      syncFormatTitles();
      syncFormatBar();
      scheduleBubble();
    }

    /* Inline markers
       The plan for a press is computed from the text around the selection, so
       pressing the same button twice puts the text back the way it was. */

    function wrapPlan(text, from, to, marker) {
      var length = marker.length;
      var selected = text.slice(from, to);
      var before = text.slice(from - length, from);
      var after = text.slice(to, to + length);
      var wrap = {
        from: from,
        to: to,
        insert: marker + selected + marker,
        selFrom: from + length,
        selTo: to + length
      };

      if (!selected) {
        // A caret parked inside an empty pair closes the pair instead of
        // stacking a second one on top of it.
        if (before === marker && after === marker) {
          return { from: from - length, to: to + length, insert: "", selFrom: from - length, selTo: from - length };
        }
        return wrap;
      }

      // Italic has to tell bold apart from a single asterisk, otherwise bolding
      // a word would look like italics to the next press.
      if (marker === "*") {
        if (text.slice(from - 3, from) === "***" && text.slice(to, to + 3) === "***") {
          return { from: from - 3, to: to + 3, insert: "**" + selected + "**", selFrom: from - 2, selTo: to - 2 };
        }
        if (text.slice(from - 2, from) === "**" && text.slice(to, to + 2) === "**") {
          return { from: from - 2, to: to + 2, insert: "***" + selected + "***", selFrom: from + 1, selTo: to + 1 };
        }
      }

      if (before === marker && after === marker) {
        return { from: from - length, to: to + length, insert: selected, selFrom: from - length, selTo: to - length };
      }

      if (to - from >= length * 2
        && text.slice(from, from + length) === marker
        && text.slice(to - length, to) === marker) {
        return { from: from, to: to, insert: selected.slice(length, selected.length - length), selFrom: from, selTo: to - length * 2 };
      }

      return wrap;
    }

    function applyWrap(marker) {
      var range = commandRange();
      var plan = wrapPlan(area.value, range.from, range.to, marker);
      applyEdit(plan.from, plan.to, plan.insert, plan.selFrom, plan.selTo);
    }

    /* Headings
       Line level, not character level: every line the selection touches is
       rewritten in one edit, so a multi-line selection is still one undo. */

    function headingLevel(line) {
      var match = HEADING_PREFIX.exec(line);
      return match ? match[1].length : 0;
    }

    function blockRange(text, range) {
      var end = text.indexOf("\n", range.to);
      return {
        start: text.lastIndexOf("\n", Math.max(0, range.from - 1)) + 1,
        end: end === -1 ? text.length : end
      };
    }

    // Read-only: reading the level must never pull focus back into the editor,
    // because this also runs at boot and while the notes panel is open.
    function currentHeadingLevel() {
      var text = area.value;
      var range = { from: area.selectionStart, to: area.selectionEnd };
      var block = blockRange(text, range);
      var lines = text.slice(block.start, block.end).split("\n");

      for (var i = 0; i < lines.length; i += 1) {
        var level = headingLevel(lines[i]);
        if (level) return Math.min(level, 6);
      }

      return 0;
    }

    // Every line-level command has the same shape: rewrite the touched block as
    // one string (so the whole change is a single undo step), then map the
    // selection offsets through the rewritten lines.
    function blockLines() {
      var range = commandRange();
      var text = area.value;
      var block = blockRange(text, range);
      var lines = text.slice(block.start, block.end).split("\n");
      var offsets = [];
      var cursor = block.start;

      lines.forEach(function (line) {
        offsets.push(cursor);
        cursor += line.length + 1;
      });

      return { range: range, text: text, block: block, lines: lines, offsets: offsets };
    }

    function rewriteBlock(lines, offsets, build) {
      var shifts = [];
      var rebuiltLines = lines.map(function (line, index) {
        var value = build(line, index);
        shifts[index] = value.length - line.length;
        return value;
      });

      var rebuilt = rebuiltLines.join("\n");
      if (rebuilt === lines.join("\n")) return false;

      var shiftBefore = [];
      var running = 0;

      shifts.forEach(function (shift, index) {
        shiftBefore[index] = running;
        running += shift;
      });

      function mapOffset(position) {
        var index = 0;

        for (var i = offsets.length - 1; i >= 0; i -= 1) {
          if (position >= offsets[i]) {
            index = i;
            break;
          }
        }

        var line = lines[index];
        var newLength = line.length + shifts[index];
        var inner = Math.min(position - offsets[index], line.length);

        inner = Math.max(0, Math.min(inner + shifts[index], newLength));
        return offsets[index] + shiftBefore[index] + inner;
      }

      var range = commandRange();
      applyEdit(offsets[0], offsets[offsets.length - 1] + lines[lines.length - 1].length,
        rebuilt, mapOffset(range.from), mapOffset(range.to));
      return true;
    }

    function setHeading(level) {
      var view = blockLines();
      var levels = view.lines.map(headingLevel);
      var uniform = levels.every(function (value) { return value === levels[0]; }) ? levels[0] : 0;
      var next = uniform === level ? 0 : level;

      rewriteBlock(view.lines, view.offsets, function (line) {
        var rest = line.replace(HEADING_PREFIX, "");
        return next && rest.trim() ? "#".repeat(next) + " " + rest : rest;
      });
    }

    function listKind(marker) {
      return /^[-*+]$/.test(marker) ? "ul" : "ol";
    }

    function currentListKind() {
      var text = area.value;
      var block = blockRange(text, { from: area.selectionStart, to: area.selectionEnd });
      var lines = text.slice(block.start, block.end).split("\n");

      for (var i = 0; i < lines.length; i += 1) {
        if (!lines[i].trim()) continue;

        var match = matchListLine(lines[i]);
        if (!match) return "";
        return listKind(match.marker);
      }

      return "";
    }

    function setList(kind) {
      var view = blockLines();
      var filled = view.lines.filter(function (line) { return line.trim(); });
      var uniform = filled.length > 0 && filled.every(function (line) {
        var match = matchListLine(line);
        return match ? listKind(match.marker) === kind : false;
      });

      // A blank line is where a list usually starts, so pressing the button
      // there has to open one instead of quietly doing nothing.
      var emptyBlock = !filled.length;
      var number = 0;

      rewriteBlock(view.lines, view.offsets, function (line, index) {
        if (emptyBlock) {
          if (index > 0) return line;
          return kind === "ul" ? "- " : "1. ";
        }

        if (!line.trim()) return line;

        var match = matchListLine(line);
        var keep = match ? match.quote + match.indent : "";
        var rest = (match ? line.slice(match.contentOffset) : line).replace(/^[ \t]+/, "");
        var marker = "";

        if (!uniform) {
          number += 1;
          marker = kind === "ul" ? "- " : number + ". ";
        }

        return keep + marker + rest;
      });
    }

    function currentLineQuoted() {
      var text = area.value;
      var block = blockRange(text, { from: area.selectionStart, to: area.selectionEnd });
      var lines = text.slice(block.start, block.end).split("\n");

      for (var i = 0; i < lines.length; i += 1) {
        if (!lines[i].trim()) continue;
        return /^ {0,3}>/.test(lines[i]);
      }

      return false;
    }

    function setQuote() {
      var view = blockLines();
      var filled = view.lines.filter(function (line) { return line.trim(); });
      var uniform = filled.length > 0 && filled.every(function (line) {
        return /^ {0,3}>/.test(line);
      });

      rewriteBlock(view.lines, view.offsets, function (line) {
        if (!line.trim()) return uniform ? line : "> " + line;

        var rest = line.replace(/^ {0,3}(?:>[ \t]?)+/, "");
        return uniform ? rest : "> " + rest;
      });
    }

    function applyCode() {
      var range = commandRange();
      var text = area.value;
      var selected = text.slice(range.from, range.to);

      // A selection that spans lines is a block, not a phrase.
      if (selected.indexOf("\n") === -1) {
        applyWrap("`");
        return;
      }

      if (text.slice(range.from - 4, range.from) === "```\n"
        && text.slice(range.to, range.to + 4) === "\n```") {
        applyEdit(range.from - 4, range.to + 4, selected, range.from - 4, range.from - 4 + selected.length);
        return;
      }

      applyEdit(range.from, range.to, "```\n" + selected + "\n```",
        range.from + 4, range.from + 4 + selected.length);
    }

    /* Links */

    function looksLikeLink(value) {
      var text = String(value || "").trim();

      return /^[a-z][a-z0-9+.-]*:\/\/\S+$/i.test(text)
        || /^www\.\S+$/i.test(text)
        || /^\S+@\S+\.\S+$/.test(text);
    }

    function normalizeHref(value) {
      var url = String(value || "").trim();

      if (!url) return "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
      if (url.charAt(0) === "/" || url.charAt(0) === "#") return url;
      if (url.indexOf("@") > 0 && url.indexOf("/") === -1) return "mailto:" + url;
      return "https://" + url;
    }

    function linkRangeAt(text, position) {
      var match;

      LINK_PATTERN.lastIndex = 0;

      while ((match = LINK_PATTERN.exec(text))) {
        var end = match.index + match[0].length;

        if (position < match.index || position > end) continue;

        var split = match[0].indexOf("](");
        if (split === -1) continue;

        return {
          start: match.index,
          end: end,
          label: match[0].slice(1, split),
          href: match[0].slice(split + 2, match[0].length - 1)
        };
      }

      return null;
    }

    function imageRangeAt(text, position) {
      IMAGE_PATTERN.lastIndex = 0;

      var match;

      while ((match = IMAGE_PATTERN.exec(text))) {
        var end = match.index + match[0].length;

        if (position < match.index || position > end) continue;

        var split = match[0].indexOf("](");
        if (split === -1) continue;

        return {
          start: match.index,
          end: end,
          alt: match[0].slice(2, split),
          src: match[0].slice(split + 2, match[0].length - 1)
        };
      }

      return null;
    }

    function normalizeImageSrc(value) {
      var url = String(value || "").trim();

      if (!url) return "";
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return url;
      if (url.charAt(0) === "/" || url.charAt(0) === "#") return url;
      return "https://" + url;
    }

    // An image is the same gesture as a link, only the marker in front differs,
    // so the field and its surrounding handling are shared.
    function applyImage(raw) {
      var src = normalizeImageSrc(raw);
      if (!src) return;

      var range = commandRange();
      var text = area.value;
      var existing = imageRangeAt(text, range.from);

      if (existing) {
        var alt = existing.alt || t("format.imageWord");
        var replaced = "![" + alt + "](" + src + ")";

        applyEdit(existing.start, existing.end, replaced, existing.start + 2, existing.start + 2 + alt.length);
        return;
      }

      var selected = text.slice(range.from, range.to);
      var label = selected;

      if (looksLikeLink(selected)) {
        src = normalizeImageSrc(selected);
        label = "";
      }
      if (!label) label = t("format.imageWord");

      var insert = "![" + label + "](" + src + ")";
      applyEdit(range.from, range.to, insert, range.from + 2, range.from + 2 + label.length);
    }

    function applyLink(raw) {
      var href = normalizeHref(raw);
      if (!href) return;

      var range = commandRange();
      var text = area.value;
      var existing = linkRangeAt(text, range.from);

      // A caret already inside a link edits that link instead of nesting a
      // second one around it.
      if (existing) {
        var label = existing.label || existing.href;
        var link = "[" + label + "](" + href + ")";

        applyEdit(existing.start, existing.end, link, existing.start + 1, existing.start + 1 + label.length);
        return;
      }

      var selected = text.slice(range.from, range.to);

      if (!selected) {
        var word = t("format.linkWord");
        var seed = "[" + word + "](" + href + ")";

        applyEdit(range.from, range.to, seed, range.from + 1, range.from + 1 + word.length);
        return;
      }

      if (looksLikeLink(selected)) href = normalizeHref(selected);

      var wrapped = "[" + selected + "](" + href + ")";
      applyEdit(range.from, range.to, wrapped, range.from + 1, range.from + 1 + selected.length);
    }

    /* Link field
       A dialog would be the wrong shape here: it takes the page away. The
       field grows out of the same surface as the buttons and disappears with
       them. */

    function linkFieldParts(kind) {
      return kind === "bar"
        ? { form: formatBarLink, input: formatBarInput, host: formatBar }
        : { form: formatBubbleLink, input: formatBubbleInput, host: formatBubble };
    }

    function linkFieldOpen() {
      return !!((formatBubbleLink && !formatBubbleLink.hidden)
        || (formatBarLink && !formatBarLink.hidden));
    }

    function openLinkField(kind, mode) {
      var parts = linkFieldParts(kind);
      if (!parts.form || !parts.input) return;

      imageMode = mode === "image";

      var range = commandRange();
      var text = area.value;
      var existing = imageMode ? imageRangeAt(text, range.from) : linkRangeAt(text, range.from);
      var selected = text.slice(range.from, range.to);
      var preset = "";

      if (existing) preset = imageMode ? existing.src : existing.href;
      else if (looksLikeLink(selected)) preset = selected;

      parts.input.setAttribute("placeholder", t(imageMode ? "format.imagePlaceholder" : "format.linkPlaceholder"));
      parts.input.setAttribute("aria-label", t(imageMode ? "format.image" : "format.linkAddress"));

      parts.form.hidden = false;
      if (parts.host) parts.host.classList.add("is-linking");
      // The field can only take focus once its container is on screen.
      if (kind === "bubble") syncBubble(true);
      parts.input.value = preset;
      parts.input.focus({ preventScroll: true });
      parts.input.setSelectionRange(0, preset.length);
      syncFormatBar();
    }

    function closeLinkField(kind) {
      var parts = linkFieldParts(kind);

      if (parts.form) {
        parts.form.hidden = true;
        if (parts.form.reset) parts.form.reset();
      }
      if (parts.host) parts.host.classList.remove("is-linking");
    }

    function commitLink(kind) {
      var parts = linkFieldParts(kind);
      var value = parts.input ? parts.input.value : "";
      var image = imageMode;

      closeLinkField(kind);
      if (image) applyImage(value);
      else applyLink(value);
      imageMode = false;
      hideBubble();
      syncFormatBar();
    }

    /* The two surfaces */

    function formatSurfaceVisible() {
      return !!((formatBubble && !formatBubble.hidden) || (formatBar && !formatBar.hidden));
    }

    function setFormatPressed(name, pressed) {
      formatButtons.forEach(function (button) {
        if (button.getAttribute("data-format") === name) {
          button.setAttribute("aria-pressed", String(!!pressed));
        }
      });
    }

    function syncFormatState() {
      if (document.activeElement !== area) return;
      if (!formatSurfaceVisible()) return;

      var runs = markdownModel(area.value).runs;
      var position = area.selectionStart;
      var strong = false;
      var em = false;
      var code = false;
      var strike = false;

      for (var i = 0; i < runs.length; i += 1) {
        var run = runs[i];

        if (position < run.start || position >= run.end) continue;

        strong = run.classes.indexOf("md-strong") !== -1;
        em = run.classes.indexOf("md-em") !== -1;
        code = run.classes.indexOf("md-code") !== -1;
        strike = run.classes.indexOf("md-strike") !== -1;
        break;
      }

      var level = currentHeadingLevel();
      var list = currentListKind();

      setFormatPressed("bold", strong);
      setFormatPressed("italic", em);
      setFormatPressed("strike", strike);
      setFormatPressed("ul", list === "ul");
      setFormatPressed("ol", list === "ol");
      setFormatPressed("code", code);
      setFormatPressed("quote", currentLineQuoted());
      setFormatPressed("image", !!imageRangeAt(area.value, position));
      syncHeadingMenu(level);
    }

    // Shortcuts belong in the tooltip, not in the dictionary: the modifier
    // differs per platform while the label does not.
    function syncFormatTitles() {
      var modifier = shortcutName();

      var titles = {
        bold: t("format.boldTitle") + " (" + modifier + "+B)",
        italic: t("format.italicTitle") + " (" + modifier + "+I)",
        quote: t("format.quoteTitle"),
        strike: t("format.strikeTitle"),
        heading: t("format.headingTitle") + " (" + modifier + "+Alt+1-3)",
        ul: t("format.ulTitle"),
        ol: t("format.olTitle"),
        code: t("format.codeTitle"),
        link: t("format.linkTitle") + " (" + modifier + "+Shift+K)",
        image: t("format.imageTitle")
      };

      formatButtons.forEach(function (button) {
        var name = button.getAttribute("data-format");
        if (!titles[name]) return;

        button.setAttribute("title", titles[name]);
        button.setAttribute("aria-label", t("format." + name));
      });
    }

    function hideBubble() {
      window.clearTimeout(bubbleTimer);
      bubbleTimer = null;
      if (bubbleFrame) window.cancelAnimationFrame(bubbleFrame);
      bubbleFrame = 0;
      window.clearTimeout(bubbleFallback);
      bubbleFallback = 0;

      if (!formatBubble || formatBubble.hidden) {
        if (formatBubble) closeLinkField("bubble");
        return;
      }

      if ((linkFieldOpen() || headingMenuOpen())
        && document.activeElement
        && formatBubble.contains(document.activeElement)) {
        return;
      }

      closeLinkField("bubble");
      formatBubble.hidden = true;
    }

    // The bubble is measured against the caret probe, which only exists once
    // the mirror has drawn the frame after the selection change. Waiting for a
    // frame first makes that order explicit instead of hoping the timer lands
    // after the render.
    // A caret alone on a blank line has nothing to select, but it is exactly
    // where a list, a quote or a heading usually begins. Treat it as an anchor
    // of its own.
    function caretOnBlankLine() {
      if (area.selectionStart !== area.selectionEnd) return false;

      var text = area.value;
      var position = area.selectionStart;
      var start = text.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
      var end = text.indexOf("\n", position);

      if (end === -1) end = text.length;

      return text.slice(start, position).trim() === ""
        && text.slice(position, end).trim() === "";
    }

    function scheduleBubble() {
      window.clearTimeout(bubbleTimer);
      window.clearTimeout(bubbleFallback);
      if (bubbleFrame) window.cancelAnimationFrame(bubbleFrame);

      function arm() {
        bubbleFrame = 0;
        window.clearTimeout(bubbleFallback);
        bubbleFallback = 0;
        window.clearTimeout(bubbleTimer);
        bubbleTimer = window.setTimeout(function () {
          bubbleTimer = null;
          syncBubble();
        }, caretOnBlankLine() ? 520 : 120);
      }

      bubbleFrame = window.requestAnimationFrame(arm);
      // A hidden tab stops producing frames, and the bubble should not wait on
      // a paint that may never come.
      bubbleFallback = window.setTimeout(arm, 400);
    }

    function syncBubble(force) {
      if (!formatBubble) return;

      if (usesTouchUI()
        || hasOpenDialog()
        || isPanelOpen()
        || previewIsOpen()
        || isToolbarRevealed()) {
        hideBubble();
        return;
      }

      // Focus that has moved inside the bubble (a menu row, the link field) is
      // still ours: closing then would make the menu vanish the moment it is
      // focused.
      var inside = formatBubble.contains(document.activeElement);

      var blank = caretOnBlankLine();

      if (!force && !inside) {
        if (document.activeElement !== area) {
          hideBubble();
          return;
        }

        if (area.selectionStart === area.selectionEnd
          && !blank
          && !headingMenuOpen()
          && !linkFieldOpen()) {
          hideBubble();
          return;
        }
      }

      // The probe the mirror already places at the caret start sits on the
      // first line of the selection, which is exactly where the bubble hangs.
      var probe = mirror.querySelector(".writing-caret-probe");
      var rect = probe ? probe.getBoundingClientRect() : null;

      // The mirror is rebuilt on the next frame, so a caret that was just placed
      // can be ahead of it. Draw now rather than anchor the bubble at a guess.
      if (!rect || (!rect.width && !rect.height)) {
        renderMirror();
        probe = mirror.querySelector(".writing-caret-probe");
        rect = probe ? probe.getBoundingClientRect() : null;
      }

      if (!rect || (!rect.width && !rect.height)) {
        if ((!force && !blank) || !stage) {
          hideBubble();
          return;
        }

        // An empty draft has no probe to measure, so the bubble starts at the
        // top of the writing surface instead of not appearing at all.
        var stageRect = stage.getBoundingClientRect();
        rect = { top: stageRect.top + 8, bottom: stageRect.top + 8, left: stageRect.left, width: 0 };
      }

      formatBubble.hidden = false;

      var viewport = window.visualViewport;
      var viewTop = viewport ? viewport.offsetTop : 0;
      var viewLeft = viewport ? viewport.offsetLeft : 0;
      var viewWidth = viewport ? viewport.width : window.innerWidth;
      var viewBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
      var width = formatBubble.offsetWidth;
      var height = formatBubble.offsetHeight;
      var gutter = 8;
      var top = rect.top - height - gutter;
      var left = rect.left + rect.width / 2 - width / 2;

      if (top < viewTop + gutter) top = rect.bottom + gutter;
      // Below the last line there may be no room left at all.
      if (top + height > viewBottom - gutter) top = Math.max(viewTop + gutter, rect.top - height - gutter);

      left = Math.max(viewLeft + gutter, Math.min(left, viewLeft + viewWidth - width - gutter));

      formatBubble.style.top = Math.round(top) + "px";
      formatBubble.style.left = Math.round(left) + "px";

      syncFormatState();
    }

    function syncFormatBar() {
      if (!formatBar) return;

      var linking = !!(formatBarLink && !formatBarLink.hidden);
      var inside = formatBar.contains(document.activeElement);
      var focused = document.activeElement === area || inside;
      // The bar belongs to the focused writing room. Outside it the page shows
      // the regular toolbar, and a floating bar there would have nowhere solid
      // to sit.
      var open = usesTouchUI()
        && isZenActive()
        && (focused || keyboardIsOpen())
        && !hasOpenDialog()
        && !isPanelOpen()
        && !previewIsOpen()
        && !isToolbarRevealed();

      if (!open && linking && !inside) closeLinkField("bar");

      if (formatBar.hidden !== !open) formatBar.hidden = !open;

      if (!open) {
        closeHeadingMenu("bar");
        return;
      }

      // The frame is pinned to the visual viewport and the bar is a row of that
      // frame, so there is nothing left to position: no offset to compute and
      // nothing that can drift while the page scrolls. The frame is refreshed
      // first so a stale height cannot leave the bar below the edge.
      syncZenViewport();

      syncFormatState();
    }

    // Reading the level is safe anywhere; the pressed state of the menu does not
    // depend on the editor holding focus, so it is kept apart from the caret
    // driven state above.
    function syncHeadingMenu(level) {
      var current = level === undefined ? currentHeadingLevel() : level;

      setFormatPressed("heading", current > 0);

      formatMenuItems.forEach(function (item) {
        item.setAttribute("aria-checked", String(Number(item.getAttribute("data-level")) === current));
      });
    }

    /* Heading menu
       One button instead of three icons that are hard to tell apart, and one
       row of choices instead of a cycle nobody can see the state of. */

    function menuFor(kind) {
      return kind === "bar" ? formatBarMenu : formatMenu;
    }

    function headingMenuOpen() {
      return !!((formatMenu && !formatMenu.hidden) || (formatBarMenu && !formatBarMenu.hidden));
    }

    function closeHeadingMenu(kind) {
      [formatMenu, formatBarMenu].forEach(function (menu) {
        if (!menu) return;
        // Scoped closes exist because the bar syncs far more often than the
        // bubble, and an unscoped close there would shut the desktop menu the
        // moment it opened.
        if (kind && menu !== menuFor(kind)) return;
        menu.hidden = true;

        var host = menu.parentNode;
        if (host) {
          var button = host.querySelector('[data-format="heading"]');
          if (button) button.setAttribute("aria-expanded", "false");
        }
      });
    }

    function toggleHeadingMenu(kind) {
      var menu = menuFor(kind);

      if (!menu) return;
      if (!menu.hidden) {
        closeHeadingMenu();
        return;
      }

      closeLinkField(kind);
      closeHeadingMenu();
      syncHeadingMenu();

      menu.hidden = false;

      var host = menu.parentNode;
      var button = host ? host.querySelector('[data-format="heading"]') : null;

      if (button) {
        button.setAttribute("aria-expanded", "true");

        // Anchor the list under the button it belongs to, not under the edge of
        // the surface, and keep it inside the surface when the button sits near
        // a corner.
        var hostRect = host.getBoundingClientRect();
        var buttonRect = button.getBoundingClientRect();
        var width = menu.offsetWidth;
        var left = buttonRect.left - hostRect.left + buttonRect.width / 2 - width / 2;

        left = Math.max(0, Math.min(left, host.clientWidth - width));
        menu.style.left = Math.round(left) + "px";
        menu.style.right = "auto";
      }

      var checked = menu.querySelector('[aria-checked="true"]') || menu.querySelector("button");
      if (checked && checked.focus) checked.focus({ preventScroll: true });
    }

    function applyHeadingLevel(level) {
      closeHeadingMenu();
      setHeading(level);
    }

    formatMenuItems.forEach(function (item) {
      item.addEventListener("click", function () {
        applyHeadingLevel(Number(item.getAttribute("data-level")));
      });
    });

    function runFormat(name) {
      if (name === "bold") applyWrap("**");
      else if (name === "italic") applyWrap("*");
      else if (name === "quote") setQuote();
      else if (name === "strike") applyWrap("~~");
      else if (name === "heading") toggleHeadingMenu(usesTouchUI() ? "bar" : "bubble");
      else if (name === "ul") setList("ul");
      else if (name === "ol") setList("ol");
      else if (name === "code") applyCode();
      else if (name === "link") openLinkField(usesTouchUI() ? "bar" : "bubble", "link");
      else if (name === "image") openLinkField(usesTouchUI() ? "bar" : "bubble", "image");
    }

    formatButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        runFormat(button.getAttribute("data-format"));
      });
    });

    [["bubble", formatBubbleLink], ["bar", formatBarLink]].forEach(function (pair) {
      if (!pair[1]) return;

      pair[1].addEventListener("submit", function (event) {
        event.preventDefault();
        commitLink(pair[0]);
      });
    });

    [["bubble", formatBubbleInput], ["bar", formatBarInput]].forEach(function (pair) {
      if (!pair[1]) return;

      pair[1].addEventListener("keydown", function (event) {
        if (event.key !== "Escape") return;

        event.preventDefault();
        event.stopPropagation();
        closeLinkField(pair[0]);
        area.focus({ preventScroll: true });
        if (rememberedRange.to > rememberedRange.from) {
          area.setSelectionRange(rememberedRange.from, rememberedRange.to);
        }
        syncFormatBar();
        scheduleBubble();
      });
    });

    // With a mouse the browser keeps the selection when the default is
    // prevented. A finger is left alone: cancelling a touch there can swallow
    // the click itself, and the remembered range already covers that case.
    [formatBubble, formatBar].forEach(function (host) {
      if (!host) return;

      host.addEventListener("pointerdown", function (event) {
        if (event.pointerType === "touch") return;
        event.preventDefault();
      });
    });

    ["pointermove", "scroll"].forEach(function (name) {
      window.addEventListener(name, function () {
        if (formatBubble && !formatBubble.hidden) scheduleBubble();
        syncFormatBar();
      }, { passive: true });
    });

    area.addEventListener("keydown", function (event) {
      if (event.isComposing || event.keyCode === 229) return;

      var modifier = event.metaKey || event.ctrlKey;
      var key = event.key ? event.key.toLowerCase() : "";

      if (modifier && !event.altKey && !event.shiftKey && (key === "b" || key === "i")) {
        event.preventDefault();
        applyWrap(key === "b" ? "**" : "*");
        return;
      }

      // Ctrl/Cmd+K belongs to the notes panel, so links take the shifted key.
      if (modifier && event.shiftKey && !event.altKey && key === "k") {
        event.preventDefault();
        openLinkField(usesTouchUI() ? "bar" : "bubble", "link");
        return;
      }

      if (event.altKey && !modifier && /^Digit[1-3]$/.test(event.code || "")) {
        event.preventDefault();
        setHeading(Number(event.code.slice(5)));
        return;
      }

      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      // Never fight an IME composition or a replaced selection.
      if (area.selectionStart !== area.selectionEnd) return;

      var position = area.selectionStart;
      var edit = listEdit(area.value, position) || quoteEdit(area.value, position);

      if (!edit) return;

      event.preventDefault();
      replaceRange(edit.from, edit.to, edit.insert);
    });

    area.addEventListener("input", function () {
      window.clearTimeout(zenHintTimer);
      zenHintTimer = null;
      if (isToolbarRevealed()) setToolbarRevealed(false);
      rememberRange();
      updateStats();
      grow();
      kickCaret();
      scheduleRender();
      scheduleBubble();
      syncFormatBar();
      queueSave();
    });

    area.addEventListener("click", function (event) {
      // Links are styled in every focus mode now, so Ctrl/Cmd-click follows them
      // everywhere too.
      if (event.metaKey || event.ctrlKey) {
        var href = hrefAt(area.selectionStart);

        if (href) {
          event.preventDefault();
          window.open(href, "_blank", "noopener");
          return;
        }
      }

      kickCaret();
      scheduleRender();
      rememberRange();
      scheduleBubble();
      syncFormatBar();
    });

    area.addEventListener("keyup", function () {
      kickCaret();
      scheduleRender();
      rememberRange();
      scheduleBubble();
      syncFormatBar();
    });

    area.addEventListener("focus", function () {
      kickCaret();
      syncFormatBar();
      syncFormatTitles();

      // The keyboard animates in after focus, so the height is only final a
      // little later. Re-measure a few times instead of trusting the first
      // frame, which is what left the bar sitting behind the keyboard.
      FORMAT_SETTLE_DELAYS.forEach(function (delay) {
        window.setTimeout(function () { syncFormatBar(); }, delay);
      });
    });

    // The blur that a tap on the buttons causes arrives after the click, so the
    // bar waits a tick before it decides to go away.
    area.addEventListener("blur", function () {
      window.setTimeout(syncFormatBar, 0);
    });

    document.addEventListener("selectionchange", function () {
      if (document.activeElement === area) {
        kickCaret();
        scheduleRender();
        rememberRange();
        scheduleBubble();
      }
      syncFormatBar();
    });

    if (window.visualViewport) {
      // Browsers that expose the visual viewport can report the keyboard; the
      // stylesheet keeps a fallback for the ones that cannot.
      document.body.classList.add("can-track-keyboard");

      window.visualViewport.addEventListener("resize", function () {
        syncKeyboard();
        syncZenViewport();
        kickCaret();
        scheduleEnsureVisible();
        syncFormatBar();
        if (formatBubble && !formatBubble.hidden) scheduleBubble();
      });
      window.visualViewport.addEventListener("scroll", function () {
        syncZenViewport();
        handleCaretScroll();
        syncFormatBar();
      });
    }

    window.addEventListener("scroll", handleCaretScroll, { passive: true });
    if (roomInner) roomInner.addEventListener("scroll", handleCaretScroll, { passive: true });
    ["wheel", "touchmove"].forEach(function (name) {
      window.addEventListener(name, releaseCaretGuard, { passive: true });
    });

    focusButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        applyFocus(button.getAttribute("data-focus"));
      });
    });

    if (fontButton) fontButton.addEventListener("click", openFontDialog);
    if (fontCloseButton) fontCloseButton.addEventListener("click", closeFontDialog);

    if (langButton) {
      langButton.addEventListener("click", function () {
        applyLanguage(activeLang() === "en" ? "id" : "en");
      });
    }

    if (fontDialog) {
      fontDialog.addEventListener("close", handleFontDialogClosed);
      fontDialog.addEventListener("click", function (event) {
        if (event.target === fontDialog) closeFontDialog();
      });
    }

    fontChoices.forEach(function (input) {
      input.addEventListener("change", function () {
        if (!input.checked) return;
        applyFont(input.value, { silent: true });
        closeFontDialog();
      });
    });

    fullscreenButton.addEventListener("click", toggleFullscreen);
    copyButton.addEventListener("click", copy);
    downloadButton.addEventListener("click", download);
    newButton.addEventListener("click", startNew);

    /* Markdown preview
       ---------------------------------------------------------- */

    [previewTrigger, previewToggle].forEach(function (button) {
      if (!button) return;
      button.addEventListener("click", openPreview);
    });

    if (previewEdit) previewEdit.addEventListener("click", closePreview);

    if (previewDialog) {
      previewDialog.addEventListener("close", handlePreviewClosed);
      previewDialog.addEventListener("cancel", function () {
        syncPreviewTriggers(false);
      });
      previewDialog.addEventListener("click", function (event) {
        if (event.target === previewDialog) closePreview();
      });
    }

    /* Daftar catatan
       ---------------------------------------------------------- */

    [notesToggle, notesTrigger].forEach(function (button) {
      if (!button) return;
      button.addEventListener("click", function () {
        if (isPanelOpen()) closePanel();
        else openPanel();
      });
    });

    /* Sync dan cadangan
       ---------------------------------------------------------- */

    if (syncButton) syncButton.addEventListener("click", openSyncDialog);
    if (syncClose) syncClose.addEventListener("click", closeSyncDialog);

    if (syncDialog) {
      syncDialog.addEventListener("click", function (event) {
        if (event.target === syncDialog) closeSyncDialog();

        var action = event.target.closest ? event.target.closest("[data-sync-act]") : null;
        if (!action) return;

        var name = action.getAttribute("data-sync-act");
        if (name === "request-open" && syncRequestForm) {
          syncRequestForm.hidden = false;
          if (syncContact) syncContact.focus();
        } else if (name === "claim") {
          setSyncView("claim");
          if (syncClaimCode) syncClaimCode.focus();
        } else if (name === "refresh") {
          checkRequestStatus();
        } else if (name === "now") {
          syncNow({ toast: true });
        } else if (name === "pair") {
          startPairing();
        } else if (name === "pair-copy") {
          if (syncPairUrl) window.Perkakas.copy(syncPairUrl);
        } else if (name === "reveal") {
          if (syncSession && syncSession.recoveryKey) {
            syncRevealKeyEl.textContent = formatRecoveryKey(syncSession.recoveryKey);
            syncRevealKeyEl.hidden = false;
          } else {
            toast(t("sync.toastNoKey"));
          }
        } else if (name === "recovery-copy") {
          if (syncSession && syncSession.recoveryKey) window.Perkakas.copy(syncSession.recoveryKey);
        } else if (name === "recovery-download") {
          if (syncSession && syncSession.recoveryKey) {
            downloadBlob(
              new Blob(
                [t("sync.title") + "\n" + t("sync.recoveryLead") + "\n\n" + syncSession.recoveryKey + "\n"],
                { type: "text/plain;charset=utf-8" }
              ),
              "zen-write-recovery-key.txt"
            );
          }
        } else if (name === "recovery-done") {
          setSyncView("active");
          loadDevices();
          scheduleSync(1000);
        } else if (name === "revoke") {
          revokeThisDevice();
        }
      });
    }

    if (syncRequestForm) {
      syncRequestForm.addEventListener("submit", function (event) {
        event.preventDefault();
        sendAccessRequest();
      });
    }

    if (syncClaimForm) {
      syncClaimForm.addEventListener("submit", function (event) {
        event.preventDefault();
        var code = syncClaimCode ? syncClaimCode.value.trim() : "";
        if (code) claimAccessCode(code);
      });
    }

    window.addEventListener("online", function () {
      if (syncReady()) scheduleSync(500);
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible" && syncReady()) scheduleSync(1000);
    });

    if (notesClose) notesClose.addEventListener("click", closePanel);
    if (notesScrim) notesScrim.addEventListener("click", closePanel);
    if (notesNew) notesNew.addEventListener("click", startNew);
    if (notesExport) notesExport.addEventListener("click", exportAll);
    if (notesTrashButton) notesTrashButton.addEventListener("click", toggleTrashView);

    if (notesSearch) {
      var searchTimer = null;
      notesSearch.addEventListener("input", function () {
        window.clearTimeout(searchTimer);
        searchTimer = window.setTimeout(renderPanel, 120);
      });
      notesSearch.addEventListener("keydown", function (event) {
        if (event.key !== "Enter") return;
        var rows = visibleDocs();
        if (!rows.length) return;
        event.preventDefault();
        openDoc(rows[0]);
        closePanel();
      });
    }

    /* Geser untuk membuka daftar catatan
       ----------------------------------------------------------
       Di mode fokus bilah alat kerap tersembunyi, jadi daftar catatan
       dibuka dan ditutup dengan gestur: geser ke kanan membuka (panel
       memang muncul dari kiri), geser ke kiri menutup. Hanya gerakan
       mendatar yang cukup jauh yang dihitung, supaya gulir tegak dan
       pemilihan teks tetap berjalan seperti biasa.
       Layar sentuh memakai touch; papan sentuh memakai roda mendatar, dan
       dengan natural scroll menggeser jari ke kanan memberi deltaX negatif. */

    function isFocusView() {
      return state.focus !== "off" || isZenActive();
    }

    // arah 1 = geser ke kanan (buka), -1 = geser ke kiri (tutup)
    function swipeNotes(direction) {
      if (direction > 0) {
        if (!isPanelOpen()) openPanel();
        return;
      }
      if (isPanelOpen()) closePanel();
    }

    var swipeStart = null;
    var wheelSwipe = { x: 0, y: 0, time: 0 };

    function startSwipe(event) {
      swipeStart = null;
      if (!isFocusView() || hasOpenDialog()) return;
      if (event.touches.length !== 1) return;

      var touch = event.touches[0];
      swipeStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
    }

    function moveSwipe(event) {
      if (!swipeStart || event.touches.length !== 1) return;

      var touch = event.touches[0];
      var dx = touch.clientX - swipeStart.x;
      var dy = touch.clientY - swipeStart.y;

      if (Math.abs(dx) < 12) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) return;

      // Geser mendatar tidak boleh diteruskan ke browser: di Chrome gestur
      // ini bisa menjadi gulir ke samping atau tombol kembali. Setelah
      // tekanan lama (memilih teks) biarkan gerakan berjalan seperti biasa.
      if (Date.now() - swipeStart.time > 250) return;
      if (event.cancelable) event.preventDefault();
    }

    function endSwipe(event) {
      var start = swipeStart;
      swipeStart = null;
      if (!start) return;

      var touch = event.changedTouches && event.changedTouches[0];
      if (!touch) return;

      var dx = touch.clientX - start.x;
      var dy = touch.clientY - start.y;

      // Tekan lama lalu menggeser berarti memilih teks, bukan gestur.
      if (Date.now() - start.time > SWIPE_MAX_DURATION) return;
      if (Math.abs(dx) < SWIPE_MIN_DISTANCE) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.5) return;

      swipeNotes(dx > 0 ? 1 : -1);
    }

    function onSwipeWheel(event) {
      if (!isFocusView() || hasOpenDialog()) return;

      var now = Date.now();
      if (now - wheelSwipe.time > SWIPE_WHEEL_WINDOW) {
        wheelSwipe.x = 0;
        wheelSwipe.y = 0;
      }
      wheelSwipe.time = now;
      wheelSwipe.x += event.deltaX;
      wheelSwipe.y += event.deltaY;

      if (Math.abs(wheelSwipe.x) < SWIPE_WHEEL_DISTANCE) return;
      if (Math.abs(wheelSwipe.x) < Math.abs(wheelSwipe.y) * 2) return;

      var direction = wheelSwipe.x < 0 ? 1 : -1;
      wheelSwipe.x = 0;
      wheelSwipe.y = 0;
      swipeNotes(direction);
    }

    document.addEventListener("touchstart", startSwipe, { passive: true });
    document.addEventListener("touchmove", moveSwipe, { passive: false });
    document.addEventListener("touchend", endSwipe, { passive: true });
    document.addEventListener("touchcancel", function () { swipeStart = null; }, { passive: true });
    document.addEventListener("wheel", onSwipeWheel, { passive: true });

    if (notesImport && notesFile) {
      notesImport.addEventListener("click", function () {
        notesFile.value = "";
        notesFile.click();
      });
      notesFile.addEventListener("change", function () {
        var file = notesFile.files && notesFile.files[0];
        notesFile.value = "";
        importFile(file);
      });
    }

    if (notesList) {
      notesList.addEventListener("click", function (event) {
        var button = event.target.closest ? event.target.closest("[data-act]") : null;
        if (!button || !notesList.contains(button)) return;

        var action = button.getAttribute("data-act");
        if (action === "empty-trash") {
          emptyTrash();
          return;
        }

        var row = button.closest(".note-item");
        if (!row) return;

        var doc = findDoc(row.getAttribute("data-id"));
        if (!doc) return;

        if (action === "open") {
          if (current && current.id === doc.id) {
            closePanel();
            return;
          }
          openDoc(doc);
          closePanel();
          return;
        }

        if (action === "pin") togglePin(doc);
        else if (action === "rename") beginRename(row, doc);
        else if (action === "delete") deleteDoc(doc);
        else if (action === "restore") restoreDoc(doc);
        else if (action === "purge") purgeDoc(doc);
      });
    }

    document.addEventListener("keydown", function (event) {
      var key = event.key ? event.key.toLowerCase() : "";
      var modifier = event.metaKey || event.ctrlKey;

      if (modifier && !event.altKey && !event.shiftKey && key === "k") {
        if (hasOpenDialog()) return;
        event.preventDefault();
        if (isPanelOpen()) closePanel();
        else openPanel({ focusSearch: true });
        return;
      }

      // Ctrl/Cmd+S selama ini memicu dialog simpan browser; simpan saja
      // ke penyimpanan sendiri karena setiap perubahan sudah otomatis.
      if (modifier && !event.altKey && key === "s") {
        event.preventDefault();
        if (!commitCurrent()) setSaved("saved");
      }
    });

    if (toolbarTrigger) {
      toolbarTrigger.addEventListener("click", function () {
        if (isToolbarRevealed()) {
          setToolbarRevealed(false);
        } else {
          revealToolbar();
        }
      });
    }

    ["pointermove", "focusin", "keydown"].forEach(function (name) {
      toolbar.addEventListener(name, function () {
        if (isToolbarRevealed()) armToolbarHide();
      });
    });

    stage.addEventListener("pointerdown", function () {
      if (isToolbarRevealed()) setToolbarRevealed(false);
      // The link field belongs to the selection it was opened for; moving the
      // caret elsewhere means it is done.
      closeLinkField("bubble");
      closeLinkField("bar");
      hideBubble();
    });

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape") return;
      if (isFontDialogOpen()) {
        if (typeof fontDialog.showModal !== "function") {
          closeFontDialog();
          event.preventDefault();
        }
        return;
      }
      if (previewIsOpen()) {
        closePreview();
        event.preventDefault();
        return;
      }
      if (hasOpenDialog()) return;
      if (isPanelOpen()) {
        closePanel();
        event.preventDefault();
        return;
      }
      if (headingMenuOpen()) {
        closeHeadingMenu();
        area.focus({ preventScroll: true });
        event.preventDefault();
        return;
      }
      if (linkFieldOpen()) {
        closeLinkField("bubble");
        closeLinkField("bar");
        area.focus({ preventScroll: true });
        syncFormatBar();
        event.preventDefault();
        return;
      }
      if (formatBubble && !formatBubble.hidden) {
        hideBubble();
        event.preventDefault();
        return;
      }
      if (isToolbarRevealed()) {
        setToolbarRevealed(false);
        event.preventDefault();
        return;
      }
      if (isZenActive()) setZen(false);
    });

    window.addEventListener("resize", function () {
      syncKeyboard();
      syncZenViewport();
      grow();
      scheduleRender();
      kickCaret();
      syncFormatBar();
      if (formatBubble && !formatBubble.hidden) scheduleBubble();
    });

    /* -------------------------------------------------------------
       Pembaruan aplikasi

       Aset disajikan dari cache dulu lalu disegarkan di latar belakang,
       jadi build baru baru terpakai pada muat berikutnya. build.js dan
       version.json sama-sama membawa waktu build: kalau berbeda, ada
       aset baru menunggu. Tidak ada muat ulang otomatis — orang sedang
       menulis di sini, jadi pembaruan selalu ditawarkan, tidak dipaksa.
       ------------------------------------------------------------- */

    var updateButton = document.getElementById("writing-update");
    var updateAvailable = false;
    var updateBusy = false;
    var updateCheckedAt = 0;
    var UPDATE_CHECK_INTERVAL = 60000;
    var UPDATE_CACHE_PREFIX = "zen-write-";

    // Penanda dari tombol pembaruan hanya dipakai sekali untuk menembus cache
    // HTTP; buang dari bilah alamat supaya tautan tetap bersih.
    if (window.location.search.indexOf("v=") !== -1) {
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }

    function setUpdateLabel(state) {
      if (!updateButton) return;
      updateButton.dataset.state = state;
      updateButton.textContent = t(state === "working" ? "update.working" : "update.available");
    }

    function checkForUpdate() {
      var running = window.ZenWriteBuild;

      if (!updateButton || updateBusy || updateAvailable) return;
      if (!running || !navigator.onLine) return;
      if (Date.now() - updateCheckedAt < UPDATE_CHECK_INTERVAL) return;

      updateCheckedAt = Date.now();

      fetch("/zen-write/version.json", { cache: "no-store" })
        .then(function (response) {
          return response.ok ? response.json() : null;
        })
        .then(function (data) {
          if (!data || !data.build || data.build === running) return;
          updateAvailable = true;
          setUpdateLabel("ready");
          updateButton.hidden = false;
        })
        .catch(function () {
          // Tanpa jaringan tidak ada yang bisa diambil; coba lagi nanti.
        });
    }

    function applyUpdate() {
      if (updateBusy) return;

      if (!navigator.onLine) {
        toast(t("update.offline"));
        return;
      }

      updateBusy = true;
      if (updateButton) {
        updateButton.disabled = true;
        setUpdateLabel("working");
      }

      // Draf yang tertunda ditulis dulu: satu-satunya cara memakai aset baru
      // adalah memuat ulang, dan tulisan tidak boleh ikut hilang.
      commitCurrent();

      writeChain
        .catch(function () {})
        .then(function () {
          return caches.keys();
        })
        .then(function (keys) {
          return Promise.all(
            keys.filter(function (key) {
              return key.indexOf(UPDATE_CACHE_PREFIX) === 0;
            }).map(function (key) {
              return caches.delete(key);
            })
          );
        })
        .then(function () {
          return navigator.serviceWorker ? navigator.serviceWorker.getRegistration() : null;
        })
        .then(function (registration) {
          // Worker baru mengambil alih dan mem-precache aset terbaru; kalau
          // gagal, muat ulang tetap menarik aset dari jaringan.
          return registration ? registration.update() : null;
        })
        .then(function () {
          // Bukan reload biasa: GitHub Pages mengirim max-age panjang untuk
          // HTML, jadi reload bisa memutar ulang dokumen lama dan tombolnya
          // terasa tidak melakukan apa-apa. URL berpenanda belum pernah dilihat
          // cache HTTP, jadi permintaan ini pasti sampai ke server.
          var url = new URL(window.location.href);
          url.searchParams.set("v", Date.now().toString(36));
          window.location.replace(url.toString());
        })
        .catch(function () {
          updateBusy = false;
          if (!updateButton) return;
          updateButton.disabled = false;
          setUpdateLabel("ready");
          toast(t("update.failed"));
        });
    }

    if (updateButton) {
      updateButton.addEventListener("click", applyUpdate);

      document.addEventListener("visibilitychange", function () {
        if (document.visibilityState === "visible") checkForUpdate();
      });

      window.addEventListener("online", checkForUpdate);
    }

    window.addEventListener("beforeunload", function () {
      commitCurrent();
    });

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") commitCurrent();
    });

    window.addEventListener("pagehide", commitCurrent);

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        grow();
        scheduleRender();
      });
    }

    syncKeyboard();
    boot();
    setZen(true);
    checkForUpdate();
  });
})();
