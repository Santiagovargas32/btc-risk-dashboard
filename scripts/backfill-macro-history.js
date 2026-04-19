#!/usr/bin/env node

const fileRepository = require('../src/server/repositories/file.repository');
const env = require('../src/server/config/env');
const { getMacroSnapshot } = require('../src/server/services/macro/macro-engine.service');
const path = require('path');

async function main() {
  const snapshot = await getMacroSnapshot();
  const outputPath = path.join(env.PROCESSED_DATA_DIR, 'macro-history.json');
  const current = await fileRepository.readJson(outputPath, { snapshots: [] });
  const snapshots = Array.isArray(current.snapshots) ? current.snapshots : [];
  snapshots.push(snapshot);
  await fileRepository.writeJson(outputPath, { snapshots });
  console.log(JSON.stringify({ outputPath, count: snapshots.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
