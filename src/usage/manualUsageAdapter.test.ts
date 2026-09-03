import { describe, expect, test } from 'vitest';
import { ManualUsageAdapter } from './manualUsageAdapter';

describe('ManualUsageAdapter', () => {
  test('normalizes an explicit manual allowance observation', () => {
    const adapter = new ManualUsageAdapter('anthropic');

    expect(adapter.normalize({
      remainingPercent: 62,
      observedAt: '2026-09-03T12:00:00.000Z',
      resetAt: '2026-09-03T17:00:00.000Z',
    })).toEqual({
      providerId: 'anthropic',
      remainingPercent: 62,
      usedPercent: 38,
      observedAt: '2026-09-03T12:00:00.000Z',
      resetAt: '2026-09-03T17:00:00.000Z',
      sourceType: 'manual',
      confidence: 'manual',
    });
  });

  test('rejects percentages outside the allowance range', () => {
    const adapter = new ManualUsageAdapter('openai');

    expect(() => adapter.normalize({ remainingPercent: 101, observedAt: '2026-09-03T12:00:00.000Z', resetUnavailable: true })).toThrow('remainingPercent');
  });

  test('requires either a reset time or an explicit unavailable selection', () => {
    const adapter = new ManualUsageAdapter('google');

    expect(() => adapter.normalize({ remainingPercent: 50, observedAt: '2026-09-03T12:00:00.000Z' })).toThrow('reset');
  });
});
