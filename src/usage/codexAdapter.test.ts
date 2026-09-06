import { expect, test, vi } from 'vitest';
import {
  CodexUsageAdapter,
  CodexWithApiSpendAdapter,
  snapshotToObservation,
  type CodexUsageSnapshot,
} from './codexAdapter';
import type { PersonalUsageAdapter } from './providerAdapter';
import type { ApiUsageMetrics, UsageObservation } from './usageTypes';

/** Shaped as the Rust connector returns it, matching a real account response. */
const snapshot: CodexUsageSnapshot = {
  providerId: 'openai',
  observedAt: '2026-09-06T09:00:00Z',
  planType: 'plus',
  primary: { usedPercent: 100, remainingPercent: 0, windowMinutes: 300, resetsAt: '2026-09-05T17:38:50Z', label: '5-hour window' },
  secondary: { usedPercent: 34, remainingPercent: 66, windowMinutes: 10080, resetsAt: '2026-09-11T14:46:04Z', label: 'weekly window' },
  bindingRemainingPercent: 0,
  bindingLabel: '5-hour window',
  bindingResetsAt: '2026-09-05T17:38:50Z',
  creditBalance: '0',
  hasCredits: false,
  unlimited: false,
  rateLimitReached: true,
  resetCreditsAvailable: 1,
  cliVersion: 'codex-cli 0.148.0-alpha.9',
  source: 'codex_cli',
};

test('a Codex observation fills the allowance fields the API connectors leave empty', () => {
  const observation = snapshotToObservation(snapshot);

  expect(observation.providerId).toBe('openai');
  expect(observation.sourceType).toBe('cli');
  expect(observation.confidence).toBe('reported');
  // This is the only source permitted to populate these.
  expect(observation.remainingPercent).toBe(0);
  expect(observation.usedPercent).toBe(100);
  expect(observation.resetAt).toBe('2026-09-05T17:38:50Z');
  expect(observation.windowLabel).toBe('5-hour window');
  expect(observation.codexAllowance?.planType).toBe('plus');
  expect(observation.codexAllowance?.source).toBe('codex_cli');
});

test('an unused reset credit is carried through so the UI can surface it', () => {
  const observation = snapshotToObservation(snapshot);

  expect(observation.codexAllowance?.resetCreditsAvailable).toBe(1);
  expect(observation.codexAllowance?.rateLimitReached).toBe(true);
});

test('both windows survive so the UI can show more than the binding one', () => {
  const observation = snapshotToObservation(snapshot);

  expect(observation.codexAllowance?.primary?.label).toBe('5-hour window');
  expect(observation.codexAllowance?.secondary?.remainingPercent).toBe(66);
});

test('a missing binding percentage is omitted rather than defaulted to zero', () => {
  const { bindingRemainingPercent: _dropped, bindingResetsAt: _also, ...sparse } = snapshot;
  const observation = snapshotToObservation(sparse as CodexUsageSnapshot);

  expect(observation.remainingPercent).toBeUndefined();
  expect(observation.usedPercent).toBeUndefined();
  expect(observation.resetAt).toBeUndefined();
  // A zero here would read as "no allowance left", which is a very different claim.
  expect('remainingPercent' in observation).toBe(false);
});

test('the adapter calls the native command and normalizes the result', async () => {
  const command = vi.fn().mockResolvedValue(snapshot);
  const observation = await new CodexUsageAdapter(command).fetch();

  expect(command).toHaveBeenCalledWith('fetch_codex_usage');
  expect(observation.remainingPercent).toBe(0);
});

test('a native error surfaces its display-safe message', async () => {
  const command = vi.fn().mockRejectedValue({
    state: 'no_data',
    message: 'The Codex CLI was not found.',
  });

  await expect(new CodexUsageAdapter(command).fetch()).rejects.toThrow('The Codex CLI was not found.');
});

test('a malformed payload is rejected rather than producing an empty observation', async () => {
  const command = vi.fn().mockResolvedValue({ providerId: 'anthropic' });

  await expect(new CodexUsageAdapter(command).fetch()).rejects.toThrow(/unexpected allowance payload/);
});

// --- composite -------------------------------------------------------------

const apiUsage: ApiUsageMetrics = {
  windowStart: '2026-08-07T00:00:00Z',
  windowEnd: '2026-09-06T00:00:00Z',
  inputTokens: 100,
  outputTokens: 20,
  cachedInputTokens: 5,
  totalTokens: 120,
  requests: 7,
  costUsd: 1.23,
  costUnitUnverified: false,
  daily: [],
  source: 'openai_usage_api',
};

function stub(observation: UsageObservation | Error): PersonalUsageAdapter {
  return {
    providerId: 'openai',
    sourceType: 'cli',
    fetch: async () => {
      if (observation instanceof Error) throw observation;
      return observation;
    },
  };
}

test('the composite merges Codex allowance with OpenAI API spend', async () => {
  const allowance = snapshotToObservation(snapshot);
  const spend: UsageObservation = {
    providerId: 'openai',
    observedAt: '2026-09-06T09:00:00Z',
    sourceType: 'api',
    confidence: 'reported',
    apiUsage,
  };

  const merged = await new CodexWithApiSpendAdapter(stub(allowance), stub(spend)).fetch();

  // Allowance answers "how much is left"; spend answers "what has it cost".
  expect(merged.remainingPercent).toBe(0);
  expect(merged.windowLabel).toBe('5-hour window');
  expect(merged.apiUsage?.totalTokens).toBe(120);
  expect(merged.sourceType).toBe('cli');
});

test('a failing API call does not discard a good allowance reading', async () => {
  const allowance = snapshotToObservation(snapshot);

  const merged = await new CodexWithApiSpendAdapter(
    stub(allowance),
    stub(new Error('admin key rejected')),
  ).fetch();

  expect(merged.remainingPercent).toBe(0);
  expect(merged.apiUsage).toBeUndefined();
});

test('a failing Codex call fails the pair, because allowance is the headline figure', async () => {
  const spend: UsageObservation = {
    providerId: 'openai',
    observedAt: '2026-09-06T09:00:00Z',
    sourceType: 'api',
    confidence: 'reported',
    apiUsage,
  };

  await expect(
    new CodexWithApiSpendAdapter(stub(new Error('CLI missing')), stub(spend)).fetch(),
  ).rejects.toThrow('CLI missing');
});
