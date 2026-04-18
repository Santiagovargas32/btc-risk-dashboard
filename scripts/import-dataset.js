const csvImportService = require('../src/server/services/csv-import.service');
const logger = require('../src/server/utils/logger');

async function main() {
  const copied = await csvImportService.importDataset();
  const snapshots = await csvImportService.buildProcessedSnapshots();

  logger.info('Dataset imported into data/raw and processed snapshots rebuilt.', {
    copiedFiles: copied.length,
    ...snapshots,
  });
}

main().catch((error) => {
  logger.error(error.message);
  process.exitCode = 1;
});
