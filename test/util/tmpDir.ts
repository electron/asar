import { afterAll } from 'vitest';
import { wrappedFs as fs } from '../../src/wrapped-fs.js';
import path from 'node:path';
import os from 'node:os';

/**
 * Create an isolated per-suite temp directory. Registers an `afterAll`
 * hook to clean it up. Each test run gets its own temp directory to
 * avoid conflicts and flaky rmSync on Windows (file locks, antivirus).
 */
export function useTmpDir(cleanupFn?: () => void) {
  const testRunDir = fs.mkdtempSync(path.join(os.tmpdir(), 'asar-test-'));

  afterAll(() => {
    cleanupFn?.();
    fs.rmSync(testRunDir, { recursive: true, force: true });
  });

  function tmpDir(name: string) {
    const dir = path.join(testRunDir, name);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  function createFixture(name: string, files: Record<string, string | Buffer>) {
    const dir = tmpDir(name);
    for (const [filePath, content] of Object.entries(files)) {
      const full = path.join(dir, filePath);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, content);
    }
    return dir;
  }

  return { testRunDir, tmpDir, createFixture };
}
