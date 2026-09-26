import os from 'node:os';
import path from 'node:path';
import stream from 'node:stream/promises';

import { FileIntegrity, getFileIntegrity, getFileIntegrityFromBuffer } from './integrity.js';
import { wrappedFs as fs } from './wrapped-fs.js';
import { CrawledFileType } from './crawlfs.js';

const UINT32_MAX = 2 ** 32 - 1;
const SYMLINK_MAX_DEPTH = 40; // matches Linux SYMLOOP_MAX

// Files smaller than this use buffer-based integrity hashing (avoids stream overhead).
// Files larger than this use streaming to avoid holding large buffers in memory.
const BUFFER_HASH_THRESHOLD = 2 * 1024 * 1024; // 2MB

export type EntryMetadata = {
  unpacked?: boolean;
};

export type FilesystemDirectoryEntry = {
  files: Record<string, FilesystemEntry>;
} & EntryMetadata;

export type FilesystemFileEntry = {
  unpacked: boolean;
  executable: boolean;
  offset: string;
  size: number;
  integrity: FileIntegrity;
} & EntryMetadata;

export type FilesystemLinkEntry = {
  link: string;
} & EntryMetadata;

export type FilesystemEntry = FilesystemDirectoryEntry | FilesystemFileEntry | FilesystemLinkEntry;

export class Filesystem {
  private src: string;
  private header: FilesystemEntry;
  private headerSize: number;
  private offset: bigint;
  // SHA-256 of contents already stored => the offset those contents live at
  private contentOffsets: Map<string, string>;

  constructor(src: string) {
    this.src = path.resolve(src);
    this.header = { files: Object.create(null) };
    this.headerSize = 0;
    this.offset = BigInt(0);
    this.contentOffsets = new Map();
  }

  getRootPath() {
    return this.src;
  }

  getHeader() {
    return this.header;
  }

  getHeaderSize() {
    return this.headerSize;
  }

  setHeader(header: FilesystemEntry, headerSize: number) {
    this.header = header;
    this.headerSize = headerSize;
  }

  searchNodeFromDirectory(p: string) {
    let json = this.header;
    const dirs = p.split(path.sep);
    for (const dir of dirs) {
      if (dir !== '.') {
        if ('files' in json) {
          if (!json.files[dir]) {
            json.files[dir] = { files: Object.create(null) };
          }
          json = json.files[dir];
        } else {
          throw new Error('Unexpected directory state while traversing: ' + p);
        }
      }
    }
    return json;
  }

  searchNodeFromPath(p: string) {
    p = path.relative(this.src, p);
    if (!p) {
      return this.header;
    }
    const name = path.basename(p);
    const node = this.searchNodeFromDirectory(path.dirname(p)) as FilesystemDirectoryEntry;
    if (!node.files) {
      node.files = Object.create(null);
    }
    if (!node.files[name]) {
      node.files[name] = Object.create(null);
    }
    return node.files[name];
  }

  insertDirectory(p: string, shouldUnpack: boolean) {
    const node = this.searchNodeFromPath(p) as FilesystemDirectoryEntry;
    if (shouldUnpack) {
      node.unpacked = shouldUnpack;
    }
    node.files = node.files || Object.create(null);
    return node.files;
  }

