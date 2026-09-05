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
