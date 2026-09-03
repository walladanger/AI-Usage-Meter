import { describe, expect, test, vi } from 'vitest';
import { createStartupService } from './startupService';

describe('startupService', () => {
  test('registers and unregisters only when explicitly requested', async () => {
    const port = { enable: vi.fn(), disable: vi.fn(), isEnabled: vi.fn().mockResolvedValue(false) };
    const service = createStartupService(port);

    await service.setEnabled(true);
    await service.setEnabled(false);

    expect(port.enable).toHaveBeenCalledOnce();
    expect(port.disable).toHaveBeenCalledOnce();
  });
});
