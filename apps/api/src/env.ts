/**
 * Loads `apps/api/.env` into `process.env`.
 *
 * Must be imported *before* anything that reads configuration. `loadConfig()`
 * is memoised and runs at module-initialisation time from the composition root,
 * so a `.env` loaded after that import has no effect and fails in the most
 * confusing way available: the file exists, the values look right, and the
 * process behaves as though it were empty.
 *
 * Real environment variables always win. A value exported in the shell is a
 * deliberate override — usually a test harness or a deploy — and a file on disk
 * should not quietly outrank it.
 *
 * Absent in production by design: there is no `.env` on a deployed host, the
 * platform supplies the environment, and this is a no-op when the file is
 * missing.
 */

import { config as loadDotenv } from 'dotenv';
import { join } from 'node:path';

loadDotenv({ path: join(__dirname, '..', '.env'), override: false, quiet: true });
