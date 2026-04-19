const { getAsset } = require('../services/assets/asset-registry.service');
const { getGeopoliticalContext } = require('../services/geopolitics/geopolitical-engine.service');

async function getGeopoliticsSnapshot(req, res, next) {
  try {
    const asset = getAsset(req.query.symbol);
    const context = await getGeopoliticalContext(asset, {
      countries: req.query.countries || 'US,IL,IR',
      limit: req.query.limit ? Number(req.query.limit) : undefined,
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
