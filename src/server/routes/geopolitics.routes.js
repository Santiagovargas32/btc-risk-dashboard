const express = require('express');
const geopoliticsController = require('../controllers/geopolitics.controller');

const router = express.Router();

router.get('/snapshot', geopoliticsController.getGeopoliticsSnapshot);

module.exports = router;
