#!/usr/bin/env node

const { importPdfKnowledge } = require('../src/server/services/knowledge/pdf-knowledge-engine.service');

async function main() {
  const filePath = process.argv[2];

  if (!filePath) {
    throw new Error('Usage: node scripts/import-pdf-knowledge.js <file.pdf|file.txt>');
  }

  const result = await importPdfKnowledge(filePath);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
