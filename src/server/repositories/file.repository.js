const fs = require('fs/promises');
const path = require('path');

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function listFilesRecursive(rootDir, predicate = () => true) {
  const found = [];

  async function walk(currentDir) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(entryPath);
      } else if (entry.isFile() && predicate(entryPath)) {
        found.push(entryPath);
      }
    }
  }

  if (!(await exists(rootDir))) {
    return found;
  }

  await walk(rootDir);
  return found.sort();
}

async function listCsvFiles(rootDir) {
  return listFilesRecursive(rootDir, (filePath) => filePath.toLowerCase().endsWith('.csv'));
}

async function copyFile(sourcePath, destinationPath) {
  await ensureDir(path.dirname(destinationPath));
  await fs.copyFile(sourcePath, destinationPath);
}

async function readText(filePath) {
  return fs.readFile(filePath, 'utf8');
}

async function writeJson(filePath, payload) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

async function readJson(filePath, fallback = null) {
  if (!(await exists(filePath))) {
    return fallback;
  }

  const contents = await readText(filePath);
  return JSON.parse(contents);
}

module.exports = {
  copyFile,
  ensureDir,
  exists,
  listCsvFiles,
  listFilesRecursive,
  readJson,
  readText,
  writeJson,
};
