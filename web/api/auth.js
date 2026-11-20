// POST /api/auth  { action: "register" | "login", username, password }
// -> { ok: true, user, token }  or  { ok: false, error }
// Zero dependencies: Node's built-in crypto + the KV REST helper.
const crypto = require("crypto");
const { kv } = require("./_kv");

function json(res, obj) {
  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(obj));
}

function readBody(req) {
  if (req.body && typeof req.body === "object") return Promise.resolve(req.body);
  return new Promise((resolve) => {
    let d = "";
    req.on("data", (c) => (d += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(d || "{}"));
      } catch (e) {
        resolve({});
      }
    });
  });
}

async function makeToken(name) {
  const t = crypto.randomBytes(16).toString("hex");
  await kv(["SET", "token:" + t, name]);
  return t;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== "POST") {
      res.statusCode = 405;
      return res.end();
    }
    const { action, username, password } = await readBody(req);
    const name = String(username || "").trim();
    const pass = String(password || "");

    if (!/^[A-Za-z0-9._-]{3,16}$/.test(name)) {
      return json(res, { ok: false, error: "Usernames are 3–16 letters, numbers, dots, dashes or underscores." });
    }
    if (pass.length < 4) {
      return json(res, { ok: false, error: "Password needs at least 4 characters." });
    }

    const key = "user:" + name.toLowerCase();
    const existing = await kv(["GET", key]);

    if (action === "register") {
      if (existing) return json(res, { ok: false, error: "That username is taken." });
      const salt = crypto.randomBytes(8).toString("hex");
      const hash = crypto.scryptSync(pass, salt, 32).toString("hex");
      await kv([
        "SET",
        key,
        JSON.stringify({ name, salt, hash, created: new Date().toISOString() }),
      ]);
      const token = await makeToken(name);
      return json(res, { ok: true, user: name, token });
    }

    if (action === "login") {
      if (!existing) return json(res, { ok: false, error: "No account with that username." });
      const rec = JSON.parse(existing);
      const hash = crypto.scryptSync(pass, rec.salt, 32);
      const ok = crypto.timingSafeEqual(hash, Buffer.from(rec.hash, "hex"));
      if (!ok) return json(res, { ok: false, error: "Wrong password." });
      const token = await makeToken(rec.name);
      return json(res, { ok: true, user: rec.name, token });
    }

    json(res, { ok: false, error: "Unknown action." });
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Server error." }));
  }
};
