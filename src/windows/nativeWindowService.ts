import { getCurrentWindow } from '@tauri-apps/api/window';
import { isTauriRuntime } from '../runtime/tauriRuntime';

export interface NativeWindowService {
  minimize(): Promise<void>;
  toggleMaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
}

export interface CurrentNativeWindowAdapter {
  minimize(): Promise<void>;
  isMaximized(): Promise<boolean>;
  maximize(): Promise<void>;
  unmaximize(): Promise<void>;
  close(): Promise<void>;
  startDragging(): Promise<void>;
}

export function createBrowserNativeWindowService(): NativeWindowService {
  const noOp = async () => undefined;
  return { minimize: noOp, toggleMaximize: noOp, close: noOp, startDragging: noOp };
}

export function createNativeWindowService(adapter: CurrentNativeWindowAdapter): NativeWindowService {
  return {
    minimize: () => adapter.minimize(),
    async toggleMaximize() {
      if (await adapter.isMaximized()) await adapter.unmaximize();
      else await adapter.maximize();
    },
    close: () => adapter.close(),
    startDragging: () => adapter.startDragging(),
  };
}

export function getNativeWindowService(): NativeWindowService {
  return isTauriRuntime() ? createNativeWindowService(getCurrentWindow()) : createBrowserNativeWindowService();
}
