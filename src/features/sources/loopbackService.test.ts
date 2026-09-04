/**
 * Loopback service tests.
 *
 * These tests cover the TypeScript-layer contracts only. Tauri IPC and
 * actual HTTP traffic are not exercised here; that's covered by the Rust
 * unit tests in src-tauri/src/loopback.rs.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The @tauri-apps modules are mocked globally in the test setup; these
// imports resolve to the mocked versions.
import { listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';

import {
  getLoopbackSession,
  onConnectorUpdate,
  type ConnectorUpdate,
  type LoopbackSession,
} from './loopbackService';

vi.mock('@tauri-apps/api/core');
vi.mock('@tauri-apps/api/event');

const mockListen = vi.mocked(listen);
const mockInvoke = vi.mocked(invoke);

describe('getLoopbackSession', () => {
  it('invokes get_loopback_session and returns the session', async () => {
    const session: LoopbackSession = { port: 52411, token: 'abc123' + '0'.repeat(26) };
    mockInvoke.mockResolvedValueOnce(session);

    const result = await getLoopbackSession();
    expect(result).toEqual(session);
    expect(mockInvoke).toHaveBeenCalledWith('get_loopback_session');
  });

  it('propagates rejection when the loopback service is not running', async () => {
    mockInvoke.mockRejectedValueOnce(new Error('loopback-unavailable'));
    await expect(getLoopbackSession()).rejects.toThrow();
  });
});

describe('onConnectorUpdate', () => {
  beforeEach(() => {
    mockListen.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('subscribes to usage://connector-update', async () => {
    const unlisten = vi.fn();
    mockListen.mockResolvedValueOnce(unlisten);

    const callback = vi.fn();
    const stop = onConnectorUpdate(callback);

    // Allow the async listen call to settle.
    await Promise.resolve();

    expect(mockListen).toHaveBeenCalledWith(
      'usage://connector-update',
      expect.any(Function),
    );

    stop();
    expect(unlisten).toHaveBeenCalled();
  });

  it('forwards the event payload to the callback', async () => {
    let capturedHandler: ((event: { payload: ConnectorUpdate }) => void) | undefined;
    mockListen.mockImplementationOnce(
      async (_channel: unknown, handler: unknown): Promise<() => void> => {
        capturedHandler = handler as (event: { payload: ConnectorUpdate }) => void;
        return (() => undefined) as () => void;
      },
    );

    const callback = vi.fn();
    onConnectorUpdate(callback);
    await Promise.resolve();

    const update: ConnectorUpdate = {
      provider: 'openai',
      percentage: 75,
      label: '75%',
      timestamp: '2026-09-04T10:00:00Z',
    };

    capturedHandler!({ payload: update });
    expect(callback).toHaveBeenCalledWith(update);
  });

  it('does not invoke callback after the subscription is stopped', async () => {
    let capturedHandler: ((event: { payload: ConnectorUpdate }) => void) | undefined;
    mockListen.mockImplementationOnce(
      async (_channel: unknown, handler: unknown): Promise<() => void> => {
        capturedHandler = handler as (event: { payload: ConnectorUpdate }) => void;
        return (() => undefined) as () => void;
      },
    );

    const callback = vi.fn();
    const stop = onConnectorUpdate(callback);
    await Promise.resolve();

    stop();

    const update: ConnectorUpdate = {
      provider: 'anthropic',
      percentage: 50,
      label: '50%',
      timestamp: '2026-09-04T10:00:00Z',
    };

    capturedHandler!({ payload: update });
    expect(callback).not.toHaveBeenCalled();
  });
});
