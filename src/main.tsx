import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StartupErrorBoundary } from './diagnostics/StartupErrorBoundary';
import { createRuntimeDiagnostics, renderStartupFailure, type DiagnosticEntry, type DiagnosticPort } from './diagnostics/runtimeDiagnostics';
import { isTauriRuntime } from './runtime/tauriRuntime';
import './styles/index.css';

// Mark external feature windows before CSS min-width rules are evaluated.
// Checked synchronously using both the initialization-script injection and
// the query-param approach (same as the tray panel) so either mechanism works.
(function markExternalWindow() {
  const injected = (window as unknown as Record<string, unknown>).__AI_USAGE_METER_EXTERNAL_FEATURE__;
  const params = new URLSearchParams(window.location.search);
  const isExternal = typeof injected === 'string' || params.get('window') === 'external';
  if (isExternal) document.documentElement.classList.add('ai-external-window');
  // The tray panel is a transparent native window, so it must not paint the opaque
  // page background that index.html sets to avoid a white flash in the other windows.
  const feature = typeof injected === 'string' ? injected : params.get('feature');
  if (feature === 'tray-panel') document.documentElement.classList.add('ai-tray-panel');
}());

const host = document.getElementById('root');

function browserConsolePort(): DiagnosticPort {
  return {
    async write(entry: DiagnosticEntry) {
      console[entry.level](`[AI Usage Meter] ${entry.message}`);
    },
  };
}

function nativeDiagnosticPort(): DiagnosticPort {
  return {
    async write(entry: DiagnosticEntry) {
      if (!isTauriRuntime()) return browserConsolePort().write(entry);
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('write_frontend_diagnostic', { entry });
    },
  };
}

async function bootstrap(): Promise<void> {
  if (!host) return;
  const diagnostics = createRuntimeDiagnostics(nativeDiagnosticPort(), window);
  diagnostics.installGlobalErrorHandlers();
  await diagnostics.info('Frontend bootstrap started.');
  try {
    const { App } = await import('./app/App');
    await diagnostics.info('Application module loaded.');
    createRoot(host).render(
      <StrictMode>
        <StartupErrorBoundary report={(message) => { void diagnostics.error(message); }}>
          <App />
        </StartupErrorBoundary>
      </StrictMode>,
    );
    await diagnostics.info('React root rendered.');
  } catch (error) {
    await diagnostics.error(`Application bootstrap failed: ${error instanceof Error ? error.message : String(error)}`);
    renderStartupFailure(host, error);
  }
}

void bootstrap();
