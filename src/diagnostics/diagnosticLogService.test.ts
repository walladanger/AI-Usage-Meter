import { describe, expect, test, vi } from 'vitest';
import { createBrowserDiagnosticLogPort, createTauriDiagnosticLogPort } from './diagnosticLogService';

describe('diagnostic log service', () => {
  test('uses the narrow native commands', async () => {
    const invoke = vi.fn()
      .mockResolvedValueOnce({ directory: 'logs', files: [] })
      .mockResolvedValueOnce({ filename: 'ai-usage-meter-2026-09-04.log', content: 'ok', truncated: false });
    const port = createTauriDiagnosticLogPort(invoke);
    await port.list();
    await port.read('ai-usage-meter-2026-09-04.log');
    expect(invoke).toHaveBeenNthCalledWith(1, 'list_diagnostic_logs');
    expect(invoke).toHaveBeenNthCalledWith(2, 'read_diagnostic_log', { filename: 'ai-usage-meter-2026-09-04.log' });
  });

  test('keeps browser previews side-effect free', async () => {
    const list = await createBrowserDiagnosticLogPort().list();
    expect(list.files).toEqual([]);
    expect(list.directory).toMatch(/installed Windows app/i);
  });
});
