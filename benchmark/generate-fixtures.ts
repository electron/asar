import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const BENCHMARK_DIR = path.join(import.meta.dirname, 'fixtures');

export type FixtureConfig = {
  name: string;
  fileCount: number;
  /** Average file size in bytes */
  avgFileSize: number;
  /** Directory depth */
  depth: number;
  /** Number of subdirectories per level */
  breadth: number;
};

export const FIXTURES: FixtureConfig[] = [
  { name: 'small', fileCount: 10, avgFileSize: 1024, depth: 2, breadth: 2 },
  { name: 'medium', fileCount: 500, avgFileSize: 4096, depth: 4, breadth: 4 },
  { name: 'large', fileCount: 5000, avgFileSize: 8192, depth: 5, breadth: 5 },
  { name: 'few-large-files', fileCount: 20, avgFileSize: 1024 * 1024, depth: 2, breadth: 2 },
  { name: 'many-small-files', fileCount: 10000, avgFileSize: 256, depth: 3, breadth: 10 },
  { name: 'deep-tree', fileCount: 1000, avgFileSize: 2048, depth: 10, breadth: 2 },
];

function generateRandomContent(size: number): Buffer {
  return crypto.randomBytes(size);
}

function generateDirectoryPaths(depth: number, breadth: number): string[] {
  const dirs: string[] = [''];
  for (let d = 0; d < depth; d++) {
    const currentLevel = dirs.filter((dir) => dir.split('/').length - 1 === d);
    for (const parent of currentLevel) {
      for (let b = 0; b < breadth; b++) {
        dirs.push(parent ? `${parent}/dir_${d}_${b}` : `dir_${d}_${b}`);
      }
    }
  }
  return dirs;
}

export function generateFixture(config: FixtureConfig): string {
  const fixtureDir = path.join(BENCHMARK_DIR, config.name);

  if (fs.existsSync(fixtureDir)) {
    return fixtureDir;
  }

  fs.mkdirSync(fixtureDir, { recursive: true });

  const dirs = generateDirectoryPaths(config.depth, config.breadth);

  // Create all directories
  for (const dir of dirs) {
    if (dir) {
      fs.mkdirSync(path.join(fixtureDir, dir), { recursive: true });
    }
  }

  // Distribute files across directories
  for (let i = 0; i < config.fileCount; i++) {
    const dir = dirs[i % dirs.length];
    // Vary file sizes: 50% to 150% of average
    const sizeVariation = 0.5 + Math.random();
    const size = Math.max(1, Math.floor(config.avgFileSize * sizeVariation));
    const content = generateRandomContent(size);
    const ext = ['.txt', '.js', '.json', '.bin', '.dat'][i % 5];
    const filePath = path.join(fixtureDir, dir, `file_${i}${ext}`);
    fs.writeFileSync(filePath, content);
  }

  return fixtureDir;
}

export function cleanFixtures() {
  if (fs.existsSync(BENCHMARK_DIR)) {
    fs.rmSync(BENCHMARK_DIR, { recursive: true, force: true });
  }
}

// When run directly, generate all fixtures
if (process.argv[1] === import.meta.filename) {
  console.log('Generating benchmark fixtures...');
  cleanFixtures();
  for (const config of FIXTURES) {
    const start = performance.now();
    const dir = generateFixture(config);
    const elapsed = (performance.now() - start).toFixed(1);
    const totalSize = getTotalSize(dir);
    console.log(
      `  ${config.name}: ${config.fileCount} files, ${formatBytes(totalSize)} in ${elapsed}ms`,
    );
  }
  console.log('Done.');
}

function getTotalSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (entry.isFile()) {
      total += fs.statSync(path.join(entry.parentPath, entry.name)).size;
    }
  }
  return total;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
