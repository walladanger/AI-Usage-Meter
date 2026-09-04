import { invoke } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../runtime/tauriRuntime';

export interface DiagnosticLogFile { date: string; filename: string; sizeBytes: number; modifiedAt: string }
export interface DiagnosticLogList { directory: string; files: DiagnosticLogFile[] }
export interface DiagnosticLogContent { filename: string; content: string; truncated: boolean }
export interface DiagnosticLogPort {
  list(): Promise<DiagnosticLogList>;
  read(filename: string): Promise<DiagnosticLogContent>;
}

export type DiagnosticInvoke = <T>(command: string, args?: Record<string, unknown>) => Promise<T>;

function readableError(error: unknown): Error {
  if (error instanceof Error) return error;
  if (typeof error === 'object' && error && 'message' in error && typeof error.message === 'string') return new Error(error.message);
  return new Error('The diagnostic log operation failed.');
}

export function createTauriDiagnosticLogPort(command: DiagnosticInvoke = invoke): DiagnosticLogPort {
  return {
    list: async () => command<DiagnosticLogList>('list_diagnostic_logs').catch((error) => { throw readableError(error); }),
    read: async (filename) => command<DiagnosticLogContent>('read_diagnostic_log', { filename }).catch((error) => { throw readableError(error); }),
  };
}

export function createBrowserDiagnosticLogPort(): DiagnosticLogPort {
  return {
    list: async () => ({ directory: 'Available in the installed Windows app', files: [] }),
    read: async (filename) => ({ filename, content: '', truncated: false }),
  };
}

export function getDiagnosticLogPort(): DiagnosticLogPort {
  return isTauriRuntime() ? createTauriDiagnosticLogPort() : createBrowserDiagnosticLogPort();
}
