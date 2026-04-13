import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { generateFixture, formatBytes, FIXTURES } from './generate-fixtures.js';
import { createPackage, createPackageFromFiles } from '../lib/asar.js';
import { crawl } from '../lib/crawlfs.js';

function getMemoryUsage() {
  if (global.gc) global.gc();
  return process.memoryUsage();
}

function printMem(label: string, before: NodeJS.MemoryUsage, after: NodeJS.MemoryUsage) {
  const heapDelta = after.heapUsed - before.heapUsed;
  const rssDelta = after.rss - before.rss;
  console.log(
    `  ${label.padEnd(30)} ` +
      `heap: ${formatBytes(after.heapUsed).padStart(10)} (Δ ${(heapDelta >= 0 ? '+' : '') + formatBytes(heapDelta)})  ` +
      `rss: ${formatBytes(after.rss).padStart(10)} (Δ ${(rssDelta >= 0 ? '+' : '') + formatBytes(rssDelta)})`,
  );
}

async function profileFixture(name: string) {
  const config = FIXTURES.find((f) => f.name === name)!;
  const fixtureDir = generateFixture(config);
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), `asar-mem-${name}-`));
  const archiveFile = path.join(tmpDir, `${name}.asar`);

  // Get data size
  let dataSize = 0;
  for (const entry of fs.readdirSync(fixtureDir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) dataSize += fs.statSync(path.join(entry.parentPath, entry.name)).size;
  }

  console.log(`\n=== ${name} (${config.fileCount} files, ${formatBytes(dataSize)}) ===`);

  // Measure: createPackage (full pipeline)
  {
    const before = getMemoryUsage();

    // Track peak heap during packing
    let peakHeap = before.heapUsed;
    let peakRss = before.rss;
    const interval = setInterval(() => {
      const mem = process.memoryUsage();
      if (mem.heapUsed > peakHeap) peakHeap = mem.heapUsed;
      if (mem.rss > peakRss) peakRss = mem.rss;
    }, 1);

    if (fs.existsSync(archiveFile)) fs.unlinkSync(archiveFile);
    await createPackage(fixtureDir, archiveFile);

    clearInterval(interval);
    const after = getMemoryUsage();
    // One final peak check
    if (after.heapUsed > peakHeap) peakHeap = after.heapUsed;
    if (after.rss > peakRss) peakRss = after.rss;

    printMem('createPackage (after)', before, after);
    console.log(
      `  ${'peak heap'.padEnd(30)} ${formatBytes(peakHeap).padStart(10)} (Δ +${formatBytes(peakHeap - before.heapUsed)})  ` +
        `rss: ${formatBytes(peakRss).padStart(10)} (Δ +${formatBytes(peakRss - before.rss)})`,
    );
    console.log(
      `  ${'data / peak-heap-delta'.padEnd(30)} ${((peakHeap - before.heapUsed) / dataSize).toFixed(2)}x data size`,
    );
  }

  // Measure: createPackageFromFiles (pre-crawled)
  {
    const [filenames, metadata] = await crawl(fixtureDir + '/**/*', { dot: true });

    if (global.gc) global.gc();
    const before = getMemoryUsage();

    let peakHeap = before.heapUsed;
    let peakRss = before.rss;
    const interval = setInterval(() => {
      const mem = process.memoryUsage();
      if (mem.heapUsed > peakHeap) peakHeap = mem.heapUsed;
      if (mem.rss > peakRss) peakRss = mem.rss;
    }, 1);

    if (fs.existsSync(archiveFile)) fs.unlinkSync(archiveFile);
    await createPackageFromFiles(fixtureDir, archiveFile, [...filenames], { ...metadata });

    clearInterval(interval);
    const after = getMemoryUsage();
    if (after.heapUsed > peakHeap) peakHeap = after.heapUsed;
    if (after.rss > peakRss) peakRss = after.rss;

    printMem('createPackageFromFiles (after)', before, after);
    console.log(
      `  ${'peak heap'.padEnd(30)} ${formatBytes(peakHeap).padStart(10)} (Δ +${formatBytes(peakHeap - before.heapUsed)})  ` +
        `rss: ${formatBytes(peakRss).padStart(10)} (Δ +${formatBytes(peakRss - before.rss)})`,
    );
    console.log(
      `  ${'data / peak-heap-delta'.padEnd(30)} ${((peakHeap - before.heapUsed) / dataSize).toFixed(2)}x data size`,
    );
  }

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

console.log('Memory profiling with --expose-gc');
console.log(`Node.js: ${process.version}, Platform: ${os.platform()} ${os.arch()}`);

await profileFixture('small');
await profileFixture('medium');
await profileFixture('large');
await profileFixture('few-large-files');
await profileFixture('many-small-files');
await profileFixture('deep-tree');
