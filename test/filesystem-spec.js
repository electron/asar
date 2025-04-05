'use strict';

const assert = require('node:assert');
const fs = require('../lib/wrapped-fs').default;
const path = require('node:path');
const createSymlinkedApp = require('./util/createSymlinkApp');
const { TEST_APPS_DIR } = require('./util/constants');

const Filesystem = require('../lib/filesystem').Filesystem;

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
