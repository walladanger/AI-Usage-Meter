import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../runtime/tauriRuntime';
import type { ProviderId } from '../usage/usageTypes';

/**
 * Frontend boundary for provider API keys.
 *
 * The key is passed to the native layer once, on save, and is never read back: there is no
 * command that returns a stored secret. Everything the UI can learn afterwards is in
 * `ProviderCredentialStatus` — whether a key exists, and a masked tail for recognition.
 * Keys are held in the Windows Credential Manager, never in settings.json, SQLite, or logs.
 */
export interface ProviderCredentialStatus {
  providerId: string;
  configured: boolean;
  hint?: string;
}

export interface ProviderCredentialsService {
  store(providerId: ProviderId, secret: string): Promise<ProviderCredentialStatus>;
  remove(providerId: ProviderId): Promise<ProviderCredentialStatus>;
  status(providerId: ProviderId): Promise<ProviderCredentialStatus>;
}

export type CredentialInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

export function createTauriProviderCredentialsService(
  command: CredentialInvoke = invoke,
): ProviderCredentialsService {
  return {
    store: (providerId, secret) =>
      command<ProviderCredentialStatus>('store_provider_credential', { providerId, secret }),
    remove: (providerId) =>
      command<ProviderCredentialStatus>('delete_provider_credential', { providerId }),
    status: (providerId) =>
      command<ProviderCredentialStatus>('provider_credential_status', { providerId }),
  };
}

/** Browser preview has no OS credential store, so nothing can be configured there. */
export function createUnavailableProviderCredentialsService(): ProviderCredentialsService {
  const unavailable = async (providerId: ProviderId): Promise<ProviderCredentialStatus> => ({
    providerId,
    configured: false,
  });
  return {
    async store() {
      throw new Error('Credential storage requires the Windows application.');
    },
    remove: unavailable,
    status: unavailable,
  };
}

export function createRuntimeProviderCredentialsService(
  isTauri = isTauriRuntime(),
  command: CredentialInvoke = invoke,
): ProviderCredentialsService {
  return isTauri
    ? createTauriProviderCredentialsService(command)
    : createUnavailableProviderCredentialsService();
}
