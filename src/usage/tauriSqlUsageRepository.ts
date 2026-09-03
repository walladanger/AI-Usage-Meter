import type { ConnectionEvent, UsageRepository } from './usageRepository';
import type { Confidence, ProviderId, SourceType, UsageObservation } from './usageTypes';
import { InMemoryUsageRepository } from './inMemoryUsageRepository';

export interface SqlDatabase {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

interface ObservationRow {
  provider_id: ProviderId;
  account_label: string | null;
  remaining_percent: number | null;
  used_percent: number | null;
  reset_at: string | null;
  window_label: string | null;
  observed_at: string;
  source_type: SourceType;
  confidence: Confidence;
}

const observationColumns = `
  provider_id, account_label, remaining_percent, used_percent, reset_at,
  window_label, observed_at, source_type, confidence
`;

function mapObservation(row: ObservationRow): UsageObservation {
  return {
    providerId: row.provider_id,
    ...(row.account_label ? { accountLabel: row.account_label } : {}),
    ...(row.remaining_percent === null ? {} : { remainingPercent: row.remaining_percent }),
    ...(row.used_percent === null ? {} : { usedPercent: row.used_percent }),
    ...(row.reset_at ? { resetAt: row.reset_at } : {}),
    ...(row.window_label ? { windowLabel: row.window_label } : {}),
    observedAt: row.observed_at,
    sourceType: row.source_type,
    confidence: row.confidence,
  };
}

export class TauriSqlUsageRepository implements UsageRepository {
  constructor(private readonly database: SqlDatabase) {}

  async saveObservation(observation: UsageObservation): Promise<void> {
    await this.database.execute(`
      INSERT INTO usage_snapshots (${observationColumns})
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [
      observation.providerId,
      observation.accountLabel ?? null,
      observation.remainingPercent ?? null,
      observation.usedPercent ?? null,
      observation.resetAt ?? null,
      observation.windowLabel ?? null,
      observation.observedAt,
      observation.sourceType,
      observation.confidence,
    ]);
  }

  async getLatestByProvider(providerId: ProviderId): Promise<UsageObservation | undefined> {
    const rows = await this.database.select<ObservationRow[]>(`
      SELECT ${observationColumns}
      FROM usage_snapshots
      WHERE provider_id = $1
      ORDER BY observed_at DESC
      LIMIT 1
    `, [providerId]);
    return rows[0] ? mapObservation(rows[0]) : undefined;
  }

  async getHistory(providerId: ProviderId, start: string, end: string): Promise<UsageObservation[]> {
    const rows = await this.database.select<ObservationRow[]>(`
      SELECT ${observationColumns}
      FROM usage_snapshots
      WHERE provider_id = $1 AND observed_at >= $2 AND observed_at <= $3
      ORDER BY observed_at ASC
    `, [providerId, start, end]);
    return rows.map(mapObservation);
  }

  async saveConnectionEvent(event: ConnectionEvent): Promise<void> {
    await this.database.execute(`
      INSERT INTO connection_events (provider_id, status, occurred_at, message)
      VALUES ($1, $2, $3, $4)
    `, [event.providerId, event.status, event.occurredAt, event.message ?? null]);
  }

  async clearHistory(): Promise<void> {
    await this.database.execute('DELETE FROM usage_snapshots');
  }
}

async function loadUsageDatabase(): Promise<SqlDatabase> {
  const { default: Database } = await import('@tauri-apps/plugin-sql');
  return Database.load('sqlite:usage.db');
}

export async function createRuntimeUsageRepository(
  isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
  loadDatabase: () => Promise<SqlDatabase> = loadUsageDatabase,
): Promise<UsageRepository> {
  if (!isTauri) return new InMemoryUsageRepository();
  return new TauriSqlUsageRepository(await loadDatabase());
}
