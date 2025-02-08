import assert from 'assert';
import path from 'path';
import createSymlinkedApp from './util/createSymlinkApp';

import { Filesystem } from '../lib/filesystem';

describe('filesystem', function () {
  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'), false);
    });
  });
});
