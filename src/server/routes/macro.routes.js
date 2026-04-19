const express = require('express');
const macroController = require('../controllers/macro.controller');

const router = express.Router();

router.get('/snapshot', macroController.getMacroSnapshotRoute);

module.exports = router;
