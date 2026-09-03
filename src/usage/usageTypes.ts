export type ProviderId = 'openai' | 'anthropic' | 'google';

export type SourceType = 'browser_extension' | 'cli' | 'manual';

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
