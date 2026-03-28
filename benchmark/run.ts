import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

import {
  createPackage,
  createPackageFromFiles,
  extractAll,
  extractFile,
  listPackage,
  statFile,
  getRawHeader,
  uncache,
} from '../lib/asar.js';
import { crawl } from '../lib/crawlfs.js';
import { getFileIntegrity } from '../lib/integrity.js';
import {
  FIXTURES,
  generateFixture,
  cleanFixtures,
  formatBytes,
  type FixtureConfig,
} from './generate-fixtures.js';

// ─── Benchmark harness ───────────────────────────────────────────────

type BenchmarkResult = {
  name: string;
  fixture: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  medianMs: number;
  p95Ms: number;
  opsPerSec: number;
  throughputMBps?: number;
};

async function benchmark(
  name: string,
  fixture: string,
  fn: () => Promise<void> | void,
  options: { iterations?: number; warmup?: number; dataSizeBytes?: number } = {},
): Promise<BenchmarkResult> {
  const { iterations = 10, warmup = 2, dataSizeBytes } = options;

  // Warmup
  for (let i = 0; i < warmup; i++) {
    await fn();
  }

  // Collect timings
  const timings: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    timings.push(performance.now() - start);
  }

  timings.sort((a, b) => a - b);
  const totalMs = timings.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;

  const result: BenchmarkResult = {
    name,
    fixture,
    iterations,
    totalMs,
    avgMs,
    minMs: timings[0],
    maxMs: timings[timings.length - 1],
    medianMs: timings[Math.floor(timings.length / 2)],
    p95Ms: timings[Math.floor(timings.length * 0.95)],
    opsPerSec: 1000 / avgMs,
  };

  if (dataSizeBytes) {
    result.throughputMBps = dataSizeBytes / (1024 * 1024) / (avgMs / 1000);
  }

  return result;
}

function printResult(result: BenchmarkResult) {
  const throughput = result.throughputMBps
    ? ` | ${result.throughputMBps.toFixed(1)} MB/s`
    : '';
  console.log(
    `  ${result.name.padEnd(40)} ` +
      `avg=${result.avgMs.toFixed(2).padStart(9)}ms  ` +
      `median=${result.medianMs.toFixed(2).padStart(9)}ms  ` +
      `min=${result.minMs.toFixed(2).padStart(9)}ms  ` +
      `p95=${result.p95Ms.toFixed(2).padStart(9)}ms  ` +
      `ops=${result.opsPerSec.toFixed(1).padStart(8)}/s` +
      throughput,
  );
}

