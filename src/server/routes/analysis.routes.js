const express = require('express');
const analysisController = require('../controllers/analysis.controller');

const router = express.Router();

router.get('/', analysisController.getAnalysis);
router.get('/multi-timeframe', analysisController.getMultiTimeframeAnalysis);

module.exports = router;
