const express = require('express');
const scoringController = require('../controllers/scoring.controller');

const router = express.Router();

router.get('/', scoringController.getScoring);

module.exports = router;
