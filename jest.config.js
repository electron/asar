/** @type {import('ts-jest').JestConfigWithTsJest} */
const nodeEnvConfig = {
  preset: 'ts-jest',
  injectGlobals: true,
  testEnvironment: 'node',
  transform: {
    '^.+\\.ts?$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
  globalSetup: './test/setup/jest.global.setup.ts',
  setupFilesAfterEnv: ['<rootDir>/test/setup/jest.env.setup.ts'],
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*-spec.ts'],
};

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 10000,
  projects: [
    nodeEnvConfig,
    {
      ...nodeEnvConfig,
      runner: '@kayahr/jest-electron-runner/main', // fork of https://github.com/facebook-atom/jest-electron-runner but updated to support jest v27+
      testMatch: [...nodeEnvConfig.testMatch, "!**/cli-spec.ts"], // cli isn't accessible within electron main process, right?
      testEnvironmentOptions: {
        electron: {
          options: [], // args for electron (such as 'no-sandbox' & 'force-device-scale-factor=1')
          disableHardwareAcceleration: false,
        },
      },
    }
  ]
};
