import rimraf from 'rimraf';
import fs from '../../lib/wrapped-fs';
import { TEST_APPS_DIR } from '../util/constants';

export default () => {
  // clean up previous tests dir 'tmp' on "global setup" of jest
  rimraf.sync(TEST_APPS_DIR, fs);
};
