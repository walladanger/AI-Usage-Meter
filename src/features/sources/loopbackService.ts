/**
 * Loopback ingestion service — frontend interface.
 *
 * Exposes the session information for the local HTTP server and provides a
 * typed subscription to connector update events emitted by the Rust backend.
 *
 * The loopback server is bound strictly to 127.0.0.1 and accepts provider
 * usage updates from a browser companion running on the same machine. This
 * module is the only entry point for connector-sourced data in the frontend.
 *
 * Usage:
 *   const session = await getLoopbackSession();
 *   const stop = onConnectorUpdate((update) => { ... });
 */

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Known provider IDs accepted by the loopback service. */
export type LoopbackProviderId = 'openai' | 'anthropic' | 'google';

/**
 * A validated provider usage update received from the browser companion
 * via the loopback service.
 */
export interface ConnectorUpdate {
  provider: LoopbackProviderId;
  /** Remaining usage as a percentage in [0, 100]. */
  percentage: number;
  /** Human-readable label from the provider page (e.g. "75%"). */
  label: string;
  /** ISO 8601 timestamp of when the data was observed on the provider page. */
  timestamp: string;
  /** ISO 8601 reset timestamp, if the provider exposes one. */
  resetAt?: string;
}

/**
 * Session information for the running loopback service.
 *
 * The token is a fresh 32-character hex string generated each app launch.
 * It must be included as `Authorization: Bearer <token>` in every request
 * to `POST http://127.0.0.1:{port}/usage/update`.
 */
export interface LoopbackSession {
  port: number;
  /** 32-character lowercase hex session token. Never persisted to disk. */
  token: string;
}

// ─── Tauri command ────────────────────────────────────────────────────────────

/**
 * Return the current loopback session (port + token).
 *
 * Rejects if the loopback service failed to start (e.g. all ports in use).
 * In that case the browser companion cannot send updates this session.
 */
export async function getLoopbackSession(): Promise<LoopbackSession> {
  return invoke<LoopbackSession>('get_loopback_session');
}

// ─── Event subscription ───────────────────────────────────────────────────────

/**
 * Subscribe to connector update events emitted by the loopback service.
 *
 * Returns an unsubscribe function; call it when the component unmounts or
 * the subscription is no longer needed.
 *
 * No-ops in non-Tauri environments (browser tests).
 */
export function onConnectorUpdate(
  callback: (update: ConnectorUpdate) => void,
): () => void {
  let active = true;
  let unlisten: (() => void) | undefined;

  void listen<ConnectorUpdate>('usage://connector-update', (event) => {
    if (active) callback(event.payload);
  }).then((fn) => {
    unlisten = fn;
    if (!active) fn();
  });

  return () => {
    active = false;
    unlisten?.();
  };
}
