export type ProviderId = 'openai' | 'anthropic' | 'google';

export type SourceType = 'browser_extension' | 'cli' | 'manual' | 'api';

export type Confidence = 'reported' | 'parsed' | 'manual' | 'estimated';

export type ConnectorState =
  | 'connected'
  | 'updating'
  | 'authentication_required'
  | 'page_unavailable'
  | 'connector_update_required'
  | 'rate_limited'
  | 'timed_out'
  | 'manual_refresh_due'
  | 'error'
  | 'no_data';

export type Freshness = 'fresh' | 'stale' | 'unavailable';

/** One day of provider-reported API consumption. */
export interface ApiUsageDailyPoint {
  date: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  requests: number;
  costUsd?: number;
}

/**
 * Organization API usage as reported by a provider's usage/cost endpoints.
 *
 * This is deliberately separate from `remainingPercent`: an API usage endpoint reports what
 * was spent, never what allowance is left. No provider offers a subscription-allowance API
 * (see docs/provider-capability-matrix.md), so an API-sourced observation leaves the
 * allowance fields undefined rather than inventing a percentage.
 */
export interface ApiUsageMetrics {
  windowStart: string;
  windowEnd: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  requests: number;
  costUsd?: number;
  /** The provider documents the cost unit ambiguously and it is not yet confirmed. */
  costUnitUnverified: boolean;
  daily: readonly ApiUsageDailyPoint[];
  /** Data-source label required by prompt §20, e.g. `openai_usage_api`. */
  source: string;
}

/** One quota window as reported by the Codex CLI. */
export interface CodexWindowView {
  usedPercent: number;
  remainingPercent: number;
  windowMinutes?: number;
  resetsAt?: string;
  label?: string;
}

/**
 * ChatGPT/Codex subscription allowance from the local Codex CLI app-server.
 *
 * This is the only source that reports allowance rather than spend, so unlike an API
 * observation it legitimately fills `remainingPercent`, `usedPercent` and `resetAt` on the
 * observation itself. The extras below have no equivalent elsewhere.
 */
export interface CodexAllowanceDetail {
  planType?: string;
  primary?: CodexWindowView;
  secondary?: CodexWindowView;
  /** Decimal string — parse as decimal, never as a float. */
  creditBalance?: string;
  hasCredits: boolean;
  unlimited: boolean;
  rateLimitReached: boolean;
  /** Earned resets the account can spend; a user can be blocked while holding one. */
  resetCreditsAvailable: number;
  cliVersion?: string;
  source: string;
}

export interface UsageObservation {
  providerId: ProviderId;
  accountLabel?: string;
  remainingPercent?: number;
  usedPercent?: number;
  resetAt?: string;
  windowLabel?: string;
  observedAt: string;
  sourceType: SourceType;
  confidence: Confidence;
  apiUsage?: ApiUsageMetrics;
  codexAllowance?: CodexAllowanceDetail;
}

export interface ProviderUsageState {
  providerId: ProviderId;
  displayName: string;
  status: ConnectorState;
  observation?: UsageObservation;
  lastError?: string;
  isFixture?: boolean;
}

export interface UsageHistoryPoint {
  observedAt: string;
  openai?: number;
  anthropic?: number;
  google?: number;
}
