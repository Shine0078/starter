import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  test: {
    include: ['test/**/*.spec.ts'],
    environment: 'node',
    reporters: ['verbose'],
    // Argon2id is slow on purpose. The auth suite hashes real passwords rather
    // than faking the hasher, because the timing-equalisation and rehash paths
    // are only meaningful against the real thing.
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
  plugins: [
    // Nest resolves constructor dependencies from `design:paramtypes`, which
    // only `emitDecoratorMetadata` produces. Vitest's default esbuild transform
    // does not emit it, so every injected controller would fail to construct.
    // SWC does, which is what lets the integration tests boot the real module
    // graph — guards, pipes, and all — instead of hand-wiring services.
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
});
