import type { Freshness, ProviderUsageState } from './usageTypes';

export function clampPercent(value: number): number {
  if (!Number.isFinite(value)) throw new Error('Percentage must be finite.');
  return Math.min(100, Math.max(0, value));
}

export function getFreshness(
  observedAt: string | undefined,
  now: string,
  staleAfterMs: number,
): Freshness {
  if (!observedAt) return 'unavailable';
  const observedTime = Date.parse(observedAt);
  const nowTime = Date.parse(now);
  if (!Number.isFinite(observedTime) || !Number.isFinite(nowTime)) return 'unavailable';
  return nowTime - observedTime > staleAfterMs ? 'stale' : 'fresh';
}

export function getLowestRemaining(states: ProviderUsageState[]): ProviderUsageState | undefined {
  return states
    .filter((state) => state.observation?.remainingPercent !== undefined)
    .reduce<ProviderUsageState | undefined>((lowest, state) => {
      if (!lowest) return state;
      return state.observation!.remainingPercent! < lowest.observation!.remainingPercent! ? state : lowest;
    }, undefined);
}

export function getNextReset(states: ProviderUsageState[], now: string): ProviderUsageState | undefined {
  const nowTime = Date.parse(now);
  if (!Number.isFinite(nowTime)) return undefined;

  return states
    .filter((state) => {
      const resetTime = Date.parse(state.observation?.resetAt ?? '');
      return Number.isFinite(resetTime) && resetTime > nowTime;
    })
    .sort((left, right) => Date.parse(left.observation!.resetAt!) - Date.parse(right.observation!.resetAt!))[0];
}

export function formatResetCountdown(resetAt: string | undefined, now: string): string {
  if (!resetAt) return 'Unavailable';
  const difference = Date.parse(resetAt) - Date.parse(now);
  if (!Number.isFinite(difference) || difference <= 0) return 'Awaiting confirmation';
  const totalMinutes = Math.ceil(difference / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
}
