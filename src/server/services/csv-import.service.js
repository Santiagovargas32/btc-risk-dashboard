const path = require('path');
const fs = require('fs/promises');
const env = require('../config/env');
const fileRepository = require('../repositories/file.repository');
const parserService = require('./parser.service');
const normalizerService = require('./normalizer.service');
const { computeHistoricalFeatures } = require('./feature-engine.service');

const PROCESSABLE_FILE_PATTERNS = [/tradehistory/i, /wallethistory/i];

function appendItems(target, items) {
  for (const item of items) {
    target.push(item);
  }
}

function isProcessableHistoricalFile(filePath) {
  const fileName = path.basename(filePath);
  return PROCESSABLE_FILE_PATTERNS.some((pattern) => pattern.test(fileName));
}

async function validateSourcePath(sourcePath) {
  if (!sourcePath || sourcePath.includes('/absolute/path/to/')) {
    throw new Error('DATASET_SOURCE_PATH must point to the external BTC dataset folder.');
  }

  const stats = await fs.stat(sourcePath);
  if (!stats.isDirectory()) {
    throw new Error('DATASET_SOURCE_PATH must be a directory.');
  }
}

async function importDataset(options = {}) {
  const sourcePath = path.resolve(options.sourcePath || env.DATASET_SOURCE_PATH || '');
  const rawDir = options.rawDir || env.RAW_DATA_DIR;

  await validateSourcePath(sourcePath);
  await fileRepository.ensureDir(rawDir);

  const resolvedRawDir = path.resolve(rawDir);
  if (resolvedRawDir.startsWith(`${sourcePath}${path.sep}`)) {
    throw new Error('DATASET_SOURCE_PATH cannot contain this project data/raw directory.');
  }

  const csvFiles = await fileRepository.listCsvFiles(sourcePath);
  if (csvFiles.length === 0) {
    throw new Error(`No CSV files found under ${sourcePath}`);
  }

  const copied = [];

  for (const csvFile of csvFiles) {
    const relativePath = path.relative(sourcePath, csvFile);
    const destinationPath = path.join(rawDir, relativePath);
    await fileRepository.copyFile(csvFile, destinationPath);
    copied.push({
      source: csvFile,
      destination: destinationPath,
    });
  }

  return copied;
}

async function buildProcessedSnapshots(options = {}) {
  const rawDir = options.rawDir || env.RAW_DATA_DIR;
  const processedDir = options.processedDir || env.PROCESSED_DATA_DIR;
  const parsedFiles = await parserService.parseRawDirectory(rawDir, {
    filePredicate: isProcessableHistoricalFile,
  });

  const allTrades = [];
  const invalidRows = [];
  const fileSummaries = [];
  let invalidRowCount = 0;

  for (const parsedFile of parsedFiles) {
    const normalized = normalizerService.normalizeRows(parsedFile.rows, parsedFile.filePath, {
      invalidLimit: 50,
    });

    appendItems(allTrades, normalized.trades);
    appendItems(invalidRows, normalized.invalidRows);
    invalidRowCount += normalized.invalidRowCount;
    fileSummaries.push({
      fileName: path.basename(parsedFile.filePath),
      rows: parsedFile.rows.length,
      trades: normalized.trades.length,
      invalidRows: normalized.invalidRowCount,
    });
  }

  const serializedTrades = allTrades.map(normalizerService.serializeTrade);
  const historicalFeatures = computeHistoricalFeatures(allTrades);
  const generatedAt = new Date().toISOString();

  await fileRepository.writeJson(path.join(processedDir, 'trades.json'), {
    generatedAt,
    sourceFiles: parsedFiles.map((file) => path.basename(file.filePath)),
    count: serializedTrades.length,
    invalidRowCount,
    trades: serializedTrades,
  });

  await fileRepository.writeJson(path.join(processedDir, 'historical-features.json'), {
    generatedAt,
    features: historicalFeatures,
  });

  await fileRepository.writeJson(path.join(processedDir, 'invalid-rows.json'), {
    generatedAt,
    count: invalidRowCount,
    sampledCount: invalidRows.length,
    invalidRows,
    fileSummaries,
  });

  return {
    generatedAt,
    tradeCount: serializedTrades.length,
    invalidRowCount,
    sourceFileCount: parsedFiles.length,
    fileSummaries,
  };
}

module.exports = {
  buildProcessedSnapshots,
  importDataset,
};
