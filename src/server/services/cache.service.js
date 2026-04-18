const store = new Map();

function get(key) {
  const item = store.get(key);
  if (!item) {
    return null;
  }

  if (item.expiresAt !== null && item.expiresAt <= Date.now()) {
    store.delete(key);
    return null;
  }

  return item.value;
}

function set(key, value, ttlSeconds = 60) {
  const expiresAt = ttlSeconds > 0 ? Date.now() + ttlSeconds * 1000 : null;
  store.set(key, { value, expiresAt });
  return value;
}

async function wrap(key, ttlSeconds, producer) {
  const cached = get(key);
  if (cached) {
    return cached;
  }

  const value = await producer();
  set(key, value, ttlSeconds);
  return value;
}

function clear() {
  store.clear();
}

module.exports = {
  clear,
  get,
  set,
  wrap,
};
