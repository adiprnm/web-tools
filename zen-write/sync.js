/* Zen Write sync helpers
   ------------------------------------------------------------
   Kripto dan transport untuk sync. Tidak menyentuh DOM dan tidak
   tahu apa pun soal daftar catatan; main.js yang mengatur itu.

   recoveryKey dibuat di perangkat dan tidak pernah dikirim. Dari
   kunci itu diturunkan dua nilai independen:
     authProof = HMAC(recoveryKey, "zen-write-auth")  -> dikirim saat recovery
     encKey    = HMAC(recoveryKey, "zen-write-enc")   -> hanya di perangkat
   Server menyimpan SHA-256(authProof), jadi ia bisa memverifikasi
   pemulihan tanpa pernah bisa menurunkan encKey.
   ------------------------------------------------------------ */

(function (global) {
  "use strict";

  var API_BASE = "/zen-write/api";
  var SESSION_KEY = "zen-write:sync:v1";
  var AUTH_LABEL = "zen-write-auth";
  var ENC_LABEL = "zen-write-enc";
  var encoder = new TextEncoder();
  var decoder = new TextDecoder();

  function bytesToBase64url(bytes) {
    var binary = "";
    for (var i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64urlToBytes(text) {
    var normalized = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    while (normalized.length % 4) normalized += "=";
    var binary = atob(normalized);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function randomRecoveryKey() {
    var bytes = crypto.getRandomValues(new Uint8Array(32));
    return bytesToBase64url(bytes);
  }

  async function hmac(recoveryKey, label) {
    var raw = base64urlToBytes(recoveryKey);
    var key = await crypto.subtle.importKey(
      "raw",
      raw,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    var signature = await crypto.subtle.sign("HMAC", key, encoder.encode(label));
    return bytesToBase64url(new Uint8Array(signature));
  }

  async function deriveKeys(recoveryKey) {
    return {
      authProof: await hmac(recoveryKey, AUTH_LABEL),
      encKey: await hmac(recoveryKey, ENC_LABEL)
    };
  }

  async function importEncKey(encKey) {
    return crypto.subtle.importKey(
      "raw",
      base64urlToBytes(encKey),
      "AES-GCM",
      false,
      ["encrypt", "decrypt"]
    );
  }

  function associatedData(noteId, rev) {
    return encoder.encode(noteId + ":" + rev);
  }

  async function encryptNote(key, note) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var payload = encoder.encode(JSON.stringify({
      title: String(note.title || ""),
      body: String(note.body || "")
    }));
    var ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv, additionalData: associatedData(note.id, note.rev) },
      key,
      payload
    );

    return {
      iv: bytesToBase64url(iv),
      ciphertext: bytesToBase64url(new Uint8Array(ciphertext))
    };
  }

  async function decryptNote(key, note) {
    var plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: base64urlToBytes(note.iv),
        additionalData: associatedData(note.id, note.rev)
      },
      key,
      base64urlToBytes(note.ciphertext)
    );

    var parsed = JSON.parse(decoder.decode(plaintext));
    return {
      title: typeof parsed.title === "string" ? parsed.title : "",
      body: typeof parsed.body === "string" ? parsed.body : ""
    };
  }

  async function api(path, options) {
    options = options || {};

    var headers = {};
    if (options.body !== undefined) headers["content-type"] = "application/json";
    if (options.token) headers.authorization = "Bearer " + options.token;

    var response = await fetch(API_BASE + path, {
      method: options.method || "GET",
      headers: headers,
      credentials: "same-origin",
      cache: "no-store",
      body: options.body === undefined ? undefined : JSON.stringify(options.body)
    });

    var data = null;
    try {
      data = await response.json();
    } catch (error) {
      data = null;
    }

    if (!response.ok) {
      var failure = new Error((data && data.error) || "http_" + response.status);
      failure.code = (data && data.error) || "http_" + response.status;
      failure.status = response.status;
      throw failure;
    }

    return data;
  }

  /* -------------------------------------------------------------
     Sesi lokal. Disimpan di localStorage karena ukurannya kecil
     (kunci, token, peta rev) dan perlu dibaca sinkron saat boot.
     Isi catatan tetap di IndexedDB.
     ------------------------------------------------------------- */

  function blankSession() {
    return {
      accountId: null,
      deviceId: null,
      deviceToken: null,
      recoveryKey: null,
      encKey: null,
      cursor: 0,
      baseRevs: {},
      lastSynced: {},
      requestId: null,
      // true setelah pemulihan: syncNow() menarik seluruh riwayat dulu sebelum
      // push pertama, sampai pull itu berhasil.
      reconcile: false
    };
  }

  function loadSession() {
    try {
      var parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (parsed && typeof parsed === "object") {
        var session = blankSession();
        Object.keys(session).forEach(function (key) {
          if (parsed[key] !== undefined) session[key] = parsed[key];
        });
        return session;
      }
    } catch (error) {
      // sesi rusak, mulai dari kosong
    }
    return blankSession();
  }

  function saveSession(session) {
    try {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      return true;
    } catch (error) {
      return false;
    }
  }

  function clearSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch (error) {
      // abaikan
    }
  }

  function hasAccount(session) {
    return !!(session && session.accountId && session.encKey);
  }

  /* Pairing payload travels in the URL fragment so it never reaches the
     server or the analytics script. */

  function encodePairPayload(payload) {
    return bytesToBase64url(encoder.encode(JSON.stringify(payload)));
  }

  function decodePairPayload(value) {
    try {
      var parsed = JSON.parse(decoder.decode(base64urlToBytes(value)));
      if (!parsed || !parsed.a || !parsed.c || !parsed.k) return null;
      return { accountId: parsed.a, code: parsed.c, encKey: parsed.k };
    } catch (error) {
      return null;
    }
  }

  function renderQr(container, text) {
    if (!container || typeof global.qrcode !== "function") return false;

    try {
      var qr = global.qrcode(0, "M");
      qr.addData(text);
      qr.make();

      var count = qr.getModuleCount();
      var scale = Math.max(3, Math.floor(220 / count));
      var size = count * scale;

      var canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      canvas.className = "sync-qr-canvas";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", text);

      var context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, size, size);
      context.fillStyle = "#111111";

      for (var row = 0; row < count; row += 1) {
        for (var col = 0; col < count; col += 1) {
          if (qr.isDark(row, col)) context.fillRect(col * scale, row * scale, scale, scale);
        }
      }

      container.textContent = "";
      container.appendChild(canvas);
      return true;
    } catch (error) {
      return false;
    }
  }

  global.ZenWriteSync = {
    api: api,
    deriveKeys: deriveKeys,
    importEncKey: importEncKey,
    encryptNote: encryptNote,
    decryptNote: decryptNote,
    randomRecoveryKey: randomRecoveryKey,
    loadSession: loadSession,
    saveSession: saveSession,
    clearSession: clearSession,
    hasAccount: hasAccount,
    encodePairPayload: encodePairPayload,
    decodePairPayload: decodePairPayload,
    renderQr: renderQr
  };
})(window);
