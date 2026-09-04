import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { StartupErrorBoundary } from './diagnostics/StartupErrorBoundary';
import { createRuntimeDiagnostics, renderStartupFailure, type DiagnosticEntry, type DiagnosticPort } from './diagnostics/runtimeDiagnostics';
import { isTauriRuntime } from './runtime/tauriRuntime';
import './styles/index.css';

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
