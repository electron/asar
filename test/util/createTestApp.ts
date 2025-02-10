import path from 'path';
import fs from '../../lib/wrapped-fs';
import rimraf from 'rimraf';
import { Dirent } from 'fs';
import { TEST_APPS_DIR } from './constants';

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
const createTestApp = async (
  testName: string | undefined,
  additionalFiles: Record<string, string> = {},
) => {
  const outDir = testName || 'app' + Math.floor(Math.random() * 100);
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

  const ordering = walk(testPath).map((filepath: string) => filepath.substring(testPath.length)); // convert to paths relative to root

  return {
    appPath,
    testPath,
    varPath,
    // helper function for generating the `ordering.txt` file data
    buildOrderingData: (getProps: (arg0: any) => any) =>
      ordering.reduce((prev: string, curr: string) => {
        return `${prev}${curr}:${JSON.stringify(getProps(curr))}\n`;
      }, ''),
  };
};

// returns a list of all directories, files, and symlinks. Automates testing `ordering` logic easy.
const walk = (root: string): string[] => {
  const getPaths = (filepath: string, filter: (stats: Dirent) => boolean) =>
    fs
      .readdirSync(filepath, { withFileTypes: true })
      .filter((dirent: Dirent) => filter(dirent))
      .map(({ name }) => path.join(filepath, name));

  const dirs = getPaths(root, (dirent: Dirent) => dirent.isDirectory());
  const files = dirs.map((dir: string) => walk(dir)).flat();
  return files.concat(
    dirs,
    getPaths(root, (dirent: Dirent) => dirent.isFile() || dirent.isSymbolicLink()),
  );
};

export default createTestApp;
