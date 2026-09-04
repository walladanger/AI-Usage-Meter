import { Component, type ErrorInfo, type ReactNode } from 'react';

interface StartupErrorBoundaryProps {
  children: ReactNode;
  report(message: string): void;
}

interface StartupErrorBoundaryState {
  error: Error | null;
}

export class StartupErrorBoundary extends Component<StartupErrorBoundaryProps, StartupErrorBoundaryState> {
  state: StartupErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): StartupErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    this.props.report(`React render failure: ${error.message}`);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <main className="startup-failure">
          <h1>AI Usage Meter could not start</h1>
          <p>{this.state.error.message}</p>
          <p>Diagnostic log: %APPDATA%\com.aiusagemeter.desktop\logs\startup-diagnostics.log</p>
        </main>
      );
    }
    return this.props.children;
  }
}
