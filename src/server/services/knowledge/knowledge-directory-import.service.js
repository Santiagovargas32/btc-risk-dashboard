const fs = require('fs/promises');
const path = require('path');
const { parse } = require('csv-parse/sync');
const env = require('../../config/env');
const fileRepository = require('../../repositories/file.repository');
const {
  KNOWLEDGE_FILES,
  sourcesIndexPath,
} = require('./knowledge-loader.service');
const {
  buildKnowledgeFromText,
  importPdfKnowledge,
  mergeExtractedKnowledge,
} = require('./pdf-knowledge-engine.service');

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.txt', '.md', '.csv']);
const VALID_CATEGORIES = new Set(Object.keys(KNOWLEDGE_FILES));
const CATEGORY_KEYS = Object.fromEntries(
  Object.entries(KNOWLEDGE_FILES).map(([category, descriptor]) => [category, descriptor.key]),
);
const CSV_KNOWN_COLUMNS = new Set([
  'category',
  'id',
  'title',
  'name',
  'condition',
  'impact',
  'risk_note',
  'note',
  'assettypes',
  'marketregimes',
  'themes',
  'signals',
  'bias',
  'riskprofile',
  'confidenceweight',
  'events',
  'eventtype',
  'positionsizingadjustment',
]);

function createEmptyExtracted() {
  return Object.fromEntries(
    Object.entries(CATEGORY_KEYS).map(([category, key]) => [category, { [key]: [] }]),
  );
}

function normalizeHeader(header) {
  return String(header || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
}

function normalizeRow(row = {}) {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeHeader(key), value]),
  );
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
}

