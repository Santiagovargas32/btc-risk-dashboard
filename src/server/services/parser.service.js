const path = require('path');
const { parse } = require('csv-parse/sync');
const fileRepository = require('../repositories/file.repository');

async function parseCsvFile(filePath) {
  const contents = await fileRepository.readText(filePath);
  const rows = parse(contents, {
    bom: true,
    columns: true,
    relax_column_count: true,
    skip_empty_lines: true,
    trim: true,
  });

  return {
    filePath,
    fileName: path.basename(filePath),
    rows,
  };
}

async function parseRawDirectory(rawDir, options = {}) {
  const csvFiles = (await fileRepository.listCsvFiles(rawDir)).filter(
    options.filePredicate || (() => true),
  );
  const parsedFiles = [];

  for (const csvFile of csvFiles) {
    parsedFiles.push(await parseCsvFile(csvFile));
  }

  return parsedFiles;
}

module.exports = {
  parseCsvFile,
  parseRawDirectory,
};
