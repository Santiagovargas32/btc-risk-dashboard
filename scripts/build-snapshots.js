const csvImportService = require('../src/server/services/csv-import.service');
const logger = require('../src/server/utils/logger');

async function main() {
  const snapshots = await csvImportService.buildProcessedSnapshots();

  logger.info('Processed snapshots rebuilt from data/raw.', snapshots);
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
