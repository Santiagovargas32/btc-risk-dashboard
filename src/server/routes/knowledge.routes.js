const express = require('express');
const knowledgeController = require('../controllers/knowledge.controller');

const router = express.Router();

router.get('/summary', knowledgeController.getKnowledgeSummaryRoute);
router.post('/import-pdf', knowledgeController.importPdfKnowledgeRoute);
router.post('/import-directory', knowledgeController.importKnowledgeDirectoryRoute);

module.exports = router;
