import { defineConfig } from 'vitest/config';
import ElectronExitReporter from './vitest.electron-reporter';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*-spec.ts'],
    setupFiles: ['test/vitest.setup.ts'],
    testTimeout: 10000,
    fileParallelism: false,
    pool: 'forks',
    reporters: [
      'default',
      new ElectronExitReporter(),
    ]
  },
});