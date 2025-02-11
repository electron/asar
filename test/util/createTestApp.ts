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

  return { appPath, testPath, varPath };
};

export default createTestApp;
