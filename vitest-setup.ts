import * as path from 'path';
import rimraf from 'rimraf';
import fs from './src/wrapped-fs';

rimraf.sync(path.join(__dirname, '..', 'tmp'), fs);
