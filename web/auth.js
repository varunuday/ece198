// auth.js — accounts for the ECE 198 fitness site.
// Two modes, picked automatically:
//   remote — deployed on Vercel with KV: accounts and sessions live on the
//            server (via /api/*) and sync across devices.
//   local  — python http.server / file:// / KV not configured: accounts live
//            in this browser's localStorage, plus preset accounts.csv logins.
// The API is tried first; any transport failure flips to local mode quietly.
(function () {
  const USERS_KEY = "ece198.users";
  const SESSION_KEY = "ece198.session";
  const DATA_PREFIX = "ece198.sessions.";

  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJSON(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toHex(buffer) {
    return Array.from(new Uint8Array(buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  async function hashPassword(salt, password) {
    const text = salt + ":" + password;
    if (window.crypto && crypto.subtle && crypto.subtle.digest) {
      try {
        const digest = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(text)
        );
        return toHex(digest);
      } catch (e) {
        /* fall through to the simple hash */
      }
    }
    // Fallback for non-secure contexts (file://): salted FNV-1a. Demo-grade only.
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = (h * 0x01000193) >>> 0;
    }
    return "fnv" + h.toString(16);
  }

  function makeSalt() {
    if (window.crypto && crypto.getRandomValues) {
      const bytes = new Uint8Array(8);
      crypto.getRandomValues(bytes);
      return Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    }
    return Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

  function normalize(name) {
    return String(name || "").trim();
  }

  function keyFor(name) {
    return normalize(name).toLowerCase();
  }

  // Preset accounts shipped with the site in accounts.csv (one "name,password"
  // per line). Used only in local mode. A password can be "salt:hash" too.
  let csvUsers = null; // null = not fetched yet

  async function ensureCSV() {
    if (csvUsers !== null) return;
    csvUsers = {};
    try {
      const res = await fetch("accounts.csv", { cache: "no-store" });
      if (!res.ok) return;
      const text = await res.text();
      for (const line of text.split(/\r?\n/)) {
        const t = line.trim();
        if (!t || /^username\s*,/i.test(t)) continue;
        const comma = t.indexOf(",");
        if (comma < 1) continue;
        const name = t.slice(0, comma).trim();
        const pass = t.slice(comma + 1).trim();
        if (name) csvUsers[keyFor(name)] = { name, pass };
      }
    } catch (e) {
      /* file:// or offline: no preset accounts */
    }
  }

  // Sign-in record: { name, token? }. token means a server (KV) account.
  function readSession() {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    if (raw[0] === "{") {
      try {
        const o = JSON.parse(raw);
        return o && o.name ? o : null;
      } catch (e) {
        return null;
      }
    }
    return { name: raw }; // older builds stored a bare username
  }

  function writeSession(rec) {
    if (rec) localStorage.setItem(SESSION_KEY, JSON.stringify(rec));
    else localStorage.removeItem(SESSION_KEY);
  }

  // API layer: returns parsed JSON, or null when the API is unreachable
  // (python server, file://, KV missing) -> caller falls back to local mode.
  let apiDown = false;
  async function api(path, options = {}, token) {
    if (apiDown) return null;
    try {
      const headers = { "Content-Type": "application/json" };
      if (token) headers.Authorization = "Bearer " + token;
      const res = await fetch("/api/" + path, { ...options, headers });
      if (!res.ok) {
        apiDown = true;
        return null;
      }
      return await res.json();
    } catch (e) {
      apiDown = true;
      return null;
    }
  }

  const Auth = {
    // Current signed-in display name, or null.
    user() {
      const s = readSession();
      if (!s || !s.name) return null;
      if (s.token) return s.name; // server account: trusted
      const users = readJSON(USERS_KEY, {});
      const rec = users[keyFor(s.name)];
      return rec ? rec.name : null;
    },

    token() {
      const s = readSession();
      return s && s.token ? s.token : null;
    },

    async register(name, password) {
      name = normalize(name);
      if (!/^[A-Za-z0-9._-]{3,16}$/.test(name)) {
        return { ok: false, error: "Usernames are 3–16 letters, numbers, dots, dashes or underscores." };
      }
      if (String(password).length < 4) {
        return { ok: false, error: "Password needs at least 4 characters." };
      }

      const r = await api("auth", {
        method: "POST",
        body: JSON.stringify({ action: "register", username: name, password }),
      });
      if (r) {
        if (!r.ok) return r;
        writeSession({ name: r.user, token: r.token });
        return { ok: true, user: r.user };
      }

      // local mode
      const users = readJSON(USERS_KEY, {});
      await ensureCSV();
      if (users[keyFor(name)] || csvUsers[keyFor(name)]) {
        return { ok: false, error: "That username is taken." };
      }
      const salt = makeSalt();
      const hash = await hashPassword(salt, password);
      users[keyFor(name)] = { name, salt, hash, created: new Date().toISOString() };
      writeJSON(USERS_KEY, users);
      writeSession({ name });
      return { ok: true, user: name };
    },

    async login(name, password) {
      const r = await api("auth", {
        method: "POST",
        body: JSON.stringify({ action: "login", username: name, password }),
      });
      if (r) {
        if (!r.ok) return r;
        writeSession({ name: r.user, token: r.token });
        await Auth.refresh();
        return { ok: true, user: r.user };
      }

      // local mode: browser accounts first, then accounts.csv
      const users = readJSON(USERS_KEY, {});
      const rec = users[keyFor(name)];
      if (rec) {
        const hash = await hashPassword(rec.salt, password);
        if (hash !== rec.hash) return { ok: false, error: "Wrong password." };
        writeSession({ name: rec.name });
        return { ok: true, user: rec.name };
      }

      await ensureCSV();
      const preset = csvUsers[keyFor(name)];
      if (!preset) return { ok: false, error: "No account with that username." };
      let ok = false;
      if (preset.pass.includes(":")) {
        const [salt, expected] = preset.pass.split(":");
        ok = (await hashPassword(salt, password)) === expected;
      } else {
        ok = preset.pass === String(password);
      }
      if (!ok) return { ok: false, error: "Wrong password." };
      // keep a hashed copy locally so the sign-in survives reloads
      const salt = makeSalt();
      const hash = await hashPassword(salt, password);
      users[keyFor(preset.name)] = {
        name: preset.name,
        salt,
        hash,
        created: new Date().toISOString(),
        preset: true,
      };
      writeJSON(USERS_KEY, users);
      writeSession({ name: preset.name });
      return { ok: true, user: preset.name };
    },

    logout() {
      writeSession(null);
    },

    dataKey() {
      const u = Auth.user();
      return u ? DATA_PREFIX + keyFor(u) : null;
    },

    // Cached sessions for the current user, newest first.
    sessions() {
      const key = Auth.dataKey();
      if (!key) return [];
      const list = readJSON(key, []);
      return Array.isArray(list) ? list : [];
    },

    // Save a workout session. Returns false when nobody is signed in.
    // Caches locally always; syncs to the server for remote accounts.
    saveSession(session) {
      const key = Auth.dataKey();
      if (!key) return false;
      session.id = Date.now() + Math.floor(Math.random() * 1000);
      const list = Auth.sessions();
      list.unshift(session);
      writeJSON(key, list);
      const t = Auth.token();
      if (t) {
        api("sessions", { method: "POST", body: JSON.stringify({ session }) }, t);
      }
      return true;
    },

    removeSession(id) {
      const key = Auth.dataKey();
      if (!key) return;
      writeJSON(
        key,
        Auth.sessions().filter((s) => s.id !== id)
      );
      const t = Auth.token();
      if (t) api("sessions?id=" + encodeURIComponent(id), { method: "DELETE" }, t);
    },

    // Pulls the server copy into the local cache (remote accounts only).
    async refresh() {
      const t = Auth.token();
      if (!t) return;
      const r = await api("sessions", {}, t);
      if (r && r.ok && Array.isArray(r.sessions)) {
        const key = Auth.dataKey();
        if (key) writeJSON(key, r.sessions);
      }
    },

    // Totals across every cached session.
    stats() {
      const all = Auth.sessions();
      const s = { sessions: all.length, reps: 0, good: 0, fast: 0, slow: 0 };
      for (const sess of all) {
        s.reps += sess.reps || 0;
        if (sess.counts) {
          s.good += sess.counts.GOOD || 0;
          s.fast += sess.counts["TOO FAST"] || 0;
          s.slow += sess.counts["TOO SLOW"] || 0;
        }
      }
      return s;
    },

    // Keeps the nav link in sync with the sign-in state.
    renderNav() {
      const link = document.getElementById("accountLink");
      if (!link) return;
      const u = Auth.user();
      link.textContent = u || "Sign in";
      link.title = u ? "Account (" + u + ")" : "Sign in or create an account";
    },
  };

  window.Auth = Auth;
  Auth.ready = Auth.refresh();
  Auth.renderNav();
})();
