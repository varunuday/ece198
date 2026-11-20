// GET /api/health — confirms the Redis store is reachable WITHOUT leaking any
// secret values. Reports which credential variable names were found and
// whether a round trip to the store succeeds.
const { kv } = require("./_kv");

module.exports = async (req, res) => {
  const found = {
    KV_REST_API_URL: !!process.env.KV_REST_API_URL,
    KV_REST_API_TOKEN: !!process.env.KV_REST_API_TOKEN,
    UPSTASH_REDIS_REST_URL: !!process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: !!process.env.UPSTASH_REDIS_REST_TOKEN,
  };

  let connected = false;
  let detail = "";
  try {
    const pong = await kv(["PING"]);
    connected = pong === "PONG" || pong === "OK" || pong != null;
    detail = "store responded";
  } catch (e) {
    detail = String(e && e.message ? e.message : e);
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ ok: true, connected, found, detail }, null, 2));
};
