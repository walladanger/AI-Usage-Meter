import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react';
import type { PersonalUsageAdapter } from './providerAdapter';
import type { UsageRepository } from './usageRepository';
import type { ProviderId, ProviderUsageState, UsageObservation } from './usageTypes';

type UsageListener = () => void;

export interface RefreshSummary {
  attempted: number;
  succeeded: number;
  failed: number;
}

export class UsageController {
  private readonly states = new Map<ProviderId, ProviderUsageState>();
  private readonly adapters = new Map<ProviderId, PersonalUsageAdapter>();
  private readonly listeners = new Set<UsageListener>();
  private snapshot: ProviderUsageState[] = [];

  constructor(
    initialStates: ProviderUsageState[],
    adapters: PersonalUsageAdapter[],
    private readonly repository?: UsageRepository,
  ) {
    for (const state of initialStates) {
      this.states.set(state.providerId, { ...state, observation: state.observation ? { ...state.observation } : undefined });
    }

    for (const adapter of adapters) this.adapters.set(adapter.providerId, adapter);
    this.updateSnapshot();
  }

  get(providerId: ProviderId): ProviderUsageState {
    const state = this.states.get(providerId);
    if (!state) throw new Error(`Unknown provider: ${providerId}`);
    return state;
  }

  getAll = (): ProviderUsageState[] => this.snapshot;

  subscribe = (listener: UsageListener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async refreshAll(): Promise<RefreshSummary> {
    const providerIds = [...this.adapters.keys()];
    const results = await Promise.all(providerIds.map((providerId) => this.refreshProvider(providerId)));
    const succeeded = results.filter(Boolean).length;
    return { attempted: providerIds.length, succeeded, failed: providerIds.length - succeeded };
  }

  async refreshProvider(providerId: ProviderId): Promise<boolean> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) return false;

    const previous = this.get(providerId);
    this.states.set(providerId, { ...previous, status: 'updating' });
    this.emit();

    try {
      const observation = await adapter.fetch();
      if (observation.providerId !== providerId) {
        throw new Error(`Connector returned ${observation.providerId} data for ${providerId}`);
      }

      this.states.set(providerId, {
        ...previous,
        status: 'connected',
        observation: { ...observation },
        lastError: undefined,
        isFixture: false,
      });
      await this.repository?.saveObservation(observation);
      this.emit();
      return true;
    } catch (error) {
      this.states.set(providerId, {
        ...previous,
        status: 'error',
        lastError: error instanceof Error ? error.message : 'Provider refresh failed',
      });
      this.emit();
      return false;
    }
  }

  async setManualObservation(observation: UsageObservation): Promise<void> {
    const previous = this.get(observation.providerId);
    this.states.set(observation.providerId, {
      ...previous,
      status: 'connected',
      observation: { ...observation },
      lastError: undefined,
      isFixture: false,
    });
    this.emit();
    await this.repository?.saveObservation(observation);
  }

  private updateSnapshot(): void {
    this.snapshot = [...this.states.values()];
  }

  private emit(): void {
    this.updateSnapshot();
    for (const listener of this.listeners) listener();
  }
}

interface UsageContextValue {
  providers: ProviderUsageState[];
  refreshProvider(providerId: ProviderId): Promise<boolean>;
  refreshAll(): Promise<RefreshSummary>;
  setManualObservation(observation: UsageObservation): Promise<void>;
}

const UsageContext = createContext<UsageContextValue | null>(null);

export interface UsageProviderProps extends PropsWithChildren {
  controller: UsageController;
}

export function UsageProvider({ children, controller }: UsageProviderProps) {
  const providers = useSyncExternalStore(controller.subscribe, controller.getAll, controller.getAll);
  const refreshProvider = useCallback((providerId: ProviderId) => controller.refreshProvider(providerId), [controller]);
  const refreshAll = useCallback(() => controller.refreshAll(), [controller]);
  const setManualObservation = useCallback((observation: UsageObservation) => controller.setManualObservation(observation), [controller]);
  const value = useMemo<UsageContextValue>(() => ({
    providers,
    refreshProvider,
    refreshAll,
    setManualObservation,
  }), [providers, refreshAll, refreshProvider, setManualObservation]);

  return <UsageContext.Provider value={value}>{children}</UsageContext.Provider>;
}

export function useUsage(): UsageContextValue {
  const context = useContext(UsageContext);
  if (!context) throw new Error('useUsage must be used within a UsageProvider.');
  return context;
}
