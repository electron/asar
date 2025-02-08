import * as fs from 'fs-extra';
import * as path from 'path';
import { appsDir, asarsDir, templateApp } from './test/util';

export default async () => {
  await fs.remove(appsDir);
  await fs.mkdirp(appsDir);
};
