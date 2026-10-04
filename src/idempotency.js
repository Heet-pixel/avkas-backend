/**
 * In-memory idempotency guard.
 *
 *   key seen & finished  -> return the stored result (NO second email)
 *   key seen & running   -> wait for the SAME work (no second email)
 *   key seen & failed    -> forgotten, so the retry can really try again
 *
 * Entries live 24 h and the store is capped, so it cannot grow without limit.
 * Scope: one running instance (what a single Render Web Service is). If you ever
 * scale to several instances, move this to a shared store (Redis / DynamoDB).
 */
const TTL_MS = 24 * 60 * 60 * 1000;
const MAX_ENTRIES = 5000;
const store = new Map();

async function once(key, work) {
  const hit = store.get(key);
  if (hit) {
    await hit.promise;
    return { first: false };
  }
  if (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value); // evict oldest

  const entry = { ts: Date.now() };
  entry.promise = (async () => {
    try {
      return await work();
    } catch (err) {
      store.delete(key); // allow a genuine retry after a failure
      throw err;
    }
  })();
  store.set(key, entry);
  await entry.promise;
  return { first: true };
}

setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [k, v] of store) if (v.ts < cutoff) store.delete(k);
}, 30 * 60 * 1000).unref();

module.exports = { once };
