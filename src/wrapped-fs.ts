const fs = 'electron' in process.versions ? require('original-fs') : require('fs');

const promisifiedMethods = ['lstat', 'mkdtemp', 'readFile', 'stat', 'writeFile'];

type AsarFS = typeof import('fs') & {
  mkdirp(dir: string): Promise<void>;
  mkdirpSync(dir: string): void;
  lstat: (typeof import('fs'))['promises']['lstat'];
  mkdtemp: (typeof import('fs'))['promises']['mkdtemp'];
  readFile: (typeof import('fs'))['promises']['readFile'];
  stat: (typeof import('fs'))['promises']['stat'];
  writeFile: (typeof import('fs'))['promises']['writeFile'];
};

const promisified = {} as AsarFS;

for (const method of Object.keys(fs)) {
  if (promisifiedMethods.includes(method)) {
    (promisified as any)[method] = fs.promises[method];
  } else {
    (promisified as any)[method] = fs[method];
  }
}
// To make it more like fs-extra
promisified.mkdirp = (dir) => fs.promises.mkdir(dir, { recursive: true });
promisified.mkdirpSync = (dir) => fs.mkdirSync(dir, { recursive: true });

export default promisified;
