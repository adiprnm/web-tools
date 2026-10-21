(function () {
  "use strict";

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/item-saver/service-worker.js").catch(function () {
        // Mode offline tidak tersedia; alat tetap bisa dipakai.
      });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    var listEl = document.getElementById("item-list");
    if (!listEl) return;

    var searchInput = document.getElementById("item-search");
    var countEl = document.getElementById("item-count");
    var addButton = document.getElementById("item-add");
    var exportButton = document.getElementById("item-export");
    var importButton = document.getElementById("item-import-button");
    var importInput = document.getElementById("item-import");

    var dialog = document.getElementById("item-dialog");
    var dialogTitle = document.getElementById("item-dialog-title");
    var form = document.getElementById("item-form");
    var idInput = document.getElementById("item-id");
    var nameInput = document.getElementById("item-name");
    var contentInput = document.getElementById("item-content");
    var nameError = document.getElementById("item-name-error");
    var contentError = document.getElementById("item-content-error");
    var closeButton = document.getElementById("item-close");
    var cancelButton = document.getElementById("item-cancel");

    function readItems() {
      try {
        var list = JSON.parse(localStorage.getItem("contents") || "[]");
        return Array.isArray(list) ? list : [];
      } catch (error) {
        return [];
      }
    }

    function writeItems(items) {
      try {
        localStorage.setItem("contents", JSON.stringify(items));
        var lastId = items.reduce(function (max, item) {
          return Math.max(max, Number(item.id) || 0);
        }, 0);
        localStorage.setItem("lastId", String(lastId));
        return true;
      } catch (error) {
        if (window.Perkakas) window.Perkakas.toast("Penyimpanan browser penuh atau diblokir.", "error");
        return false;
      }
    }

    function nextId() {
      var last = parseInt(localStorage.getItem("lastId") || "0", 10);
      if (isNaN(last)) last = 0;
      return last + 1;
    }

    function iconButton(icon, label, modifier) {
      var button = document.createElement("button");
      button.type = "button";
      button.className = "icon-btn" + (modifier ? " " + modifier : "");
      button.setAttribute("aria-label", label);
      button.title = label;
      button.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-' + icon + '"></use></svg>';
      return button;
    }

    function emptyState(title, message) {
      var wrapper = document.createElement("div");
      wrapper.className = "empty-state";

      var heading = document.createElement("p");
      heading.textContent = title;
      wrapper.appendChild(heading);

      if (message) {
        var copy = document.createElement("p");
        copy.textContent = message;
        copy.style.marginTop = "4px";
        wrapper.appendChild(copy);
      }

      return wrapper;
    }

    function render() {
      var query = searchInput.value.trim().toLowerCase();
      var items = readItems();
      var filtered = query
        ? items.filter(function (item) {
            return String(item.name || "").toLowerCase().indexOf(query) >= 0;
          })
        : items;

      listEl.textContent = "";

      if (!items.length) {
        var empty = emptyState("Belum ada yang disimpan.");
        var add = document.createElement("button");
        add.type = "button";
        add.className = "btn";
        add.textContent = "Tambah item pertama";
        add.addEventListener("click", openCreate);
        empty.appendChild(add);
        listEl.appendChild(empty);
      } else if (!filtered.length) {
        listEl.appendChild(emptyState("Tidak ada yang cocok.", "Coba kata kunci lain atau hapus pencarian."));
      } else {
        filtered.forEach(function (item) {
          listEl.appendChild(itemRow(item));
        });
      }

      countEl.textContent = items.length
        ? items.length + " item tersimpan di browser ini."
        : "Data hanya tersimpan di browser ini.";
    }

    function itemRow(item) {
      var row = document.createElement("article");
      row.className = "item";

      var copy = document.createElement("div");
      copy.className = "item-copy";

      var name = document.createElement("p");
      name.className = "item-name";
      name.textContent = item.name;

      var content = document.createElement("p");
      content.className = "item-content";
      content.textContent = item.content;
      content.title = item.content;

      copy.appendChild(name);
      copy.appendChild(content);

      var actions = document.createElement("div");
      actions.className = "item-actions";

      var copyButton = iconButton("copy", "Salin isi " + item.name);
      copyButton.addEventListener("click", function () {
        if (window.Perkakas) {
          window.Perkakas.copy(item.content);
        } else {
          navigator.clipboard.writeText(item.content);
        }
      });

      var editButton = iconButton("pencil", "Ubah " + item.name);
      editButton.addEventListener("click", function () {
        openEdit(item);
      });

      var deleteButton = iconButton("trash", "Hapus " + item.name, "icon-btn--danger");
      deleteButton.addEventListener("click", function () {
        if (!window.confirm("Hapus “" + item.name + "” dari daftar?")) return;
        var remaining = readItems().filter(function (entry) {
          return Number(entry.id) !== Number(item.id);
        });
        writeItems(remaining);
        render();
        if (window.Perkakas) window.Perkakas.toast("Item dihapus.");
      });

      actions.appendChild(copyButton);
      actions.appendChild(editButton);
      actions.appendChild(deleteButton);

      row.appendChild(copy);
      row.appendChild(actions);
      return row;
    }

    function clearErrors() {
      nameError.textContent = "";
      contentError.textContent = "";
    }

    function openCreate() {
      clearErrors();
      form.reset();
      idInput.value = "";
      dialogTitle.textContent = "Tambah item";
      dialog.showModal();
      nameInput.focus();
    }

    function openEdit(item) {
      clearErrors();
      idInput.value = item.id;
      nameInput.value = item.name;
      contentInput.value = item.content;
      dialogTitle.textContent = "Ubah item";
      dialog.showModal();
      nameInput.focus();
    }

    addButton.addEventListener("click", openCreate);
    closeButton.addEventListener("click", function () { dialog.close(); });
    cancelButton.addEventListener("click", function () { dialog.close(); });

    dialog.addEventListener("click", function (event) {
      if (event.target === dialog) dialog.close();
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors();

      var name = nameInput.value.trim();
      var contentValue = contentInput.value.trim();
      var valid = true;

      if (!name) {
        nameError.textContent = "Nama tidak boleh kosong.";
        valid = false;
      }

      if (!contentValue) {
        contentError.textContent = "Isi tidak boleh kosong.";
        valid = false;
      }

      if (!valid) {
        if (!name) nameInput.focus();
        else contentInput.focus();
        return;
      }

      var items = readItems();
      var editingId = Number(idInput.value);

      if (editingId) {
        items = items.map(function (item) {
          if (Number(item.id) !== editingId) return item;
          return { id: item.id, name: name, content: contentValue };
        });
      } else {
        items.push({ id: nextId(), name: name, content: contentValue });
      }

      if (!writeItems(items)) return;

      dialog.close();
      render();
      if (window.Perkakas) {
        window.Perkakas.toast(editingId ? "Item diperbarui." : "Item disimpan di browser ini.");
      }
    });

    [nameInput, contentInput].forEach(function (field) {
      field.addEventListener("input", clearErrors);
    });

    searchInput.addEventListener("input", render);

    exportButton.addEventListener("click", function () {
      var items = readItems();
      var blob = new Blob([JSON.stringify(items, null, 2)], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "item-saver.json";
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
      if (window.Perkakas) window.Perkakas.toast("Berkas JSON diunduh.");
    });

    importButton.addEventListener("click", function () {
      importInput.click();
    });

    importInput.addEventListener("change", function () {
      var file = importInput.files && importInput.files[0];
      if (!file) return;

      file.text().then(function (text) {
        var imported;
        try {
          imported = JSON.parse(text);
        } catch (error) {
          throw new Error("Berkas bukan JSON yang valid.");
        }

        if (!Array.isArray(imported)) {
          throw new Error("JSON harus berupa daftar item.");
        }

        var validItems = imported.filter(function (item) {
          return item && typeof item.name === "string" && typeof item.content === "string" && item.name.trim() && item.content.trim();
        });

        if (!validItems.length) {
          throw new Error("Tidak ada item yang bisa diimpor.");
        }

        var items = readItems();
        var last = items.reduce(function (max, item) { return Math.max(max, Number(item.id) || 0); }, 0);

        validItems.forEach(function (item) {
          last += 1;
          items.push({ id: last, name: item.name.trim(), content: item.content.trim() });
        });

        if (!writeItems(items)) return;
        render();
        if (window.Perkakas) {
          window.Perkakas.toast(validItems.length + " item diimpor.");
        }
      }).catch(function (error) {
        if (window.Perkakas) {
          window.Perkakas.toast(error.message || "Gagal mengimpor berkas.", "error");
        }
      }).finally(function () {
        importInput.value = "";
      });
    });

    render();
  });
})();
