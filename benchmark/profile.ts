import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateFixture, FIXTURES } from './generate-fixtures.js';
import { crawl } from '../lib/crawlfs.js';
import { createPackageFromFiles, extractAll, uncache } from '../lib/asar.js';

const config = FIXTURES.find((f) => f.name === 'many-small-files')!;
const fixtureDir = generateFixture(config);
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-profile-'));
const archiveFile = path.join(tmpDir, 'test.asar');

console.log('=== Profiling many-small-files (10,000 x ~256B = 2.4MB) ===\n');

// Profile pack phases
{
  console.log('--- PACK BREAKDOWN ---');
  let t = performance.now();
  const [filenames, metadata] = await crawl(fixtureDir + '/**/*', { dot: true });
  const crawlTime = performance.now() - t;
  console.log(`  crawl:         ${crawlTime.toFixed(1)}ms (${filenames.length} entries)`);

  t = performance.now();
  await createPackageFromFiles(fixtureDir, archiveFile, [...filenames], { ...metadata });
  const packTime = performance.now() - t;
  console.log(`  pack (no crawl): ${packTime.toFixed(1)}ms`);
  console.log(`  TOTAL:         ${(crawlTime + packTime).toFixed(1)}ms`);

  const archiveSize = fs.statSync(archiveFile).size;
  console.log(`  archive size:  ${(archiveSize / 1024).toFixed(1)} KB\n`);
}

// Profile extract
{
  console.log('--- EXTRACT BREAKDOWN ---');
  uncache(archiveFile);
  const extractDir = path.join(tmpDir, 'extracted');

  const t = performance.now();
  extractAll(archiveFile, extractDir);
  const extractTime = performance.now() - t;
  console.log(`  extractAll:    ${extractTime.toFixed(1)}ms\n`);
}

// Profile: how much time is just integrity hashing?
{
  console.log('--- INTEGRITY HASH OVERHEAD ---');
  const { getFileIntegrity } = await import('../lib/integrity.js');

  // Hash 10,000 small files via streams
  const files = fs
    .readdirSync(fixtureDir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));

  let t = performance.now();
  for (const file of files) {
    await getFileIntegrity(fs.createReadStream(file));
  }
  const streamHashTime = performance.now() - t;
  console.log(`  stream-based:  ${streamHashTime.toFixed(1)}ms (${files.length} files)`);
  console.log(`  per file:      ${(streamHashTime / files.length).toFixed(3)}ms`);

  // Compare: hash via buffer (no stream overhead)
  const crypto = await import('node:crypto');
  t = performance.now();
  for (const file of files) {
    const buf = fs.readFileSync(file);
    crypto.createHash('SHA256').update(buf).digest('hex');
  }
  const bufferHashTime = performance.now() - t;
  console.log(`  buffer-based:  ${bufferHashTime.toFixed(1)}ms (${files.length} files)`);
  console.log(`  per file:      ${(bufferHashTime / files.length).toFixed(3)}ms`);
  console.log(`  SPEEDUP:       ${(streamHashTime / bufferHashTime).toFixed(1)}x\n`);
}

// Profile: how much time is file I/O vs stream setup?
{
  console.log('--- STREAM vs BUFFER READ ---');
  const files = fs
    .readdirSync(fixtureDir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile())
    .map((e) => path.join(e.parentPath, e.name));

  // Read all files via streams
  let t = performance.now();
  for (const file of files) {
    await new Promise<void>((resolve, reject) => {
      const s = fs.createReadStream(file);
      const chunks: Buffer[] = [];
      s.on('data', (c) => chunks.push(c as Buffer));
      s.on('end', () => {
        Buffer.concat(chunks);
        resolve();
      });
      s.on('error', reject);
    });
  }
  const streamReadTime = performance.now() - t;
  console.log(`  stream read:   ${streamReadTime.toFixed(1)}ms`);

  // Read all files via readFileSync
  t = performance.now();
  for (const file of files) {
    fs.readFileSync(file);
  }
  const syncReadTime = performance.now() - t;
  console.log(`  sync read:     ${syncReadTime.toFixed(1)}ms`);
  console.log(`  SPEEDUP:       ${(streamReadTime / syncReadTime).toFixed(1)}x`);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
