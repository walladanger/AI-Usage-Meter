export type DiagnosticLevel = 'info' | 'warn' | 'error';

export interface DiagnosticEntry {
  timestamp: string;
  level: DiagnosticLevel;
  message: string;
}

export interface DiagnosticPort {
  write(entry: DiagnosticEntry): Promise<void>;
}

export interface RuntimeDiagnostics {
  info(message: string): Promise<void>;
  warn(message: string): Promise<void>;
  error(message: string): Promise<void>;
  installGlobalErrorHandlers(): () => void;
}

function errorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (typeof reason === 'string') return reason;
  try { return JSON.stringify(reason); } catch { return String(reason); }
}

export function createRuntimeDiagnostics(port: DiagnosticPort, browserWindow: Window): RuntimeDiagnostics {
  const record = async (level: DiagnosticLevel, message: string) => {
    const entry = { timestamp: new Date().toISOString(), level, message };
    try { await port.write(entry); } catch { console[level](message); }
  };
  const onError = (event: ErrorEvent) => { void record('error', `Uncaught browser error: ${event.message || errorMessage(event.error)}`); };
  const onRejection = (event: PromiseRejectionEvent) => { void record('error', `Unhandled promise rejection: ${errorMessage(event.reason)}`); };
  return {
    info: (message) => record('info', message),
    warn: (message) => record('warn', message),
    error: (message) => record('error', message),
    installGlobalErrorHandlers() {
      browserWindow.addEventListener('error', onError);
      browserWindow.addEventListener('unhandledrejection', onRejection);
      return () => {
        browserWindow.removeEventListener('error', onError);
        browserWindow.removeEventListener('unhandledrejection', onRejection);
      };
    },
  };
}

export function renderStartupFailure(host: HTMLElement, reason: unknown): void {
  host.replaceChildren();
  const panel = document.createElement('main');
  panel.className = 'startup-failure';
  const heading = document.createElement('h1');
  heading.textContent = 'AI Usage Meter could not start';
  const explanation = document.createElement('p');
  explanation.textContent = errorMessage(reason);
  const logLocation = document.createElement('p');
  logLocation.textContent = 'Diagnostic log: %LOCALAPPDATA%\\com.aiusagemeter.desktop\\logs';
  panel.append(heading, explanation, logLocation);
  host.append(panel);
}
