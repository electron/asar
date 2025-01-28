const assert = require('assert');
const fs = require('../src/wrapped-fs').default;
const path = require('path');
const rimraf = require('rimraf');
const createSymlinkedApp = require('./util/createSymlinkApp');

const Filesystem = require('../src/filesystem').Filesystem;

describe('filesystem', function () {
  beforeEach(() => {
    rimraf.sync(path.join(__dirname, '..', 'tmp'), fs);
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'));
    });
  });
});
