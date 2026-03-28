import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { generateFixture, FIXTURES } from './generate-fixtures.js';

const config = FIXTURES.find((f) => f.name === 'many-small-files')!;
const fixtureDir = generateFixture(config);

// Get all files
const allFiles = fs.readdirSync(fixtureDir, { withFileTypes: true, recursive: true })
  .filter((e) => e.isFile())
  .map((e) => path.join(e.parentPath, e.name));

console.log(`=== Pack phase breakdown: ${allFiles.length} files, ~256B each ===\n`);

// 1. readFileSync for all files
{
  const t = performance.now();
  const bufs: Buffer[] = [];
  for (const f of allFiles) bufs.push(fs.readFileSync(f));
  console.log(`readFileSync all:     ${(performance.now() - t).toFixed(1)}ms`);
}

// 2. readFile (async) sequentially with await
{
  const t = performance.now();
  for (const f of allFiles) await fs.promises.readFile(f);
  console.log(`await readFile seq:   ${(performance.now() - t).toFixed(1)}ms`);
}

// 3. readFile (async) parallel
{
  const t = performance.now();
  await Promise.all(allFiles.map((f) => fs.promises.readFile(f)));
  console.log(`await readFile par:   ${(performance.now() - t).toFixed(1)}ms`);
}

// 4. Hash all buffers synchronously
{
  const bufs = allFiles.map((f) => fs.readFileSync(f));
  const t = performance.now();
  for (const buf of bufs) {
    crypto.createHash('SHA256').update(buf).digest('hex');
    // block hash too
    crypto.createHash('SHA256').update(buf).digest('hex');
  }
  console.log(`hash all (sync):      ${(performance.now() - t).toFixed(1)}ms`);
}

// 5. path.relative + path.normalize overhead
{
  const t = performance.now();
  for (let i = 0; i < allFiles.length; i++) {
    path.normalize(allFiles[i]);
    path.relative(fixtureDir, allFiles[i]);
    path.dirname(allFiles[i]);
    path.basename(allFiles[i]);
    path.relative(fixtureDir, path.dirname(allFiles[i]));
  }
  console.log(`path ops (5 per file): ${(performance.now() - t).toFixed(1)}ms`);
}

// 6. Individual write vs batch write
{
  const bufs = allFiles.map((f) => fs.readFileSync(f));
  const tmpFile = path.join(os.tmpdir(), 'asar-write-test');

  // Individual writes
  let t = performance.now();
  const out1 = fs.createWriteStream(tmpFile);
  for (const buf of bufs) {
    await new Promise<void>((resolve, reject) => {
      out1.write(buf, (err) => (err ? reject(err) : resolve()));
    });
  }
  out1.end();
  await new Promise((r) => out1.on('finish', r));
  console.log(`individual writes:    ${(performance.now() - t).toFixed(1)}ms`);

  // Batch write
  t = performance.now();
  const out2 = fs.createWriteStream(tmpFile);
  const combined = Buffer.concat(bufs);
  await new Promise<void>((resolve, reject) => {
    out2.write(combined, (err) => (err ? reject(err) : resolve()));
  });
  out2.end();
  await new Promise((r) => out2.on('finish', r));
  console.log(`batch write:          ${(performance.now() - t).toFixed(1)}ms`);

  // writev
  t = performance.now();
  const fd = fs.openSync(tmpFile, 'w');
  fs.writevSync(fd, bufs);
  fs.closeSync(fd);
  console.log(`writevSync:           ${(performance.now() - t).toFixed(1)}ms`);

  // writeFileSync single buffer
  t = performance.now();
  fs.writeFileSync(tmpFile, combined);
  console.log(`writeFileSync:        ${(performance.now() - t).toFixed(1)}ms`);

  fs.unlinkSync(tmpFile);
}

// 7. Promise/await overhead
{
  const t = performance.now();
  for (let i = 0; i < allFiles.length; i++) {
    await Promise.resolve();
  }
  console.log(`10k await Promise:    ${(performance.now() - t).toFixed(1)}ms`);
}

// 8. searchNodeFromDirectory simulation - splitting paths and traversing
{
  const header: any = { files: {} };
  // Build tree
  const t = performance.now();
  for (const file of allFiles) {
    const rel = path.relative(fixtureDir, file);
    const parts = rel.split(path.sep);
    let node = header;
    for (const part of parts) {
      if (!node.files[part]) node.files[part] = { files: {} };
      node = node.files[part];
    }
  }
  console.log(`tree build:           ${(performance.now() - t).toFixed(1)}ms`);
}

// 9. Minimatch overhead
{
  const { minimatch } = await import('minimatch');
  const t = performance.now();
  for (const file of allFiles) {
    minimatch(file, '*.node', { matchBase: true });
  }
  console.log(`minimatch (10k):      ${(performance.now() - t).toFixed(1)}ms`);
}
