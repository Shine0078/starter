import { readdir } from 'node:fs/promises';
import { join } from 'node:path';

const MIGRATIONS_DIR = join(__dirname, '..', '..', '..', 'migrations');

/** Latest SQL migration bundled in this image. This is image identity, not a live DB query. */
export async function bundledSchemaVersion(): Promise<string | null> {
  try {
    const files = (await readdir(MIGRATIONS_DIR))
      .filter((name) => name.endsWith('.sql'))
      .sort();
    return files.at(-1) ?? null;
  } catch {
    return null;
  }
}