function splitList(value, fallback = []) {
  if (!value) {
    return fallback;
  }

  return String(value)
    .split(/[|;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseObjectCell(value, fallback = {}) {
  if (!value) {
    return fallback;
  }

  const raw = String(value).trim();
  if (raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  const entries = raw
    .split(/[|;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const separator = part.includes('=') ? '=' : part.includes(':') ? ':' : null;
      if (!separator) return null;
      const [key, ...rest] = part.split(separator);
      return [key.trim(), rest.join(separator).trim()];
    })
    .filter(Boolean);

  if (entries.length === 0) {
    return { summary: raw };
  }

  return Object.fromEntries(entries);
}

function sourceMetadata(filePath, section) {
  return {
    fileName: path.basename(filePath || 'unknown'),
    section,
    extractedAt: new Date().toISOString(),
  };
}

function addExtracted(target, category, value) {
  const key = CATEGORY_KEYS[category];
  if (!key) return;

  const bucket = target[category][key];
  if (!bucket.some((item) => item.id === value.id)) {
    bucket.push(value);
  }
}

function rowToText(row = {}) {
  return Object.entries(row)
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim() !== '')
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
}

function mergeExtracted(target, incoming) {
  for (const [category, descriptor] of Object.entries(KNOWLEDGE_FILES)) {
    const key = descriptor.key;
    for (const item of incoming?.[category]?.[key] || []) {
      addExtracted(target, category, item);
    }
  }

  return target;
}

function inferCategory(row) {
  const candidate = String(row.category || '').trim();
  if (VALID_CATEGORIES.has(candidate)) {
    return candidate;
  }

  return null;
}

function idForRow(row, filePath, rowNumber, prefix) {
  return (
    slugify(row.id) ||
    `${prefix}_${slugify(row.title || row.name || row.impact || path.basename(filePath))}_${rowNumber}`
  );
}

function structuredRuleFromRow(row, filePath, rowNumber) {
  const category = inferCategory(row);
  if (!category) {
    return null;
  }

  const source = sourceMetadata(filePath, `csv_row_${rowNumber}`);
  const note = row.risk_note || row.note || row.impact || row.condition || '';
  const impact = parseObjectCell(row.impact, { summary: row.impact || note });
  const condition = parseObjectCell(row.condition, {});

  if (category === 'trading_strategies') {
    return {
      category,
      value: {
        id: idForRow(row, filePath, rowNumber, 'csv_strategy'),
        name: row.title || row.name || 'CSV Strategy',
        assetTypes: splitList(row.assettypes, ['crypto', 'stock', 'etf']),
        marketRegimes: splitList(row.marketregimes, ['trend', 'range', 'breakout']),
        signals: splitList(row.signals || row.condition, ['csv_signal']),
        riskProfile: row.riskprofile || 'medium',
        bias: row.bias || 'neutral',
        notes: note,
        source,
      },
    };
  }

  if (category === 'macro_rules') {
    return {
      category,
      value: {
        id: idForRow(row, filePath, rowNumber, 'csv_macro'),
        condition,
        impact,
        confidenceWeight: Number(row.confidenceweight || 0.45),
        source,
      },
    };
  }

  if (category === 'volatility_rules') {
    return {
      category,
      value: {
        id: idForRow(row, filePath, rowNumber, 'csv_volatility'),
        condition: Object.keys(condition).length ? condition : { regime: 'high_vol_noise' },
        impact,
        confidenceWeight: Number(row.confidenceweight || 0.45),
        source,
      },
    };
  }

  if (category === 'event_rules') {
    return {
      category,
      value: {
        id: idForRow(row, filePath, rowNumber, 'csv_event'),
        eventType: row.eventtype || condition.eventType || 'macro_event',
        themes: splitList(row.themes),
        impact,
        source,
      },
    };
  }

  if (category === 'regime_rules') {
    return {
      category,
      value: {
        id: idForRow(row, filePath, rowNumber, 'csv_regime'),
        condition,
        interpretation: row.impact || row.note || row.condition || '',
        confidenceWeight: Number(row.confidenceweight || 0.4),
        source,
      },
    };
  }

  return {
    category,
    value: {
      id: idForRow(row, filePath, rowNumber, 'csv_risk'),
      condition: Object.keys(condition).length ? condition : { dangerLevel: 'medium' },
      positionSizingAdjustment: Number(row.positionsizingadjustment || -0.15),
      note,
      source,
    },
  };
}

function hasKnownCsvColumns(rows) {
  return rows.some((row) =>
    Object.keys(row).some((key) => CSV_KNOWN_COLUMNS.has(normalizeHeader(key))),
  );
}

function countExtracted(extracted) {
  return Object.fromEntries(
    Object.entries(KNOWLEDGE_FILES).map(([category, descriptor]) => [
      category,
      {
        addedOrUpdated: extracted?.[category]?.[descriptor.key]?.length || 0,
        total: null,
      },
    ]),
  );
}

function normalizeCounts(counts = {}) {
  return Object.fromEntries(
    Object.keys(KNOWLEDGE_FILES).map((category) => {
      const value = counts[category];
      if (typeof value === 'number') {
        return [category, { addedOrUpdated: value, total: null }];
      }

      return [
        category,
        {
          addedOrUpdated: Number(value?.addedOrUpdated || 0),
          total: value?.total ?? null,
        },
      ];
    }),
  );
}

async function parseCsvKnowledge(filePath) {
  const content = await fileRepository.readText(filePath);
  const rows = parse(content, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });
  const extracted = createEmptyExtracted();

  if (!hasKnownCsvColumns(rows)) {
    for (const [index, row] of rows.entries()) {
      mergeExtracted(extracted, buildKnowledgeFromText(rowToText(row), `${filePath}#row-${index + 1}`));
    }
    return extracted;
  }

  for (const [index, rawRow] of rows.entries()) {
    const row = normalizeRow(rawRow);
    const structured = structuredRuleFromRow(row, filePath, index + 1);

    if (structured) {
      addExtracted(extracted, structured.category, structured.value);
    } else {
      mergeExtracted(extracted, buildKnowledgeFromText(rowToText(rawRow), `${filePath}#row-${index + 1}`));
    }
  }

  return extracted;
}

async function importCsvKnowledge(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const extracted = await parseCsvKnowledge(resolvedPath);
  const counts = options.dryRun
    ? countExtracted(extracted)
    : await mergeExtractedKnowledge(extracted, options);

  return {
    sourceFile: path.basename(resolvedPath),
    mode: 'csv-deterministic',
    rowCounts: countExtracted(extracted),
    counts,
    extracted: options.includeExtracted ? extracted : undefined,
    importedAt: new Date().toISOString(),
  };
}

function resolveSourceDir(sourceDir) {
  const candidate = sourceDir || env.KNOWLEDGE_SOURCE_DIR;
  if (!candidate) {
    const error = new Error('sourceDir is required. Set KNOWLEDGE_SOURCE_DIR or pass sourceDir explicitly.');
    error.status = 400;
    throw error;
  }

  return path.resolve(candidate);
}

async function assertDirectory(sourceDir) {
  try {
    const stat = await fs.stat(sourceDir);
    if (!stat.isDirectory()) {
      const error = new Error(`Knowledge source path is not a directory: ${sourceDir}`);
      error.status = 400;
      throw error;
    }
  } catch (error) {
    if (error.status) throw error;
    const wrapped = new Error(`Knowledge source directory does not exist: ${sourceDir}`);
    wrapped.status = 400;
    throw wrapped;
  }
}

async function listKnowledgeSourceFiles(sourceDir) {
  const resolvedDir = resolveSourceDir(sourceDir);
  await assertDirectory(resolvedDir);

  return fileRepository.listFilesRecursive(resolvedDir, (filePath) =>
    SUPPORTED_EXTENSIONS.has(path.extname(filePath).toLowerCase()),
  );
}

async function getFileSnapshot(filePath) {
  const stat = await fs.stat(filePath);
  const resolvedPath = path.resolve(filePath);

  return {
    filePath: resolvedPath,
    fileName: path.basename(resolvedPath),
    extension: path.extname(resolvedPath).toLowerCase(),
    sizeBytes: stat.size,
    modifiedAt: stat.mtime.toISOString(),
  };
}

function defaultSourcesIndexPath(options = {}) {
  return options.sourcesIndexPath || sourcesIndexPath(options.knowledgeDataDir);
}

async function readSourcesIndex(options = {}) {
  const indexPath = defaultSourcesIndexPath(options);
  const payload = await fileRepository.readJson(indexPath, { sources: [] });

  return {
    ...payload,
    sources: Array.isArray(payload?.sources) ? payload.sources : [],
  };
}

async function writeSourcesIndex(index, options = {}) {
  const indexPath = defaultSourcesIndexPath(options);
  await fileRepository.writeJson(indexPath, {
    ...index,
    sources: index.sources || [],
    updatedAt: new Date().toISOString(),
  });
  return indexPath;
}

function findSourceEntry(index, snapshot) {
  return index.sources.find((source) => source.filePath === snapshot.filePath);
}

function shouldSkipFile(index, snapshot, force = false) {
  if (force) {
    return false;
  }

  const existing = findSourceEntry(index, snapshot);
  return (
    existing?.status === 'processed' &&
    existing.sizeBytes === snapshot.sizeBytes &&
    existing.modifiedAt === snapshot.modifiedAt
  );
}

function upsertSourceEntry(index, entry) {
  const sources = index.sources.filter((source) => source.filePath !== entry.filePath);
  sources.push(entry);
  index.sources = sources.sort((left, right) => left.filePath.localeCompare(right.filePath));
  return index;
}

async function importKnowledgeFile(filePath, options = {}) {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.csv') {
    return importCsvKnowledge(filePath, options);
  }

  const result = await importPdfKnowledge(filePath, {
    ...options,
    includeExtracted: options.dryRun || options.includeExtracted,
  });

  return {
    ...result,
    counts: options.dryRun && result.extracted ? countExtracted(result.extracted) : result.counts,
    extracted: options.includeExtracted ? result.extracted : undefined,
  };
}

function sourceEntryFromResult(snapshot, result, status, error = null) {
  return {
    ...snapshot,
    importedAt: new Date().toISOString(),
    status,
    counts: normalizeCounts(result?.counts),
    error: error ? String(error.message || error) : null,
  };
}

function addSummaryCounts(totalCounts, counts = {}) {
  for (const category of Object.keys(KNOWLEDGE_FILES)) {
    const value = counts[category];
    const addedOrUpdated =
      typeof value === 'number' ? value : Number(value?.addedOrUpdated ?? 0);
    totalCounts[category] = (totalCounts[category] || 0) + addedOrUpdated;
  }
}

function buildImportSummary(results = [], meta = {}) {
  const counts = Object.fromEntries(Object.keys(KNOWLEDGE_FILES).map((category) => [category, 0]));

  for (const result of results) {
    if (result.status === 'processed') {
      addSummaryCounts(counts, result.counts);
    }
  }

  return {
    sourceDir: meta.sourceDir,
    processed: results.filter((result) => result.status === 'processed').length,
    skipped: results.filter((result) => result.status === 'skipped').length,
    failed: results.filter((result) => result.status === 'failed').length,
    counts,
    sourcesIndexPath: meta.sourcesIndexPath,
    dryRun: Boolean(meta.dryRun),
    files: results,
    generatedAt: new Date().toISOString(),
  };
}

async function importKnowledgeDirectory(options = {}) {
  const sourceDir = resolveSourceDir(options.sourceDir);
  const files = await listKnowledgeSourceFiles(sourceDir);
  const indexOptions = {
    knowledgeDataDir: options.knowledgeDataDir,
    sourcesIndexPath: options.sourcesIndexPath,
  };
  const index = await readSourcesIndex(indexOptions);
  const results = [];

  for (const filePath of files) {
    const snapshot = await getFileSnapshot(filePath);

    if (shouldSkipFile(index, snapshot, Boolean(options.force))) {
      const existing = findSourceEntry(index, snapshot);
      results.push({
        ...snapshot,
        status: 'skipped',
        counts: normalizeCounts(existing?.counts),
        error: null,
      });
      continue;
    }

    try {
      const imported = await importKnowledgeFile(filePath, options);
      const entry = sourceEntryFromResult(snapshot, imported, 'processed');
      results.push(entry);

      if (!options.dryRun) {
        upsertSourceEntry(index, entry);
      }
    } catch (error) {
      const entry = sourceEntryFromResult(snapshot, null, 'failed', error);
      results.push(entry);

      if (!options.dryRun) {
        upsertSourceEntry(index, entry);
      }
    }
  }

  const indexPath = defaultSourcesIndexPath(indexOptions);
  if (!options.dryRun) {
    await writeSourcesIndex(index, indexOptions);
  }

  return buildImportSummary(results, {
    sourceDir,
    sourcesIndexPath: indexPath,
    dryRun: options.dryRun,
  });
}

module.exports = {
  SUPPORTED_EXTENSIONS,
  buildImportSummary,
  countExtracted,
  getFileSnapshot,
  importCsvKnowledge,
  importKnowledgeDirectory,
  listKnowledgeSourceFiles,
  parseCsvKnowledge,
  readSourcesIndex,
  shouldSkipFile,
  writeSourcesIndex,
};
