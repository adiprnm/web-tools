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
    var toolbar = document.getElementById("writing-toolbar");
    var toolbarTrigger = document.getElementById("writing-toolbar-trigger");
    var stage = document.getElementById("writing-stage");
    var mirror = document.getElementById("writing-mirror");
    var wordsEl = document.getElementById("writing-words");
    var charsEl = document.getElementById("writing-chars");
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
        })
        .catch(function () {
          openDoc(createDoc(""), { silent: true, skipFlush: true });
          setSaved("unavailable");
          toast(t("toast.noStorage"));
        });
    }

    function updateStats() {
      var text = area.value;
      var words = text.trim() ? text.trim().split(/\s+/).length : 0;

      wordsEl.textContent = words;
      charsEl.textContent = text.length;
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
    var ESCAPABLE = "\\`*_{}[]()#+-.!~<>";

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
              overlays.push({ start: markerEnd, end: lineEnd, classes: ["md-heading"] });
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

      if (char === "+" && text.charAt(start + 1) === "+") {
        return matchEmphasis(text, start, to, "++", ["md-underline"]);
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
        overlays: scanHeadings(text, fences).concat(scanLists(text, fences))
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
    }

    function revealToolbar() {
      window.clearTimeout(zenHintTimer);
      zenHintTimer = null;
      setToolbarRevealed(true);
    }

    function scrollContainer() {
      return document.body.classList.contains("is-zen") ? room : null;
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
      setSaved(lastSavedKey);
    }

    function applyLanguage(code) {
      if (!i18n) return;

      i18n.setLang(code);
      syncLanguage();
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

    function syncZenViewport() {
      if (!document.body.classList.contains("is-zen")) return;

      var viewport = window.visualViewport;
      var box = viewport
        ? { top: viewport.offsetTop, left: viewport.offsetLeft, width: viewport.width, height: viewport.height }
        : { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

      // visualViewport can scroll every frame; rewriting the same box would
      // invalidate layout each time, so only touch the styles when they move.
      if (box.top === viewportBox.top
        && box.left === viewportBox.left
        && box.width === viewportBox.width
        && box.height === viewportBox.height) {
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

    area.addEventListener("keydown", function (event) {
      if (event.key !== "Enter") return;
      if (event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return;
      // Never fight an IME composition or a replaced selection.
      if (event.isComposing || event.keyCode === 229) return;
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
      updateStats();
      grow();
      kickCaret();
      scheduleRender();
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
    });

    area.addEventListener("keyup", function () {
      kickCaret();
      scheduleRender();
    });

    area.addEventListener("focus", kickCaret);

    document.addEventListener("selectionchange", function () {
      if (document.activeElement === area) {
        kickCaret();
        scheduleRender();
      }
    });

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", function () {
        syncZenViewport();
        kickCaret();
        scheduleEnsureVisible();
      });
      window.visualViewport.addEventListener("scroll", function () {
        syncZenViewport();
        handleCaretScroll();
      });
    }

    window.addEventListener("scroll", handleCaretScroll, { passive: true });
    room.addEventListener("scroll", handleCaretScroll, { passive: true });
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

    /* Daftar catatan
       ---------------------------------------------------------- */

    [notesToggle, notesTrigger].forEach(function (button) {
      if (!button) return;
      button.addEventListener("click", function () {
        if (isPanelOpen()) closePanel();
        else openPanel();
      });
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
      if (hasOpenDialog()) return;
      if (isPanelOpen()) {
        closePanel();
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
      syncZenViewport();
      grow();
      scheduleRender();
      kickCaret();
    });

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

    boot();
    setZen(true);
  });
})();
