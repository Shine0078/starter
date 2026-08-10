import { describe, expect, it, vi } from 'vitest';

import { FixedClock } from '../src/infra/clock';
import { AuthMaintenanceService } from '../src/modules/auth/auth-maintenance.service';

const NOW = new Date('2026-08-10T12:00:00.000Z');

function service(options?: {
  purge?: () => Promise<number>;
  deleteExpired?: () => Promise<number>;
}) {
  const purgeDue = options?.purge ?? vi.fn(async () => 0);
  const deleteExpired = options?.deleteExpired ?? vi.fn(async () => 0);
  const maintenance = new AuthMaintenanceService(
    { purgeDue } as never,
    { deleteExpired } as never,
    new FixedClock('2026-08-10'),
  );
  return { maintenance, purgeDue, deleteExpired };
}

describe('AuthMaintenanceService', () => {
  it('purges due accounts and expired sessions using the same clock instant', async () => {
    const { maintenance, purgeDue, deleteExpired } = service({
      purge: vi.fn(async () => 2),
      deleteExpired: vi.fn(async () => 5),
    });

    await expect(maintenance.runOnce()).resolves.toEqual({
      purgedAccounts: 2,
      expiredSessions: 5,
    });
    expect(purgeDue).toHaveBeenCalledWith(NOW);
    expect(deleteExpired).toHaveBeenCalledWith(NOW);
  });

  it('continues session cleanup when account purging fails', async () => {
    const { maintenance, purgeDue, deleteExpired } = service({
      purge: vi.fn(async () => {
        throw new Error('database temporarily unavailable');
      }),
      deleteExpired: vi.fn(async () => 3),
    });

    await expect(maintenance.runOnce()).resolves.toEqual({
      purgedAccounts: 0,
      expiredSessions: 3,
    });
    expect(purgeDue).toHaveBeenCalledOnce();
    expect(deleteExpired).toHaveBeenCalledOnce();
  });

  it('does not overlap two maintenance passes', async () => {
    let release!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const purgeDue = vi.fn(async () => {
      await blocked;
      return 1;
    });
    const { maintenance, deleteExpired } = service({ purge: purgeDue });

    const first = maintenance.runOnce();
    await expect(maintenance.runOnce()).resolves.toEqual({
      purgedAccounts: 0,
      expiredSessions: 0,
    });
    release();
    await expect(first).resolves.toEqual({
      purgedAccounts: 1,
      expiredSessions: 0,
    });
    expect(purgeDue).toHaveBeenCalledOnce();
    expect(deleteExpired).toHaveBeenCalledOnce();
  });
});
