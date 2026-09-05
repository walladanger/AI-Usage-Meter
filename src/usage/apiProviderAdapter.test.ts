import { expect, test, vi } from 'vitest';
import {
  ApiUsageAdapter,
  API_CONNECTOR_PROVIDERS,
  createApiAdapters,
  snapshotToObservation,
  type ProviderUsageSnapshot,
} from './apiProviderAdapter';

const snapshot: ProviderUsageSnapshot = {
  providerId: 'openai',
  observedAt: '2026-09-05T12:00:00Z',
  windowStart: '2026-08-06T12:00:00Z',
  windowEnd: '2026-09-05T12:00:00Z',
  inputTokens: 1200,
  outputTokens: 340,
  cachedInputTokens: 90,
  totalTokens: 1540,
  requests: 27,
  costUsd: 6.72,
  costUnitUnverified: false,
  daily: [{ date: '2026-09-04', inputTokens: 600, outputTokens: 170, cachedInputTokens: 45, requests: 13, costUsd: 3.1 }],
  source: 'openai_usage_api',
};

test('an API observation reports spend and never invents an allowance or reset time', () => {
  const observation = snapshotToObservation(snapshot);

  expect(observation.sourceType).toBe('api');
  expect(observation.confidence).toBe('reported');
  // No provider exposes subscription allowance, so these must stay unavailable.
  expect(observation.remainingPercent).toBeUndefined();
  expect(observation.usedPercent).toBeUndefined();
  expect(observation.resetAt).toBeUndefined();
  expect(observation.apiUsage?.totalTokens).toBe(1540);
  expect(observation.apiUsage?.costUsd).toBe(6.72);
  expect(observation.apiUsage?.source).toBe('openai_usage_api');
});

test('a missing cost is omitted rather than defaulted to zero', () => {
  const { costUsd: _omitted, ...withoutCost } = snapshot;
  const observation = snapshotToObservation(withoutCost as ProviderUsageSnapshot);

  expect(observation.apiUsage).toBeDefined();
  expect('costUsd' in (observation.apiUsage ?? {})).toBe(false);
});

test('the adapter forwards the provider id and returns a normalized observation', async () => {
  const command = vi.fn().mockResolvedValue(snapshot);
  const adapter = new ApiUsageAdapter('openai', command);

  const observation = await adapter.fetch();

  expect(command).toHaveBeenCalledWith('fetch_provider_usage', { providerId: 'openai' });
  expect(observation.providerId).toBe('openai');
  expect(observation.apiUsage?.requests).toBe(27);
});

test('a native connector error surfaces its display-safe message', async () => {
  const command = vi.fn().mockRejectedValue({
    state: 'authentication_required',
    message: 'The provider rejected this key.',
  });
  const adapter = new ApiUsageAdapter('anthropic', command);

  await expect(adapter.fetch()).rejects.toThrow('The provider rejected this key.');
});

test('a payload for the wrong provider is rejected', async () => {
  const command = vi.fn().mockResolvedValue({ ...snapshot, providerId: 'anthropic' });
  const adapter = new ApiUsageAdapter('openai', command);

  await expect(adapter.fetch()).rejects.toThrow(/anthropic data for openai/);
});

test('a malformed payload is rejected instead of producing an empty observation', async () => {
  const command = vi.fn().mockResolvedValue({ providerId: 'openai' });
  const adapter = new ApiUsageAdapter('openai', command);

  await expect(adapter.fetch()).rejects.toThrow(/unexpected usage payload/);
});

test('adapters are built only for configured providers with a real connector', () => {
  const command = vi.fn();

  expect(createApiAdapters(['openai'], command).map((adapter) => adapter.providerId)).toEqual(['openai']);
  expect(createApiAdapters([], command)).toEqual([]);
  // Google has no official usage endpoint, so it never gets a connector.
  expect(createApiAdapters(['google'], command)).toEqual([]);
  expect(API_CONNECTOR_PROVIDERS).not.toContain('google');
});
