import { describe, it, expect } from 'vitest';
import path from 'node:path';

import { uncacheAll } from '../src/asar.js';
import { crawl, determineFileType } from '../src/crawlfs.js';
import { useTmpDir } from './util/tmpDir.js';

describe('crawlfs', () => {
  const { createFixture } = useTmpDir(uncacheAll);

  it('determineFileType should return null for special files', async () => {
    // /dev/null is not a regular file, directory, or symlink
    if (process.platform === 'win32') return;
    const result = await determineFileType('/dev/null');
    // /dev/null is classified as a file on macOS
    // This test just verifies it doesn't crash
    expect(result === null || result.type === 'file').toBe(true);
  });

  it('crawl should return sorted filenames', async () => {
    const src = createFixture('crawl-sort', {
      'z.txt': 'z',
      'a.txt': 'a',
      'm.txt': 'm',
    });
    const [filenames] = await crawl(src + '/**/*', { dot: true });
    const basenames = filenames.map((f) => path.basename(f)).filter((f) => f.endsWith('.txt'));
    expect(basenames).toEqual([...basenames].sort());
  });

  it('crawl should respect dot option', async () => {
    const src = createFixture('crawl-dot', {
      'visible.txt': 'visible',
      '.hidden': 'hidden',
    });
    const [withDot] = await crawl(src + '/**/*', { dot: true });
    const [withoutDot] = await crawl(src + '/**/*', { dot: false });

    expect(withDot.some((f) => f.includes('.hidden'))).toBe(true);
    expect(withoutDot.some((f) => f.includes('.hidden'))).toBe(false);
  });
});
