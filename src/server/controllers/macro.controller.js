const { getMacroSnapshot } = require('../services/macro/macro-engine.service');

async function getMacroSnapshotRoute(req, res, next) {
  try {
    res.json(await getMacroSnapshot());
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getMacroSnapshotRoute,
};
