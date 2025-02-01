import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: './vitest-setup.ts',
    include: ['test/**/*-spec.?(c|m)[jt]s?(x)'],
  },
});
