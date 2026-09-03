import { describe, expect, test } from 'vitest';
import { confirmReset, evaluateThreshold } from './alertEvaluator';
import type { UsageObservation } from '../usage/usageTypes';

function observation(remainingPercent: number, observedAt: string): UsageObservation {
  return { providerId: 'anthropic', remainingPercent, usedPercent: 100 - remainingPercent, observedAt, sourceType: 'browser_extension', confidence: 'parsed' };
}

describe('alertEvaluator', () => {
  test('emits the most urgent threshold crossed and does not repeat without a new crossing', () => {
    const previous = observation(61, '2026-09-03T10:00:00.000Z');
    const current = observation(22, '2026-09-03T11:00:00.000Z');

    expect(evaluateThreshold(previous, current, [50, 25, 10, 5, 0])).toMatchObject({ kind: 'quota_threshold', threshold: 25 });
    expect(evaluateThreshold(current, current, [50, 25, 10, 5, 0])).toBeNull();
  });

  test('confirms a reset only after a post-reset observation increases remaining allowance', () => {
    const expectedReset = '2026-09-03T12:00:00.000Z';
    const before = observation(8, '2026-09-03T11:58:00.000Z');
    const after = observation(96, '2026-09-03T12:02:00.000Z');

    expect(confirmReset(expectedReset, before, after)).toMatchObject({ kind: 'reset_confirmed', providerId: 'anthropic' });
    expect(confirmReset(expectedReset, before, observation(7, '2026-09-03T12:02:00.000Z'))).toBeNull();
  });
});