  insertFile(
    p: string,
    streamGenerator: () => NodeJS.ReadableStream,
    shouldUnpack: boolean,
    file: CrawledFileType,
    options: {
      transform?: (filePath: string) => NodeJS.ReadWriteStream | void;
      /**
       * Set when the file content comes from a stream rather than a file on
       * disk at `p`. In that case `p` is only the destination path inside the
       * archive, so integrity must be computed from the stream.
       */
      fromStream?: boolean;
    } = {},
  ): Promise<boolean> {
    const dirNode = this.searchNodeFromPath(path.dirname(p)) as FilesystemDirectoryEntry;
    const node = this.searchNodeFromPath(p) as FilesystemFileEntry;
    if (shouldUnpack || dirNode.unpacked) {
      node.size = file.stat.size;
      node.unpacked = true;
      // Unpacked files are copied out of the archive as standalone files, so every
      // copy is written even when their contents are identical.
      return getFileIntegrity(streamGenerator()).then((integrity) => {
        node.integrity = integrity;
        return false;
      });
    }

    const transformed = options.transform && options.transform(p);
    if (transformed) {
      return this.insertFileAsync(p, streamGenerator, file, node, transformed);
    }

    const size = file.stat.size;

    // JavaScript cannot precisely present integers >= UINT32_MAX.
    if (size > UINT32_MAX) {
      throw new Error(`${p}: file size can not be larger than 4.2GB`);
    }

    const executable = process.platform !== 'win32' && (file.stat.mode & 0o100) !== 0;

    if (!options.fromStream && size <= BUFFER_HASH_THRESHOLD) {
      // Fully synchronous fast path — no Promise, no stream, no microtask yield
      try {
        const fileBuffer = fs.readFileSync(p);
        // Don't trust a buffer that doesn't match the size recorded in the header;
        // hash the stream instead.
        if (fileBuffer.length === size) {
          const integrity = getFileIntegrityFromBuffer(fileBuffer);
          const duplicate = this.storeFileEntry(node, size, executable, integrity);
          if (!duplicate) {
            file.cachedBuffer = fileBuffer;
          }
          return Promise.resolve(duplicate);
        }
      } catch {
        // Fall through to stream path
      }
    }

    return getFileIntegrity(streamGenerator()).then((integrity) =>
      this.storeFileEntry(node, size, executable, integrity),
    );
  }

  /**
   * Fills in a file entry and reserves the region of the archive that holds its
   * contents, growing the archive by `size` bytes. When a file with identical
   * contents was already inserted, the entry instead points at the offset of those
   * contents and the archive is left unchanged — the caller must then skip writing
   * the contents.
   *
   * @returns whether the contents were already stored by an earlier file
   */
  private storeFileEntry(
    node: FilesystemFileEntry,
    size: number,
    executable: boolean,
    integrity: FileIntegrity,
  ): boolean {
    const sharedOffset = this.contentOffsets.get(integrity.hash);

    node.size = size;
    node.offset = sharedOffset ?? this.offset.toString();
    if (executable) {
      node.executable = true;
    }
    node.integrity = integrity;

    if (sharedOffset !== undefined) {
      return true;
    }
    this.contentOffsets.set(integrity.hash, node.offset);
    this.offset += BigInt(size);
    return false;
  }

