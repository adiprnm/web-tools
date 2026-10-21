(function () {
  "use strict";

  var STORAGE = {
    link: "link",
    guestKey: "guest_key",
    guests: "guests",
    template: "message_template",
    index: "current_index"
  };

  var SEND_URL = "/share-undangan/kirim/";
  var DONE_URL = "/share-undangan/done/";
  var SETUP_URL = "/share-undangan/";

  function read(key, fallback) {
    try {
      var value = localStorage.getItem(key);
      return value == null ? fallback : value;
    } catch (error) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      // localStorage bisa diblokir; biarkan halaman tetap berjalan.
    }
  }

  function guestsFromStorage() {
    try {
      var list = JSON.parse(read(STORAGE.guests, "[]"));
      return Array.isArray(list) ? list : [];
    } catch (error) {
      return [];
    }
  }

  function normalizeLink(value) {
    var trimmed = value.trim();
    if (!trimmed) return "";
    if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)) return trimmed;
    return "https://" + trimmed;
  }

  function normalizeGuests(value) {
    return value
      .split("\n")
      .map(function (line) { return line.trim(); })
      .filter(function (line) { return line.length > 0; });
  }

  function guestLink(base, key, guest) {
    try {
      var url = new URL(base);
      url.searchParams.set(key, guest);
      return url.toString();
    } catch (error) {
      var separator = base.indexOf("?") >= 0 ? "&" : "?";
      return base + separator + encodeURIComponent(key) + "=" + encodeURIComponent(guest);
    }
  }

  function messageFor(guest, index) {
    var template = read(STORAGE.template, "");
    var base = read(STORAGE.link, "");
    var key = read(STORAGE.guestKey, "to") || "to";
    var list = guestsFromStorage();
    var name = guest || list[index] || "";

    return template
      .replace(/<nama_tamu>/g, name)
      .replace(/<link_undangan>/g, guestLink(base, key, name));
  }

  function currentMessage() {
    var index = parseInt(read(STORAGE.index, "0"), 10);
    if (isNaN(index) || index < 0) index = 0;
    return messageFor(null, index);
  }

  function setupIndexPage() {
    var form = document.getElementById("invite-form");
    if (!form) return;

    var linkInput = document.getElementById("invite-link");
    var keyInput = document.getElementById("guest-key");
    var guestsInput = document.getElementById("invite-guests");
    var templateInput = document.getElementById("invite-template");
    var saveButton = document.getElementById("invite-save");
    var linkError = document.getElementById("invite-link-error");
    var keyError = document.getElementById("invite-key-error");
    var guestsError = document.getElementById("invite-guests-error");
    var templateError = document.getElementById("invite-template-error");

    function clearErrors() {
      linkError.textContent = "";
      keyError.textContent = "";
      guestsError.textContent = "";
      templateError.textContent = "";
    }

    function validate() {
      clearErrors();
      var valid = true;
      var link = normalizeLink(linkInput.value);
      var key = keyInput.value.trim();
      var guests = normalizeGuests(guestsInput.value);
      var template = templateInput.value;

      if (!link) {
        linkError.textContent = "Masukkan link undangan.";
        valid = false;
      } else {
        try {
          new URL(link);
        } catch (error) {
          linkError.textContent = "Link harus berupa alamat lengkap, misalnya https://kanyaah.com/fulanah-fulan.";
          valid = false;
        }
      }

      if (!key) {
        keyError.textContent = "Masukkan nama parameter, misalnya to.";
        valid = false;
      }

      if (!guests.length) {
        guestsError.textContent = "Isi setidaknya satu nama tamu.";
        valid = false;
      }

      if (!template) {
        templateError.textContent = "Template pesan tidak boleh kosong.";
        valid = false;
      } else if (template.indexOf("<nama_tamu>") < 0) {
        templateError.textContent = "Template harus memuat <nama_tamu>.";
        valid = false;
      } else if (template.indexOf("<link_undangan>") < 0) {
        templateError.textContent = "Template harus memuat <link_undangan>.";
        valid = false;
      }

      if (!valid) {
        var firstError = form.querySelector(".field-error:not(:empty)");
        if (firstError) {
          var field = firstError.parentElement.querySelector("input, textarea");
          if (field) field.focus();
        }
      }

      return valid;
    }

    function save() {
      linkInput.value = normalizeLink(linkInput.value);
      write(STORAGE.link, linkInput.value);
      write(STORAGE.guestKey, keyInput.value.trim() || "to");
      write(STORAGE.guests, JSON.stringify(normalizeGuests(guestsInput.value)));
      write(STORAGE.template, templateInput.value);
      write(STORAGE.index, "0");
    }

    function restore() {
      var link = read(STORAGE.link, "");
      if (link) linkInput.value = link;

      var key = read(STORAGE.guestKey, "");
      if (key) keyInput.value = key;

      var guests = guestsFromStorage();
      if (guests.length) guestsInput.value = guests.join("\n");

      var template = read(STORAGE.template, "");
      if (template) templateInput.value = template;
    }

    saveButton.addEventListener("click", function () {
      if (!validate()) return;
      save();
      window.Perkakas.toast("Daftar tamu disimpan di browser ini.");
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!validate()) return;
      save();
      window.location.href = SEND_URL;
    });

    [linkInput, keyInput, guestsInput, templateInput].forEach(function (field) {
      field.addEventListener("input", clearErrors);
    });

    restore();
  }

  function setupSendPage() {
    var messageEl = document.getElementById("invite-message");
    if (!messageEl) return;

    var stepEl = document.getElementById("invite-step");
    var guestEl = document.getElementById("invite-guest");
    var sendButton = document.getElementById("invite-send");
    var nextButton = document.getElementById("invite-next");
    var emptyEl = document.getElementById("invite-empty");
    var panelEl = document.getElementById("invite-panel");

    var guests = guestsFromStorage();
    var index = parseInt(read(STORAGE.index, "0"), 10);
    if (isNaN(index) || index < 0) index = 0;

    if (!guests.length || !read(STORAGE.template, "")) {
      if (panelEl) panelEl.hidden = true;
      if (emptyEl) emptyEl.hidden = false;
      return;
    }

    if (index >= guests.length) {
      window.location.replace(DONE_URL);
      return;
    }

    var message = messageFor(null, index);
    messageEl.textContent = message;
    stepEl.textContent = "Tamu " + (index + 1) + " dari " + guests.length;
    guestEl.textContent = guests[index];

    sendButton.addEventListener("click", function () {
      window.open("https://wa.me/?text=" + encodeURIComponent(message), "_blank", "noopener");
    });

    nextButton.addEventListener("click", function () {
      index += 1;
      write(STORAGE.index, String(index));

      if (index >= guests.length) {
        window.location.href = DONE_URL;
      } else {
        window.location.href = SEND_URL;
      }
    });
  }

  function setupDonePage() {
    var restart = document.getElementById("invite-restart");
    if (!restart) return;

    restart.addEventListener("click", function (event) {
      event.preventDefault();
      write(STORAGE.index, "0");
      window.location.href = SEND_URL;
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    setupIndexPage();
    setupSendPage();
    setupDonePage();
  });
})();
