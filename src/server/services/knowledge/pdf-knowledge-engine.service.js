const fs = require('fs/promises');
const path = require('path');
const fileRepository = require('../../repositories/file.repository');
const { KNOWLEDGE_FILES, knowledgePath } = require('./knowledge-loader.service');

const LLM_KNOWLEDGE_SCHEMA = {
  type: 'object',
  properties: {
    rules: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          category: {
            type: 'string',
            enum: [
              'trading_strategies',
              'macro_rules',
              'volatility_rules',
              'event_rules',
              'regime_rules',
              'risk_rules',
            ],
          },
          id: { type: 'string' },
          title: { type: 'string' },
          condition: { type: 'string' },
          impact: { type: 'string' },
          risk_note: { type: 'string' },
        },
        required: ['category', 'id', 'title', 'condition', 'impact', 'risk_note'],
        additionalProperties: false,
      },
    },
  },
  required: ['rules'],
  additionalProperties: false,
};

const CATEGORY_KEYS = {
  trading_strategies: 'strategies',
  macro_rules: 'rules',
  volatility_rules: 'rules',
  event_rules: 'rules',
  regime_rules: 'rules',
  risk_rules: 'rules',
};

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function chunkText(text, maxLength = 1800) {
  const paragraphs = String(text || '')
    .split(/\n{2,}/)
    .map((item) => item.trim())
    .filter(Boolean);
  const chunks = [];
  let current = '';

  for (const paragraph of paragraphs) {
    if ((current + '\n\n' + paragraph).length > maxLength && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph;
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

function classifyChunk(chunk) {
  const text = chunk.toLowerCase();
  const categories = [];

  if (/breakout|trend following|mean reversion|moving average|rsi|entry|exit/.test(text)) {
    categories.push('trading_strategies');
  }
  if (/inflation|rates|central bank|fomc|cpi|nfp|unemployment|gdp|liquidity/.test(text)) {
    categories.push('macro_rules');
  }
  if (/volatility|atr|implied vol|options|squeeze|compression|expansion/.test(text)) {
    categories.push('volatility_rules');
  }
  if (/conflict|sanction|oil|shipping|geopolitical|war|tariff/.test(text)) {
    categories.push('event_rules');
  }
  if (/risk-on|risk off|risk-off|regime|range|trend|panic/.test(text)) {
    categories.push('regime_rules');
  }
  if (/position size|stop loss|drawdown|risk per trade|reduce size|leverage/.test(text)) {
    categories.push('risk_rules');
  }

  return categories.length ? categories : ['regime_rules'];
}

function sourceMetadata(sourceFile, section = 'deterministic_chunk') {
  return {
    fileName: path.basename(sourceFile || 'unknown'),
    section,
    extractedAt: new Date().toISOString(),
  };
}

function strategyFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  const breakout = text.includes('breakout');
  const meanReversion = text.includes('mean reversion') || text.includes('range');
  const id = breakout ? 'pdf_breakout_strategy' : meanReversion ? 'pdf_mean_reversion_strategy' : 'pdf_trend_strategy';

  return {
    id,
    name: breakout ? 'PDF Breakout Strategy' : meanReversion ? 'PDF Mean Reversion Strategy' : 'PDF Trend Strategy',
    assetTypes: ['crypto', 'stock', 'etf'],
    marketRegimes: breakout ? ['breakout', 'low_vol_breakout'] : meanReversion ? ['range', 'compressed_range'] : ['trend'],
    signals: breakout ? ['breakout', 'volume_expansion'] : ['trend_confirmation'],
    riskProfile: text.includes('high risk') ? 'high' : 'medium',
    bias: text.includes('short') ? 'bearish' : text.includes('bull') || breakout ? 'bullish' : 'neutral',
    notes: chunk.slice(0, 240),
    source: sourceMetadata(sourceFile),
  };
}

function macroRuleFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  return {
    id: `pdf_macro_${slugify(chunk.slice(0, 60))}`,
    condition: {
      ratesTrend: text.includes('falling rates') || text.includes('rate cuts') ? 'falling' : text.includes('rising rates') ? 'rising' : 'stable',
    },
    impact: {
      stocks: text.includes('risk off') ? 'bearish' : 'mixed',
      crypto: text.includes('liquidity') && text.includes('expanding') ? 'bullish' : 'mixed',
    },
    confidenceWeight: 0.45,
    source: sourceMetadata(sourceFile),
  };
}

function volatilityRuleFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  return {
    id: `pdf_vol_${slugify(chunk.slice(0, 60))}`,
    condition: {
      regime: text.includes('compression') || text.includes('squeeze') ? 'compressed_range' : text.includes('high volatility') ? 'high_vol_noise' : 'high_vol_trend',
    },
    impact: {
      strategy: text.includes('compression') ? 'wait_for_breakout_confirmation' : 'reduce_size_when_unstable',
      risk: chunk.slice(0, 180),
    },
    confidenceWeight: 0.45,
    source: sourceMetadata(sourceFile),
  };
}

function eventRuleFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  const themes = [];
  if (text.includes('oil')) themes.push('energy');
  if (text.includes('shipping')) themes.push('shipping');
  if (text.includes('sanction')) themes.push('sanctions');
  if (text.includes('conflict') || text.includes('war')) themes.push('conflict');

  return {
    id: `pdf_event_${slugify(chunk.slice(0, 60))}`,
    eventType: themes.includes('conflict') ? 'geopolitical_conflict' : 'macro_event',
    themes,
    impact: {
      equities: text.includes('risk off') || themes.includes('conflict') ? 'bearish' : 'mixed',
      crypto: 'mixed',
      safe_haven: themes.includes('conflict') ? 'bullish' : 'mixed',
    },
    source: sourceMetadata(sourceFile),
  };
}

function regimeRuleFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  return {
    id: `pdf_regime_${slugify(chunk.slice(0, 60))}`,
    condition: {
      technicalRegime: text.includes('range') ? 'range' : text.includes('breakout') ? 'breakout' : 'trend',
    },
    interpretation: chunk.slice(0, 240),
    confidenceWeight: 0.4,
    source: sourceMetadata(sourceFile),
  };
}

function riskRuleFromChunk(chunk, sourceFile) {
  const text = chunk.toLowerCase();
  return {
    id: `pdf_risk_${slugify(chunk.slice(0, 60))}`,
    condition: {
      dangerLevel: text.includes('high volatility') || text.includes('drawdown') ? 'high' : 'medium',
    },
    positionSizingAdjustment: text.includes('reduce') || text.includes('drawdown') ? -0.35 : -0.15,
    note: chunk.slice(0, 220),
    source: sourceMetadata(sourceFile),
  };
}

function addDeduped(target, category, value) {
  const key = CATEGORY_KEYS[category];
  const bucket = target[category][key];
  if (!bucket.some((item) => item.id === value.id)) {
    bucket.push(value);
  }
}

function addLlmRule(target, rule, sourceFile) {
  const id = `llm_${slugify(rule.id || rule.title || rule.impact)}`;
  const source = sourceMetadata(sourceFile, 'llm_assisted_normalization');

  if (rule.category === 'trading_strategies') {
    addDeduped(target, rule.category, {
      id,
      name: rule.title,
      assetTypes: ['crypto', 'stock', 'etf'],
      marketRegimes: ['trend', 'breakout', 'range', 'compressed_range'],
      signals: [slugify(rule.condition || 'llm_condition')],
      riskProfile: rule.risk_note.toLowerCase().includes('high') ? 'high' : 'medium',
      bias: 'neutral',
      notes: rule.impact,
      source,
    });
  }

  if (rule.category === 'macro_rules') {
    addDeduped(target, rule.category, {
      id,
      condition: { regime: 'mixed' },
      impact: { summary: rule.impact },
      confidenceWeight: 0.35,
      source,
    });
  }

  if (rule.category === 'volatility_rules') {
    addDeduped(target, rule.category, {
      id,
      condition: { regime: rule.condition.toLowerCase().includes('compression') ? 'compressed_range' : 'high_vol_noise' },
      impact: { strategy: rule.impact, risk: rule.risk_note },
      confidenceWeight: 0.35,
      source,
    });
  }

  if (rule.category === 'event_rules') {
    addDeduped(target, rule.category, {
      id,
      eventType: rule.condition.toLowerCase().includes('conflict') ? 'geopolitical_conflict' : 'macro_event',
      themes: classifyChunk(`${rule.condition} ${rule.impact}`).includes('event_rules') ? ['conflict'] : [],
      impact: { summary: rule.impact },
      source,
    });
  }

  if (rule.category === 'regime_rules') {
    addDeduped(target, rule.category, {
      id,
      condition: { technicalRegime: rule.condition.toLowerCase().includes('range') ? 'range' : 'trend' },
      interpretation: rule.impact,
      confidenceWeight: 0.35,
      source,
    });
  }

  if (rule.category === 'risk_rules') {
    addDeduped(target, rule.category, {
      id,
      condition: { dangerLevel: rule.risk_note.toLowerCase().includes('high') ? 'high' : 'medium' },
      positionSizingAdjustment: -0.2,
      note: rule.risk_note || rule.impact,
      source,
    });
  }
}

