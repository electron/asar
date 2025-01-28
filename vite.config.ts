import { fileURLToPath, URL } from 'url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: './vitest-setup.ts',
    environment: 'jsdom',
    // TODO: remove include prop after complete Vitest migration
    include: ['tests-vitest/**/*.{test,spec}.?(c|m)[jt]s?(x)'],
    coverage: {
      reporter: ['lcov', 'text'],
    },
    outputFile: 'coverage/sonar-report.xml',
  },
  resolve: {
    alias: [{ find: '@/', replacement: fileURLToPath(new URL('./', import.meta.url))
      },
});