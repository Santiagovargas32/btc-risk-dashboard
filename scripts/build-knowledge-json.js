#!/usr/bin/env node

const { getKnowledgeSummary } = require('../src/server/services/knowledge/knowledge-loader.service');

async function main() {
  const summary = await getKnowledgeSummary();
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
