import type { ConnectionEvent, UsageRepository } from './usageRepository';
import type { ProviderId, UsageObservation } from './usageTypes';

export class InMemoryUsageRepository implements UsageRepository {
  private observations: UsageObservation[] = [];
  private connectionEvents: ConnectionEvent[] = [];

  async saveObservation(observation: UsageObservation): Promise<void> {
    this.observations.push({ ...observation });
  }

  async getLatestByProvider(providerId: ProviderId): Promise<UsageObservation | undefined> {
    const match = this.observations
      .filter((observation) => observation.providerId === providerId)
      .sort((left, right) => right.observedAt.localeCompare(left.observedAt))[0];
    return match ? { ...match } : undefined;
  }

  async getHistory(providerId: ProviderId, start: string, end: string): Promise<UsageObservation[]> {
    return this.observations
      .filter((observation) => observation.providerId === providerId && observation.observedAt >= start && observation.observedAt <= end)
      .sort((left, right) => left.observedAt.localeCompare(right.observedAt))
      .map((observation) => ({ ...observation }));
  }

  async saveConnectionEvent(event: ConnectionEvent): Promise<void> {
    this.connectionEvents.push({ ...event });
  }

  async clearHistory(): Promise<void> {
    this.observations = [];
  }

  getConnectionEvents(): ConnectionEvent[] {
    return this.connectionEvents.map((event) => ({ ...event }));
  }
}
