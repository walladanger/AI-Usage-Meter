import { BellRing, ShieldCheck } from 'lucide-react';
import type { ProviderUsageState } from '../../usage/usageTypes';
import '../shared/featurePages.css';

export interface AlertsPageProps { providers: ProviderUsageState[]; }

export function AlertsPage({ providers }: AlertsPageProps) {
  const lowProviders = providers.filter((provider) => (provider.observation?.remainingPercent ?? 101) <= 25);

  return <section className="feature-page" aria-labelledby="alerts-page-title">
    <header className="feature-page__hero"><span className="feature-page__eyebrow">Local evaluation</span><h1 id="alerts-page-title">Alerts</h1><p>Threshold and reset events are evaluated independently for each allowance window.</p></header>
    <div className="feature-page__grid">
      <article className="feature-card"><h2><BellRing size={17} /> Active alerts</h2>{lowProviders.length ? <ul className="feature-list">{lowProviders.map((provider) => <li key={provider.providerId}><strong>{provider.displayName}</strong><span>{provider.observation?.remainingPercent}% remaining</span></li>)}</ul> : <div className="feature-empty"><ShieldCheck size={24} /><strong>No active alerts</strong><span>Nothing currently needs your attention.</span></div>}</article>
      <article className="feature-card"><h2>Default thresholds</h2><p>Notifications are off by default. When enabled, alerts can fire at these remaining levels.</p><div className="feature-chips">{[50, 25, 10, 5, 0].map((threshold) => <span key={threshold}>{threshold === 0 ? 'Exhausted' : `${threshold}%`}</span>)}</div></article>
    </div>
  </section>;
}
