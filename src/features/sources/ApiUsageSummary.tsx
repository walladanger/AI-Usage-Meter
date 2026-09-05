import { Plug } from 'lucide-react';
import type { ProviderUsageState } from '../../usage/usageTypes';
import './apiUsageSummary.css';

export interface ApiUsageSummaryProps {
  providers: ProviderUsageState[];
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  openai_usage_api: 'OpenAI Usage + Costs API',
  anthropic_admin_api: 'Anthropic Usage + Cost Admin API',
};

function count(value: number): string {
  return value.toLocaleString();
}

function money(value: number): string {
  return value.toLocaleString(undefined, { style: 'currency', currency: 'USD' });
}

function windowLabel(start: string, end: string): string {
  const from = new Date(start);
  const to = new Date(end);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 'Reporting window unavailable';
  return `${from.toLocaleDateString()} – ${to.toLocaleDateString()}`;
}

/**
 * Shows what the API connectors actually returned.
 *
 * This exists so a configured key can be verified end to end. It deliberately reports spend
 * rather than an allowance: no provider exposes subscription allowance through an API, so
 * there is no remaining-percentage to show here.
 */
export function ApiUsageSummary({ providers }: ApiUsageSummaryProps) {
  const connected = providers.filter((provider) => provider.observation?.apiUsage);
  if (connected.length === 0) return null;

  return (
    <article className="feature-card feature-card--wide api-usage">
      <h2><Plug size={17} /> API usage reported by providers</h2>
      <p>
        Figures come straight from each provider&apos;s usage and cost endpoints. They describe
        API spend, not subscription allowance — no provider publishes an allowance API.
      </p>

      <div className="api-usage__list">
        {connected.map((provider) => {
          const usage = provider.observation?.apiUsage;
          if (!usage) return null;
          return (
            <section className="api-usage__item" key={provider.providerId}>
              <header className="api-usage__header">
                <strong>{provider.displayName}</strong>
                <span>{windowLabel(usage.windowStart, usage.windowEnd)}</span>
              </header>

              <dl className="api-usage__metrics">
                <div><dt>Input tokens</dt><dd>{count(usage.inputTokens)}</dd></div>
                <div><dt>Output tokens</dt><dd>{count(usage.outputTokens)}</dd></div>
                <div><dt>Cached input</dt><dd>{count(usage.cachedInputTokens)}</dd></div>
                <div><dt>Total tokens</dt><dd>{count(usage.totalTokens)}</dd></div>
                {usage.requests > 0 ? (
                  <div><dt>Requests</dt><dd>{count(usage.requests)}</dd></div>
                ) : null}
                <div>
                  <dt>Cost</dt>
                  <dd>
                    {usage.costUsd === undefined
                      ? 'Unavailable'
                      : usage.costUnitUnverified
                        ? `${money(usage.costUsd)} (unit unconfirmed)`
                        : money(usage.costUsd)}
                  </dd>
                </div>
              </dl>

              <p className="api-usage__source">
                Source: {SOURCE_LABELS[usage.source] ?? usage.source}
                {usage.costUnitUnverified
                  ? ' · This provider documents its cost unit ambiguously; the amount is not yet confirmed against a real account.'
                  : ''}
              </p>
            </section>
          );
        })}
      </div>
    </article>
  );
}
