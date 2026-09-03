import type { ColorProfileSelection } from '../types/theme';
import type { PersistenceAdapter } from '../services/contracts';

export interface WindowBehaviorSettings {
  restoreOnLaunch: boolean;
  rememberBounds: boolean;
}

export interface UsageSettings {
  refreshMinutes: 0 | 1 | 5 | 10 | 15 | 30;
  notificationsEnabled: boolean;
  alertThresholds: readonly number[];
  notifyOnReset: boolean;
  launchOnStartup: boolean;
  startMinimized: boolean;
  retentionDays: number;
}

export interface AppSettings {
  version: 1;
  colorProfile: ColorProfileSelection;
  navigationCollapsed: boolean;
  recentFiles: readonly string[];
  windowBehavior: WindowBehaviorSettings;
  usage: UsageSettings;
  extensionSettings: Readonly<Record<string, unknown>>;
}

export interface SettingsService<TSettings> {
  load(): Promise<TSettings>;
  save(settings: TSettings): Promise<SettingsPersistenceResult>;
  reset(): Promise<TSettings>;
}

export type SettingsPersistenceResult =
  | { kind: 'success' }
  | { kind: 'failure'; code: 'persistence-failed' };

export type SettingsPersistenceAdapter = PersistenceAdapter<string>;
