const fs = require('fs');
const path = require('path');

// returns a list of all directories, files, and symlinks. Automates testing `ordering` logic easy and verifying unpacked directories.
const walk = (root) => {
  const getPaths = (filepath, filter) =>
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

module.exports = walk;
