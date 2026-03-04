import path from 'node:path';
import crypto from 'node:crypto';
import plist from 'plist';

import { wrappedFs as fs } from './wrapped-fs.js';
import { FileRecord } from './disk.js';

// Integrity digest type definitions

/**
 * An object that represents an integrity digest of a given version.
 */
type IntegrityDigest<Version extends number, AdditionalParams> =
  | { used: false }
  | ({ used: true; version: Version } & AdditionalParams);

/**
 * A v1 integrity digest.
 */
type IntegrityDigestV1 = IntegrityDigest<1, { sha256Digest: Buffer }>;

/**
 * A map type of all integrity digest versions.
 */
type DigestByVersion = {
  1: IntegrityDigestV1;
  // Add new versions here
};

/**
 * A union of all integrity digest versions.
 */
type AnyIntegrityDigest = DigestByVersion[keyof DigestByVersion];

// Integrity digest calculation functions

type AsarIntegrity = Record<string, Pick<FileRecord['integrity'], 'algorithm' | 'hash'>>;

function isValidAsarIntegrity(asarIntegrity: any): asarIntegrity is AsarIntegrity {
  if (typeof asarIntegrity !== 'object' || asarIntegrity === null) return false;
  if (Object.keys(asarIntegrity).length === 0) return false;
  for (const key of Object.keys(asarIntegrity)) {
    if (typeof key !== 'string') return false;
    if (typeof asarIntegrity[key] !== 'object' || asarIntegrity[key] === null) return false;
    if (typeof asarIntegrity[key].algorithm !== 'string') return false;
    if (typeof asarIntegrity[key].hash !== 'string') return false;
  }
  return true;
}

/**
 * Calculates the v1 integrity digest for the app.
 * @see https://github.com/electron/electron/blob/2d5597b1b0fa697905380184e26c9f0947e05c5d/shell/common/asar/integrity_digest.mm#L52-L66
 * @param asarIntegrity - The integrity information for the app.
 * @returns The v1 integrity digest for the app.
 *
 */
function calculateIntegrityDigestV1(asarIntegrity: AsarIntegrity): IntegrityDigestV1 {
  const integrityHash = crypto.createHash('SHA256');
  for (const key of Object.keys(asarIntegrity).sort()) {
    const { algorithm, hash } = asarIntegrity[key];
    integrityHash.update(key);
    integrityHash.update(algorithm);
    integrityHash.update(hash);
  }
  return {
    used: true,
    version: 1,
    sha256Digest: integrityHash.digest(),
  };
}

/**
 * Reads the integrity information from the Info.plist of the given app
 *  bundle and calculates the v1 integrity digest for the app.
 * @param appPath - The path to the app bundle.
 * @returns The v1 integrity digest for the app.
 */
function calculateIntegrityDigestV1ForApp(appPath: string): IntegrityDigestV1 {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const plistBuffer = fs.readFileSync(plistPath);
  const plistData = plist.parse(plistBuffer.toString()) as Record<string, any>;
  const asarIntegrity = plistData['ElectronAsarIntegrity'];
  if (!isValidAsarIntegrity(asarIntegrity)) {
    throw new InvalidAsarIntegrityError();
  }
  return calculateIntegrityDigestV1(asarIntegrity);
}

/// Integrity digest handling errors (API)

export class InvalidAppPathError extends Error {
  constructor() {
    super('Invalid app path');
    this.name = 'InvalidAppPathError';
  }
}

export class InvalidAsarIntegrityError extends Error {
  constructor() {
    super('Invalid ASAR Integrity information in Info.plist');
    this.name = 'InvalidAsarIntegrityError';
  }
}

export class MissingIntegrityDigestError extends Error {
  constructor() {
    super('No integrity digest found in the binary');
    this.name = 'MissingIntegrityDigestError';
  }
}

export class MultipleDifferentIntegrityDigestsError extends Error {
  constructor() {
    super('Multiple different integrity digests found in the binary');
    this.name = 'MultipleDifferentIntegrityDigestsError';
  }
}

export class UnknownIntegrityDigestVersionError extends Error {
  constructor(version: number) {
    super(`Unknown integrity digest version: ${version}`);
    this.name = 'UnknownIntegrityDigestVersionError';
  }
}

