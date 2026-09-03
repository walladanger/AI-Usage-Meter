import { Gauge, RefreshCw, Settings, X } from 'lucide-react';
import { formatResetCountdown, getLowestRemaining, getNextReset } from '../../usage/usageMath';
import type { ProviderUsageState } from '../../usage/usageTypes';
import './trayPanel.css';

export interface TrayPanelProps {
  providers: ProviderUsageState[];
  now: string;
  onOpenDashboard(): void;
  onRefresh(): Promise<void>;
  onOpenSettings(): void;
  onClosePanel(): void;
  onExit(): void;
}

export function TrayPanel({ providers, now, onOpenDashboard, onRefresh, onOpenSettings, onClosePanel, onExit }: TrayPanelProps) {
  const lowest = getLowestRemaining(providers);
  const nextReset = getNextReset(providers, now);

  return <section className="tray-panel" aria-labelledby="tray-panel-title">
    <header><div><span className="tray-panel__mark"><Gauge size={17} /></span><div><h1 id="tray-panel-title">AI Usage Meter</h1><span>Personal allowances</span></div></div><button type="button" aria-label="Close panel" onClick={onClosePanel}><X size={16} /></button></header>
    <div className="tray-panel__providers">{providers.map((provider) => <article key={provider.providerId} data-provider={provider.providerId}><div><strong>{provider.displayName}</strong><span>{formatResetCountdown(provider.observation?.resetAt, now)}</span></div><b>{provider.observation?.remainingPercent === undefined ? '—' : `${provider.observation.remainingPercent}%`}</b></article>)}</div>
    <dl className="tray-panel__summary"><div><dt>Lowest remaining</dt><dd>{lowest ? `${lowest.displayName} · ${lowest.observation?.remainingPercent}%` : 'Unavailable'}</dd></div><div><dt>Next reset</dt><dd>{nextReset ? `${nextReset.displayName} · ${formatResetCountdown(nextReset.observation?.resetAt, now)}` : 'Unavailable'}</dd></div></dl>
    <footer><button type="button" onClick={onOpenDashboard}>Open dashboard</button><button type="button" aria-label="Refresh" onClick={() => { void onRefresh(); }}><RefreshCw size={15} /></button><button type="button" aria-label="Settings" onClick={onOpenSettings}><Settings size={15} /></button><button type="button" aria-label="Exit application" onClick={onExit}>Exit</button></footer>
  </section>;
}
