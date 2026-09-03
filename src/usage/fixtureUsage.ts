import type { ProviderUsageState, UsageHistoryPoint } from './usageTypes';

export const fixtureNow = '2026-09-03T09:16:00.000Z';

export const fixtureProviders: ProviderUsageState[] = [
  {
    providerId: 'openai',
    displayName: 'ChatGPT / Codex',
    status: 'connected',
    isFixture: true,
    observation: {
      providerId: 'openai',
      remainingPercent: 72,
      usedPercent: 28,
      resetAt: '2026-09-03T11:30:00.000Z',
      observedAt: fixtureNow,
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
  {
    providerId: 'anthropic',
    displayName: 'Claude / Claude Code',
    status: 'connected',
    isFixture: true,
    observation: {
      providerId: 'anthropic',
      remainingPercent: 38,
      usedPercent: 62,
      resetAt: '2026-09-03T10:03:00.000Z',
      observedAt: fixtureNow,
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
  {
    providerId: 'google',
    displayName: 'Gemini',
    status: 'connected',
    isFixture: true,
    observation: {
      providerId: 'google',
      remainingPercent: 84,
      usedPercent: 16,
      resetAt: '2026-09-03T20:44:00.000Z',
      observedAt: fixtureNow,
      sourceType: 'browser_extension',
      confidence: 'parsed',
    },
  },
];

export const fixtureHistory: UsageHistoryPoint[] = [
  { observedAt: '2026-08-28T23:59:00.000Z', openai: 58, anthropic: 43, google: 25 },
  { observedAt: '2026-08-29T23:59:00.000Z', openai: 68, anthropic: 31, google: 21 },
  { observedAt: '2026-08-30T23:59:00.000Z', openai: 77, anthropic: 48, google: 27 },
  { observedAt: '2026-08-31T23:59:00.000Z', openai: 80, anthropic: 50, google: 22 },
  { observedAt: '2026-09-01T23:59:00.000Z', openai: 78, anthropic: 40, google: 24 },
  { observedAt: '2026-09-02T23:59:00.000Z', openai: 70, anthropic: 43, google: 23 },
  { observedAt: '2026-09-03T09:16:00.000Z', openai: 84, anthropic: 64, google: 34 },
];
