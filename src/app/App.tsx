import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { DialogProvider } from '../dialogs/DialogProvider';
import { ThemeProvider } from '../design-system/themeStore';
import { NotificationProvider } from '../notifications/NotificationProvider';
import { AppShell } from '../shell/AppShell';
import { SettingsProvider } from '../settings/settingsStore';
import { WindowManagerProvider, useWindowManager } from '../windows/WindowManagerProvider';
import { ExternalWindowRoute, selectExternalFeature } from '../external-windows/ExternalWindowRoute';
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
import type { ShellRoute } from '../navigation/navigationTypes';
import { isTauriRuntime } from '../windows/nativeWindowService';

const defaultUsageController = new UsageController(fixtureProviders, []);

function AppContent() {
  const { open, openExternal } = useWindowManager();
  const { providers, refreshAll, setManualObservation } = useUsage();
  const { settings, update } = useSettings();
  const [setupOpen, setSetupOpen] = useState(false);
  const [requestedRoute, setRequestedRoute] = useState<ShellRoute>('overview');
  const externalFeature = typeof window === 'undefined' ? null : selectExternalFeature(window.location.search, windowRegistry);
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

  if (externalFeature) return <ExternalWindowRoute feature={externalFeature} />;

  const dashboard = <Dashboard
    providers={providers}
    history={fixtureHistory}
    now={fixtureNow}
    onRefresh={() => { void refreshAll(); }}
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
          />
        : <SourcesPage providers={providers} onOpenSetup={() => setSetupOpen(true)} onManualObservation={setManualObservation} />;
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
