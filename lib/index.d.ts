import { IOptions as GlobOptions } from 'glob';
import { Stats } from 'fs';

export type CreateOptions = {
  dot?: boolean;
  globOptions?: GlobOptions;
  ordering?: string;
  pattern?: string;
  transform?: (filePath: string) => string;
  unpack?: string;
  unpackDir?: string;
};

export type ListOptions = {
  isPack: boolean;
};

export type EntryMetadata = {
  unpacked: boolean;
};

export type DirectoryMetadata = EntryMetadata & {
  files: { [property: string]: EntryMetadata };
};

export type FileMetadata = EntryMetadata & {
  executable?: true;
  offset?: number;
  size?: number;
};

export type LinkMetadata = {
  link: string;
};

export type Metadata = DirectoryMetadata | FileMetadata | LinkMetadata;

export type InputMetadataType = 'directory' | 'file' | 'link';

export type InputMetadata = {
  [property: string]: {
    type: InputMetadataType;
    stat: Stats;
  }
};

export function createPackage(src: string, dest: string): Promise<void>;
export function createPackageWithOptions(
  src: string,
  dest: string,
  options: CreateOptions
): Promise<void>;
export function createPackageFromFiles(
  src: string,
  dest: string,
  filenames: string[],
  metadata?: InputMetadata,
  options?: CreateOptions
): Promise<void>;

export function statFile(archive: string, filename: string, followLinks?: boolean): Metadata;
export function listPackage(archive: string, options?: ListOptions): string[];
export function extractFile(archive: string, filename: string): Buffer;
export function extractAll(archive: string, dest: string): void;
export function uncache(archive: string): boolean;
export function uncacheAll(): void;
