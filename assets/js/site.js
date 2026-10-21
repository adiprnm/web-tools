(function () {
  "use strict";

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

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