// Integrity digest storage and retrieval helpers

/**
 * @see https://github.com/electron/electron/blob/2d5597b1b0fa697905380184e26c9f0947e05c5d/shell/common/asar/integrity_digest.mm#L24
 */
const INTEGRITY_DIGEST_SENTINEL = 'AGbevlPCksUGKNL8TSn7wGmJEuJsXb2A';

function pathToIntegrityDigestFile(appPath: string) {
  if (appPath.endsWith('.app')) {
    return path.resolve(
      appPath,
      'Contents',
      'Frameworks',
      'Electron Framework.framework',
      'Electron Framework',
    );
  }
  throw new InvalidAppPathError();
}

function forEachSentinelInApp(
  appPath: string,
  callback: (sentinelIndex: number, integrityFile: Buffer) => void,
  writeBack: boolean = false,
) {
  const integrityFilePath = pathToIntegrityDigestFile(appPath);
  const integrityFile = fs.readFileSync(integrityFilePath);
  let searchCursor = 0;
  const sentinelAsBuffer = Buffer.from(INTEGRITY_DIGEST_SENTINEL);
  do {
    const sentinelIndex = integrityFile.indexOf(sentinelAsBuffer, searchCursor);
    if (sentinelIndex === -1) break;
    callback(sentinelIndex, integrityFile);
    searchCursor = sentinelIndex + sentinelAsBuffer.length;
  } while (true);
  if (writeBack) {
    fs.writeFileSync(integrityFilePath, integrityFile);
  }
}

function doDigestsMatch(digestA: AnyIntegrityDigest, digestB: AnyIntegrityDigest): boolean {
  if (digestA.used !== digestB.used) return false;
  if (digestA.used && digestB.used) {
    if (digestA.version !== digestB.version) return false;
    switch (digestA.version) {
      case 1:
        return digestA.sha256Digest.equals(digestB.sha256Digest);
      default:
        throw new UnknownIntegrityDigestVersionError(digestA.version);
    }
  } else return true;
}

function sentinelIndexToDigest<T extends AnyIntegrityDigest>(
  integrityFile: Buffer,
  sentinelIndex: number,
): T {
  const used = integrityFile.readUInt8(sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length) === 1;
  if (!used) {
    return { used: false } as T;
  } else {
    const version = integrityFile.readUInt8(sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 1);
    switch (version) {
      case 1: {
        const sha256Digest = integrityFile.subarray(
          sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 2,
          sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 2 + 32, // SHA256 digest size
        );
        return {
          used: true,
          version: 1,
          sha256Digest,
        } as T;
      }
      default:
        throw new UnknownIntegrityDigestVersionError(version);
    }
  }
}

// Integrity digest storage and retrieval functions (API)

/**
 * Calculates the integrity digest for the app.
 * @param appPath - The path to the app bundle.
 * @param version - The version of the integrity digest to calculate.
 * @returns The integrity digest for the app.
 */
export function calculateIntegrityDigestForApp<Version extends keyof DigestByVersion>(
  appPath: string,
  version: Version,
): DigestByVersion[Version] {
  if (version !== 1) {
    throw new UnknownIntegrityDigestVersionError(version);
  }
  switch (version) {
    case 1:
      return calculateIntegrityDigestV1ForApp(appPath);
    default:
      throw new UnknownIntegrityDigestVersionError(version);
  }
}

/**
 * Gets the stored integrity digest for the app.
 * @param appPath - The path to the app bundle.
 * @returns The stored integrity digest for the app.
 */
export function getStoredIntegrityDigestForApp<T extends AnyIntegrityDigest>(appPath: string): T {
  let lastDigestFound: T | null = null;
  forEachSentinelInApp(appPath, (sentinelIndex, integrityFile) => {
    const currentDigest = sentinelIndexToDigest<T>(integrityFile, sentinelIndex);
    if (lastDigestFound === null) {
      lastDigestFound = currentDigest;
    } else if (!doDigestsMatch(currentDigest, lastDigestFound)) {
      throw new MultipleDifferentIntegrityDigestsError();
    }
    lastDigestFound = currentDigest;
  });
  if (lastDigestFound === null) {
    throw new MissingIntegrityDigestError();
  }
  return lastDigestFound;
}

