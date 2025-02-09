import rimraf from 'rimraf';
import * as path from 'path';
import fs from '../../lib/wrapped-fs';

export default () => {
  rimraf.sync(path.join(__dirname, '..', '..', 'tmp'), fs);
};
