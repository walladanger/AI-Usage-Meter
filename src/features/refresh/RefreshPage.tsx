import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import type { RefreshSummary } from '../../usage/usageStore';
import type { ProviderUsageState } from '../../usage/usageTypes';
import { refreshSummaryMessage } from './refreshFeedback';
import '../shared/featurePages.css';

export function RefreshPage({ providers, onRefresh }: { providers: ProviderUsageState[]; onRefresh(): Promise<RefreshSummary> }) {
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>();
  const refresh = async () => {
    setRefreshing(true);
    setMessage(undefined);
    try { setMessage(refreshSummaryMessage(await onRefresh())); }
    catch { setMessage('Refresh could not be completed. Existing values were preserved.'); }
    finally { setRefreshing(false); }
  };
  return <section className="feature-page" aria-labelledby="refresh-page-title"><header className="feature-page__hero"><span className="feature-page__eyebrow">Independent polling</span><h1 id="refresh-page-title">Refresh sources</h1><p>Each provider refresh settles independently. Failed refreshes preserve the last successful observation.</p></header><article className="feature-card"><div className="source-list">{providers.map((provider) => <div className="source-card" key={provider.providerId}><div><strong>{provider.displayName}</strong><span>{provider.observation ? `Last observation ${new Date(provider.observation.observedAt).toLocaleString()}` : 'No observation yet'}</span></div><span className="source-card__status">{provider.status.replace(/_/g, ' ')}</span></div>)}</div><button type="button" className="feature-button feature-form-action" disabled={refreshing} onClick={() => { void refresh(); }}><RefreshCw size={16} />{refreshing ? 'Refreshing…' : 'Refresh all providers'}</button>{message ? <p className="feature-form-message" role="status">{message}</p> : null}</article></section>;
}
