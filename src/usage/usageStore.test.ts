import { describe, expect, test } from 'vitest';
import type { PersonalUsageAdapter } from './providerAdapter';
import { InMemoryUsageRepository } from './inMemoryUsageRepository';
import { UsageController } from './usageStore';
import type { ProviderUsageState, UsageObservation } from './usageTypes';

const initialStates: ProviderUsageState[] = [
  { providerId: 'openai', displayName: 'ChatGPT / Codex', status: 'no_data' },
  {
    providerId: 'anthropic',
    displayName: 'Claude / Claude Code',
    status: 'connected',
    observation: {
      providerId: 'anthropic', remainingPercent: 41, observedAt: '2026-09-03T11:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed',
    },
  },
  { providerId: 'google', displayName: 'Gemini', status: 'no_data' },
];

function adapter(providerId: UsageObservation['providerId'], result: UsageObservation | Error): PersonalUsageAdapter {
  return {
    providerId,
    sourceType: 'browser_extension',
    async fetch() {
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

describe('UsageController', () => {
  test('reports when no automatic provider source is available to refresh', async () => {
    const controller = new UsageController(initialStates, []);

    await expect(controller.refreshAll()).resolves.toEqual({
      attempted: 0,
      succeeded: 0,
      failed: 0,
    });
  });

  test('can refresh a single provider without touching another provider', async () => {
    const controller = new UsageController(initialStates, [
      adapter('openai', { providerId: 'openai', remainingPercent: 72, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed' }),
    ]);

    await controller.refreshProvider('openai');

    expect(controller.get('openai')).toMatchObject({ status: 'connected', observation: { remainingPercent: 72 } });
    expect(controller.get('anthropic')).toMatchObject({ status: 'connected', observation: { remainingPercent: 41 } });
  });

  test('settles provider refreshes independently and preserves the last successful value', async () => {
    const controller = new UsageController(initialStates, [
      adapter('openai', { providerId: 'openai', remainingPercent: 72, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed' }),
      adapter('anthropic', new Error('provider unavailable')),
      adapter('google', { providerId: 'google', remainingPercent: 84, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed' }),
    ]);

    await controller.refreshAll();

    expect(controller.get('openai').status).toBe('connected');
    expect(controller.get('anthropic')).toMatchObject({ status: 'error', observation: { remainingPercent: 41 } });
    expect(controller.get('google').status).toBe('connected');
  });

  test('accepts a validated manual observation without changing other providers', () => {
    const controller = new UsageController(initialStates, []);
    controller.setManualObservation({
      providerId: 'google', remainingPercent: 55, usedPercent: 45, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'manual', confidence: 'manual',
    });

    expect(controller.get('google')).toMatchObject({ status: 'connected', observation: { remainingPercent: 55, sourceType: 'manual' } });
    expect(controller.get('openai').status).toBe('no_data');
  });

  test('persists successful connector and manual observations', async () => {
    const repository = new InMemoryUsageRepository();
    const controller = new UsageController(initialStates, [
      adapter('openai', { providerId: 'openai', remainingPercent: 72, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'browser_extension', confidence: 'parsed' }),
    ], repository);

    await controller.refreshProvider('openai');
    await controller.setManualObservation({
      providerId: 'google', remainingPercent: 55, usedPercent: 45, observedAt: '2026-09-03T12:01:00.000Z', sourceType: 'manual', confidence: 'manual',
    });

    expect(await repository.getLatestByProvider('openai')).toMatchObject({ remainingPercent: 72 });
    expect(await repository.getLatestByProvider('google')).toMatchObject({ remainingPercent: 55 });
  });
});
