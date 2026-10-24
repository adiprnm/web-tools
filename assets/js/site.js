(function () {
  "use strict";

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  var THEME_KEY = "perkakas-theme";
  var root = document.documentElement;
  var themeToggle = document.querySelector("[data-theme-toggle]");
  var themeColorMeta = document.querySelector('meta[name="theme-color"]');
  var darkQuery = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function readStoredTheme() {
    try {
      var value = localStorage.getItem(THEME_KEY);
      return value === "dark" || value === "light" ? value : null;
    } catch (error) {
      return null;
    }
  }

  function systemTheme() {
    return darkQuery && darkQuery.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    root.dataset.theme = theme;

    if (themeColorMeta) {
      var color = theme === "dark" ? root.dataset.themeColorDark : root.dataset.themeColorLight;
      if (color) themeColorMeta.setAttribute("content", color);
    }

    if (themeToggle) {
      var label = theme === "dark" ? "Mode terang" : "Mode gelap";
      themeToggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
      themeToggle.setAttribute("aria-label", label);
      themeToggle.setAttribute("title", label);
    }
  }

  // Mode gelap hanya diaktifkan di halaman yang memang punya tombolnya
  // (Zen Write). Halaman lain selalu memakai tema terang.
  if (themeToggle) {
    applyTheme(readStoredTheme() || systemTheme());

    themeToggle.addEventListener("click", function () {
      var next = root.dataset.theme === "dark" ? "light" : "dark";
      applyTheme(next);
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (error) {
        // localStorage bisa diblokir; tema tetap berlaku untuk sesi ini.
      }
    });

    if (darkQuery) {
      var onSchemeChange = function (event) {
        // Ikuti sistem hanya bila pengunjung belum memilih sendiri.
        if (!readStoredTheme()) applyTheme(event.matches ? "dark" : "light");
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
    copy: copyText
  };
})();
