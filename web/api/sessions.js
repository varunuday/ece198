// /api/sessions — saved workouts for the signed-in user.
//   GET     (Authorization: Bearer <token>)        -> { ok, sessions: [...] }
//   POST    (Bearer) { session }                   -> { ok, id }
//   DELETE  (Bearer) /api/sessions?id=<id>         -> { ok }
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

module.exports = async (req, res) => {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) return json(res, { ok: false, error: "Not signed in." });

    const user = await kv(["GET", "token:" + token]);
    if (!user) return json(res, { ok: false, error: "Session expired — sign in again." });

    const key = "sess:" + user.toLowerCase();

    if (req.method === "GET") {
      const raw = await kv(["GET", key]);
      return json(res, { ok: true, sessions: raw ? JSON.parse(raw) : [] });
    }

    if (req.method === "POST") {
      const { session } = await readBody(req);
      if (!session || !session.exercise) return json(res, { ok: false, error: "Bad session." });
      const raw = await kv(["GET", key]);
      const list = raw ? JSON.parse(raw) : [];
      if (session.id == null) session.id = Date.now() + Math.floor(Math.random() * 1000);
      list.unshift(session);
      if (list.length > 200) list.length = 200;
      await kv(["SET", key, JSON.stringify(list)]);
      return json(res, { ok: true, id: session.id });
    }

    if (req.method === "DELETE") {
      const id = Number(req.query && req.query.id);
      const raw = await kv(["GET", key]);
      const list = (raw ? JSON.parse(raw) : []).filter((s) => s.id !== id);
      await kv(["SET", key, JSON.stringify(list)]);
      return json(res, { ok: true });
    }

    res.statusCode = 405;
    res.end();
  } catch (e) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ok: false, error: "Server error." }));
  }
};
