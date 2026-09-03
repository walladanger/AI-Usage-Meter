import { RefreshCw } from 'lucide-react';
import type { ProviderUsageState } from '../../usage/usageTypes';
import '../shared/featurePages.css';

export function RefreshPage({ providers, onRefresh }: { providers: ProviderUsageState[]; onRefresh(): Promise<void> }) {
  return <section className="feature-page" aria-labelledby="refresh-page-title"><header className="feature-page__hero"><span className="feature-page__eyebrow">Independent polling</span><h1 id="refresh-page-title">Refresh sources</h1><p>Each provider refresh settles independently. Failed refreshes preserve the last successful observation.</p></header><article className="feature-card"><div className="source-list">{providers.map((provider) => <div className="source-card" key={provider.providerId}><div><strong>{provider.displayName}</strong><span>{provider.observation ? `Last observation ${new Date(provider.observation.observedAt).toLocaleString()}` : 'No observation yet'}</span></div><span className="source-card__status">{provider.status.replace(/_/g, ' ')}</span></div>)}</div><button type="button" className="feature-button feature-form-action" onClick={() => { void onRefresh(); }}><RefreshCw size={16} />Refresh all providers</button></article></section>;
}
