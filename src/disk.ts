import path from 'node:path';
import { wrappedFs as fs } from './wrapped-fs.js';
import { Pickle } from './pickle.js';
import { Filesystem, FilesystemFileEntry } from './filesystem.js';
import { CrawledFileType } from './crawlfs.js';
import { Stats } from 'node:fs';
import stream from 'node:stream/promises';

let filesystemCache: Record<string, Filesystem | undefined> = Object.create(null);

async function copyFile(dest: string, src: string, filename: string) {
  const srcFile = path.join(src, filename);
  const targetFile = path.join(dest, filename);

  const [content, stats] = await Promise.all([
    fs.readFile(srcFile),
    fs.stat(srcFile),
    fs.mkdirp(path.dirname(targetFile)),
  ]);
  return fs.writeFile(targetFile, content, { mode: stats.mode });
}

async function streamTransformedFile(
  stream: NodeJS.ReadableStream,
  outStream: NodeJS.WritableStream,
) {
  return new Promise<void>((resolve, reject) => {
    stream.pipe(outStream, { end: false });
    stream.on('error', reject);
    stream.on('end', () => resolve());
  });
}

export type InputMetadata = {
  [property: string]: CrawledFileType;
};

export type BasicFilesArray = {
  filename: string;
  unpack: boolean;
}[];

export type BasicStreamArray = {
  filename: string;
  streamGenerator: () => NodeJS.ReadableStream; // this is called multiple times per file
  mode: Stats['mode'];
  unpack: boolean;
  link: string | undefined; // only for symlinks, should refactor as part of larger project refactor in follow-up PR
}[];

export type FilesystemFilesAndLinks<T extends BasicFilesArray | BasicStreamArray> = {
  files: T;
  links: T;
};

const writeFileListToStream = async function (
  dest: string,
  filesystem: Filesystem,
  out: NodeJS.WritableStream,
  lists: FilesystemFilesAndLinks<BasicFilesArray>,
  metadata: InputMetadata,
) {
  const { files, links } = lists;

  // Batch cached buffers into a single write to avoid per-file write syscalls
  let pendingBuffers: Buffer[] = [];

  const flushPendingBuffers = async () => {
    if (pendingBuffers.length === 0) return;
    const combined =
      pendingBuffers.length === 1 ? pendingBuffers[0] : Buffer.concat(pendingBuffers);
    pendingBuffers = [];
    await new Promise<void>((resolve, reject) => {
      out.write(combined, (err) => (err ? reject(err) : resolve()));
    });
  };

  for (const file of files) {
    if (file.unpack) {
      await flushPendingBuffers();
      const filename = path.relative(filesystem.getRootPath(), file.filename);
      await copyFile(`${dest}.unpacked`, filesystem.getRootPath(), filename);
    } else {
      const fileMeta = metadata[file.filename];
      if (fileMeta.cachedBuffer) {
        pendingBuffers.push(fileMeta.cachedBuffer);
        fileMeta.cachedBuffer = undefined;
      } else {
        await flushPendingBuffers();
        const transformed = fileMeta.transformed;
        const stream = fs.createReadStream(transformed ? transformed.path : file.filename);
        await streamTransformedFile(stream, out);
      }
    }
  }
  await flushPendingBuffers();

  for (const file of links.filter((f) => f.unpack)) {
    const filename = path.relative(filesystem.getRootPath(), file.filename);
    const link = await fs.readlink(file.filename);
    await createSymlink(dest, filename, link);
  }
  return new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.end(() => resolve());
  });
};

export async function writeFilesystem(
  dest: string,
  filesystem: Filesystem,
  lists: FilesystemFilesAndLinks<BasicFilesArray>,
  metadata: InputMetadata,
) {
  const out = await createFilesystemWriteStream(filesystem, dest);
  return writeFileListToStream(dest, filesystem, out, lists, metadata);
}

export async function streamFilesystem(
  dest: string,
  filesystem: Filesystem,
  lists: FilesystemFilesAndLinks<BasicStreamArray>,
) {
  const out = await createFilesystemWriteStream(filesystem, dest);

  const { files, links } = lists;
  for await (const file of files) {
    // the file should not be packed into archive
    if (file.unpack) {
      const targetFile = path.join(`${dest}.unpacked`, file.filename);
      await fs.mkdirp(path.dirname(targetFile));
      const writeStream = fs.createWriteStream(targetFile, { mode: file.mode });
      await stream.pipeline(file.streamGenerator(), writeStream);
    } else {
      await streamTransformedFile(file.streamGenerator(), out);
    }
  }

  for (const file of links.filter((f) => f.unpack && f.link)) {
    // the symlink needs to be recreated outside in .unpacked
    await createSymlink(dest, file.filename, file.link!);
  }
  return new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.end(() => resolve());
  });
}

export interface FileRecord extends FilesystemFileEntry {
  integrity: {
    hash: string;
    algorithm: 'SHA256';
    blocks: string[];
    blockSize: number;
  };
}

export type DirectoryRecord = {
  files: Record<string, DirectoryRecord | FileRecord>;
};

