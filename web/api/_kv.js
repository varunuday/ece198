// Shared helper: one round trip to the Upstash Redis REST API (formerly
// "Vercel KV"). Files in api/ starting with "_" are helpers, not routes.
//
// Vercel's Marketplace Redis integration injects the REST URL/token under
// different names depending on how the store was provisioned, so we accept
// every common pair: KV_* (legacy Vercel KV), UPSTASH_REDIS_REST_* (current
// Upstash), and a couple of older fallbacks.
function kvCreds() {
  const url =
    process.env.KV_REST_API_URL ||
    process.env.UPSTASH_REDIS_REST_URL ||
    process.env.REDIS_REST_API_URL;
  const token =
    process.env.KV_REST_API_TOKEN ||
    process.env.UPSTASH_REDIS_REST_TOKEN ||
    process.env.REDIS_REST_API_TOKEN;
  return { url, token };
}

async function kv(command) {
  const { url, token } = kvCreds();
  if (!url || !token) throw new Error("KV not configured");
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result === undefined ? null : data.result;
}

module.exports = { kv };
