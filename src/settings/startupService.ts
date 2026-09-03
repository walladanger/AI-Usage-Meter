import { disable, enable, isEnabled } from '@tauri-apps/plugin-autostart';

export interface StartupPort {
  enable(): Promise<void>;
  disable(): Promise<void>;
  isEnabled(): Promise<boolean>;
}

export interface StartupService {
  setEnabled(enabled: boolean): Promise<void>;
  isEnabled(): Promise<boolean>;
}

export function createStartupService(port: StartupPort): StartupService {
  return {
    async setEnabled(enabled) {
      if (enabled) await port.enable();
      else await port.disable();
    },
    isEnabled: () => port.isEnabled(),
  };
}

const browserPort: StartupPort = {
  async enable() { /* Browser preview cannot register Windows startup. */ },
  async disable() { /* Browser preview cannot register Windows startup. */ },
  async isEnabled() { return false; },
};

export function createRuntimeStartupService(
  isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window,
): StartupService {
  return createStartupService(isTauri ? { enable, disable, isEnabled } : browserPort);
}
