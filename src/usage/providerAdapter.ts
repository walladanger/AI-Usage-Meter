import type { ProviderId, SourceType, UsageObservation } from './usageTypes';

export interface PersonalUsageAdapter {
  providerId: ProviderId;
  sourceType: SourceType;
  fetch(): Promise<UsageObservation>;
}
