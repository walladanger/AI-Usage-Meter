import { invoke } from '@tauri-apps/api/core';
import type { PersonalUsageAdapter } from './providerAdapter';
import type { ApiUsageMetrics, ProviderId, UsageObservation } from './usageTypes';

/**
 * Adapter over the native provider connectors.
 *
 * The HTTPS call and the response parsing both happen in Rust; this only receives aggregate
 * numbers. See `src-tauri/src/providers.rs` and docs/provider-capability-matrix.md.
 */

/** Mirrors `ProviderUsageSnapshot` in src-tauri/src/providers.rs. */
export interface ProviderUsageSnapshot {
  providerId: string;
  observedAt: string;
  windowStart: string;
  windowEnd: string;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  totalTokens: number;
  requests: number;
  costUsd?: number;
  costUnitUnverified: boolean;
  daily: ApiUsageMetrics['daily'];
  source: string;
}

export type UsageInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function isSnapshot(value: unknown): value is ProviderUsageSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<ProviderUsageSnapshot>;
  return typeof snapshot.providerId === 'string'
    && typeof snapshot.observedAt === 'string'
    && typeof snapshot.inputTokens === 'number'
    && typeof snapshot.outputTokens === 'number'
    && typeof snapshot.totalTokens === 'number'
    && typeof snapshot.source === 'string';
}

/**
 * A native error arrives as `{ state, message }`, where `state` is a `ConnectorState`.
 * `UsageController` records `lastError`, so the message must stay display-safe — the native
 * side already guarantees it carries no response body or key material.
 */
function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'The provider refresh failed.';
}

export function snapshotToObservation(snapshot: ProviderUsageSnapshot): UsageObservation {
  return {
    providerId: snapshot.providerId as ProviderId,
    observedAt: snapshot.observedAt,
    sourceType: 'api',
    // The provider reported these figures directly rather than us deriving them.
    confidence: 'reported',
    // No allowance percentage or reset time: no provider exposes those through an API.
    // Leaving them undefined keeps the dashboard honest about what is unavailable.
    apiUsage: {
      windowStart: snapshot.windowStart,
      windowEnd: snapshot.windowEnd,
      inputTokens: snapshot.inputTokens,
      outputTokens: snapshot.outputTokens,
      cachedInputTokens: snapshot.cachedInputTokens,
      totalTokens: snapshot.totalTokens,
      requests: snapshot.requests,
      ...(typeof snapshot.costUsd === 'number' ? { costUsd: snapshot.costUsd } : {}),
      costUnitUnverified: snapshot.costUnitUnverified === true,
      daily: snapshot.daily ?? [],
      source: snapshot.source,
    },
  };
}

export class ApiUsageAdapter implements PersonalUsageAdapter {
  readonly sourceType = 'api' as const;

  constructor(
    readonly providerId: ProviderId,
    private readonly command: UsageInvoke = invoke,
  ) {}

  async fetch(): Promise<UsageObservation> {
    let snapshot: unknown;
    try {
      snapshot = await this.command<ProviderUsageSnapshot>('fetch_provider_usage', {
        providerId: this.providerId,
      });
    } catch (error) {
      throw new Error(describe(error));
    }
    if (!isSnapshot(snapshot)) {
      throw new Error('The provider returned an unexpected usage payload.');
    }
    if (snapshot.providerId !== this.providerId) {
      throw new Error(`Connector returned ${snapshot.providerId} data for ${this.providerId}`);
    }
    return snapshotToObservation(snapshot);
  }
}

/**
 * Builds adapters only for providers that both have a stored key and a real connector.
 * Google is intentionally absent: there is no official Gemini usage endpoint, so it stays
 * on manual entry rather than pretending to connect.
 */
export const API_CONNECTOR_PROVIDERS: readonly ProviderId[] = ['openai', 'anthropic'];

export function createApiAdapters(
  configuredProviders: readonly ProviderId[],
  command: UsageInvoke = invoke,
): ApiUsageAdapter[] {
  return API_CONNECTOR_PROVIDERS
    .filter((providerId) => configuredProviders.includes(providerId))
    .map((providerId) => new ApiUsageAdapter(providerId, command));
}