function printSection(title: string) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(60)}`);
}

function getDirectorySize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
    }
  }
  return total;
}

function getFileCount(dir: string): number {
  let count = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) count++;
  }
  return count;
}

// ─── Benchmark suites ────────────────────────────────────────────────

async function benchmarkCrawl(fixtureDir: string, config: FixtureConfig): Promise<BenchmarkResult> {
  return benchmark(
    `crawl [${config.name}]`,
    config.name,
    async () => {
      await crawl(fixtureDir + '/**/*', { dot: true });
    },
    { iterations: config.fileCount > 5000 ? 5 : 15 },
  );
}

async function benchmarkPack(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-pack-'));
  const destFile = path.join(tmpDir, `${config.name}.asar`);
  const dataSize = getDirectorySize(fixtureDir);

  const result = await benchmark(
    `pack [${config.name}]`,
    config.name,
    async () => {
      if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
      await createPackage(fixtureDir, destFile);
    },
    {
      iterations: config.fileCount > 5000 ? 3 : 10,
      warmup: 1,
      dataSizeBytes: dataSize,
    },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkPackFromFiles(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-packff-'));
  const destFile = path.join(tmpDir, `${config.name}.asar`);
  const dataSize = getDirectorySize(fixtureDir);

  // Pre-crawl so we only measure packing
  const [filenames, metadata] = await crawl(fixtureDir + '/**/*', { dot: true });

  const result = await benchmark(
    `packFromFiles [${config.name}]`,
    config.name,
    async () => {
      if (fs.existsSync(destFile)) fs.unlinkSync(destFile);
      await createPackageFromFiles(fixtureDir, destFile, [...filenames], { ...metadata });
    },
    {
      iterations: config.fileCount > 5000 ? 3 : 10,
      warmup: 1,
      dataSizeBytes: dataSize,
    },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkExtractAll(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  // First create the archive
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-extract-'));
  const archiveFile = path.join(tmpDir, `${config.name}.asar`);
  await createPackage(fixtureDir, archiveFile);
  const archiveSize = fs.statSync(archiveFile).size;

  const extractDir = path.join(tmpDir, 'extracted');

  const result = await benchmark(
    `extractAll [${config.name}]`,
    config.name,
    () => {
      if (fs.existsSync(extractDir)) fs.rmSync(extractDir, { recursive: true, force: true });
      uncache(archiveFile);
      extractAll(archiveFile, extractDir);
    },
    {
      iterations: config.fileCount > 5000 ? 3 : 10,
      warmup: 1,
      dataSizeBytes: archiveSize,
    },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkExtractSingleFile(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-extractone-'));
  const archiveFile = path.join(tmpDir, `${config.name}.asar`);
  await createPackage(fixtureDir, archiveFile);

  // Find a file in the archive to extract (strip leading /)
  const files = listPackage(archiveFile, { isPack: false })
    .map((f) => f.replace(/^\//, ''))
    .filter((f) => f.includes('.'));
  const targetFile = files[Math.floor(files.length / 2)];

  const result = await benchmark(
    `extractFile [${config.name}]`,
    config.name,
    () => {
      uncache(archiveFile);
      extractFile(archiveFile, targetFile);
    },
    { iterations: 50, warmup: 5 },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkListPackage(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-list-'));
  const archiveFile = path.join(tmpDir, `${config.name}.asar`);
  await createPackage(fixtureDir, archiveFile);

  const result = await benchmark(
    `listPackage [${config.name}]`,
    config.name,
    () => {
      uncache(archiveFile);
      listPackage(archiveFile, { isPack: false });
    },
    { iterations: 50, warmup: 5 },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkHeaderParsing(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-header-'));
  const archiveFile = path.join(tmpDir, `${config.name}.asar`);
  await createPackage(fixtureDir, archiveFile);

  const result = await benchmark(
    `headerParse [${config.name}]`,
    config.name,
    () => {
      getRawHeader(archiveFile);
    },
    { iterations: 100, warmup: 10 },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkStatFile(
  fixtureDir: string,
  config: FixtureConfig,
): Promise<BenchmarkResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-stat-'));
  const archiveFile = path.join(tmpDir, `${config.name}.asar`);
  await createPackage(fixtureDir, archiveFile);

  const files = listPackage(archiveFile, { isPack: false })
    .map((f) => f.replace(/^\//, ''))
    .filter((f) => f.includes('.'));
  const targetFile = files[Math.floor(files.length / 2)];

  const result = await benchmark(
    `statFile [${config.name}]`,
    config.name,
    () => {
      uncache(archiveFile);
      statFile(archiveFile, targetFile);
    },
    { iterations: 100, warmup: 10 },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

async function benchmarkIntegrity(): Promise<BenchmarkResult> {
  // Create a temp file of 10MB
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-bench-integrity-'));
  const tmpFile = path.join(tmpDir, 'testfile.bin');
  const data = crypto.randomBytes(10 * 1024 * 1024);
  fs.writeFileSync(tmpFile, data);

  const result = await benchmark(
    'integrity hash (10MB file)',
    'synthetic',
    async () => {
      const stream = fs.createReadStream(tmpFile);
      await getFileIntegrity(stream);
    },
    { iterations: 20, warmup: 3, dataSizeBytes: data.length },
  );

  fs.rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  const filterArg = process.argv[2]; // Optional: filter by fixture name
  const suitesArg = process.argv[3]; // Optional: filter by suite name

  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              @electron/asar Benchmark Suite             ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Node.js: ${process.version}`);
  console.log(`  Platform: ${os.platform()} ${os.arch()}`);
  console.log(`  CPUs: ${os.cpus().length}x ${os.cpus()[0].model}`);
  console.log(`  Memory: ${(os.totalmem() / (1024 * 1024 * 1024)).toFixed(1)} GB`);

  // Generate fixtures
  printSection('Generating fixtures');
  const fixtureDirs = new Map<string, string>();
  const activeFixtures = FIXTURES.filter(
    (f) => !filterArg || f.name === filterArg || f.name.startsWith(filterArg + '-') || filterArg === 'all',
  );

  for (const config of activeFixtures) {
    const start = performance.now();
    const dir = generateFixture(config);
    const elapsed = (performance.now() - start).toFixed(1);
    const totalSize = getDirectorySize(dir);
    const fileCount = getFileCount(dir);
    console.log(
      `  ${config.name}: ${fileCount} files, ${formatBytes(totalSize)} (${elapsed}ms)`,
    );
    fixtureDirs.set(config.name, dir);
  }

  const allResults: BenchmarkResult[] = [];

  // Crawl benchmarks
  if (!suitesArg || suitesArg.includes('crawl')) {
    printSection('Filesystem Crawl');
    for (const config of activeFixtures) {
      const result = await benchmarkCrawl(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }
  }

  // Pack benchmarks
  if (!suitesArg || suitesArg.includes('pack')) {
    printSection('Pack (full pipeline: crawl + hash + write)');
    for (const config of activeFixtures) {
      const result = await benchmarkPack(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }

    printSection('Pack from pre-crawled files (hash + write only)');
    for (const config of activeFixtures) {
      const result = await benchmarkPackFromFiles(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }
  }

  // Extract benchmarks
  if (!suitesArg || suitesArg.includes('extract')) {
    printSection('Extract All');
    for (const config of activeFixtures) {
      const result = await benchmarkExtractAll(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }

    printSection('Extract Single File');
    for (const config of activeFixtures) {
      const result = await benchmarkExtractSingleFile(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }
  }

  // Read benchmarks
  if (!suitesArg || suitesArg.includes('read')) {
    printSection('List Package');
    for (const config of activeFixtures) {
      const result = await benchmarkListPackage(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }

    printSection('Header Parsing');
    for (const config of activeFixtures) {
      const result = await benchmarkHeaderParsing(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }

    printSection('Stat File');
    for (const config of activeFixtures) {
      const result = await benchmarkStatFile(fixtureDirs.get(config.name)!, config);
      printResult(result);
      allResults.push(result);
    }
  }

  // Integrity benchmark
  if (!suitesArg || suitesArg.includes('integrity')) {
    printSection('Integrity Hashing');
    const result = await benchmarkIntegrity();
    printResult(result);
    allResults.push(result);
  }

  // Summary
  printSection('Summary');
  console.log(`  Total benchmarks: ${allResults.length}`);

  // Write JSON results
  const resultsFile = path.join(import.meta.dirname, 'results.json');
  fs.writeFileSync(
    resultsFile,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        node: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        results: allResults,
      },
      null,
      2,
    ),
  );
  console.log(`  Results written to: ${resultsFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
