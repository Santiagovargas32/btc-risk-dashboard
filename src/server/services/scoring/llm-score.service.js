const OpenAI = require('openai');
const openaiConfig = require('../../config/openai');
const { clamp, round } = require('../../utils/math');
const logger = require('../../utils/logger');

const LLM_SCHEMA = {
  type: 'object',
  properties: {
    sentiment: {
      type: 'string',
      enum: ['bullish', 'bearish', 'neutral'],
    },
    confidence: {
      type: 'number',
    },
    reasoning: {
      type: 'string',
    },
    risk_note: {
      type: 'string',
    },
    position_size_note: {
      type: 'string',
    },
    contradictions: {
      type: 'array',
      items: {
        type: 'string',
      },
    },
  },
  required: ['sentiment', 'confidence', 'reasoning', 'risk_note', 'position_size_note', 'contradictions'],
  additionalProperties: false,
};

function isConfigured() {
  return Boolean(openaiConfig.enabled);
}

function createOpenAiClient(options = {}) {
  if (!isConfigured()) {
    return null;
  }

  return new OpenAI({
    apiKey: options.apiKey || process.env.OPENAI_API_KEY,
    baseURL: options.baseURL || openaiConfig.baseURL,
    timeout: options.timeoutMs || openaiConfig.timeoutMs,
  });
}

function fallbackResponse(reason) {
  return {
    enabled: false,
    unavailable: true,
    sentiment: 'neutral',
    confidence: 0,
    reasoning: reason,
    risk_note: 'LLM meta layer unavailable; use deterministic score and risk controls only.',
    position_size_note: 'No LLM sizing note was produced.',
    contradictions: [],
  };
}

function extractOutputText(response) {
  if (response?.output_text) {
    return response.output_text;
  }

  const contentItems = response?.output
    ?.flatMap((item) => item.content || [])
    ?.filter((item) => item.type === 'output_text' || item.type === 'text');

  return contentItems?.map((item) => item.text).join('') || '';
}

function normalizeLlmPayload(payload) {
  return {
    enabled: true,
    unavailable: false,
    sentiment: ['bullish', 'bearish', 'neutral'].includes(payload.sentiment) ? payload.sentiment : 'neutral',
    confidence: round(clamp(Number(payload.confidence || 0), 0, 100), 2),
    reasoning: String(payload.reasoning || ''),
    risk_note: String(payload.risk_note || ''),
    position_size_note: String(payload.position_size_note || ''),
    contradictions: Array.isArray(payload.contradictions)
      ? payload.contradictions.map((item) => String(item)).slice(0, 8)
      : [],
  };
}

function buildPrompt(input = {}) {
  return [
    {
      role: 'system',
      content:
        'You are a risk-aware market analysis meta layer. Explain deterministic signals only. Do not invent market data, do not guarantee outcomes, and do not create a trade signal without the deterministic score context. Return JSON that matches the schema.',
    },
    {
      role: 'user',
      content: JSON.stringify(
        {
          task: 'Explain the deterministic market intelligence output and flag contradictions.',
          input,
        },
        null,
        2,
      ),
    },
  ];
}

async function scoreWithLlm(input = {}, options = {}) {
  if (options.enabled === false || !isConfigured()) {
    return fallbackResponse(openaiConfig.reason);
  }

  const client = createOpenAiClient(options);
  if (!client) {
    return fallbackResponse('OpenAI client is not configured.');
  }

  try {
    const response = await client.responses.create({
      model: options.model || openaiConfig.model,
      input: buildPrompt(input),
      temperature: 0.1,
      max_output_tokens: options.maxOutputTokens || 600,
      text: {
        format: {
          type: 'json_schema',
          name: 'market_meta_analysis',
          strict: true,
          schema: LLM_SCHEMA,
        },
      },
    });
    const outputText = extractOutputText(response);
    const parsed = JSON.parse(outputText);
    return normalizeLlmPayload(parsed);
  } catch (error) {
    logger.warn('llm_score.failed', {
      message: error.message,
      model: options.model || openaiConfig.model,
    });

    return fallbackResponse(`OpenAI meta layer failed: ${error.message}`);
  }
}

module.exports = {
  LLM_SCHEMA,
  createOpenAiClient,
  fallbackResponse,
  isConfigured,
  scoreWithLlm,
};
