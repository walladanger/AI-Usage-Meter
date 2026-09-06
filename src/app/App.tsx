import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { DialogProvider } from '../dialogs/DialogProvider';
import { ThemeProvider } from '../design-system/themeStore';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { AppShell } from '../shell/AppShell';
import { SettingsProvider } from '../settings/settingsStore';
import { WindowManagerProvider, useWindowManager } from '../windows/WindowManagerProvider';
import { ExternalWindowRoute, injectedExternalFeatureId, selectExternalFeature } from '../external-windows/ExternalWindowRoute';
import { windowRegistry } from '../windows/windowRegistry';
import { useNativeWindowStateLifecycle } from '../windows/windowState';
import { Dashboard } from '../features/dashboard/Dashboard';
import { AlertsPage } from '../features/alerts/AlertsPage';
import { HelpPage } from '../features/help/HelpPage';
import { HistoryPage } from '../features/history/HistoryPage';
import { RefreshPage } from '../features/refresh/RefreshPage';
import { SetupFlow, type SetupDraft } from '../features/setup/SetupFlow';
import { SourcesPage } from '../features/sources/SourcesPage';
import { UsageSettingsPage } from '../features/settings/UsageSettingsPage';
import { fixtureHistory, fixtureNow, fixtureProviders } from '../usage/fixtureUsage';
import { UsageController, UsageProvider, useUsage } from '../usage/usageStore';
import { useSettings } from '../settings/settingsStore';
import { isTauriRuntime } from '../runtime/tauriRuntime';
import type { ShellRoute } from '../navigation/navigationTypes';
import { recordAppDiagnostic } from '../diagnostics/appDiagnostics';
import { API_CONNECTOR_PROVIDERS, ApiUsageAdapter, createApiAdapters } from '../usage/apiProviderAdapter';
import { CodexUsageAdapter, CodexWithApiSpendAdapter } from '../usage/codexAdapter';
import { invoke } from '@tauri-apps/api/core';
import type { PersonalUsageAdapter } from '../usage/providerAdapter';
import { createRuntimeProviderCredentialsService } from '../settings/providerCredentialsService';
import type { ProviderId } from '../usage/usageTypes';

const defaultUsageController = new UsageController(fixtureProviders, []);

