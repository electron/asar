const path = require('path');
const fs = require('../../src/wrapped-fs').default;
const rimraf = require('rimraf');
/**
 * Directory structure:
 * tmp
 * ├── private
 * │   └── var
 * │       ├── app
 * │       │   └── file.txt -> ../file.txt
 * │       └── file.txt
 * └── var -> private/var
 */
module.exports = (testName) => {
  const tmpPath = path.join(__dirname, '../..', 'tmp', testName || 'app');
  const privateVarPath = path.join(tmpPath, 'private', 'var');
  const varPath = path.join(tmpPath, 'var');

  rimraf.sync(tmpPath, fs);

  fs.mkdirSync(privateVarPath, { recursive: true });
  fs.symlinkSync(path.relative(tmpPath, privateVarPath), varPath);

  const originFilePath = path.join(varPath, 'file.txt');
  fs.writeFileSync(originFilePath, 'hello world');
  const appPath = path.join(varPath, 'app');
  fs.mkdirpSync(appPath);
  fs.symlinkSync('../file.txt', path.join(appPath, 'file.txt'));
  return { appPath, tmpPath, varPath };
};
