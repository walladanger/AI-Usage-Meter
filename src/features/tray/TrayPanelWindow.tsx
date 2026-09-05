import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../../runtime/tauriRuntime';
import { fixtureNow } from '../../usage/fixtureUsage';
import { useUsage } from '../../usage/usageStore';
import { TrayPanel } from './TrayPanel';

function runNative(command: string, args?: Record<string, unknown>): void {
  if (isTauriRuntime()) void invoke(command, args);
}

export function TrayPanelWindow() {
  const { providers, refreshAll } = useUsage();
  return <div
    className="tray-panel-host"
    // The tray icon schedules a hide when the pointer leaves it. Entering the panel
    // cancels that hide; leaving the panel lets it close again.
    onMouseEnter={() => runNative('keep_tray_panel_open')}
    onMouseLeave={() => runNative('hide_tray_panel')}
  ><TrayPanel
    providers={providers}
    now={providers.some((provider) => provider.isFixture) ? fixtureNow : new Date().toISOString()}
    onOpenDashboard={() => runNative('show_main_window')}
    onOpenSettings={() => runNative('show_main_window', { route: 'settings' })}
    onRefresh={async () => { await refreshAll(); runNative('request_usage_refresh'); }}
    onClosePanel={() => runNative('hide_tray_panel')}
    onExit={() => runNative('exit_application')}
  /></div>;
}