async function normalizeWithLlm(text, sourceFile, options = {}) {
  const { createOpenAiClient, isConfigured } = require('../scoring/llm-score.service');

  if (!isConfigured()) {
    return null;
  }

  const client = createOpenAiClient(options);
  if (!client) {
    return null;
  }

  const response = await client.responses.create({
    model: options.model || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
    temperature: 0.1,
    max_output_tokens: 900,
    input: [
      {
        role: 'system',
        content:
          'Extract concise market knowledge rules. Do not copy long passages. Do not invent facts outside the supplied text. Return JSON only.',
      },
      {
        role: 'user',
        content: text.slice(0, 12000),
      },
    ],
    text: {
      format: {
        type: 'json_schema',
        name: 'knowledge_rules',
        strict: true,
        schema: LLM_KNOWLEDGE_SCHEMA,
      },
    },
  });
  const outputText =
    response.output_text ||
    response.output
      ?.flatMap((item) => item.content || [])
      ?.map((item) => item.text || '')
      .join('') ||
    '';
  const parsed = JSON.parse(outputText);
  const extracted = Object.fromEntries(
    Object.entries(CATEGORY_KEYS).map(([category, key]) => [category, { [key]: [] }]),
  );

  for (const rule of parsed.rules || []) {
    addLlmRule(extracted, rule, sourceFile);
  }

  return extracted;
}

function buildKnowledgeFromText(text, sourceFile = 'unknown') {
  const extracted = Object.fromEntries(
    Object.entries(CATEGORY_KEYS).map(([category, key]) => [category, { [key]: [] }]),
  );

  for (const chunk of chunkText(text)) {
    for (const category of classifyChunk(chunk)) {
      if (category === 'trading_strategies') addDeduped(extracted, category, strategyFromChunk(chunk, sourceFile));
      if (category === 'macro_rules') addDeduped(extracted, category, macroRuleFromChunk(chunk, sourceFile));
      if (category === 'volatility_rules') addDeduped(extracted, category, volatilityRuleFromChunk(chunk, sourceFile));
      if (category === 'event_rules') addDeduped(extracted, category, eventRuleFromChunk(chunk, sourceFile));
      if (category === 'regime_rules') addDeduped(extracted, category, regimeRuleFromChunk(chunk, sourceFile));
      if (category === 'risk_rules') addDeduped(extracted, category, riskRuleFromChunk(chunk, sourceFile));
    }
  }

  return extracted;
}

async function extractTextFromPdf(filePath) {
  const buffer = await fs.readFile(filePath);
  const pdfParse = require('pdf-parse');

  if (typeof pdfParse === 'function') {
    const result = await pdfParse(buffer);
    return result.text || '';
  }

  if (pdfParse.PDFParse) {
    const parser = new pdfParse.PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return result.text || '';
    } finally {
      await parser.destroy?.();
    }
  }

  throw new Error('Unsupported pdf-parse API shape.');
}

async function extractText(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.pdf') {
    return extractTextFromPdf(filePath);
  }

  return fs.readFile(filePath, 'utf8');
}

async function mergeExtractedKnowledge(extracted, options = {}) {
  const counts = {};
  const knowledgeDataDir = options.knowledgeDataDir;

  for (const [category, descriptor] of Object.entries(KNOWLEDGE_FILES)) {
    const key = descriptor.key;
    const current = await fileRepository.readJson(knowledgePath(descriptor.fileName, knowledgeDataDir), { [key]: [] });
    const existing = Array.isArray(current?.[key]) ? current[key] : [];
    const incoming = extracted[category]?.[key] || [];
    const byId = new Map(existing.map((item) => [item.id, item]));

    for (const item of incoming) {
      byId.set(item.id, item);
    }

    const merged = { [key]: [...byId.values()] };
    await fileRepository.writeJson(knowledgePath(descriptor.fileName, knowledgeDataDir), merged);
    counts[category] = {
      addedOrUpdated: incoming.length,
      total: merged[key].length,
    };
  }

  return counts;
}

async function importPdfKnowledge(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const text = await extractText(resolvedPath);
  const deterministic = buildKnowledgeFromText(text, resolvedPath);
  let llmAssisted = null;

  if (options.useLlm) {
    try {
      llmAssisted = await normalizeWithLlm(text, resolvedPath, options);
      if (llmAssisted) {
        for (const [category, descriptor] of Object.entries(KNOWLEDGE_FILES)) {
          const key = descriptor.key;
          for (const item of llmAssisted[category]?.[key] || []) {
            addDeduped(deterministic, category, item);
          }
        }
      }
    } catch (error) {
      llmAssisted = {
        unavailable: true,
        reason: error.message,
      };
    }
  }

  const counts = options.dryRun ? {} : await mergeExtractedKnowledge(deterministic, options);

  return {
    sourceFile: path.basename(resolvedPath),
    mode: llmAssisted && !llmAssisted.unavailable ? 'deterministic-plus-llm-assisted' : 'deterministic',
    llmAssisted: options.useLlm ? llmAssisted || { unavailable: true, reason: 'OpenAI not configured.' } : undefined,
    chunkCount: chunkText(text).length,
    counts,
    extracted: options.includeExtracted ? deterministic : undefined,
    importedAt: new Date().toISOString(),
  };
}

module.exports = {
  buildKnowledgeFromText,
  chunkText,
  classifyChunk,
  extractText,
  extractTextFromPdf,
  importPdfKnowledge,
  normalizeWithLlm,
  mergeExtractedKnowledge,
};
