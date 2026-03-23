import path from 'node:path';

/**
 * Validates that a resolved child path is strictly within a container directory.
 * Uses path.resolve (not realpath) so it works before paths exist on disk.
 * Throws if the resolved path escapes the container via traversal sequences.
 */
export function ensureWithin(container: string, filePath: string): string {
  const resolvedContainer = path.resolve(container);
  const resolvedPath = path.resolve(resolvedContainer, filePath);
  if (
    !resolvedPath.startsWith(resolvedContainer + path.sep) &&
    resolvedPath !== resolvedContainer
  ) {
    throw new Error(
      `Path "${filePath}" resolves to "${resolvedPath}" which is outside "${resolvedContainer}"`,
    );
  }
  return resolvedPath;
}
