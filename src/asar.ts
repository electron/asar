import * as path from 'path';
import * as minimatch from 'minimatch';

import fs from './wrapped-fs';
import { Filesystem, FilesystemEntry } from './filesystem';
import * as disk from './disk';
import { crawl as crawlFilesystem, determineFileType } from './crawlfs';
import { IOptions } from 'glob';

/**
 * Whether a directory should be excluded from packing due to the `--unpack-dir" option.
 *
 * @param dirPath - directory path to check
 * @param pattern - literal prefix [for backward compatibility] or glob pattern
 * @param unpackDirs - Array of directory paths previously marked as unpacked
 */
function isUnpackedDir(dirPath: string, pattern: string, unpackDirs: string[]) {
  if (dirPath.startsWith(pattern) || minimatch(dirPath, pattern)) {
    if (!unpackDirs.includes(dirPath)) {
      unpackDirs.push(dirPath);
    }
    return true;
  } else {
    return unpackDirs.some((unpackDir) => dirPath.startsWith(unpackDir));
  }
}

export async function createPackage(src: string, dest: string) {
  return createPackageWithOptions(src, dest, {});
}

export type CreateOptions = {
  dot?: boolean;
  globOptions?: IOptions;
  ordering?: string;
  pattern?: string;
  transform?: (filePath: string) => NodeJS.ReadWriteStream | void;
  unpack?: string;
  unpackDir?: string;
};

export async function createPackageWithOptions(src: string, dest: string, options: CreateOptions) {
  const globOptions = options.globOptions ? options.globOptions : {};
  globOptions.dot = options.dot === undefined ? true : options.dot;

  const pattern = src + (options.pattern ? options.pattern : '/**/*');

  const [filenames, metadata] = await crawlFilesystem(pattern, globOptions);
  return createPackageFromFiles(src, dest, filenames, metadata, options);
}

/**
 * Create an ASAR archive from a list of filenames.
 *
 * @param src - Base path. All files are relative to this.
 * @param dest - Archive filename (& path).
 * @param filenames - List of filenames relative to src.
 * @param [metadata] - Object with filenames as keys and {type='directory|file|link', stat: fs.stat} as values. (Optional)
 * @param [options] - Options passed to `createPackageWithOptions`.
 */
export async function createPackageFromFiles(
  src: string,
  dest: string,
  filenames: string[],
  metadata: disk.InputMetadata = {},
  options: CreateOptions = {},
) {
  src = path.normalize(src);
  dest = path.normalize(dest);
  filenames = filenames.map(function (filename) {
    return path.normalize(filename);
  });

  const filesystem = new Filesystem(src);
  const files: { filename: string; unpack: boolean }[] = [];
  const unpackDirs: string[] = [];

  let filenamesSorted: string[] = [];
  if (options.ordering) {
    const orderingFiles = (await fs.readFile(options.ordering))
      .toString()
      .split('\n')
      .map((line) => {
        if (line.includes(':')) {
          line = line.split(':').pop()!;
        }
        line = line.trim();
        if (line.startsWith('/')) {
          line = line.slice(1);
        }
        return line;
      });

    const ordering: string[] = [];
    for (const file of orderingFiles) {
      const pathComponents = file.split(path.sep);
      let str = src;
      for (const pathComponent of pathComponents) {
        str = path.join(str, pathComponent);
        ordering.push(str);
      }
    }

    let missing = 0;
    const total = filenames.length;

    for (const file of ordering) {
      if (!filenamesSorted.includes(file) && filenames.includes(file)) {
        filenamesSorted.push(file);
      }
    }

    for (const file of filenames) {
      if (!filenamesSorted.includes(file)) {
        filenamesSorted.push(file);
        missing += 1;
      }
    }

    console.log(`Ordering file has ${((total - missing) / total) * 100}% coverage.`);
  } else {
    filenamesSorted = filenames;
  }

  const handleFile = async function (filename: string) {
    if (!metadata[filename]) {
      const fileType = await determineFileType(filename);
      if (!fileType) {
        throw new Error('Unknown file type for file: ' + filename);
      }
      metadata[filename] = fileType;
    }
    const file = metadata[filename];

    let shouldUnpack: boolean;
    switch (file.type) {
      case 'directory':
        if (options.unpackDir) {
          shouldUnpack = isUnpackedDir(path.relative(src, filename), options.unpackDir, unpackDirs);
        } else {
          shouldUnpack = false;
        }
        filesystem.insertDirectory(filename, shouldUnpack);
        break;
      case 'file':
        shouldUnpack = false;
        if (options.unpack) {
          shouldUnpack = minimatch(filename, options.unpack, { matchBase: true });
        }
        if (!shouldUnpack && options.unpackDir) {
          const dirName = path.relative(src, path.dirname(filename));
          shouldUnpack = isUnpackedDir(dirName, options.unpackDir, unpackDirs);
        }
        files.push({ filename: filename, unpack: shouldUnpack });
        return filesystem.insertFile(filename, shouldUnpack, file, options);
      case 'link':
        filesystem.insertLink(filename);
        break;
    }
    return Promise.resolve();
  };

  const insertsDone = async function () {
    await fs.mkdirp(path.dirname(dest));
    return disk.writeFilesystem(dest, filesystem, files, metadata);
  };

  const names = filenamesSorted.slice();

  const next = async function (name?: string) {
    if (!name) {
      return insertsDone();
    }

    await handleFile(name);
    return next(names.shift());
  };

  return next(names.shift());
}

