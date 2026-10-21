(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/zen-write/service-worker.js").catch(function () {
        // PWA offline mode tidak tersedia; alat tetap bisa dipakai.
      });
    });
  }

  var STORAGE_KEY = "zen-write:v1";
  var LEGACY_STORAGE_KEY = "tulis-tenang:v1";
  var SAVE_DELAY = 500;
  var WORDS_PER_MINUTE = 200;
  var FOCUS_MODES = ["off", "sentence", "paragraph"];
  var isFirefoxMobile = /Firefox|FxiOS/i.test(navigator.userAgent) && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  var sentenceSegmenter = null;
  try {
    if (typeof Intl !== "undefined" && Intl.Segmenter) {
      sentenceSegmenter = new Intl.Segmenter("id", { granularity: "sentence" });
    }
  } catch (error) {
    sentenceSegmenter = null;
  }

  document.addEventListener("DOMContentLoaded", function () {
    var area = document.getElementById("writing-area");
    if (!area) return;

    var room = document.getElementById("writing-room");
    var toolbar = room.querySelector(".writing-toolbar");
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

    var state = { focus: "off" };
    var saveTimer = null;
    var renderFrame = null;
    var ensureFrame = null;
    var caretGuardUntil = 0;
    var caretKickTimers = [];

    function toast(message) {
      if (window.Perkakas) window.Perkakas.toast(message);
    }

    function setSaved(message) {
      savedEl.textContent = message;
    }

    function readDraft() {
      try {
        var raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) {
          var legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
          if (legacy) {
            localStorage.setItem(STORAGE_KEY, legacy);
            localStorage.removeItem(LEGACY_STORAGE_KEY);
            raw = legacy;
          }
        }
        return JSON.parse(raw || "null");
      } catch (error) {
        return null;
      }
    }

    function writeDraft() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
          body: area.value,
          focus: state.focus,
          updatedAt: Date.now()
        }));
        setSaved("Tersimpan");
        return true;
      } catch (error) {
        setSaved("Tidak bisa menyimpan");
        return false;
      }
    }

    function queueSave() {
      setSaved("Menyimpan…");
      window.clearTimeout(saveTimer);
      saveTimer = window.setTimeout(function () {
        saveTimer = null;
        writeDraft();
      }, SAVE_DELAY);
    }

    function saveNow() {
      window.clearTimeout(saveTimer);
      saveTimer = null;
      writeDraft();
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
      return probe;
    }

    function appendSegment(text, start, end, className, position) {
      var before = text.slice(start, position);
      var after = text.slice(position, end);

      if (className) {
        var span = document.createElement("span");
        span.className = className;
        if (before) span.appendChild(document.createTextNode(before));
        span.appendChild(makeProbe());
        if (after) span.appendChild(document.createTextNode(after));
        mirror.appendChild(span);
      } else {
        if (before) mirror.appendChild(document.createTextNode(before));
        mirror.appendChild(makeProbe());
        if (after) mirror.appendChild(document.createTextNode(after));
      }
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

    function renderMirror() {
      var text = area.value;
      var position = Math.max(0, Math.min(area.selectionStart, text.length));
      var isFocus = state.focus !== "off" && text.length > 0;

      stage.classList.toggle("is-focus", isFocus);
      stage.classList.toggle("is-empty", text.length === 0);

      var ranges;
      if (isFocus) {
        var range = state.focus === "sentence"
          ? sentenceRange(text, position)
          : paragraphRange(text, position);
        ranges = [
          [0, range[0], "writing-dim"],
          [range[0], range[1], "writing-active"],
          [range[1], text.length, "writing-dim"]
        ];
      } else {
        ranges = [[0, text.length, ""]];
      }

      mirror.textContent = "";
      var probeInserted = false;

      ranges.forEach(function (part) {
        var start = part[0];
        var end = part[1];
        var className = part[2];

        if (probeInserted || position < start || position > end) {
          appendText(text.slice(start, end), className);
          return;
        }

        appendSegment(text, start, end, className, position);
        probeInserted = true;
      });

      if (!probeInserted) mirror.appendChild(makeProbe());
    }

    function isZenActive() {
      return document.body.classList.contains("is-zen") || document.body.classList.contains("is-zen-flow");
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
      if (Date.now() < caretGuardUntil && document.activeElement === area) {
        scheduleEnsureVisible();
      }
    }

    function applyFocus(mode) {
      state.focus = FOCUS_MODES.indexOf(mode) >= 0 ? mode : "off";
      focusButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-focus") === state.focus));
      });
      area.focus({ preventScroll: true });
      kickCaret();
      scheduleRender();
      queueSave();
    }

    function restore() {
      var draft = readDraft();
      if (draft && typeof draft.body === "string") {
        area.value = draft.body;
        state.focus = FOCUS_MODES.indexOf(draft.focus) >= 0 ? draft.focus : "off";
      }

      focusButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-focus") === state.focus));
      });

      updateStats();
      grow();
      renderMirror();
      setSaved(draft && draft.body ? "Draf dipulihkan" : "Siap");
    }

    function copy() {
      var text = area.value;
      if (!text.trim()) {
        toast("Belum ada tulisan untuk disalin.");
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
        toast("Belum ada tulisan untuk diunduh.");
        return;
      }

      var firstLine = text.split("\n").find(function (line) { return line.trim().length > 0; });
      var name = (firstLine || "tanpa-judul")
        .trim()
        .slice(0, 60)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

      var blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = (name || "tanpa-judul") + ".txt";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      toast("Tulisan diunduh.");
    }

    function startNew() {
      if (area.value.trim() && !window.confirm("Mulai dokumen baru? Draf saat ini akan dihapus.")) {
        return;
      }

      area.value = "";
      updateStats();
      grow();
      renderMirror();
      saveNow();
      setSaved("Draf baru");
      area.focus();
      kickCaret();
      scheduleRender();
    }

    function updateFullscreenButton() {
      var active = isZenActive();
      var label = active ? "Keluar layar penuh" : "Layar penuh";
      var iconUse = fullscreenButton.querySelector("use");

      fullscreenButton.setAttribute("aria-label", label);
      fullscreenButton.setAttribute("title", label);
      if (iconUse) iconUse.setAttribute("href", active ? "#i-fullscreen-exit" : "#i-fullscreen");
    }

    function syncZenViewport() {
      if (!document.body.classList.contains("is-zen")) return;

      var viewport = window.visualViewport;
      if (viewport) {
        room.style.top = viewport.offsetTop + "px";
        room.style.left = viewport.offsetLeft + "px";
        room.style.width = viewport.width + "px";
        room.style.height = viewport.height + "px";
      } else {
        room.style.top = "0px";
        room.style.left = "0px";
        room.style.width = "100%";
        room.style.height = window.innerHeight + "px";
      }

      room.style.right = "auto";
      room.style.bottom = "auto";
    }

    function setZen(enabled) {
      var useFlow = enabled && isFirefoxMobile;

      document.body.classList.toggle("is-zen", enabled && !useFlow);
      document.body.classList.toggle("is-zen-flow", useFlow);
      if (!enabled) document.body.classList.remove("zen-boot");

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
    }

    function toggleFullscreen() {
      setZen(!isZenActive());
    }

    area.addEventListener("input", function () {
      updateStats();
      grow();
      kickCaret();
      scheduleRender();
      queueSave();
    });

    area.addEventListener("click", function () {
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
        scheduleEnsureVisible();
      });
    }

    window.addEventListener("scroll", handleCaretScroll, { passive: true });
    room.addEventListener("scroll", handleCaretScroll, { passive: true });

    focusButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        applyFocus(button.getAttribute("data-focus"));
      });
    });

    fullscreenButton.addEventListener("click", toggleFullscreen);
    copyButton.addEventListener("click", copy);
    downloadButton.addEventListener("click", download);
    newButton.addEventListener("click", startNew);

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && isZenActive()) {
        setZen(false);
      }
    });

    window.addEventListener("resize", function () {
      syncZenViewport();
      grow();
      scheduleRender();
      kickCaret();
    });

    window.addEventListener("beforeunload", function () {
      if (saveTimer) {
        window.clearTimeout(saveTimer);
        writeDraft();
      }
    });

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () {
        grow();
        scheduleRender();
      });
    }

    restore();
    setZen(true);
  });
})();
