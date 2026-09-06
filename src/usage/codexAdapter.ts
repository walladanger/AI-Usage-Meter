import { invoke } from '@tauri-apps/api/core';
import type { PersonalUsageAdapter } from './providerAdapter';
import type { CodexAllowanceDetail, ProviderId, UsageObservation } from './usageTypes';

/**
 * ChatGPT/Codex subscription allowance, via the local Codex CLI app-server.
 *
 * This is the only adapter permitted to populate `remainingPercent`, `usedPercent` and
 * `resetAt`: it is the only source that reports allowance rather than spend. The API
 * connectors deliberately leave those undefined.
 *
 * The process spawning, JSON-RPC handshake and parsing all happen in Rust
 * (`src-tauri/src/codex.rs`); this only receives the normalized snapshot.
 */

/** Mirrors `CodexUsageSnapshot` in src-tauri/src/codex.rs. */
export interface CodexUsageSnapshot {
  providerId: string;
  observedAt: string;
  planType?: string;
  primary?: CodexAllowanceDetail['primary'];
  secondary?: CodexAllowanceDetail['secondary'];
  bindingRemainingPercent?: number;
  bindingLabel?: string;
  bindingResetsAt?: string;
  creditBalance?: string;
  hasCredits: boolean;
  unlimited: boolean;
  rateLimitReached: boolean;
  resetCreditsAvailable: number;
  cliVersion?: string;
  source: string;
}

export type CodexInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function isSnapshot(value: unknown): value is CodexUsageSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<CodexUsageSnapshot>;
  return snapshot.providerId === 'openai'
    && typeof snapshot.observedAt === 'string'
    && typeof snapshot.source === 'string';
}

function describe(error: unknown): string {
  if (error && typeof error === 'object') {
    const { message } = error as { message?: unknown };
    if (typeof message === 'string' && message.length > 0) return message;
  }
  return 'The Codex allowance refresh failed.';
}

export function snapshotToObservation(snapshot: CodexUsageSnapshot): UsageObservation {
  const remaining = snapshot.bindingRemainingPercent;
  const detail: CodexAllowanceDetail = {
    ...(snapshot.planType ? { planType: snapshot.planType } : {}),
    ...(snapshot.primary ? { primary: snapshot.primary } : {}),
    ...(snapshot.secondary ? { secondary: snapshot.secondary } : {}),
    ...(snapshot.creditBalance !== undefined ? { creditBalance: snapshot.creditBalance } : {}),
    hasCredits: snapshot.hasCredits === true,
    unlimited: snapshot.unlimited === true,
    rateLimitReached: snapshot.rateLimitReached === true,
    resetCreditsAvailable: snapshot.resetCreditsAvailable ?? 0,
    ...(snapshot.cliVersion ? { cliVersion: snapshot.cliVersion } : {}),
    source: snapshot.source,
  };

  return {
    providerId: 'openai',
    observedAt: snapshot.observedAt,
    sourceType: 'cli',
    // The CLI reports these figures directly rather than us deriving them.
    confidence: 'reported',
    ...(typeof remaining === 'number'
      ? { remainingPercent: remaining, usedPercent: 100 - remaining }
      : {}),
    ...(snapshot.bindingResetsAt ? { resetAt: snapshot.bindingResetsAt } : {}),
    ...(snapshot.bindingLabel ? { windowLabel: snapshot.bindingLabel } : {}),
    codexAllowance: detail,
  };
}

export class CodexUsageAdapter implements PersonalUsageAdapter {
  readonly providerId: ProviderId = 'openai';
  readonly sourceType = 'cli' as const;

  constructor(private readonly command: CodexInvoke = invoke) {}

  async fetch(): Promise<UsageObservation> {
    let snapshot: unknown;
    try {
      snapshot = await this.command<CodexUsageSnapshot>('fetch_codex_usage');
    } catch (error) {
      throw new Error(describe(error));
    }
    if (!isSnapshot(snapshot)) {
      throw new Error('Codex returned an unexpected allowance payload.');
    }
    return snapshotToObservation(snapshot);
  }
}

/**
 * Combines the Codex allowance with OpenAI API spend into one observation.
 *
 * Both describe the same provider but answer different questions, and `UsageController`
 * keys adapters by provider, so without this one of them would be silently dropped.
 * Allowance is the headline figure, so a Codex failure is fatal to the pair while an API
 * failure only omits the spend detail.
 */
export class CodexWithApiSpendAdapter implements PersonalUsageAdapter {
  readonly providerId: ProviderId = 'openai';
  readonly sourceType = 'cli' as const;

  constructor(
    private readonly codex: PersonalUsageAdapter,
    private readonly api: PersonalUsageAdapter,
  ) {}

  async fetch(): Promise<UsageObservation> {
    const allowance = await this.codex.fetch();
    try {
      const spend = await this.api.fetch();
      return { ...allowance, ...(spend.apiUsage ? { apiUsage: spend.apiUsage } : {}) };
    } catch {
      // Spend is supplementary; losing it must not discard a good allowance reading.
      return allowance;
    }
  }
}
