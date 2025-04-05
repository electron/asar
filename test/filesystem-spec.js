import assert from 'node:assert';
import fs from '../lib/wrapped-fs.js';
import path from 'node:path';
import { createSymlinkedApp } from './util/createSymlinkedApp.js';
import { TEST_APPS_DIR } from './util/constants.js';
import { Filesystem } from '../lib/filesystem.js';

describe('filesystem', function () {
  beforeEach(() => {
    fs.rmSync(TEST_APPS_DIR, { recursive: true, force: true });
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = await createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'));
    });
  });
});
