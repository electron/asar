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
let counter = 0;
const createTestApp = async (testName: string, additionalFiles: Record<string, string> = {}) => {
  const outDir = testName || 'app-' + counter++;
  const testPath = path.join(appsDir, outDir);
  if (fs.existsSync(testPath)) {
    fs.rmdirSync(testPath);
  }

  const privateVarPath = path.join(testPath, 'private', 'var');
  const varPath = path.join(testPath, 'var');

  await fs.mkdirp(privateVarPath);
  await fs.symlink(path.relative(testPath, privateVarPath), varPath);

  const files = {
    'file.txt': 'hello world',
    ...additionalFiles,
  };
  for await (const [filename, fileData] of Object.entries(files)) {
    const originFilePath = path.join(varPath, filename);
    await fs.writeFile(originFilePath, fileData);
  }
  const appPath = path.join(varPath, 'app');
  await fs.mkdirp(appPath);
  await fs.symlink('../file.txt', path.join(appPath, 'file.txt'));

  return {
    testPath,
    varPath,
    appPath,
  };
};

export default createTestApp;
