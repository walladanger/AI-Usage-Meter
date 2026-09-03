import type { ProviderId, UsageObservation } from './usageTypes';

export interface ManualUsageInput {
  remainingPercent: number;
  observedAt: string;
  resetAt?: string;
  resetUnavailable?: boolean;
  accountLabel?: string;
  windowLabel?: string;
}

function requireValidTimestamp(value: string, fieldName: string) {
  if (Number.isNaN(Date.parse(value))) {
    throw new Error(`${fieldName} must be a valid timestamp`);
  }
}

export class ManualUsageAdapter {
  constructor(private readonly providerId: ProviderId) {}

  normalize(input: ManualUsageInput): UsageObservation {
    if (!Number.isFinite(input.remainingPercent) || input.remainingPercent < 0 || input.remainingPercent > 100) {
      throw new Error('remainingPercent must be between 0 and 100');
    }

    requireValidTimestamp(input.observedAt, 'observedAt');

    if (!input.resetAt && !input.resetUnavailable) {
      throw new Error('A reset time or explicit reset-unavailable selection is required');
    }

    if (input.resetAt && input.resetUnavailable) {
      throw new Error('Choose either a reset time or reset unavailable');
    }

    if (input.resetAt) requireValidTimestamp(input.resetAt, 'resetAt');

    return {
      providerId: this.providerId,
      ...(input.accountLabel ? { accountLabel: input.accountLabel } : {}),
      remainingPercent: input.remainingPercent,
      usedPercent: 100 - input.remainingPercent,
      ...(input.resetAt ? { resetAt: input.resetAt } : {}),
      ...(input.windowLabel ? { windowLabel: input.windowLabel } : {}),
      observedAt: input.observedAt,
      sourceType: 'manual',
      confidence: 'manual',
    };
  }
}
