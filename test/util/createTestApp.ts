import path from 'path';
import fs from '../../lib/wrapped-fs';
import rimraf from 'rimraf';

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
const appsDir = path.join(__dirname, '../..', 'tmp');

const createTestApp = async (
  testName: string | undefined,
  additionalFiles: Record<string, string> = {},
) => {
  const outDir = testName || 'app' + Math.floor(Math.random() * 100);
  const testPath = path.join(appsDir, outDir);
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

  return { testPath, varPath, appPath };
};

export default createTestApp;
