import type { Pool } from 'pg';

import type { BankLink, BankLinkStore, BankWebhookJob, BankWebhookStore } from '../../ports/banking';
import { withUserScope } from '../postgres/pool';

export class InMemoryBankLinkStore implements BankLinkStore {
  private readonly rows = new Map<string, BankLink[]>();
  private readonly syncStartedAt = new Map<string, number>();

  private bucket(userId: string): BankLink[] {
    const current = this.rows.get(userId) ?? [];
    this.rows.set(userId, current);
    return current;
  }

  async list(userId: string): Promise<BankLink[]> {
    return [...this.bucket(userId)];
  }
  async get(userId: string, id: string): Promise<BankLink | null> {
    return this.bucket(userId).find((row) => row.id === id) ?? null;
  }
  async getByProviderItemId(providerItemId: string) {
    for (const [userId, rows] of this.rows) {
      const link = rows.find((row) => row.providerItemId === providerItemId);
      if (link) return { userId, link };
    }
    return null;
  }
  async create(userId: string, link: BankLink): Promise<BankLink> {
    this.bucket(userId).push(link);
    return link;
  }
  async update(userId: string, id: string, patch: Partial<BankLink>): Promise<BankLink | null> {
    const rows = this.bucket(userId);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return null;
    rows[index] = { ...rows[index]!, ...patch, id };
    if (patch.status !== 'syncing') this.syncStartedAt.delete(`${userId}:${id}`);
    return rows[index]!;
  }
  async startSync(userId: string, id: string): Promise<BankLink | null> {
    const link = await this.get(userId, id);
    if (!link) return null;
    const key = `${userId}:${id}`;
    const startedAt = this.syncStartedAt.get(key);
    if (link.status === 'syncing' && startedAt !== undefined && Date.now() - startedAt < 5 * 60_000) {
      return null;
    }
    this.syncStartedAt.set(key, Date.now());
    return this.update(userId, id, { status: 'syncing', errorCode: null });
  }
  async remove(userId: string, id: string): Promise<boolean> {
    const rows = this.bucket(userId);
    const index = rows.findIndex((row) => row.id === id);
    if (index < 0) return false;
    rows.splice(index, 1);
    this.syncStartedAt.delete(`${userId}:${id}`);
    return true;
  }
  purgeUser(userId: string): void {
    this.rows.delete(userId);
    for (const key of this.syncStartedAt.keys()) {
      if (key.startsWith(`${userId}:`)) this.syncStartedAt.delete(key);
    }
  }
}

interface BankLinkRow {
  id: string;
  provider_item_id: string;
  institution_id: string | null;
  institution_name: string;
  encrypted_access_token: string;
  cursor: string | null;
  status: BankLink['status'];
  error_code: string | null;
  last_synced_at: Date | null;
  created_at: Date;
}

const COLUMNS = `id, provider_item_id, institution_id, institution_name,
 encrypted_access_token, cursor, status, error_code, last_synced_at, created_at`;
const map = (row: BankLinkRow): BankLink => ({
  id: row.id,
  provider: 'plaid',
  providerItemId: row.provider_item_id,
  institutionId: row.institution_id,
  institutionName: row.institution_name,
  encryptedAccessToken: row.encrypted_access_token,
  cursor: row.cursor,
  status: row.status,
  errorCode: row.error_code,
  lastSyncedAt: row.last_synced_at?.toISOString() ?? null,
  createdAt: row.created_at.toISOString(),
});

export class PostgresBankLinkStore implements BankLinkStore {
  constructor(private readonly pg: Pool) {}
  async list(userId: string): Promise<BankLink[]> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BankLinkRow>(
        `SELECT ${COLUMNS} FROM institution_links WHERE user_id=$1 ORDER BY created_at`,
        [userId],
      );
      return rows.map(map);
    });
  }
  async get(userId: string, id: string): Promise<BankLink | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BankLinkRow>(
        `SELECT ${COLUMNS} FROM institution_links WHERE user_id=$1 AND id=$2`,
        [userId, id],
      );
      return rows[0] ? map(rows[0]) : null;
    });
  }
  async getByProviderItemId(providerItemId: string) {
    const { rows } = await this.pg.query<{ user_id: string; link_id: string }>(
      'SELECT user_id, link_id FROM finverse_link_owner($1)',
      [providerItemId],
    );
    if (!rows[0]) return null;
    const link = await this.get(rows[0].user_id, rows[0].link_id);
    return link ? { userId: rows[0].user_id, link } : null;
  }
  async create(userId: string, link: BankLink): Promise<BankLink> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BankLinkRow>(
        `INSERT INTO institution_links
         (id,user_id,provider,provider_item_id,institution_id,institution_name,
          encrypted_access_token,cursor,status,error_code,last_synced_at,created_at)
         VALUES ($1,$2,'plaid',$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING ${COLUMNS}`,
        [link.id,userId,link.providerItemId,link.institutionId,link.institutionName,
         link.encryptedAccessToken,link.cursor,link.status,link.errorCode,link.lastSyncedAt,link.createdAt],
      );
      return map(rows[0]!);
    });
  }
  async update(userId: string, id: string, patch: Partial<BankLink>): Promise<BankLink | null> {
    const fields: Array<[keyof BankLink, string]> = [
      ['institutionId','institution_id'],['institutionName','institution_name'],
      ['encryptedAccessToken','encrypted_access_token'],['cursor','cursor'],['status','status'],
      ['errorCode','error_code'],['lastSyncedAt','last_synced_at'],
    ];
    const values: unknown[] = [userId,id];
    const set: string[] = [];
    for (const [key,column] of fields) if (key in patch) { values.push(patch[key]); set.push(`${column}=$${values.length}`); }
    if (!set.length) return this.get(userId,id);
    return withUserScope(this.pg,userId,async(client)=>{
      const {rows}=await client.query<BankLinkRow>(
        `UPDATE institution_links SET ${set.join(',')}, updated_at=now()
         WHERE user_id=$1 AND id=$2 RETURNING ${COLUMNS}`,values);
      return rows[0]?map(rows[0]):null;
    });
  }
  startSync(userId: string, id: string): Promise<BankLink | null> {
    return withUserScope(this.pg, userId, async (client) => {
      const { rows } = await client.query<BankLinkRow>(
        `UPDATE institution_links SET status='syncing',error_code=NULL,updated_at=now()
         WHERE user_id=$1 AND id=$2
           AND (status <> 'syncing' OR updated_at < now() - interval '5 minutes')
         RETURNING ${COLUMNS}`,
        [userId, id],
      );
      return rows[0] ? map(rows[0]) : null;
    });
  }
  remove(userId: string, id: string): Promise<boolean> {
    return withUserScope(this.pg, userId, async (client) => {
      const result = await client.query(
        'DELETE FROM institution_links WHERE user_id=$1 AND id=$2',
        [userId, id],
      );
      return result.rowCount === 1;
    });
  }
}

