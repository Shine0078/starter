import { defineConfig } from 'vitest/config';

// Only the pure domain layer is unit-tested here. It has no decorators and no
// framework imports, so esbuild transpilation is sufficient (see ADR-0002).
export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    reporters: ['verbose'],
  },
});
