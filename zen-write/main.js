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
  var TOOLBAR_HIDE_DELAY = 2800;
  var TOOLBAR_HINT_DELAY = 2000;
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
    var fontChoices = Array.prototype.slice.call(document.querySelectorAll('input[name="writing-font"]'));

    var state = { focus: "off", font: "sans" };
    var saveTimer = null;
    var renderFrame = null;
    var ensureFrame = null;
    var caretGuardUntil = 0;
    var caretKickTimers = [];
    var toolbarHideTimer = null;
    var zenHintTimer = null;

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
          font: state.font,
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
        overlays: scanHeadings(text, fences)
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

    function renderActiveRange(text, from, to, position) {
      var segments = styleSegments(text, from, to);
      var caret = Math.max(from, Math.min(position, to));
      var probeInserted = false;

      segments.forEach(function (segment) {
        var classes = ["writing-active"].concat(segment.classes).join(" ");

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

      if (!isFocus) {
        appendText(text.slice(0, position));
        mirror.appendChild(makeProbe());
        appendText(text.slice(position));
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

    function setToolbarRevealed(revealed, hideDelay) {
      var next = Boolean(revealed) && isZenActive();

      document.body.classList.toggle("is-toolbar-revealed", next);
      if (toolbarTrigger) {
        var label = next ? "Sembunyikan alat tulis" : "Tampilkan alat tulis";

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
      if (Date.now() < caretGuardUntil && document.activeElement === area) {
        scheduleEnsureVisible();
      }
    }

    function syncFontChoices() {
      fontChoices.forEach(function (input) {
        input.checked = input.value === state.font;
      });

      if (fontButton) {
        var label = "Jenis huruf: " + (FONT_LABELS[state.font] || FONT_LABELS.sans);
        fontButton.setAttribute("aria-label", label);
        fontButton.setAttribute("title", label);
      }
    }

    function isFontDialogOpen() {
      return !!fontDialog && (fontDialog.open || fontDialog.hasAttribute("open"));
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

      if (options.persist !== false) queueSave();
    }

    function applyFocus(mode) {
      state.focus = FOCUS_MODES.indexOf(mode) >= 0 ? mode : "off";
      syncFocusButtons();
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
      if (draft) {
        state.font = FONT_MODES.indexOf(draft.font) >= 0 ? draft.font : "sans";
      }

      syncFocusButtons();
      applyFont(state.font, { silent: true, persist: false });

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
          if (!isZenActive() || isToolbarRevealed() || document.activeElement === area) return;
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
      if ((event.metaKey || event.ctrlKey) && state.focus !== "off") {
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

    if (fontButton) fontButton.addEventListener("click", openFontDialog);
    if (fontCloseButton) fontCloseButton.addEventListener("click", closeFontDialog);

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
