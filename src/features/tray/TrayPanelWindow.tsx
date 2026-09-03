import { invoke } from '@tauri-apps/api/core';
import { fixtureNow } from '../../usage/fixtureUsage';
import { useUsage } from '../../usage/usageStore';
import { TrayPanel } from './TrayPanel';

function runNative(command: string, args?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window) void invoke(command, args);
}

export function TrayPanelWindow() {
  const { providers, refreshAll } = useUsage();
  return <TrayPanel
    providers={providers}
    now={providers.some((provider) => provider.isFixture) ? fixtureNow : new Date().toISOString()}
    onOpenDashboard={() => runNative('show_main_window')}
    onOpenSettings={() => runNative('show_main_window', { route: 'settings' })}
    onRefresh={async () => { await refreshAll(); runNative('request_usage_refresh'); }}
    onClosePanel={() => runNative('hide_tray_panel')}
    onExit={() => runNative('exit_application')}
  />;
}
