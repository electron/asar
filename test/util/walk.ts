import fs from 'fs';
import path from 'path';

// returns a list of all directories, files, and symlinks. Automates testing `ordering` logic easy and verifying unpacked directories.
const walk = (root: string): string[] => {
  const getPaths = (filepath: string, filter: (stat: fs.Dirent) => boolean) =>
    fs
      .readdirSync(filepath, { withFileTypes: true })
      .filter(filter)
      .map(({ name }: fs.Dirent) => path.join(filepath, name));

  const dirs = getPaths(root, (dirent) => dirent.isDirectory());
  const files = dirs.map((dir: string) => walk(dir)).flat();
  return files.concat(
    dirs,
    getPaths(root, (dirent) => dirent.isFile() || dirent.isSymbolicLink()),
  );
};

export default walk;
