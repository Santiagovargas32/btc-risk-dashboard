const assetCatalog = require('../services/assets/asset-catalog.service');
const { buildAssetProfile } = require('../services/assets/asset-profile.service');
const { analyzeTimeframe, analyzeMultiTimeframe } = require('../services/technical/timeframe-technical.service');
const { getMacroSnapshot } = require('../services/macro/macro-engine.service');
const { getGeopoliticalContext } = require('../services/geopolitics/geopolitical-engine.service');
const { analyzeVolatility } = require('../services/volatility/volatility-engine.service');
const { matchKnowledge } = require('../services/knowledge/knowledge-loader.service');
const { runFusion, runMultiTimeframeFusion } = require('../services/fusion/fusion-engine.service');
const { scoreWithLlm } = require('../services/scoring/llm-score.service');

function shouldIncludeLlm(query = {}) {
  return String(query.llm || 'true').toLowerCase() !== 'false';
}

async function buildAnalysisPayload(options = {}) {
  const asset = await assetCatalog.resolveAsset(options.symbol);
  const interval = options.interval || '1h';
  const timeframe = await analyzeTimeframe({
    asset,
    interval,
    limit: options.limit,
  });
  const technical = timeframe.technical;
  const macro = await getMacroSnapshot();
  const geopolitics = await getGeopoliticalContext(asset);
  const volatility = analyzeVolatility(timeframe.candles, technical.features);
  const knowledgeMatches = await matchKnowledge({
    asset,
    technical,
    macro,
    geopolitics,
    volatility,
  });
  const deterministic = runFusion({
    asset,
    technical,
    macro,
    geopolitics,
    volatility,
    knowledgeMatches,
  });
  const llm = options.includeLlm
    ? await scoreWithLlm({
        asset,
        technical,
        macro,
        geopolitics,
        volatility,
        deterministic: {
          signal: deterministic.signal,
          totalScore: deterministic.totalScore,
          confidence: deterministic.confidence,
          riskLevel: deterministic.riskLevel,
        },
      })
    : undefined;

  return {
    asset: buildAssetProfile(asset),
    timeframe: interval,
    signal: deterministic.signal,
    confidence: deterministic.confidence,
    riskLevel: deterministic.riskLevel,
    scores: {
      technical: deterministic.components.technical.score,
      macro: deterministic.components.macro.score,
      geopolitics: deterministic.components.geopolitics.score,
      volatility: deterministic.components.volatility.score,
      total: deterministic.totalScore,
    },
    components: {
      technical,
      macro,
      geopolitics,
      volatility,
    },
    deterministic,
    knowledgeMatches,
    summary: deterministic.summary,
    llm,
    generatedAt: new Date().toISOString(),
  };
}

async function buildMultiTimeframePayload(options = {}) {
  const asset = await assetCatalog.resolveAsset(options.symbol);
  const timeframes = await analyzeMultiTimeframe({
    asset,
    limit: options.limit,
  });
  const primary = timeframes.find((analysis) => analysis.interval === '1h') || timeframes[0];
  const macro = await getMacroSnapshot();
  const geopolitics = await getGeopoliticalContext(asset);
  const volatility = analyzeVolatility(primary.candles, primary.technical.features);
  const knowledgeMatches = await matchKnowledge({
    asset,
    technical: primary.technical,
    macro,
    geopolitics,
    volatility,
  });
  const deterministic = runMultiTimeframeFusion({
    asset,
    timeframes: timeframes.map((analysis) => ({
      interval: analysis.interval,
      technical: analysis.technical,
    })),
    macro,
    geopolitics,
    volatility,
    knowledgeMatches,
  });

  return {
    asset: buildAssetProfile(asset),
    signal: deterministic.signal,
    confidence: deterministic.confidence,
    riskLevel: deterministic.riskLevel,
    scores: {
      technical: deterministic.components.technical.score,
      macro: deterministic.components.macro.score,
      geopolitics: deterministic.components.geopolitics.score,
      volatility: deterministic.components.volatility.score,
      total: deterministic.totalScore,
    },
    alignment: deterministic.alignment,
    timeframes: timeframes.map((analysis) => ({
      interval: analysis.interval,
      score: analysis.technical.score,
      regime: analysis.technical.features.regime,
      trend: analysis.technical.features.trend,
      rsi: analysis.technical.features.rsi,
      momentum: analysis.technical.features.momentum,
    })),
    deterministic,
    knowledgeMatches,
    summary: deterministic.summary,
    generatedAt: new Date().toISOString(),
  };
}

async function getAnalysis(req, res, next) {
  try {
    const payload = await buildAnalysisPayload({
      symbol: req.query.symbol,
      interval: req.query.interval,
      includeLlm: shouldIncludeLlm(req.query),
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

async function getMultiTimeframeAnalysis(req, res, next) {
  try {
    const payload = await buildMultiTimeframePayload({
      symbol: req.query.symbol,
    });
    res.json(payload);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  buildAnalysisPayload,
  buildMultiTimeframePayload,
  getAnalysis,
  getMultiTimeframeAnalysis,
};
