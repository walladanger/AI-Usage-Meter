import { describe, expect, test } from 'vitest';
import { createRuntimeDiagnostics, renderStartupFailure, type DiagnosticEntry } from './runtimeDiagnostics';

function createCapturingPort() {
  const entries: DiagnosticEntry[] = [];
  return {
    entries,
    port: { write: async (entry: DiagnosticEntry) => { entries.push(entry); } },
  };
}

describe('runtime diagnostics', () => {
  test('records a bootstrap marker before application modules are loaded', async () => {
    const capture = createCapturingPort();
    const diagnostics = createRuntimeDiagnostics(capture.port, window);

    await diagnostics.info('Frontend bootstrap started.');

    expect(capture.entries).toEqual([
      expect.objectContaining({ level: 'info', message: 'Frontend bootstrap started.' }),
    ]);
  });

  test('records uncaught browser errors with their message', async () => {
    const capture = createCapturingPort();
    const diagnostics = createRuntimeDiagnostics(capture.port, window);
    const remove = diagnostics.installGlobalErrorHandlers();

    window.dispatchEvent(new ErrorEvent('error', { message: 'Dashboard import failed', error: new Error('Dashboard import failed') }));
    await Promise.resolve();
    remove();

    expect(capture.entries).toContainEqual(expect.objectContaining({
      level: 'error',
      message: 'Uncaught browser error: Dashboard import failed',
    }));
  });

  test('shows a readable recovery screen when the application module cannot load', () => {
    const host = document.createElement('div');

    renderStartupFailure(host, new Error('Dashboard import failed'));

    expect(host).toHaveTextContent('AI Usage Meter could not start');
    expect(host).toHaveTextContent('Dashboard import failed');
    expect(host).toHaveTextContent('%LOCALAPPDATA%\\com.aiusagemeter.desktop\\logs');
  });
});
