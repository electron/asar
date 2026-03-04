import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import plist from 'plist';
import semver from 'semver';
import { downloadArtifact } from '@electron/get';
import { FuseV1Options, FuseVersion, flipFuses } from '@electron/fuses';

import {
  calculateIntegrityDigestForApp,
  getRawHeader,
  getStoredIntegrityDigestForApp,
  setStoredIntegrityDigestForApp,
} from '../src/asar.js';
import { wrappedFs as fs } from '../src/wrapped-fs.js';
import { TEST_APPS_DIR } from './util/constants.js';

type ReleaseChannel = 'auto' | 'stable' | 'beta' | 'alpha' | 'nightly';

async function fetchAllElectronVersions(nightly?: boolean) {
  const response = await fetch(`https://registry.npmjs.org/electron${nightly ? '-nightly' : ''}`);
  if (!response.ok) {
    throw new Error(`Failed to fetch electron versions: HTTP ${response.status}`);
  }
  const payload = (await response.json()) as {
    versions?: Record<string, unknown>;
  };
  if (!payload.versions || typeof payload.versions !== 'object') {
    throw new Error('Unexpected npm registry response for electron versions');
  }
  return Object.keys(payload.versions);
}

async function getTargetElectronVersion(): Promise<string> {
  const configuredVersion = process.env.ELECTRON_INTEGRITY_DIGEST_TEST_VERSION?.trim();
  if (configuredVersion) {
    return Promise.resolve(configuredVersion);
  }
  const configuredMajorVersion = process.env.ELECTRON_INTEGRITY_DIGEST_TEST_MAJOR_VERSION?.trim();
  const configuredReleaseChannel =
    process.env.ELECTRON_INTEGRITY_DIGEST_TEST_RELEASE_CHANNEL?.trim();
  if (!configuredMajorVersion || !configuredReleaseChannel) {
    throw new Error(
      'ELECTRON_INTEGRITY_DIGEST_TEST_MAJOR_VERSION and ELECTRON_INTEGRITY_DIGEST_TEST_RELEASE_CHANNEL must be set',
    );
  }
  if (!/^\d+$/.test(configuredMajorVersion)) {
    throw new Error('ELECTRON_INTEGRITY_DIGEST_TEST_MAJOR_VERSION must be a number');
  }
  if (!['auto', 'stable', 'beta', 'alpha', 'nightly'].includes(configuredReleaseChannel)) {
    throw new Error(
      'ELECTRON_INTEGRITY_DIGEST_TEST_RELEASE_CHANNEL must be one of auto|stable|beta|alpha|nightly',
    );
  }
  const allElectronVersions = await fetchAllElectronVersions(
    configuredReleaseChannel === 'nightly',
  );
  const targetMajorVersion = Number(configuredMajorVersion);
  const validVersions = allElectronVersions.filter((version) => semver.valid(version) !== null);

  const latestVersionForChannel = (channel: ReleaseChannel): string | null => {
    const matchingVersions = validVersions.filter((version) => {
      if (semver.major(version) !== targetMajorVersion) {
        return false;
      }
      const prerelease = semver.prerelease(version);
      if (channel === 'stable') {
        return prerelease === null;
      }
      if (prerelease === null || prerelease.length === 0) {
        return false;
      }
      return String(prerelease[0]) === channel;
    });
    const [latest] = semver.rsort(matchingVersions);
    return latest ?? null;
  };

  const channelsToTry: Array<ReleaseChannel> =
    configuredReleaseChannel === 'auto'
      ? ['stable', 'beta', 'alpha', 'nightly']
      : [configuredReleaseChannel as ReleaseChannel];

  for (const channel of channelsToTry) {
    const latest = latestVersionForChannel(channel);
    if (latest) {
      return latest;
    }
  }

  throw new Error(
    `Could not find matching Electron version for major=${targetMajorVersion}, channel=${configuredReleaseChannel}`,
  );
}

function runCommand(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'ignore' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });
  });
}

