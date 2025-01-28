import assert from 'assert';
import path from 'path';
import rimraf from 'rimraf';
import fs from '../src/wrapped-fs';
import createSymlinkedApp from './util/createSymlinkApp';

import { Filesystem } from '../src/filesystem';

describe('filesystem', function () {
  beforeEach(() => {
    rimraf.sync(path.join(__dirname, '..', 'tmp'), fs);
  });

  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'), false);
    });
  });
});
