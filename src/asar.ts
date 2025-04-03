import * as path from 'path';
import minimatch from 'minimatch';

import fs from './wrapped-fs';
import {
  Filesystem,
  FilesystemDirectoryEntry,
  FilesystemEntry,
  FilesystemLinkEntry,
} from './filesystem';
import * as disk from './disk';
import { CrawledFileType, crawl as crawlFilesystem, determineFileType } from './crawlfs';
import { IOptions } from './types/glob';

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
    return unpackDirs.some(
      (unpackDir) =>
        dirPath.startsWith(unpackDir) && !path.relative(unpackDir, dirPath).startsWith('..'),
    );
  }
}

export async function createPackage(src: string, dest: string) {
  return createPackageWithOptions(src, dest, {});
}

export type CreateOptions = {
  dot?: boolean;
  globOptions?: IOptions;
  /**
   * Path to a file containing the list of relative filepaths relative to `src` and the specific order they should be inserted into the asar.
   * Formats allowed below:
   *   filepath
   *   : filepath
   *   <anything>:filepath
   */
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
  const files: disk.BasicFilesArray = [];
  const links: disk.BasicFilesArray = [];
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

    const shouldUnpackPath = function (
      relativePath: string,
      unpack: string | undefined,
      unpackDir: string | undefined,
    ) {
      let shouldUnpack = false;
      if (unpack) {
        shouldUnpack = minimatch(filename, unpack, { matchBase: true });
      }
      if (!shouldUnpack && unpackDir) {
        shouldUnpack = isUnpackedDir(relativePath, unpackDir, unpackDirs);
      }
      return shouldUnpack;
    };

    let shouldUnpack: boolean;
    switch (file.type) {
      case 'directory':
        shouldUnpack = shouldUnpackPath(path.relative(src, filename), undefined, options.unpackDir);
        filesystem.insertDirectory(filename, shouldUnpack);
        break;
      case 'file':
        shouldUnpack = shouldUnpackPath(
          path.relative(src, path.dirname(filename)),
          options.unpack,
          options.unpackDir,
        );
        files.push({ filename, unpack: shouldUnpack });
        return filesystem.insertFile(
          filename,
          () => fs.createReadStream(filename),
          shouldUnpack,
          file,
          options,
        );
      case 'link':
        shouldUnpack = shouldUnpackPath(
          path.relative(src, filename),
          options.unpack,
          options.unpackDir,
        );
        links.push({ filename, unpack: shouldUnpack });
        filesystem.insertLink(filename, shouldUnpack);
        break;
    }
    return Promise.resolve();
  };

  const insertsDone = async function () {
    await fs.mkdirp(path.dirname(dest));
    return disk.writeFilesystem(dest, filesystem, { files, links }, metadata);
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

export type AsarStream = {
  /**
    Relative path to the file or directory from within the archive
  */
  path: string;
  /**
    Function that returns a read stream for a file.
    Note: this is called multiple times per "file", so a new NodeJS.ReadableStream needs to be created each time
  */
  streamGenerator: () => NodeJS.ReadableStream;
  /**
    Whether the file/link should be unpacked
  */
  unpacked: boolean;
  stat: CrawledFileType['stat'];
};
export type AsarDirectory = Pick<AsarStream, 'path' | 'unpacked'> & {
  type: 'directory';
};
export type AsarSymlinkStream = AsarStream & {
  type: 'link';
  symlink: string;
};
export type AsarFileStream = AsarStream & {
  type: 'file';
};
export type AsarStreamType = AsarDirectory | AsarFileStream | AsarSymlinkStream;

/**
 * Create an ASAR archive from a list of streams.
 *
 * @param dest - Archive filename (& path).
 * @param streams - List of streams to be piped in-memory into asar filesystem. Insertion order is preserved.
 */
export async function createPackageFromStreams(dest: string, streams: AsarStreamType[]) {
  // We use an ambiguous root `src` since we're piping directly from a stream and the `filePath` for the stream is already relative to the src/root
  const src = '.';

  const filesystem = new Filesystem(src);
  const files: disk.BasicStreamArray = [];
  const links: disk.BasicStreamArray = [];

  const handleFile = async function (stream: AsarStreamType) {
    const { path: destinationPath, type } = stream;
    const filename = path.normalize(destinationPath);
    switch (type) {
      case 'directory':
        filesystem.insertDirectory(filename, stream.unpacked);
        break;
      case 'file':
        files.push({
          filename,
          streamGenerator: stream.streamGenerator,
          link: undefined,
          mode: stream.stat.mode,
          unpack: stream.unpacked,
        });
        return filesystem.insertFile(filename, stream.streamGenerator, stream.unpacked, {
          type: 'file',
          stat: stream.stat,
        });
      case 'link':
        links.push({
          filename,
          streamGenerator: stream.streamGenerator,
          link: stream.symlink,
          mode: stream.stat.mode,
          unpack: stream.unpacked,
        });
        filesystem.insertLink(
          filename,
          stream.unpacked,
          path.dirname(filename),
          stream.symlink,
          src,
        );
        break;
    }
    return Promise.resolve();
  };

  const insertsDone = async function () {
    await fs.mkdirp(path.dirname(dest));
    return disk.streamFilesystem(dest, filesystem, { files, links });
  };

  const streamQueue = streams.slice();

  const next = async function (stream?: AsarStreamType) {
    if (!stream) {
      return insertsDone();
    }

    await handleFile(stream);

    return next(streamQueue.shift());
  };

  return next(streamQueue.shift());
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

export interface ListOptions {
  isPack: boolean;
}

export function listPackage(archivePath: string, options: ListOptions) {
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
    if (path.relative(dest, destFilename).startsWith('..')) {
      throw new Error(`${fullPath}: file "${destFilename}" writes out of the package`);
    }
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
      if (path.relative(dest, linkSrcPath).startsWith('..')) {
        throw new Error(
          `${fullPath}: file "${file.link}" links out of the package to "${linkSrcPath}"`,
        );
      }
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

// Legacy type exports to maintain compatibility with pre-TypeScript rewrite
// (https://github.com/electron/asar/blob/50b0c62e5b24c3d164687e6470b8658e09b09eea/lib/index.d.ts)
// These don't match perfectly and are technically still a breaking change but they're close enough
// to keep _most_ build pipelines out there from breaking.
export { EntryMetadata } from './filesystem';
export { InputMetadata, DirectoryRecord, FileRecord, ArchiveHeader } from './disk';
export type InputMetadataType = 'directory' | 'file' | 'link';
export type DirectoryMetadata = FilesystemDirectoryEntry;
export type FileMetadata = FilesystemEntry;
export type LinkMetadata = FilesystemLinkEntry;

// Export everything in default, too
export default {
  createPackage,
  createPackageWithOptions,
  createPackageFromFiles,
  createPackageFromStreams,
  statFile,
  getRawHeader,
  listPackage,
  extractFile,
  extractAll,
  uncache,
  uncacheAll,
};