describe('integrity digest integration', () => {
  it('downloads an app, enables ASAR integrity, and verifies digest survives launch', async ({
    skip,
  }) => {
    if (process.platform !== 'darwin') {
      skip();
    }
    if (!process.env.CI) {
      skip();
    }

    const baseDir = path.join(TEST_APPS_DIR, 'integrity-digest-integration');
    const extractedDir = path.join(baseDir, 'extracted');

    fs.rmSync(baseDir, { recursive: true, force: true });
    await fs.mkdirp(baseDir);

    const electronVersion = await getTargetElectronVersion();
    const parsedElectronVersion = semver.parse(electronVersion);
    if (!parsedElectronVersion || 41 > parsedElectronVersion.major) {
      throw new Error(
        `The integrity digest is only supported for Electron >=41. Got ${electronVersion}.`,
      );
    }

    // Step 1: download and extract the Electron app.
    const artifactPath = await downloadArtifact({
      version: electronVersion,
      platform: 'darwin',
      arch: process.arch,
      artifactName: 'electron',
      cacheRoot: path.join(baseDir, 'cache'),
      tempDirectory: baseDir,
    });

    await fs.mkdirp(extractedDir);
    await runCommand('ditto', ['-xk', artifactPath, extractedDir]);

    const appPath = path.join(extractedDir, 'Electron.app');
    const appContentsPath = path.join(appPath, 'Contents');
    const asarPath = path.join(appContentsPath, 'Resources', 'default_app.asar');
    const infoPlistPath = path.join(appContentsPath, 'Info.plist');
    const electronBinaryPath = path.join(appContentsPath, 'MacOS', 'Electron');
    const asarIntegrityPlistKey = path.relative(appContentsPath, asarPath);

    expect(fs.existsSync(appPath)).toBe(true);
    expect(fs.existsSync(asarPath)).toBe(true);

    // Step 2: enable runtime ASAR integrity validation.
    await flipFuses(electronBinaryPath, {
      version: FuseVersion.V1,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
    });

    // Add ASAR integrity metadata to Info.plist so we can calculate/store digest.
    const plistRaw = await fs.readFile(infoPlistPath, 'utf8');
    const plistData = plist.parse(plistRaw) as Record<string, unknown>;
    const asarHeaderHash = crypto
      .createHash('SHA256')
      .update(getRawHeader(asarPath).headerString)
      .digest('hex');
    plistData.ElectronAsarIntegrity = {
      [asarIntegrityPlistKey]: {
        algorithm: 'SHA256',
        hash: asarHeaderHash,
      },
    };
    await fs.writeFile(infoPlistPath, plist.build(plistData as any), 'utf8');

    // Step 3: calculate digest, save it, and store in artifact.
    const calculatedDigest = calculateIntegrityDigestForApp(appPath, 1);
    expect(calculatedDigest.used).toBe(true);
    if (!calculatedDigest.used) {
      throw new Error('Expected calculated digest to be enabled');
    }
    expect(calculatedDigest.version).toBe(1);
    const calculatedDigestHex = calculatedDigest.sha256Digest.toString('hex');
    setStoredIntegrityDigestForApp(appPath, calculatedDigest);

    // Re-sign after mutating Info.plist and framework binary, otherwise macOS can kill on launch.
    await runCommand('codesign', [
      '--sign',
      '-',
      '--force',
      '--preserve-metadata=entitlements,requirements,flags,runtime',
      '--deep',
      appPath,
    ]);

    // Step 4: launch and ensure app is still running after a short wait.
    const appProcess = spawn(electronBinaryPath, [], { stdio: 'ignore' });
    try {
      await sleep(4_000);
      expect(appProcess.exitCode).toBeNull();
    } finally {
      if (appProcess.exitCode === null) {
        appProcess.kill('SIGTERM');
        await Promise.race([
          new Promise<void>((resolve) => appProcess.once('exit', () => resolve())),
          sleep(3000).then(() => {
            if (appProcess.exitCode === null) {
              appProcess.kill('SIGKILL');
            }
          }),
        ]);
      }
    }

    // Step 5: read stored digest and compare with saved digest value.
    const storedDigest = getStoredIntegrityDigestForApp<{
      used: true;
      version: 1;
      sha256Digest: Buffer;
    }>(appPath);
    expect(storedDigest.used).toBe(true);
    expect(storedDigest.version).toBe(1);
    expect(storedDigest.sha256Digest.toString('hex')).toBe(calculatedDigestHex);
  }, 600_000);
});
