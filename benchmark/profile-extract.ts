import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateFixture, FIXTURES } from './generate-fixtures.js';
import { createPackage, extractAll, uncache } from '../lib/asar.js';
import { readArchiveHeaderSync, readFilesystemSync } from '../lib/disk.js';

const config = FIXTURES.find((f) => f.name === 'many-small-files')!;
const fixtureDir = generateFixture(config);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-prof-extract-'));
const archiveFile = path.join(tmpDir, 'test.asar');
await createPackage(fixtureDir, archiveFile);
const archiveSize = fs.statSync(archiveFile).size;

console.log(
  `=== Extract breakdown: ${config.fileCount} files, archive ${(archiveSize / 1024).toFixed(0)} KB ===\n`,
);

// 1. Header parsing
{
  const t = performance.now();
  for (let i = 0; i < 10; i++) readArchiveHeaderSync(archiveFile);
  console.log(`header parse (avg):   ${((performance.now() - t) / 10).toFixed(2)}ms`);
}

// 2. listFiles
{
  uncache(archiveFile);
  const filesystem = readFilesystemSync(archiveFile);
  const t = performance.now();
  const files = filesystem.listFiles();
  console.log(
    `listFiles:            ${(performance.now() - t).toFixed(2)}ms (${files.length} entries)`,
  );

  // 3. getFile lookups
  const followLinks = process.platform === 'win32';
  const t2 = performance.now();
  for (const fullPath of files) {
    const filename = fullPath.substr(1);
    filesystem.getFile(filename, followLinks);
  }
  console.log(`getFile (all):        ${(performance.now() - t2).toFixed(2)}ms`);
}

// 4. Read all file data from archive with individual readSync
{
  uncache(archiveFile);
  const filesystem = readFilesystemSync(archiveFile);
  const files = filesystem.listFiles();
  const followLinks = process.platform === 'win32';
  const fd = fs.openSync(archiveFile, 'r');
  const headerSize = filesystem.getHeaderSize();

  let totalRead = 0;
  const t = performance.now();
  for (const fullPath of files) {
    const filename = fullPath.substr(1);
    const file = filesystem.getFile(filename, followLinks);
    if ('size' in file && !('files' in file) && !('link' in file) && !file.unpacked) {
      const buffer = Buffer.alloc(file.size);
      if (file.size > 0) {
        const offset = 8 + headerSize + parseInt(file.offset);
        fs.readSync(fd, buffer, 0, file.size, offset);
        totalRead += file.size;
      }
    }
  }
  fs.closeSync(fd);
  console.log(
    `readSync (individual): ${(performance.now() - t).toFixed(2)}ms (${totalRead} bytes)`,
  );

  // 5. Read all data in one shot
  const t2 = performance.now();
  const fd2 = fs.openSync(archiveFile, 'r');
  const dataStart = 8 + headerSize;
  const dataSize = archiveSize - dataStart;
  const allData = Buffer.alloc(dataSize);
  fs.readSync(fd2, allData, 0, dataSize, dataStart);
  fs.closeSync(fd2);
  console.log(`readSync (one shot):  ${(performance.now() - t2).toFixed(2)}ms (${dataSize} bytes)`);
}

// 6. writeFileSync overhead
{
  const extractDir = path.join(tmpDir, 'write-test');
  fs.mkdirSync(extractDir, { recursive: true });

  // Pre-generate content
  const content = Buffer.alloc(256, 0x41);
  const filePaths: string[] = [];
  for (let i = 0; i < 10000; i++) {
    const dir = path.join(extractDir, `d${i % 10}`);
    fs.mkdirSync(dir, { recursive: true });
    filePaths.push(path.join(dir, `f${i}.txt`));
  }

  const t = performance.now();
  for (const fp of filePaths) {
    fs.writeFileSync(fp, content);
  }
  console.log(`writeFileSync (10k):  ${(performance.now() - t).toFixed(1)}ms`);

  fs.rmSync(extractDir, { recursive: true });
}

// 7. mkdirSync overhead (with recursive)
{
  const extractDir = path.join(tmpDir, 'mkdir-test');
  const dirs: string[] = [];
  for (let i = 0; i < 1000; i++) {
    dirs.push(path.join(extractDir, `a${i % 10}`, `b${i % 100}`, `c${i}`));
  }
  const t = performance.now();
  for (const d of dirs) {
    fs.mkdirSync(d, { recursive: true });
  }
  console.log(`mkdirSync (1k):       ${(performance.now() - t).toFixed(1)}ms`);
  fs.rmSync(extractDir, { recursive: true });
}

// 8. Full extractAll for reference
{
  const extractDir = path.join(tmpDir, 'full-extract');
  uncache(archiveFile);
  const t = performance.now();
  extractAll(archiveFile, extractDir);
  console.log(`\nextractAll (total):    ${(performance.now() - t).toFixed(1)}ms`);
  fs.rmSync(extractDir, { recursive: true });
}

// 9. Pack insertFile loop overhead (without pre-read)
{
  console.log('\n--- Pack insert loop breakdown ---');
  const { crawl } = await import('../lib/crawlfs.js');
  const [filenames, metadata] = await crawl(fixtureDir + '/**/*', { dot: true });

  // Just the insert loop with readFileSync + hash
  const { Filesystem } = await import('../lib/filesystem.js');
  const filesystem = new Filesystem(fixtureDir);

  const fileEntries = filenames.filter((f) => metadata[f]?.type === 'file');
  const dirEntries = filenames.filter((f) => metadata[f]?.type === 'directory');

  let t = performance.now();
  for (const d of dirEntries) filesystem.insertDirectory(d, false);
  console.log(
    `insertDirectory:      ${(performance.now() - t).toFixed(1)}ms (${dirEntries.length})`,
  );

  t = performance.now();
  for (const f of fileEntries) {
    await filesystem.insertFile(f, () => fs.createReadStream(f), false, metadata[f]);
  }
  console.log(
    `insertFile (all):     ${(performance.now() - t).toFixed(1)}ms (${fileEntries.length})`,
  );
}

fs.rmSync(tmpDir, { recursive: true, force: true });
