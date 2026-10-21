(function () {
  "use strict";

  var STORAGE_KEY = "zen-write:v1";
  var LEGACY_STORAGE_KEY = "tulis-tenang:v1";
  var SAVE_DELAY = 500;
  var WORDS_PER_MINUTE = 200;
  var FOCUS_MODES = ["off", "sentence", "paragraph"];

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

    function appendPart(text, className) {
      if (!text) return;
      var span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      mirror.appendChild(span);
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

    function renderFocus() {
      var text = area.value;
      var isFocus = state.focus !== "off" && text.length > 0;

      stage.classList.toggle("is-focus", isFocus);
      stage.classList.toggle("is-empty", text.length === 0);

      if (!isFocus) {
        mirror.textContent = "";
        return;
      }

      var range = state.focus === "sentence"
        ? sentenceRange(text, area.selectionStart)
        : paragraphRange(text, area.selectionStart);

      mirror.textContent = "";
      appendPart(text.slice(0, range[0]), "writing-dim");
      appendPart(text.slice(range[0], range[1]), "writing-active");
      appendPart(text.slice(range[1]), "writing-dim");
    }

    function scheduleRender() {
      if (renderFrame) return;
      renderFrame = window.requestAnimationFrame(function () {
        renderFrame = null;
        renderFocus();
      });
    }

    function applyFocus(mode) {
      state.focus = FOCUS_MODES.indexOf(mode) >= 0 ? mode : "off";
      focusButtons.forEach(function (button) {
        button.setAttribute("aria-pressed", String(button.getAttribute("data-focus") === state.focus));
      });
      renderFocus();
      queueSave();
      area.focus();
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
      renderFocus();
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
      renderFocus();
      saveNow();
      setSaved("Draf baru");
      area.focus();
    }

    function isFullscreen() {
      return document.fullscreenElement === room || document.body.classList.contains("is-zen");
    }

    function updateFullscreenButton() {
      var active = isFullscreen();
      var label = active ? "Keluar layar penuh" : "Layar penuh";
      var iconUse = fullscreenButton.querySelector("use");

      fullscreenButton.setAttribute("aria-label", label);
      fullscreenButton.setAttribute("title", label);
      if (iconUse) iconUse.setAttribute("href", active ? "#i-fullscreen-exit" : "#i-fullscreen");
    }

    function fallbackZen(enabled) {
      document.body.classList.toggle("is-zen", enabled);
      updateFullscreenButton();
      window.setTimeout(grow, 50);
    }

    function toggleFullscreen() {
      if (document.fullscreenElement) {
        document.exitFullscreen();
        return;
      }

      if (document.body.classList.contains("is-zen")) {
        fallbackZen(false);
        return;
      }

      if (room.requestFullscreen) {
        room.requestFullscreen().then(function () {
          updateFullscreenButton();
          window.setTimeout(grow, 50);
        }).catch(function () {
          fallbackZen(true);
        });
      } else {
        fallbackZen(true);
      }
    }

    area.addEventListener("input", function () {
      updateStats();
      grow();
      scheduleRender();
      queueSave();
    });

    area.addEventListener("click", scheduleRender);
    area.addEventListener("keyup", scheduleRender);

    document.addEventListener("selectionchange", function () {
      if (document.activeElement === area) scheduleRender();
    });

    focusButtons.forEach(function (button) {
      button.addEventListener("click", function () {
        applyFocus(button.getAttribute("data-focus"));
      });
    });

    fullscreenButton.addEventListener("click", toggleFullscreen);
    copyButton.addEventListener("click", copy);
    downloadButton.addEventListener("click", download);
    newButton.addEventListener("click", startNew);

    document.addEventListener("fullscreenchange", function () {
      updateFullscreenButton();
      window.setTimeout(grow, 50);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && document.body.classList.contains("is-zen")) {
        fallbackZen(false);
      }
    });

    window.addEventListener("resize", function () {
      grow();
      scheduleRender();
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
    updateFullscreenButton();
  });
})();