function AppContent() {
  const { open, openExternal } = useWindowManager();
  const { providers, refreshAll, setManualObservation, setAdapters } = useUsage();
  const { settings, update } = useSettings();
  const [setupOpen, setSetupOpen] = useState(false);
  const [requestedRoute, setRequestedRoute] = useState<ShellRoute>('overview');
  const externalFeature = typeof window === 'undefined' ? null : selectExternalFeature(window.location.search, windowRegistry, injectedExternalFeatureId(window));
  useNativeWindowStateLifecycle(externalFeature ? `feature:${externalFeature.id}` : 'main');
  useEffect(() => {
    if (!isTauriRuntime() || externalFeature) return undefined;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen<ShellRoute>('usage://navigate', (event) => { if (active) setRequestedRoute(event.payload); })
      .then((cleanup) => { unlisten = cleanup; if (!active) cleanup(); });
    return () => { active = false; unlisten?.(); };
  }, [externalFeature]);
  useEffect(() => {
    if (!isTauriRuntime() || externalFeature) return undefined;
    let active = true;
    let unlisten: (() => void) | undefined;
    void listen('usage://refresh-all', () => { if (active) void refreshAll(); })
      .then((cleanup) => { unlisten = cleanup; if (!active) cleanup(); });
    return () => { active = false; unlisten?.(); };
  }, [externalFeature, refreshAll]);

  // Install a connector for each provider that has a key in the Windows Credential Manager.
  // Runs once: `setAdapters` and `refreshAll` are stable for a given controller, so this
  // cannot become a render loop.
  useEffect(() => {
    if (!isTauriRuntime() || externalFeature) return undefined;
    let active = true;
    void (async () => {
      const credentials = createRuntimeProviderCredentialsService();
      const configured: ProviderId[] = [];
      for (const providerId of API_CONNECTOR_PROVIDERS) {
        try {
          const status = await credentials.status(providerId);
          if (status.configured) configured.push(providerId);
        } catch {
          // A provider whose status cannot be read stays on its existing source.
        }
      }
      // The Codex CLI reports ChatGPT/Codex *allowance*, which no API exposes. When both it
      // and an OpenAI key are present they answer different questions about the same
      // provider, so they are merged rather than one silently replacing the other.
      let codexAvailable = false;
      try {
        codexAvailable = await invoke<boolean>('codex_cli_available');
      } catch {
        // Treated as absent; OpenAI then falls back to the API connector or manual entry.
      }
      if (!active) return;

      const adapters: PersonalUsageAdapter[] = createApiAdapters(
        configured.filter((providerId) => !(codexAvailable && providerId === 'openai')),
      );
      if (codexAvailable) {
        const codex = new CodexUsageAdapter();
        adapters.push(
          configured.includes('openai')
            ? new CodexWithApiSpendAdapter(codex, new ApiUsageAdapter('openai'))
            : codex,
        );
      }
      if (adapters.length === 0) return;

      setAdapters(adapters);
      void recordAppDiagnostic(
        'info',
        `Provider connectors installed; api=${configured.length}; codex=${codexAvailable}.`,
      );
      void refreshAll();
    })();
    return () => { active = false; };
  }, [externalFeature, refreshAll, setAdapters]);

  // Scheduled refresh. `refreshMinutes` of 0 means manual only.
  useEffect(() => {
    if (!isTauriRuntime() || externalFeature) return undefined;
    const minutes = settings.usage.refreshMinutes;
    if (!minutes || minutes <= 0) return undefined;
    const timer = setInterval(() => { void refreshAll(); }, minutes * 60_000);
    return () => clearInterval(timer);
  }, [externalFeature, refreshAll, settings.usage.refreshMinutes]);

  if (externalFeature) return <ExternalWindowRoute feature={externalFeature} />;

  const dashboard = <Dashboard
    providers={providers}
    history={fixtureHistory}
    now={fixtureNow}
    onRefresh={refreshAll}
    onPopOutChart={() => { void openExternal('usage-trend'); }}
  />;

  const renderRoute = (route: ShellRoute) => {
    switch (route) {
      case 'overview': return dashboard;
      case 'refresh': return <RefreshPage providers={providers} onRefresh={refreshAll} />;
      case 'alerts': return <AlertsPage providers={providers} />;
      case 'history': return <HistoryPage history={fixtureHistory} isPreview={providers.some((provider) => provider.isFixture)} />;
      case 'sources': return setupOpen
        ? <SetupFlow
            initialDraft={settings.extensionSettings.setupDraft as SetupDraft | undefined}
            saveDraft={async (draft) => { await update({ extensionSettings: { ...settings.extensionSettings, setupDraft: draft }, usage: { ...settings.usage, refreshMinutes: draft.refreshMinutes, notificationsEnabled: draft.notificationsEnabled } }); }}
            onComplete={() => setSetupOpen(false)}
            report={(level, message) => { void recordAppDiagnostic(level, message); }}
          />
        : <SourcesPage providers={providers} onOpenSetup={() => { void recordAppDiagnostic('info', 'Guided source setup opened.'); setSetupOpen(true); }} onManualObservation={setManualObservation} />;
      case 'settings': return <UsageSettingsPage />;
      case 'help': return <HelpPage />;
    }
  };

  return (
    <AppShell
      onOpenDataExplorer={() => open('data-explorer')}
      statusContent={<><span>{providers.some((provider) => provider.isFixture) ? 'Preview mode' : 'Local monitoring'}</span><span style={{ marginLeft: '2rem' }}>Data stays local</span></>}
      renderRoute={renderRoute}
      requestedRoute={requestedRoute}
    />
  );
}

export interface AppProps {
  usageController?: UsageController;
}

export function App({ usageController = defaultUsageController }: AppProps) {
  return (
    <SettingsProvider>
      <ThemeProvider>
        <NotificationProvider>
          <DialogProvider>
            <WindowManagerProvider>
              <UsageProvider controller={usageController}>
                <AppContent />
              </UsageProvider>
            </WindowManagerProvider>
          </DialogProvider>
        </NotificationProvider>
      </ThemeProvider>
    </SettingsProvider>
  );
}
