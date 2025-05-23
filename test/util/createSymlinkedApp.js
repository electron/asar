import path from 'node:path';
import { wrappedFs as fs } from '../../lib/wrapped-fs.js';
import { TEST_APPS_DIR } from './constants.js';
import { walk } from './walk.js';

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
export async function createSymlinkedApp(testName, additionalFiles = {}) {
  const outDir = (testName || 'app') + Math.floor(Math.random() * 100);
  const testPath = path.join(TEST_APPS_DIR, outDir);
  const privateVarPath = path.join(testPath, 'private', 'var');
  const varPath = path.join(testPath, 'var');

  fs.rmSync(testPath, { recursive: true, force: true });

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
}