interface MemoryWebhookJob extends BankWebhookJob {
  status: 'pending' | 'processing' | 'completed' | 'failed';
  updatedAt: string;
  createdAt: string;
}

export class InMemoryBankWebhookStore implements BankWebhookStore {
  private readonly jobs = new Map<string, MemoryWebhookJob>();

  async enqueue(job: BankWebhookJob): Promise<boolean> {
    const now = Date.now();
    if ([...this.jobs.values()].some(
      (existing) => existing.bodyHash === job.bodyHash && now - Date.parse(existing.createdAt) < 60 * 60_000,
    )) return false;
    const createdAt = new Date(now).toISOString();
    this.jobs.set(job.id, { ...job, status: 'pending', updatedAt: createdAt, createdAt });
    return true;
  }

  async claim(limit: number): Promise<BankWebhookJob[]> {
    const now = Date.now();
    const stale = now - 5 * 60_000;
    return [...this.jobs.values()]
      .filter((job) =>
        (job.status === 'pending' && Date.parse(job.availableAt) <= now) ||
        (job.status === 'processing' && Date.parse(job.updatedAt) < stale),
      )
      .sort((left, right) => left.availableAt.localeCompare(right.availableAt))
      .slice(0, Math.max(1, Math.min(limit, 100)))
      .map((job) => {
        job.status = 'processing';
        job.attempts += 1;
        job.updatedAt = new Date().toISOString();
        return { ...job };
      });
  }

  async complete(userId: string, id: string): Promise<void> {
    const job = this.jobs.get(id);
    if (job?.userId === userId) job.status = 'completed';
  }

  async retry(userId: string, id: string, availableAt: string, terminal: boolean): Promise<void> {
    const job = this.jobs.get(id);
    if (job?.userId !== userId) return;
    job.status = terminal ? 'failed' : 'pending';
    job.availableAt = availableAt;
    job.updatedAt = new Date().toISOString();
  }
  async purgeLink(userId: string, linkId: string): Promise<void> {
    for (const [id, job] of this.jobs) {
      if (job.userId === userId && job.linkId === linkId) this.jobs.delete(id);
    }
  }

  purgeUser(userId: string): void {
    for (const [id, job] of this.jobs) if (job.userId === userId) this.jobs.delete(id);
  }
}

interface BankWebhookRow {
  id: string;
  user_id: string;
  link_id: string;
  body_hash: string;
  attempts: number;
  available_at: Date;
}

const mapWebhook = (row: BankWebhookRow): BankWebhookJob => ({
  id: row.id,
  userId: row.user_id,
  linkId: row.link_id,
  bodyHash: row.body_hash,
  attempts: row.attempts,
  availableAt: row.available_at.toISOString(),
});

export class PostgresBankWebhookStore implements BankWebhookStore {
  constructor(private readonly pg: Pool) {}

  enqueue(job: BankWebhookJob): Promise<boolean> {
    return withUserScope(this.pg, job.userId, async (client) => {
      const result = await client.query(
        `INSERT INTO bank_webhook_jobs
         (id,user_id,link_id,body_hash,status,attempts,available_at,created_at)
         VALUES ($1,$2,$3,$4,'pending',0,$5,now())
         ON CONFLICT (body_hash, dedupe_bucket) DO NOTHING`,
        [job.id, job.userId, job.linkId, job.bodyHash, job.availableAt],
      );
      return result.rowCount === 1;
    });
  }

  async claim(limit: number): Promise<BankWebhookJob[]> {
    const { rows } = await this.pg.query<BankWebhookRow>(
      'SELECT * FROM finverse_claim_bank_webhooks($1)',
      [limit],
    );
    return rows.map(mapWebhook);
  }

  complete(userId: string, id: string): Promise<void> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `UPDATE bank_webhook_jobs SET status='completed',updated_at=now()
         WHERE user_id=$1 AND id=$2`,
        [userId, id],
      );
    });
  }

  retry(userId: string, id: string, availableAt: string, terminal: boolean): Promise<void> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        `UPDATE bank_webhook_jobs
         SET status=$3,available_at=$4,updated_at=now()
         WHERE user_id=$1 AND id=$2`,
        [userId, id, terminal ? 'failed' : 'pending', availableAt],
      );
    });
  }
  purgeLink(userId: string, linkId: string): Promise<void> {
    return withUserScope(this.pg, userId, async (client) => {
      await client.query(
        'DELETE FROM bank_webhook_jobs WHERE user_id=$1 AND link_id=$2',
        [userId, linkId],
      );
    });
  }
}
