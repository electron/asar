import * as asar from '..';
import * as fs from 'fs';
import * as crypto from 'crypto'
import { expectType } from 'tsd';

await asar.createPackage('bin', 'tmp/foo.asar');
await asar.createPackageWithOptions('bin', 'tmp/foo.asar', {
  dot: true,
  globOptions: {
    debug: true,
  },
  transform: (filePath: string) => {
    if (process.env.TRANSFORM_ASAR) {
      return crypto.createCipheriv('aes-256-cbc', crypto.randomBytes(32), crypto.randomBytes(16)).setAutoPadding(true).setEncoding('base64')
    }
  }
});
await asar.createPackageFromFiles('bin', 'tmp/foo.asar', ['bin/asar.js']);
const stat = fs.statSync('bin/asar.js');
await asar.createPackageFromFiles('bin', 'tmp/foo.asar', ['bin/asar.js'], {
  'bin/asar.js': {
    type: 'file',
    stat,
  },
});

expectType<asar.Metadata>(asar.statFile('tmp/foo.asar', 'bin/asar.js'));
expectType<asar.Metadata>(asar.statFile('tmp/foo.asar', 'bin/asar.js', false));

expectType<string[]>(asar.listPackage('tmp/foo.asar'));
expectType<string[]>(asar.listPackage('tmp/foo.asar', { isPack: true }));

expectType<Buffer>(asar.extractFile('tmp/foo.asar', 'bin/asar.js'));

asar.extractAll('tmp/foo.asar', 'tmp');

expectType<boolean>(asar.uncache('tmp/foo.asar'));

asar.uncacheAll();
