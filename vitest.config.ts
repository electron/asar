import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*-spec.ts'],
    globalSetup: 'test/vitest.global.ts',
    testTimeout: 10000,
    fileParallelism: false,
    pool: 'forks',
    reporters: ['default'],
  },
});
