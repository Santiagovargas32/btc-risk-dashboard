const assert = require('node:assert/strict');
const fs = require('fs/promises');
const path = require('path');
const app = require('../src/server/app');
const fileRepository = require('../src/server/repositories/file.repository');
const { getKnowledgeSummary } = require('../src/server/services/knowledge/knowledge-loader.service');
const {
  importKnowledgeDirectory,
  listKnowledgeSourceFiles,
  parseCsvKnowledge,
} = require('../src/server/services/knowledge/knowledge-directory-import.service');

async function makeWorkspace(name) {
  const root = path.resolve(process.cwd(), 'data/processed', `test-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  const sourceDir = path.join(root, 'source');
  const knowledgeDataDir = path.join(root, 'knowledge');
  await fileRepository.ensureDir(sourceDir);
  await fileRepository.ensureDir(knowledgeDataDir);
  return { root, sourceDir, knowledgeDataDir };
}

async function cleanup(root) {
  await fs.rm(root, { recursive: true, force: true });
}

async function writeText(filePath, contents) {
  await fileRepository.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, contents, 'utf8');
}

async function runWithServer(handler) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));

  try {
    return await handler(server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function run() {
  await testListKnowledgeSourceFiles();
  await testImportBatchAndSummary();
  await testCsvParsers();
  await testSkipForceAndDryRun();
  await testImportDirectoryEndpoint();
}

async function testListKnowledgeSourceFiles() {
  const { root, sourceDir } = await makeWorkspace('list');
  try {
    await writeText(path.join(sourceDir, 'a.txt'), 'trend following breakout');
    await writeText(path.join(sourceDir, 'b.md'), 'macro regime');
    await writeText(path.join(sourceDir, 'c.csv'), 'text\nrisk');
    await writeText(path.join(sourceDir, 'nested', 'd.pdf'), 'fake pdf placeholder');
    await writeText(path.join(sourceDir, 'ignore.png'), 'ignore');

    const files = await listKnowledgeSourceFiles(sourceDir);
    assert.equal(files.length, 4);
    assert.deepEqual(
      files.map((filePath) => path.extname(filePath).toLowerCase()).sort(),
      ['.csv', '.md', '.pdf', '.txt'],
    );
  } finally {
    await cleanup(root);
  }
}

async function testImportBatchAndSummary() {
  const { root, sourceDir, knowledgeDataDir } = await makeWorkspace('batch');
  try {
    await writeText(path.join(sourceDir, 'strategy.txt'), 'Trend following breakout with volatility compression and volume expansion.');
    await writeText(path.join(sourceDir, 'risk.md'), 'High volatility drawdown periods require reduced position size and stop loss rules.');

    const result = await importKnowledgeDirectory({
      sourceDir,
      knowledgeDataDir,
      force: true,
    });
    const summary = await getKnowledgeSummary({ knowledgeDataDir });

    assert.equal(result.processed, 2);
    assert.equal(result.failed, 0);
    assert.ok(result.counts.trading_strategies > 0);
    assert.ok(result.counts.risk_rules > 0);
    assert.equal(summary.sources.processed, 2);
    assert.equal(summary.sources.failed, 0);
  } finally {
    await cleanup(root);
  }
}

async function testCsvParsers() {
  const { root, sourceDir } = await makeWorkspace('csv');
  try {
    const structuredCsv = path.join(sourceDir, 'structured.csv');
    await writeText(
      structuredCsv,
      [
        'category,id,title,condition,impact,risk_note,assetTypes,marketRegimes,themes',
        'trading_strategies,csv_breakout,CSV Breakout,breakout,Use volume confirmation,Medium risk,crypto|stock,breakout|trend,',
        'event_rules,csv_conflict,Conflict Oil,conflict,oil bullish equities bearish,High risk,,conflict',
      ].join('\n'),
    );
    const structured = await parseCsvKnowledge(structuredCsv);
    assert.equal(structured.trading_strategies.strategies.length, 1);
    assert.equal(structured.event_rules.rules.length, 1);

    const unknownCsv = path.join(sourceDir, 'unknown.csv');
    await writeText(
      unknownCsv,
      ['text,comment', 'High volatility drawdown requires reduced position size,Stop loss discipline'].join('\n'),
    );
    const fallback = await parseCsvKnowledge(unknownCsv);
    assert.ok(fallback.risk_rules.rules.length > 0);
  } finally {
    await cleanup(root);
  }
}

async function testSkipForceAndDryRun() {
  const { root, sourceDir, knowledgeDataDir } = await makeWorkspace('skip');
  try {
    await writeText(path.join(sourceDir, 'macro.txt'), 'Inflation cools and central bank rates are falling while liquidity expands.');

    const first = await importKnowledgeDirectory({ sourceDir, knowledgeDataDir });
    const second = await importKnowledgeDirectory({ sourceDir, knowledgeDataDir });
    const forced = await importKnowledgeDirectory({ sourceDir, knowledgeDataDir, force: true });

    assert.equal(first.processed, 1);
    assert.equal(second.skipped, 1);
    assert.equal(forced.processed, 1);

    const dry = await makeWorkspace('dry');
    try {
      await writeText(path.join(dry.sourceDir, 'risk.txt'), 'High volatility danger means reduce size.');
      const dryRun = await importKnowledgeDirectory({
        sourceDir: dry.sourceDir,
        knowledgeDataDir: dry.knowledgeDataDir,
        dryRun: true,
      });
      assert.equal(dryRun.processed, 1);
      assert.equal(await fileRepository.exists(path.join(dry.knowledgeDataDir, 'sources.json')), false);
      assert.equal(await fileRepository.exists(path.join(dry.knowledgeDataDir, 'risk_rules.json')), false);
    } finally {
      await cleanup(dry.root);
    }
  } finally {
    await cleanup(root);
  }
}

async function testImportDirectoryEndpoint() {
  const { root, sourceDir } = await makeWorkspace('endpoint');
  try {
    await writeText(path.join(sourceDir, 'strategy.txt'), 'Trend following breakout with volume expansion.');

    await runWithServer(async (port) => {
      const response = await fetch(`http://127.0.0.1:${port}/api/knowledge/import-directory`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
        },
        body: JSON.stringify({
          sourceDir,
          dryRun: true,
        }),
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.processed, 1);
      assert.equal(payload.dryRun, true);
      assert.ok(Object.hasOwn(payload.counts, 'trading_strategies'));
    });
  } finally {
    await cleanup(root);
  }
}

module.exports = {
  name: 'knowledge directory import processes source folders and CSV rules',
  run,
};
