import { useState } from 'react';
import type { UsageHistoryPoint } from '../../usage/usageTypes';
import { UsageTrendChart } from '../dashboard/UsageTrendChart';
import '../shared/featurePages.css';

export interface HistoryPageProps { history: UsageHistoryPoint[]; isPreview?: boolean; }

export function HistoryPage({ history, isPreview = false }: HistoryPageProps) {
  const [range, setRange] = useState('7 days');
  return <section className="feature-page" aria-labelledby="history-page-title">
    <header className="feature-page__hero"><span className="feature-page__eyebrow">Local snapshots</span><h1 id="history-page-title">Usage history</h1><p>Compare allowance consumption across providers. Reported and estimated values remain distinguishable at the observation level.</p></header>
    <article className="feature-card feature-chart-card">
      <header className="feature-card__toolbar"><div><h2>Allowance used</h2>{isPreview ? <span className="dashboard__preview-badge">Preview data</span> : null}</div><div className="feature-segmented" aria-label="History range">{['Today', '7 days', '30 days', '90 days', 'All'].map((option) => <button type="button" key={option} aria-pressed={range === option} onClick={() => setRange(option)}>{option}</button>)}</div></header>
      <UsageTrendChart history={history} />
    </article>
  </section>;
}
