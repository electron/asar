import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import * as stream from 'stream';

import { FileIntegrity, getFileIntegrity } from './integrity';
import fs from './wrapped-fs';
import { CrawledFileType } from './crawlfs';

const UINT32_MAX = 2 ** 32 - 1;

const pipeline = promisify(stream.pipeline);

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

  constructor(src: string) {
    this.src = path.resolve(src);
    this.header = { files: Object.create(null) };
    this.headerSize = 0;
    this.offset = BigInt(0);
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

  async insertFile(
    p: string,
    streamGenerator: () => NodeJS.ReadableStream,
    shouldUnpack: boolean,
    file: CrawledFileType,
    options: {
      transform?: (filePath: string) => NodeJS.ReadWriteStream | void;
    } = {},
  ) {
    const dirNode = this.searchNodeFromPath(path.dirname(p)) as FilesystemDirectoryEntry;
    const node = this.searchNodeFromPath(p) as FilesystemFileEntry;
    if (shouldUnpack || dirNode.unpacked) {
      node.size = file.stat.size;
      node.unpacked = true;
      node.integrity = await getFileIntegrity(streamGenerator());
      return Promise.resolve();
    }

    let size: number;

    const transformed = options.transform && options.transform(p);
    if (transformed) {
      const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), 'asar-'));
      const tmpfile = path.join(tmpdir, path.basename(p));
      const out = fs.createWriteStream(tmpfile);

      await pipeline(streamGenerator(), transformed, out);
      file.transformed = {
        path: tmpfile,
        stat: await fs.lstat(tmpfile),
      };
      size = file.transformed.stat.size;
    } else {
      size = file.stat.size;
    }

    // JavaScript cannot precisely present integers >= UINT32_MAX.
    if (size > UINT32_MAX) {
      throw new Error(`${p}: file size can not be larger than 4.2GB`);
    }

    node.size = size;
    node.offset = this.offset.toString();
    node.integrity = await getFileIntegrity(streamGenerator());
    if (process.platform !== 'win32' && file.stat.mode & 0o100) {
      node.executable = true;
    }
    this.offset += BigInt(size);
  }

  insertLink(
    p: string,
    shouldUnpack: boolean,
    parentPath: string = fs.realpathSync(path.dirname(p)),
    symlink: string = fs.readlinkSync(p), // /var/tmp => /private/var
    src: string = fs.realpathSync(this.src),
  ) {
    const link = this.resolveLink(src, parentPath, symlink);
    if (link.startsWith('..')) {
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
    const target = path.join(parentPath, symlink);
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

  getNode(p: string, followLinks: boolean = true): FilesystemEntry {
    const node = this.searchNodeFromDirectory(path.dirname(p));
    const name = path.basename(p);
    if ('link' in node && followLinks) {
      return this.getNode(path.join(node.link, name));
    }
    if (name) {
      return (node as FilesystemDirectoryEntry).files[name];
    } else {
      return node;
    }
  }

  getFile(p: string, followLinks: boolean = true): FilesystemEntry {
    const info = this.getNode(p, followLinks);

    if (!info) {
      throw new Error(`"${p}" was not found in this archive`);
    }

    // if followLinks is false we don't resolve symlinks
    if ('link' in info && followLinks) {
      return this.getFile(info.link, followLinks);
    } else {
      return info;
    }
  }
}
