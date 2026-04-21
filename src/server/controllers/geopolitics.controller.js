const assetCatalog = require('../services/assets/asset-catalog.service');
const { getGeopoliticalContext } = require('../services/geopolitics/geopolitical-engine.service');

async function getGeopoliticsSnapshot(req, res, next) {
  try {
    const asset = await assetCatalog.resolveAsset(req.query.symbol);
    const context = await getGeopoliticalContext(asset, {
      countries: req.query.countries,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      windowMin: req.query.windowMin ? Number(req.query.windowMin) : undefined,
    });
    res.json({
      asset,
      ...context,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getGeopoliticsSnapshot,
};
