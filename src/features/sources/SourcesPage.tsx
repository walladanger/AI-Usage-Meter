import { Puzzle, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import { ManualUsageAdapter } from '../../usage/manualUsageAdapter';
import type { ProviderId, ProviderUsageState, UsageObservation } from '../../usage/usageTypes';
import '../shared/featurePages.css';
import { ApiUsageSummary } from './ApiUsageSummary';
import { CodexAllowanceCard } from './CodexAllowanceCard';

export interface SourcesPageProps {
  providers: ProviderUsageState[];
  onOpenSetup(): void;
  onManualObservation(observation: UsageObservation): Promise<void>;
}

export function SourcesPage({ providers, onOpenSetup, onManualObservation }: SourcesPageProps) {
  const [providerId, setProviderId] = useState<ProviderId>('openai');
  const [remaining, setRemaining] = useState('');
  const [resetAt, setResetAt] = useState('');
  const [message, setMessage] = useState<string | null>(null);

  const saveManual = async () => {
    try {
      const observation = new ManualUsageAdapter(providerId).normalize({
        remainingPercent: remaining.trim() ? Number(remaining) : Number.NaN, observedAt: new Date().toISOString(),
        ...(resetAt ? { resetAt: new Date(resetAt).toISOString() } : { resetUnavailable: true }),
      });
      await onManualObservation(observation);
      setMessage('Manual observation saved locally.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Manual observation could not be saved.');
    }
  };

  return <section className="feature-page" aria-labelledby="sources-page-title">
    <header className="feature-page__hero"><span className="feature-page__eyebrow">Provider sources</span><h1 id="sources-page-title">Sources</h1><p>ChatGPT/Codex allowance is read from the Codex CLI on this machine. OpenAI and Anthropic API spend needs a key in Settings &rsaquo; Providers. Gemini, and Claude allowance, use manual entry.</p></header>
    <div className="source-list">{providers.map((provider) => <article className="feature-card source-card" key={provider.providerId}><div><strong>{provider.displayName}</strong><span>{provider.observation?.sourceType === 'cli' ? 'Codex CLI' : provider.observation?.sourceType === 'api' ? 'API connector' : provider.observation?.sourceType === 'manual' ? 'Manual entry' : provider.observation?.sourceType === 'browser_extension' ? 'Browser companion' : 'Not configured'}</span></div><span className="source-card__status" data-status={provider.status}>{provider.isFixture ? 'Preview' : provider.status.replace(/_/g, ' ')}</span>{provider.lastError ? <span className="source-card__error" role="alert">{provider.lastError}</span> : null}</article>)}</div>
    <div className="feature-page__grid">
      <CodexAllowanceCard providers={providers} now={new Date().toISOString()} />
      <ApiUsageSummary providers={providers} />
      <article className="feature-card"><h2><Puzzle size={17} /> Guided setup</h2><p>Set up Manual Entry for a provider. Browser companion support is not installed yet.</p><button type="button" className="feature-button" onClick={onOpenSetup}>Open guided setup</button></article>
      <article className="feature-card"><h2><SlidersHorizontal size={17} /> Manual observation</h2><p>No supported source yet? Enter a remaining percentage and optional reset time without sharing account credentials.</p><div className="feature-form-row"><label className="feature-field">Provider<select value={providerId} onChange={(event) => setProviderId(event.target.value as ProviderId)}><option value="openai">ChatGPT / Codex</option><option value="anthropic">Claude / Claude Code</option><option value="google">Gemini</option></select></label><label className="feature-field">Remaining %<input type="number" min="0" max="100" value={remaining} onChange={(event) => setRemaining(event.target.value)} /></label></div><label className="feature-field">Reset time (optional)<input type="datetime-local" value={resetAt} onChange={(event) => setResetAt(event.target.value)} /></label><button type="button" className="feature-button feature-form-action" onClick={() => { void saveManual(); }}>Save manual value</button>{message ? <p className="feature-form-message" role="status">{message}</p> : null}</article>
    </div>
  </section>;
}
