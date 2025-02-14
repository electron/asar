const path = require('path');
const fs = require('../../lib/wrapped-fs').default;
const rimraf = require('rimraf');
const { TEST_APPS_DIR } = require('./constants');
const walk = require('./walk');

/**
 * Directory structure:
 * testName
 * ├── private
 * │   └── var
 * │       ├── app
 * │       │   └── file.txt -> ../file.txt
 * │       └── file.txt
 * └── var -> private/var
 */
module.exports = async (testName, additionalFiles = {}) => {
  const outDir = (testName || 'app') + Math.floor(Math.random() * 100);
  const testPath = path.join(TEST_APPS_DIR, outDir);
  const privateVarPath = path.join(testPath, 'private', 'var');
  const varPath = path.join(testPath, 'var');

  rimraf.sync(testPath, fs);

  fs.mkdirSync(privateVarPath, { recursive: true });
  fs.symlinkSync(path.relative(testPath, privateVarPath), varPath);

  const files = {
    'file.txt': 'hello world',
    ...additionalFiles,
  };
  for await (const [filename, fileData] of Object.entries(files)) {
    const originFilePath = path.join(varPath, filename);
    await fs.writeFile(originFilePath, fileData);
  }

  const appPath = path.join(varPath, 'app');
  fs.mkdirpSync(appPath);
  fs.symlinkSync('../file.txt', path.join(appPath, 'file.txt'));

  // reverse otherwise we might as well just not be using ordering logic flow (it defaults to filelist order, which is the same as this non-reversed)
  const filesOrdering = walk(testPath)
    .reverse()
    .map((filepath) => filepath.substring(testPath.length)); // convert to paths relative to root

  return { appPath, testPath, varPath, filesOrdering };
};
