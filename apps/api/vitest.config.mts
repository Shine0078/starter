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
    hookTimeout: 60_000,
    // Two suites share one database when TEST_DATABASE_URL is set, and both
    // truncate between tests. Run files one at a time in that case: in
    // parallel, one suite's reset deletes the other's fixtures mid-assertion,
    // and the failure moves around between runs. Without a database there is
    // nothing shared, so the common `npm test` path stays fully parallel.
    fileParallelism: !process.env.TEST_DATABASE_URL,
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
