(function () {
  "use strict";

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  var THEME_KEY = "perkakas-theme";
  var THEMES = {
    paper: { name: "Kertas", color: "#f4f5f1" },
    warm: { name: "Hangat", color: "#f6efe3" },
    dusk: { name: "Senja", color: "#17120f" },
    night: { name: "Malam", color: "#101310" }
  };
  var THEME_ALIASES = { light: "paper", dark: "night" };
  var root = document.documentElement;
  var themeOpeners = Array.prototype.slice.call(document.querySelectorAll("[data-theme-open]"));
  var themeDialog = document.querySelector("[data-theme-dialog]");
  var themeClose = document.querySelector("[data-theme-close]");
  var themeChoices = Array.prototype.slice.call(document.querySelectorAll('input[name="perkakas-theme"]'));
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function normalizeTheme(value) {
    if (Object.prototype.hasOwnProperty.call(THEMES, value)) return value;
    return THEME_ALIASES[value] || null;
  }

  function readStoredTheme() {
    try {
      return normalizeTheme(localStorage.getItem(THEME_KEY));
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return darkQuery && darkQuery.matches ? "night" : "paper";
  }

  function syncThemeChoices() {
    themeChoices.forEach(function (input) {
      input.checked = input.value === root.dataset.theme;
    });
  }

  function applyTheme(theme) {
    var next = normalizeTheme(theme) || "paper";
    var meta = THEMES[next];

    root.dataset.theme = next;

    if (themeColorMeta) themeColorMeta.setAttribute("content", meta.color);

    themeOpeners.forEach(function (button) {
      var label = "Tema tampilan: " + meta.name;
      button.setAttribute("aria-label", label);
      button.setAttribute("title", label);
    });

    syncThemeChoices();
  }

  function storeTheme(theme) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (error) {
      // localStorage bisa diblokir; tema tetap berlaku untuk sesi ini.
    }
  }

  function setTheme(theme, options) {
    applyTheme(theme);
    if (!options || !options.skipStore) storeTheme(root.dataset.theme);
  }

  function isThemeDialogOpen() {
    return !!themeDialog && (themeDialog.open || themeDialog.hasAttribute("open"));
  }

  function openThemeDialog() {
    if (!themeDialog) return;
    syncThemeChoices();

    if (typeof themeDialog.showModal === "function") {
      if (!themeDialog.open) themeDialog.showModal();
    } else {
      themeDialog.setAttribute("open", "");
    }

    var current = themeDialog.querySelector('input[name="perkakas-theme"]:checked');
    if (current) current.focus({ preventScroll: true });
  }

  function closeThemeDialog() {
    if (!themeDialog) return;

    if (typeof themeDialog.close === "function") {
      if (themeDialog.open) themeDialog.close();
    } else {
      themeDialog.removeAttribute("open");
    }
  }

  // Pemilih tema hanya diaktifkan di halaman yang memang punya tombolnya
  // (Zen Write). Halaman lain selalu memakai tema terang.
  if (themeOpeners.length) {
    applyTheme(readStoredTheme() || systemTheme());

    themeOpeners.forEach(function (button) {
      button.addEventListener("click", openThemeDialog);
    });

    if (themeClose) themeClose.addEventListener("click", closeThemeDialog);

    if (themeDialog) {
      themeDialog.addEventListener("click", function (event) {
        if (event.target === themeDialog) closeThemeDialog();
      });
    }

    document.addEventListener("keydown", function (event) {
      if (event.key !== "Escape" || !isThemeDialogOpen()) return;
      // Dialog modal menutup dirinya sendiri; hanya fallback yang butuh bantuan.
      if (typeof themeDialog.showModal !== "function") {
        closeThemeDialog();
        event.preventDefault();
      }
    });

    themeChoices.forEach(function (input) {
      input.addEventListener("change", function () {
        if (!input.checked) return;
        setTheme(input.value);
        closeThemeDialog();
      });
    });

    if (darkQuery) {
      var onSchemeChange = function (event) {
        // Ikuti sistem hanya bila pengunjung belum memilih sendiri.
        if (!readStoredTheme()) applyTheme(event.matches ? "night" : "paper");
      };

      if (darkQuery.addEventListener) {
        darkQuery.addEventListener("change", onSchemeChange);
      } else if (darkQuery.addListener) {
        darkQuery.addListener(onSchemeChange);
      }
    }
  }

  function showToast(message, tone) {
    if (!toastEl || !message) return;

    window.clearTimeout(toastTimer);
    toastEl.textContent = message;
    toastEl.dataset.tone = tone || "ok";
    toastEl.classList.add("is-visible");

    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove("is-visible");
    }, 2400);
  }

  function fallbackCopy(text) {
    var field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();

    var succeeded = false;
    try {
      succeeded = document.execCommand("copy");
    } catch (error) {
      succeeded = false;
    }

    document.body.removeChild(field);
    return succeeded;
  }

  function copyText(text) {
    if (!text) {
      showToast("Tidak ada teks untuk disalin.", "error");
      return Promise.resolve(false);
    }

    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(
        function () {
          showToast("Disalin ke papan klip.");
          return true;
        },
        function () {
          if (fallbackCopy(text)) {
            showToast("Disalin ke papan klip.");
            return true;
          }
          showToast("Tidak bisa menyalin. Pilih teksnya secara manual.", "error");
          return false;
        }
      );
    }

    if (fallbackCopy(text)) {
      showToast("Disalin ke papan klip.");
      return Promise.resolve(true);
    }

    showToast("Tidak bisa menyalin. Pilih teksnya secara manual.", "error");
    return Promise.resolve(false);
  }

  function setCopyLabel(button) {
    var label = button.querySelector(".btn-label");
    if (!label) return;

    if (!button.dataset.originalLabel) {
      button.dataset.originalLabel = label.textContent;
    }

    label.textContent = "Disalin";
    window.setTimeout(function () {
      label.textContent = button.dataset.originalLabel;
    }, 1600);
  }

  document.addEventListener("click", function (event) {
    var button = event.target.closest("[data-copy]");
    if (!button) return;

    var selector = button.getAttribute("data-copy");
    var value = button.getAttribute("data-copy-value");
    var target = selector ? document.querySelector(selector) : null;
    var text = value != null ? value : target ? target.innerText : "";

    copyText(text).then(function (copied) {
      if (copied) setCopyLabel(button);
    });
  });

  window.Perkakas = {
    toast: showToast,
    copy: copyText,
    setTheme: setTheme
  };
})();
