import { describe, expect, test } from 'vitest';
import { InMemoryUsageRepository } from './inMemoryUsageRepository';
import type { UsageObservation } from './usageTypes';

const first: UsageObservation = {
  providerId: 'openai', remainingPercent: 72, usedPercent: 28, observedAt: '2026-09-02T12:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed',
};
const second: UsageObservation = {
  providerId: 'openai', remainingPercent: 63, usedPercent: 37, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'manual', confidence: 'manual',
};

describe('InMemoryUsageRepository', () => {
  test('stores observations and returns the latest and ranged history', async () => {
    const repository = new InMemoryUsageRepository();
    await repository.saveObservation(first);
    await repository.saveObservation(second);

    expect(await repository.getLatestByProvider('openai')).toEqual(second);
    expect(await repository.getHistory('openai', '2026-09-03T00:00:00.000Z', '2026-09-04T00:00:00.000Z')).toEqual([second]);
  });

  test('stores connection events and clears only usage history', async () => {
    const repository = new InMemoryUsageRepository();
    await repository.saveObservation(first);
    await repository.saveConnectionEvent({ providerId: 'openai', status: 'connected', occurredAt: first.observedAt });

    await repository.clearHistory();

    expect(await repository.getLatestByProvider('openai')).toBeUndefined();
    expect(repository.getConnectionEvents()).toHaveLength(1);
  });
});
