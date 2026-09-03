import { Bell, ExternalLink, RefreshCw } from 'lucide-react';
import type { ProviderUsageState, UsageHistoryPoint } from '../../usage/usageTypes';
import { ProviderPanel } from './ProviderPanel';
import { UsageTrendChart } from './UsageTrendChart';
import './dashboard.css';

export interface DashboardProps {
  providers: ProviderUsageState[];
  history: UsageHistoryPoint[];
  now: string;
  onRefresh: () => void;
  onPopOutChart: () => void;
}

export function Dashboard({ providers, history, now, onRefresh, onPopOutChart }: DashboardProps) {
  const hasFixtureData = providers.some((provider) => provider.isFixture);
  const observationTimes = providers
    .map((provider) => provider.observation?.observedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const latest = observationTimes[observationTimes.length - 1];

  return (
    <section className="dashboard" aria-labelledby="dashboard-title">
      <header className="dashboard__header">
        <div>
          <h1 id="dashboard-title">Command Center</h1>
          <p>Local-first AI usage tracking and allowance monitor</p>
        </div>
        <div className="dashboard__actions">
          {hasFixtureData ? <span className="dashboard__preview-badge">Preview data</span> : null}
          <span className="dashboard__last-refresh"><RefreshCw aria-hidden="true" size={16} />Last refreshed: {latest ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', timeZone: 'UTC' }).format(new Date(latest)) : 'Never'}</span>
          <button type="button" className="dashboard__button" onClick={onRefresh} aria-label="Refresh all providers"><RefreshCw aria-hidden="true" size={17} />Refresh now</button>
          <button type="button" className="dashboard__icon-button" aria-label="Notifications"><Bell aria-hidden="true" size={19} /></button>
        </div>
      </header>

      <div className="dashboard__providers">
        {providers.map((provider) => <ProviderPanel key={provider.providerId} provider={provider} now={now} />)}
      </div>

      <section className="usage-trend" aria-labelledby="usage-trend-title">
        <header className="usage-trend__header">
          <div>
            <h2 id="usage-trend-title">7-day usage trend</h2>
            <span>% of allowance used per day</span>
          </div>
          <button type="button" className="dashboard__icon-button" onClick={onPopOutChart} aria-label="Open seven-day usage in a new window"><ExternalLink aria-hidden="true" size={18} /></button>
        </header>
        <UsageTrendChart history={history} />
      </section>
    </section>
  );
}
