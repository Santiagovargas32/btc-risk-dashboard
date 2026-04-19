const cache = require('../cache.service');
const env = require('../../config/env');

function get(key) {
  return cache.get(`macro:${key}`);
}

function set(key, value, ttlSeconds = env.MACRO_CACHE_TTL_SECONDS) {
  return cache.set(`macro:${key}`, value, ttlSeconds);
}

async function wrap(key, producer, ttlSeconds = env.MACRO_CACHE_TTL_SECONDS) {
  return cache.wrap(`macro:${key}`, ttlSeconds, producer);
}

module.exports = {
  get,
  set,
  wrap,
};
