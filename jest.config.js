/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  injectGlobals: true,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*-spec.ts'],
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
  testTimeout: 10000,
};
