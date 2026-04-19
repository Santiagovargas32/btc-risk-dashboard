const env = require('./env');

module.exports = {
  enabled: Boolean(env.OPENAI_API_KEY),
  model: env.OPENAI_MODEL,
  baseURL: env.OPENAI_BASE_URL,
  timeoutMs: env.OPENAI_TIMEOUT_MS,
  reason: env.OPENAI_API_KEY
    ? 'OpenAI meta reasoning is enabled. Deterministic scoring remains authoritative.'
    : 'OPENAI_API_KEY is missing. Deterministic scoring is active without LLM meta reasoning.',
};
