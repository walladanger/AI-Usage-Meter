import { isTauriRuntime } from '../runtime/tauriRuntime';

export type DiagnosticLevel = 'info' | 'warn' | 'error';

export async function recordAppDiagnostic(level: DiagnosticLevel, message: string): Promise<void> {
  const entry = { timestamp: new Date().toISOString(), level, message };
  try {
    if (isTauriRuntime()) {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_frontend_diagnostic', { entry });
      return;
    }
  } catch { /* Diagnostics must never interrupt the observed action. */ }
  console[level](`[AI Usage Meter] ${message}`);
}
