const express = require('express');
const assetsController = require('../controllers/assets.controller');

const router = express.Router();

router.get('/', assetsController.getAssets);
router.get('/resolve', assetsController.resolveAsset);
router.post('/watchlist', assetsController.addWatchlistAsset);
router.delete('/watchlist/:symbol', assetsController.removeWatchlistAsset);

module.exports = router;
