import fs from 'node:fs';
import path from 'node:path';

// returns a list of all directories, files, and symlinks. Automates testing `ordering` logic easy and verifying unpacked directories.
export const walk = (root: string): string[] => {
  const getPaths = (filepath: string, filter: (dirent: fs.Dirent) => boolean) =>
    fs
      .readdirSync(filepath, { withFileTypes: true })
      .filter(filter)
      .map(({ name }) => path.join(filepath, name));

  const dirs = getPaths(root, (dirent) => dirent.isDirectory());
  const files = dirs.map((dir) => walk(dir)).flat();
  return files.concat(
    dirs,
    getPaths(root, (dirent) => dirent.isFile() || dirent.isSymbolicLink()),
  );
};
