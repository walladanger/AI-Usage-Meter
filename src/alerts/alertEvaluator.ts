import type { ProviderId, UsageObservation } from '../usage/usageTypes';

export interface UsageAlertEvent {
  kind: 'quota_threshold' | 'reset_confirmed';
  providerId: ProviderId;
  observedAt: string;
  threshold?: number;
}

export function evaluateThreshold(
  previous: UsageObservation,
  current: UsageObservation,
  thresholds: number[],
): UsageAlertEvent | null {
  if (previous.providerId !== current.providerId) return null;
  if (previous.remainingPercent === undefined || current.remainingPercent === undefined) return null;

  const crossed = thresholds
    .filter((threshold) => threshold >= 0 && threshold <= 100)
    .filter((threshold) => previous.remainingPercent! > threshold && current.remainingPercent! <= threshold)
    .sort((left, right) => left - right)[0];

  return crossed === undefined ? null : {
    kind: 'quota_threshold',
    providerId: current.providerId,
    observedAt: current.observedAt,
    threshold: crossed,
  };
}

export function confirmReset(
  expectedResetAt: string,
  before: UsageObservation,
  after: UsageObservation,
): UsageAlertEvent | null {
  if (before.providerId !== after.providerId) return null;
  if (before.remainingPercent === undefined || after.remainingPercent === undefined) return null;
  if (Number.isNaN(Date.parse(expectedResetAt)) || Date.parse(after.observedAt) < Date.parse(expectedResetAt)) return null;
  if (after.remainingPercent <= before.remainingPercent) return null;

  return { kind: 'reset_confirmed', providerId: after.providerId, observedAt: after.observedAt };
}
