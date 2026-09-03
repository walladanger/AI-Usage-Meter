import { describe, expect, test } from 'vitest';
import type { ProviderUsageState } from './usageTypes';
import { clampPercent, formatResetCountdown, getFreshness, getLowestRemaining, getNextReset } from './usageMath';

const states: ProviderUsageState[] = [
  {
    providerId: 'openai',
    displayName: 'ChatGPT / Codex',
    status: 'connected',
    observation: {
      providerId: 'openai',
      remainingPercent: 72,
      resetAt: '2026-09-03T14:14:00.000Z',
      observedAt: '2026-09-03T12:00:00.000Z',
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
  {
    providerId: 'anthropic',
    displayName: 'Claude / Claude Code',
    status: 'connected',
    observation: {
      providerId: 'anthropic',
      remainingPercent: 38,
      resetAt: '2026-09-03T12:47:00.000Z',
      observedAt: '2026-09-03T12:00:00.000Z',
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
  {
    providerId: 'google',
    displayName: 'Gemini',
    status: 'connected',
    observation: {
      providerId: 'google',
      remainingPercent: 84,
      resetAt: '2026-09-03T23:28:00.000Z',
      observedAt: '2026-09-03T12:00:00.000Z',
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
];

describe('usage calculations', () => {
  test('clamps finite percentages and rejects non-finite values', () => {
    expect(clampPercent(125)).toBe(100);
    expect(clampPercent(-2)).toBe(0);
    expect(() => clampPercent(Number.NaN)).toThrow('finite');
  });

  test('selects the lowest remaining provider with reported data', () => {
    expect(getLowestRemaining(states)?.providerId).toBe('anthropic');
  });

  test('selects the nearest future reset', () => {
    expect(getNextReset(states, '2026-09-03T12:00:00.000Z')?.providerId).toBe('anthropic');
  });

  test('marks observations stale after their threshold', () => {
    expect(getFreshness('2026-09-03T12:00:00.000Z', '2026-09-03T12:06:00.000Z', 300_000)).toBe('stale');
    expect(getFreshness('2026-09-03T12:00:00.000Z', '2026-09-03T12:04:00.000Z', 300_000)).toBe('fresh');
    expect(getFreshness(undefined, '2026-09-03T12:04:00.000Z', 300_000)).toBe('unavailable');
  });

  test('formats reset countdowns without assuming an unconfirmed reset', () => {
    expect(formatResetCountdown('2026-09-03T11:30:00.000Z', '2026-09-03T09:16:00.000Z')).toBe('2h 14m');
    expect(formatResetCountdown('2026-09-03T10:03:00.000Z', '2026-09-03T09:16:00.000Z')).toBe('47m');
    expect(formatResetCountdown('2026-09-03T09:15:00.000Z', '2026-09-03T09:16:00.000Z')).toBe('Awaiting confirmation');
  });
});
