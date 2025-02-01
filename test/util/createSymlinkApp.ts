import path from 'path';
import rimraf from 'rimraf';
import fs from '../../src/wrapped-fs';
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
export default (testName: string) => {
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
