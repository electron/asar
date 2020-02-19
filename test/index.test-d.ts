import * as asar from '..';
import * as fs from 'fs';
import { expectType } from 'tsd';

await asar.createPackage('bin', 'tmp/foo.asar');
await asar.createPackageWithOptions('bin', 'tmp/foo.asar', { dot: true });
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
