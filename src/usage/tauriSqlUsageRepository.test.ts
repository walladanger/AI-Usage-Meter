import { describe, expect, test, vi } from 'vitest';
import { InMemoryUsageRepository } from './inMemoryUsageRepository';
import { TauriSqlUsageRepository, createRuntimeUsageRepository, type SqlDatabase } from './tauriSqlUsageRepository';

describe('TauriSqlUsageRepository', () => {
  test('uses memory in the browser and SQLite in the native runtime', async () => {
    const database: SqlDatabase = { execute: vi.fn(), select: vi.fn() };

    expect(await createRuntimeUsageRepository(false, async () => database)).toBeInstanceOf(InMemoryUsageRepository);
    expect(await createRuntimeUsageRepository(true, async () => database)).toBeInstanceOf(TauriSqlUsageRepository);
  });

  test('uses parameterized SQL to save observations without secret fields', async () => {
    const database: SqlDatabase = { execute: vi.fn().mockResolvedValue(undefined), select: vi.fn().mockResolvedValue([]) };
    const repository = new TauriSqlUsageRepository(database);

    await repository.saveObservation({
      providerId: 'anthropic', accountLabel: 'Personal', remainingPercent: 41, usedPercent: 59,
      resetAt: '2026-09-03T17:00:00.000Z', windowLabel: 'Five-hour window', observedAt: '2026-09-03T12:00:00.000Z',
      sourceType: 'browser_extension', confidence: 'parsed',
    });

    expect(database.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO usage_snapshots'), [
      'anthropic', 'Personal', 41, 59, '2026-09-03T17:00:00.000Z', 'Five-hour window',
      '2026-09-03T12:00:00.000Z', 'browser_extension', 'parsed',
    ]);
    expect(JSON.stringify(vi.mocked(database.execute).mock.calls)).not.toMatch(/token|cookie|password|api_key/i);
  });

  test('maps the latest stored row to a normalized observation', async () => {
    const database: SqlDatabase = {
      execute: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue([{
        provider_id: 'google', account_label: null, remaining_percent: 84, used_percent: 16, reset_at: null,
        window_label: 'Daily quota', observed_at: '2026-09-03T12:00:00.000Z', source_type: 'manual', confidence: 'manual',
      }]),
    };
    const repository = new TauriSqlUsageRepository(database);

    expect(await repository.getLatestByProvider('google')).toEqual({
      providerId: 'google', remainingPercent: 84, usedPercent: 16, windowLabel: 'Daily quota',
      observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'manual', confidence: 'manual',
    });
    expect(database.select).toHaveBeenCalledWith(expect.stringContaining('WHERE provider_id = $1'), ['google']);
  });
});