export function statFile(
  archivePath: string,
  filename: string,
  followLinks: boolean = true,
): FilesystemEntry {
  const filesystem = disk.readFilesystemSync(archivePath);
  return filesystem.getFile(filename, followLinks);
}

export function getRawHeader(archivePath: string) {
  return disk.readArchiveHeaderSync(archivePath);
}

export function listPackage(archivePath: string, options: { isPack: boolean }) {
  return disk.readFilesystemSync(archivePath).listFiles(options);
}

export function extractFile(archivePath: string, filename: string, followLinks: boolean = true) {
  const filesystem = disk.readFilesystemSync(archivePath);
  const fileInfo = filesystem.getFile(filename, followLinks);
  if ('link' in fileInfo || 'files' in fileInfo) {
    throw new Error('Expected to find file at: ' + filename + ' but found a directory or link');
  }
  return disk.readFileSync(filesystem, filename, fileInfo);
}

export function extractAll(archivePath: string, dest: string) {
  const filesystem = disk.readFilesystemSync(archivePath);
  const filenames = filesystem.listFiles();

  // under windows just extract links as regular files
  const followLinks = process.platform === 'win32';

  // create destination directory
  fs.mkdirpSync(dest);

  const extractionErrors: Error[] = [];
  for (const fullPath of filenames) {
    // Remove leading slash
    const filename = fullPath.substr(1);
    const destFilename = path.join(dest, filename);
    const file = filesystem.getFile(filename, followLinks);
    if ('files' in file) {
      // it's a directory, create it and continue with the next entry
      fs.mkdirpSync(destFilename);
    } else if ('link' in file) {
      // it's a symlink, create a symlink
      const linkSrcPath = path.dirname(path.join(dest, file.link));
      const linkDestPath = path.dirname(destFilename);
      const relativePath = path.relative(linkDestPath, linkSrcPath);
      // try to delete output file, because we can't overwrite a link
      try {
        fs.unlinkSync(destFilename);
      } catch {}
      const linkTo = path.join(relativePath, path.basename(file.link));
      fs.symlinkSync(linkTo, destFilename);
    } else {
      // it's a file, try to extract it
      try {
        const content = disk.readFileSync(filesystem, filename, file);
        fs.writeFileSync(destFilename, content);
        if (file.executable) {
          fs.chmodSync(destFilename, '755');
        }
      } catch (e) {
        extractionErrors.push(e as Error);
      }
    }
  }
  if (extractionErrors.length) {
    throw new Error(
      'Unable to extract some files:\n\n' +
        extractionErrors.map((error) => error.stack).join('\n\n'),
    );
  }
}

export function uncache(archivePath: string) {
  return disk.uncacheFilesystem(archivePath);
}

export function uncacheAll() {
  disk.uncacheAll();
}
