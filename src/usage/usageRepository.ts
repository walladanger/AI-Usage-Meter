import type { ConnectorState, ProviderId, UsageObservation } from './usageTypes';

export interface ConnectionEvent {
  providerId: ProviderId;
  status: ConnectorState;
  occurredAt: string;
  message?: string;
}

export interface UsageRepository {
  saveObservation(observation: UsageObservation): Promise<void>;
  getLatestByProvider(providerId: ProviderId): Promise<UsageObservation | undefined>;
  getHistory(providerId: ProviderId, start: string, end: string): Promise<UsageObservation[]>;
  saveConnectionEvent(event: ConnectionEvent): Promise<void>;
  clearHistory(): Promise<void>;
}