  private async insertFileAsync(
    p: string,
    streamGenerator: () => NodeJS.ReadableStream,
    file: CrawledFileType,
    node: FilesystemFileEntry,
    transformed: NodeJS.ReadWriteStream,
  ): Promise<boolean> {
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'asar-'));
    const tmpfile = path.join(tmpdir, path.basename(p));
    const out = fs.createWriteStream(tmpfile);

    await stream.pipeline(streamGenerator(), transformed, out);
    file.transformed = {
      path: tmpfile,
      stat: await fs.lstat(tmpfile),
    };
    const size = file.transformed.stat.size;

    if (size > UINT32_MAX) {
      throw new Error(`${p}: file size can not be larger than 4.2GB`);
    }

    // Integrity must be computed over the transformed bytes that are actually
    // stored in the archive, not the original (pre-transform) source bytes.
    const integrity = await getFileIntegrity(fs.createReadStream(file.transformed.path));
    const executable = process.platform !== 'win32' && (file.stat.mode & 0o100) !== 0;
    const duplicate = this.storeFileEntry(node, size, executable, integrity);
    if (duplicate) {
      // Nothing will read these transformed bytes again, so don't leave them behind
      file.transformed = undefined;
      fs.rmSync(tmpdir, { recursive: true, force: true });
    }
    return duplicate;
  }

  insertLink(
    p: string,
    shouldUnpack: boolean,
    parentPath: string = fs.realpathSync(path.dirname(p)),
    symlink: string = fs.readlinkSync(p), // /var/tmp => /private/var
    src: string = fs.realpathSync(this.src),
  ) {
    const link = this.resolveLink(src, parentPath, symlink);
    if (path.isAbsolute(link) || path.normalize(link).startsWith('..')) {
      throw new Error(`${p}: file "${link}" links out of the package`);
    }
    const node = this.searchNodeFromPath(p) as FilesystemLinkEntry;
    const dirNode = this.searchNodeFromPath(path.dirname(p)) as FilesystemDirectoryEntry;
    if (shouldUnpack || dirNode.unpacked) {
      node.unpacked = true;
    }
    node.link = link;
    return link;
  }

  private resolveLink(src: string, parentPath: string, symlink: string) {
    // Use path.resolve (not path.join) so that an absolute symlink target is
    // honored as-is instead of being concatenated onto parentPath. With join,
    // an absolute target's leading separator is swallowed, producing a broken
    // relative link for in-package targets and silently bypassing the
    // out-of-package guard for targets outside the package. resolve handles
    // both absolute and relative targets through a single code path.
    const target = path.resolve(parentPath, symlink);
    const link = path.relative(src, target);
    return link;
  }

  listFiles(options?: { isPack: boolean }) {
    const files: string[] = [];

    const fillFilesFromMetadata = function (basePath: string, metadata: FilesystemEntry) {
      if (!('files' in metadata)) {
        return;
      }

      for (const [childPath, childMetadata] of Object.entries(metadata.files)) {
        const fullPath = path.join(basePath, childPath);
        const packState =
          'unpacked' in childMetadata && childMetadata.unpacked ? 'unpack' : 'pack  ';
        files.push(options && options.isPack ? `${packState} : ${fullPath}` : fullPath);
        fillFilesFromMetadata(fullPath, childMetadata);
      }
    };

    fillFilesFromMetadata('/', this.header);
    return files;
  }

  getNode(
    p: string,
    followLinks: boolean = true,
    depth: number = 0,
    visited: Set<string> = new Set(),
  ): FilesystemEntry {
    const node = this.searchNodeFromDirectory(path.dirname(p));
    const name = path.basename(p);
    if ('link' in node && followLinks) {
      const resolvedPath = path.join(node.link, name);
      if (visited.has(resolvedPath)) {
        throw new Error(`"${p}": circular symlink detected at "${resolvedPath}"`);
      }
      if (depth >= SYMLINK_MAX_DEPTH) {
        throw new Error(`"${p}": too many levels of symbolic links (>${SYMLINK_MAX_DEPTH})`);
      }
      visited.add(resolvedPath);
      return this.getNode(resolvedPath, followLinks, depth + 1, visited);
    }
    if (name) {
      return (node as FilesystemDirectoryEntry).files[name];
    } else {
      return node;
    }
  }

  getFile(
    p: string,
    followLinks: boolean = true,
    depth: number = 0,
    visited: Set<string> = new Set(),
  ): FilesystemEntry {
    const info = this.getNode(p, followLinks, depth, visited);

    if (!info) {
      throw new Error(`"${p}" was not found in this archive`);
    }

    // if followLinks is false we don't resolve symlinks
    if ('link' in info && followLinks) {
      const link = (info as FilesystemLinkEntry).link;
      if (visited.has(link)) {
        throw new Error(`"${p}": circular symlink detected at "${link}"`);
      }
      if (depth >= SYMLINK_MAX_DEPTH) {
        throw new Error(`"${p}": too many levels of symbolic links (>${SYMLINK_MAX_DEPTH})`);
      }
      visited.add(link);
      return this.getFile(link, followLinks, depth + 1, visited);
    } else {
      return info;
    }
  }
}
