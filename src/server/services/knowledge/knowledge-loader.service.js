const path = require('path');
const env = require('../../config/env');
const fileRepository = require('../../repositories/file.repository');

const KNOWLEDGE_FILES = {
  trading_strategies: { fileName: 'trading_strategies.json', key: 'strategies' },
  macro_rules: { fileName: 'macro_rules.json', key: 'rules' },
  volatility_rules: { fileName: 'volatility_rules.json', key: 'rules' },
  event_rules: { fileName: 'event_rules.json', key: 'rules' },
  regime_rules: { fileName: 'regime_rules.json', key: 'rules' },
  risk_rules: { fileName: 'risk_rules.json', key: 'rules' },
};

const SOURCES_INDEX_FILE = 'sources.json';

function knowledgePath(fileName, knowledgeDataDir = env.KNOWLEDGE_DATA_DIR) {
  return path.join(knowledgeDataDir, fileName);
}

function sourcesIndexPath(knowledgeDataDir = env.KNOWLEDGE_DATA_DIR) {
  return knowledgePath(SOURCES_INDEX_FILE, knowledgeDataDir);
}

async function loadKnowledge(options = {}) {
  const knowledgeDataDir = options.knowledgeDataDir || env.KNOWLEDGE_DATA_DIR;
  const knowledge = {};

  for (const [category, descriptor] of Object.entries(KNOWLEDGE_FILES)) {
    const payload = await fileRepository.readJson(knowledgePath(descriptor.fileName, knowledgeDataDir), {
      [descriptor.key]: [],
    });
    knowledge[category] = Array.isArray(payload?.[descriptor.key]) ? payload[descriptor.key] : [];
  }

  return knowledge;
}

async function loadSourcesIndex(options = {}) {
  const indexPath = options.sourcesIndexPath || sourcesIndexPath(options.knowledgeDataDir);
  const payload = await fileRepository.readJson(indexPath, { sources: [] });
  return {
    ...payload,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
  };
}

async function getKnowledgeSummary(options = {}) {
  const knowledge = await loadKnowledge(options);
  const sourcesIndex = await loadSourcesIndex(options);
  const processedSources = sourcesIndex.sources.filter((source) => source.status === 'processed');
  const failedSources = sourcesIndex.sources.filter((source) => source.status === 'failed');
  const importedAtValues = sourcesIndex.sources
    .map((source) => source.importedAt)
    .filter(Boolean)
    .sort();

  return {
    categories: Object.fromEntries(
      Object.entries(knowledge).map(([category, values]) => [category, values.length]),
    ),
    files: Object.fromEntries(
      Object.entries(KNOWLEDGE_FILES).map(([category, descriptor]) => [category, descriptor.fileName]),
    ),
    sources: {
      total: sourcesIndex.sources.length,
      processed: processedSources.length,
      failed: failedSources.length,
      lastImportedAt: importedAtValues.length ? importedAtValues[importedAtValues.length - 1] : null,
      indexPath: sourcesIndexPath(options.knowledgeDataDir),
    },
    generatedAt: new Date().toISOString(),
  };
}

function matchesCondition(condition = {}, state = {}) {
  return Object.entries(condition).every(([key, expected]) => {
    const actual = state[key];

    if (Array.isArray(expected)) {
      return expected.includes(actual);
    }

    return actual === expected;
  });
}

function volatilityDangerLevel(volatility = {}) {
  const danger = Number(volatility.state?.dangerLevel || volatility.dangerLevel || 0);
  if (danger >= 70) return 'high';
  if (danger >= 35) return 'medium';
  return 'low';
}

function matchStrategies(knowledge, context) {
  const assetType = context.asset?.type;
  const technicalRegime = context.technical?.features?.regime;
  const volatilityRegime = context.volatility?.state?.regime;

  return knowledge.trading_strategies
    .filter((strategy) => {
      const assetMatch = !strategy.assetTypes || strategy.assetTypes.includes(assetType);
      const regimeMatch =
        !strategy.marketRegimes ||
        strategy.marketRegimes.includes(technicalRegime) ||
        strategy.marketRegimes.includes(volatilityRegime);
      return assetMatch && regimeMatch;
    })
    .map((strategy) => ({
      category: 'trading_strategies',
      id: strategy.id,
      name: strategy.name,
      note: strategy.notes,
      strategy,
    }));
}

function matchMacroRules(knowledge, context) {
  return knowledge.macro_rules
    .filter((rule) => matchesCondition(rule.condition, context.macro || {}))
    .map((rule) => ({
      category: 'macro_rules',
      id: rule.id,
      note: `Macro rule matched with confidence weight ${rule.confidenceWeight ?? 0}.`,
      rule,
    }));
}

function matchVolatilityRules(knowledge, context) {
  const state = context.volatility?.state || {};
  return knowledge.volatility_rules
    .filter((rule) => matchesCondition(rule.condition, state))
    .map((rule) => ({
      category: 'volatility_rules',
      id: rule.id,
      note: rule.impact?.risk || rule.impact?.strategy || 'Volatility rule matched.',
      rule,
    }));
}

function matchEventRules(knowledge, context) {
  const themes = context.geopolitics?.themes || [];

  return knowledge.event_rules
    .filter((rule) => {
      if (Array.isArray(rule.themes) && rule.themes.some((theme) => themes.includes(theme))) {
        return true;
      }

      return themes.includes(rule.eventType);
    })
    .map((rule) => ({
      category: 'event_rules',
      id: rule.id,
      note: `Event rule matched for themes: ${(rule.themes || [rule.eventType]).join(', ')}.`,
      rule,
    }));
}

function matchRegimeRules(knowledge, context) {
  const state = {
    technicalRegime: context.technical?.features?.regime,
    macroRegime: context.macro?.regime,
    volatilityRegime: context.volatility?.state?.regime,
  };

  return knowledge.regime_rules
    .filter((rule) => matchesCondition(rule.condition, state))
    .map((rule) => ({
      category: 'regime_rules',
      id: rule.id,
      note: rule.interpretation,
      rule,
    }));
}

function matchRiskRules(knowledge, context) {
  const state = {
    dangerLevel: volatilityDangerLevel(context.volatility),
    eventRisk: context.macro?.eventRisk,
    geopoliticalRisk: context.geopolitics?.riskLevel,
  };

  return knowledge.risk_rules
    .filter((rule) => matchesCondition(rule.condition, state))
    .map((rule) => ({
      category: 'risk_rules',
      id: rule.id,
      note: rule.note,
      positionSizingAdjustment: rule.positionSizingAdjustment,
      rule,
    }));
}

async function matchKnowledge(context = {}) {
  const knowledge = await loadKnowledge();
  return [
    ...matchStrategies(knowledge, context),
    ...matchMacroRules(knowledge, context),
    ...matchVolatilityRules(knowledge, context),
    ...matchEventRules(knowledge, context),
    ...matchRegimeRules(knowledge, context),
    ...matchRiskRules(knowledge, context),
  ];
}

module.exports = {
  KNOWLEDGE_FILES,
  SOURCES_INDEX_FILE,
  getKnowledgeSummary,
  knowledgePath,
  loadKnowledge,
  loadSourcesIndex,
  matchKnowledge,
  matchesCondition,
  sourcesIndexPath,
  volatilityDangerLevel,
};
