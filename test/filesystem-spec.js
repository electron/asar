'use strict';

const assert = require('assert');
const fs = require('../lib/wrapped-fs').default;
const path = require('path');
const rimraf = require('rimraf');
const createSymlinkedApp = require('./util/createSymlinkApp');
const { TEST_APPS_DIR } = require('./util/constants');

const Filesystem = require('../lib/filesystem').Filesystem;

describe('filesystem', function () {
  beforeEach(() => {
    rimraf.sync(TEST_APPS_DIR, fs);
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = await createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'));
    });
  });
});
