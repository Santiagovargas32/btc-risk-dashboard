#!/usr/bin/env node

const { importKnowledgeDirectory } = require('../src/server/services/knowledge/knowledge-directory-import.service');

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--force') {
      options.force = true;
    } else if (arg === '--dryRun' || arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--useLlm' || arg === '--use-llm') {
      options.useLlm = true;
    } else if (arg === '--sourceDir' || arg === '--source-dir') {
      options.sourceDir = argv[index + 1];
      index += 1;
    }
  }

  return options;
}

async function main() {
  const result = await importKnowledgeDirectory(parseArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