/**
 * Sets the stored integrity digest for the app.
 * @param appPath - The path to the app bundle.
 * @param digest - The integrity digest to set.
 * @returns The stored integrity digest for the app.
 */
export function setStoredIntegrityDigestForApp<T extends AnyIntegrityDigest>(
  appPath: string,
  digest: T,
): void {
  if (digest.used === true && digest.version !== 1) {
    throw new UnknownIntegrityDigestVersionError(digest.version);
  }
  forEachSentinelInApp(
    appPath,
    (sentinelIndex, integrityFile) => {
      integrityFile.writeUInt8(
        digest.used ? 1 : 0,
        sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length,
      );
      const oldVersion = integrityFile.readUInt8(
        sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 1,
      );
      switch (oldVersion) {
        case 1:
          integrityFile.fill(
            0,
            sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 2,
            sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 2 + 32, // SHA256 digest size
          );
          break;
      }
      if (digest.used) {
        integrityFile.writeUInt8(
          digest.version,
          sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 1,
        );
        switch (digest.version) {
          case 1: {
            const v1Digest = digest as IntegrityDigestV1 & { used: true };
            v1Digest.sha256Digest.copy(
              integrityFile,
              sentinelIndex + INTEGRITY_DIGEST_SENTINEL.length + 2,
            );
            break;
          }
          default:
            throw new UnknownIntegrityDigestVersionError(digest.version);
        }
      }
    },
    true,
  );
}

// High-level integrity digest management functions

function printDigest(digest: AnyIntegrityDigest, prefix: string = '') {
  const digestLogger = prefix
    ? (s: string, ...args: any[]) => console.log(prefix + s, ...args)
    : console.log;
  if (!digest.used) {
    digestLogger('Integrity digest is OFF');
    return;
  }
  digestLogger('Integrity digest is ON (version: %d)', digest.version);
  switch (digest.version) {
    case 1:
      digestLogger('\tDigest (SHA256): %s', digest.sha256Digest.toString('hex'));
      break;
    default:
      digestLogger('\tUnexpected digest version: %d. Cannot print digest.', digest.version);
  }
}

export async function enableIntegrityDigestForApp(appPath: string): Promise<void> {
  try {
    console.log('Calculating integrity digest...');
    const digest = calculateIntegrityDigestForApp(appPath, 1);
    console.log('Turning integrity digest ON...');
    await setStoredIntegrityDigestForApp(appPath, digest);
    console.log('Integrity digest turned ON');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log('Failed to turn ON integrity digest: %s', errorMessage);
  }
}

export async function disableIntegrityDigestForApp(appPath: string): Promise<void> {
  try {
    console.log('Turning integrity digest OFF...');
    await setStoredIntegrityDigestForApp(appPath, { used: false });
    console.log('Integrity digest turned OFF');
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log('Failed to turn OFF integrity digest: %s', errorMessage);
  }
}

export async function printStoredIntegrityDigestForApp(appPath: string): Promise<void> {
  try {
    const storedDigest = await getStoredIntegrityDigestForApp(appPath);
    printDigest(storedDigest);
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log('Failed to read integrity digest: %s', errorMessage);
  }
}

export async function verifyIntegrityDigestForApp(appPath: string): Promise<void> {
  try {
    const storedDigest = await getStoredIntegrityDigestForApp(appPath);
    if (!storedDigest.used) {
      console.log('Integrity digest is off, verification SKIPPED');
      return;
    }
    const calculatedDigest = calculateIntegrityDigestForApp(appPath, 1);
    if (doDigestsMatch(storedDigest, calculatedDigest)) {
      console.log('Integrity digest verification PASSED');
    } else {
      console.log('Integrity digest verification FAILED');
      console.log('Expected digest:');
      printDigest(calculatedDigest, '\t');
      console.log('Actual digest:');
      printDigest(storedDigest, '\t');
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.log('Failed to verify integrity digest: %s', errorMessage);
  }
}
