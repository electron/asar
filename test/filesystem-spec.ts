import { describe, it, beforeEach, expect } from 'vitest';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import path from 'node:path';
import { createSymlinkedApp } from './util/createSymlinkedApp.js';
import { TEST_APPS_DIR } from './util/constants.js';
import { Filesystem } from '../src/filesystem.js';

describe('filesystem', () => {
  beforeEach(() => {
    fs.rmSync(TEST_APPS_DIR, { recursive: true, force: true });
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = await createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    expect(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'), false);
    }).not.toThrow();
  });
});
