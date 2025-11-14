import path from 'node:path';
import crypto from 'node:crypto';
import plist from 'plist';

import { wrappedFs as fs } from './wrapped-fs.js';
import { FileRecord } from './disk.js';

// Integrity digest type definitions

type IntegrityDigest<Version extends number, AdditionalParams> =
  | { used: false }
  | ({ used: true; version: Version } & AdditionalParams);

type IntegrityDigestV1 = IntegrityDigest<1, { sha256Digest: Buffer }>;

type AnyIntegrityDigest = IntegrityDigestV1; // Extend this union type as new versions are added

// Integrity digest calculation functions

type AsarIntegrity = Record<string, Pick<FileRecord['integrity'], 'algorithm' | 'hash'>>;

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

function calculateIntegrityDigestV1ForApp(appPath: string): IntegrityDigestV1 {
  const plistPath = path.join(appPath, 'Contents', 'Info.plist');
  const plistBuffer = fs.readFileSync(plistPath);
  const plistData = plist.parse(plistBuffer.toString()) as Record<string, any>;
  const asarIntegrity = plistData['ElectronAsarIntegrity'] as AsarIntegrity;
  return calculateIntegrityDigestV1(asarIntegrity);
}

/// Integrity digest handling errors

const UnknownIntegrityDigestVersionError = class extends Error {
  constructor(version: number) {
    super(`Unknown integrity digest version: ${version}`);
    this.name = 'UnknownIntegrityDigestVersionError';
  }
};

// Integrity digest storage and retrieval functions

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
  throw new Error('App path must be an .app bundle');
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

async function getStoredIntegrityDigestForApp<T extends AnyIntegrityDigest>(
  appPath: string,
): Promise<T> {
  let lastDigestFound: T | null = null;
  forEachSentinelInApp(appPath, (sentinelIndex, integrityFile) => {
    const currentDigest = sentinelIndexToDigest<T>(integrityFile, sentinelIndex);
    if (lastDigestFound === null) {
      lastDigestFound = currentDigest;
    } else if (!doDigestsMatch(currentDigest, lastDigestFound)) {
      throw new Error('Multiple differing integrity digests found in the binary');
    }
    lastDigestFound = currentDigest;
  });
  if (lastDigestFound === null) {
    throw new Error('No integrity digest found in the binary');
  }
  return lastDigestFound;
}

async function setStoredIntegrityDigestForApp<T extends AnyIntegrityDigest>(
  appPath: string,
  digest: T,
): Promise<void> {
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
      digestLogger('\tUnknown metadata for digest version: %d', digest.version);
  }
}

export async function enableIntegrityDigestForApp(appPath: string): Promise<void> {
  try {
    console.log('Calculating integrity digest...');
    const digest = calculateIntegrityDigestV1ForApp(appPath);
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
    const calculatedDigest = calculateIntegrityDigestV1ForApp(appPath);
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
