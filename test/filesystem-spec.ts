import assert from 'assert';
import path from 'path';
import createSymlinkedApp from './util/createTestApp';

import { Filesystem } from '../lib/filesystem';

describe('filesystem', function () {
  it('should does not throw an error when the src path includes a symbol link', async () => {
    const { appPath, varPath } = await createSymlinkedApp('filesystem');
    const filesystem = new Filesystem(varPath);
    assert.doesNotThrow(() => {
      filesystem.insertLink(path.join(appPath, 'file.txt'), false);
    });
  });
});
