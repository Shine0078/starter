import { describe, expect, it } from 'vitest';

import { bundledSchemaVersion } from '../src/infra/postgres/schema-identity';

describe('bundled schema identity', () => {
  it('reports the latest numbered migration in this image', async () => {
    await expect(bundledSchemaVersion()).resolves.toMatch(/^\d{3}_.+\.sql$/);
  });
});
