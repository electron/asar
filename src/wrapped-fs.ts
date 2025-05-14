import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const fs = 'electron' in process.versions ? require('original-fs') : require('node:fs');

const promisifiedMethods = [
  'lstat',
  'mkdtemp',
  'readFile',
  'stat',
  'writeFile',
  'symlink',
  'readlink',
];

type AsarFS = typeof import('fs') & {
  mkdirp(dir: string): Promise<void>;
  mkdirpSync(dir: string): void;
  lstat: (typeof import('fs'))['promises']['lstat'];
  mkdtemp: (typeof import('fs'))['promises']['mkdtemp'];
  readFile: (typeof import('fs'))['promises']['readFile'];
  stat: (typeof import('fs'))['promises']['stat'];
  writeFile: (typeof import('fs'))['promises']['writeFile'];
  symlink: (typeof import('fs'))['promises']['symlink'];
  readlink: (typeof import('fs'))['promises']['readlink'];
};

export const wrappedFs: AsarFS = Object.keys(fs).reduce(
  (accum, method) => {
    return {
      ...accum,
      [method]: promisifiedMethods.includes(method) ? fs.promises[method] : fs[method],
    };
  },
  {
    // To make it more like fs-extra
    mkdirp: (dir) => fs.promises.mkdir(dir, { recursive: true }),
    mkdirpSync: (dir) => fs.mkdirSync(dir, { recursive: true }),
  } as AsarFS,
);
