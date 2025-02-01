const path = require('path');
const fs = require('../../lib/wrapped-fs').default;
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

  const ordering = walk(tmpPath).map((filepath) => filepath.substring(tmpPath.length)); // convert to paths relative to root

  return {
    appPath,
    tmpPath,
    varPath,
    // helper function for generating the `ordering.txt` file data
    buildOrderingData: (getProps) =>
      ordering.reduce((prev, curr) => {
        return `${prev}${curr}:${JSON.stringify(getProps(curr))}\n`;
      }, ''),
  };
};

// returns a list of all directories, files, and symlinks. Automates testing `ordering` logic easy.
const walk = (root) => {
  const getPaths = (filepath, filter) =>
    fs
      .readdirSync(filepath, { withFileTypes: true })
      .filter((dirent) => filter(dirent))
      .map(({ name }) => path.join(filepath, name));

  const dirs = getPaths(root, (dirent) => dirent.isDirectory());
  const files = dirs.map((dir) => walk(dir)).flat();
  return files.concat(
    dirs,
    getPaths(root, (dirent) => dirent.isFile() || dirent.isSymbolicLink()),
  );
};
