const { getKnowledgeSummary } = require('../services/knowledge/knowledge-loader.service');
const { importPdfKnowledge } = require('../services/knowledge/pdf-knowledge-engine.service');
const { importKnowledgeDirectory } = require('../services/knowledge/knowledge-directory-import.service');

async function getKnowledgeSummaryRoute(req, res, next) {
  try {
    res.json(await getKnowledgeSummary());
  } catch (error) {
    next(error);
  }
}

async function importPdfKnowledgeRoute(req, res, next) {
  try {
    if (!req.body?.filePath) {
      const error = new Error('filePath is required.');
      error.status = 400;
      throw error;
    }

    const result = await importPdfKnowledge(req.body.filePath, {
      dryRun: Boolean(req.body.dryRun),
      includeExtracted: Boolean(req.body.includeExtracted),
      useLlm: Boolean(req.body.useLlm),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

async function importKnowledgeDirectoryRoute(req, res, next) {
  try {
    const result = await importKnowledgeDirectory({
      sourceDir: req.body?.sourceDir,
      force: Boolean(req.body?.force),
      dryRun: Boolean(req.body?.dryRun),
      useLlm: Boolean(req.body?.useLlm),
    });
    res.json(result);
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getKnowledgeSummaryRoute,
  importKnowledgeDirectoryRoute,
  importPdfKnowledgeRoute,
};