export type ArchiveHeader = {
  // The JSON parsed header string
  header: DirectoryRecord;
  headerString: string;
  headerSize: number;
};

export function readArchiveHeaderSync(archivePath: string): ArchiveHeader {
  const fd = fs.openSync(archivePath, 'r');
  let size: number;
  let headerBuf: Buffer;
  try {
    const sizeBuf = Buffer.alloc(8);
    if (fs.readSync(fd, sizeBuf, 0, 8, null) !== 8) {
      throw new Error('Unable to read header size');
    }

    const sizePickle = Pickle.createFromBuffer(sizeBuf);
    size = sizePickle.createIterator().readUInt32();
    headerBuf = Buffer.alloc(size);
    if (fs.readSync(fd, headerBuf, 0, size, null) !== size) {
      throw new Error('Unable to read header');
    }
  } finally {
    fs.closeSync(fd);
  }

  const headerPickle = Pickle.createFromBuffer(headerBuf);
  const header = headerPickle.createIterator().readString();
  return { headerString: header, header: JSON.parse(header), headerSize: size };
}

export function readFilesystemSync(archivePath: string) {
  if (!filesystemCache[archivePath]) {
    const header = readArchiveHeaderSync(archivePath);
    const filesystem = new Filesystem(archivePath);
    filesystem.setHeader(header.header, header.headerSize);
    filesystemCache[archivePath] = filesystem;
  }
  return filesystemCache[archivePath];
}

export function uncacheFilesystem(archivePath: string) {
  if (filesystemCache[archivePath]) {
    filesystemCache[archivePath] = undefined;
    return true;
  }
  return false;
}

export function uncacheAll() {
  filesystemCache = {};
}

export function readFileSync(filesystem: Filesystem, filename: string, info: FilesystemFileEntry) {
  let buffer = Buffer.alloc(info.size);
  if (info.size <= 0) {
    return buffer;
  }
  if (info.unpacked) {
    // it's an unpacked file, copy it.
    buffer = fs.readFileSync(path.join(`${filesystem.getRootPath()}.unpacked`, filename));
  } else {
    // Node throws an exception when reading 0 bytes into a 0-size buffer,
    // so we short-circuit the read in this case.
    const fd = fs.openSync(filesystem.getRootPath(), 'r');
    try {
      const fileOffset = parseInt(info.offset);
      if (Number.isNaN(fileOffset) || fileOffset < 0 || !Number.isSafeInteger(fileOffset)) {
        throw new Error(`Invalid file offset in archive header: ${info.offset}`);
      }
      const offset = 8 + filesystem.getHeaderSize() + fileOffset;
      if (!Number.isSafeInteger(offset)) {
        throw new Error(`Computed offset exceeds safe integer range`);
      }
      const archiveSize = fs.statSync(filesystem.getRootPath()).size;
      if (offset < 0 || offset + info.size > archiveSize) {
        throw new Error(
          `File entry extends beyond archive boundary (offset=${offset}, size=${info.size}, archiveSize=${archiveSize})`,
        );
      }
      fs.readSync(fd, buffer, 0, info.size, offset);
    } finally {
      fs.closeSync(fd);
    }
  }
  return buffer;
}

export function readFileWithFd(
  fd: number,
  filesystem: Filesystem,
  filename: string,
  info: FilesystemFileEntry,
) {
  let buffer = Buffer.alloc(info.size);
  if (info.size <= 0) {
    return buffer;
  }
  if (info.unpacked) {
    buffer = fs.readFileSync(path.join(`${filesystem.getRootPath()}.unpacked`, filename));
  } else {
    const offset = 8 + filesystem.getHeaderSize() + parseInt(info.offset);
    fs.readSync(fd, buffer, 0, info.size, offset);
  }
  return buffer;
}

async function createFilesystemWriteStream(filesystem: Filesystem, dest: string) {
  const headerPickle = Pickle.createEmpty();
  headerPickle.writeString(JSON.stringify(filesystem.getHeader()));
  const headerBuf = headerPickle.toBuffer();

  const sizePickle = Pickle.createEmpty();
  sizePickle.writeUInt32(headerBuf.length);
  const sizeBuf = sizePickle.toBuffer();

  const out = fs.createWriteStream(dest);
  await new Promise<void>((resolve, reject) => {
    out.on('error', reject);
    out.write(sizeBuf);
    return out.write(headerBuf, () => resolve());
  });
  return out;
}

async function createSymlink(dest: string, filepath: string, link: string) {
  // if symlink is within subdirectories, then we need to recreate dir structure
  await fs.mkdirp(path.join(`${dest}.unpacked`, path.dirname(filepath)));
  // create symlink within unpacked dir
  await fs.symlink(link, path.join(`${dest}.unpacked`, filepath)).catch(async (error) => {
    if (error.code === 'EPERM' && error.syscall === 'symlink') {
      throw new Error(
        'Could not create symlinks for unpacked assets. On Windows, consider activating Developer Mode to allow non-admin users to create symlinks by following the instructions at https://docs.microsoft.com/en-us/windows/apps/get-started/enable-your-device-for-development.',
      );
    }
    throw error;
  });
}
