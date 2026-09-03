import { Clock3, PlugZap } from 'lucide-react';
import { SiAnthropic, SiGooglegemini } from 'react-icons/si';
import { TbBrandOpenai } from 'react-icons/tb';
import type { IconType } from 'react-icons';
import { formatResetCountdown } from '../../usage/usageMath';
import type { ProviderId, ProviderUsageState } from '../../usage/usageTypes';

const providerIcons: Record<ProviderId, IconType> = {
  openai: TbBrandOpenai,
  anthropic: SiAnthropic,
  google: SiGooglegemini,
};

export interface ProviderPanelProps {
  provider: ProviderUsageState;
  now: string;
}

export function ProviderPanel({ provider, now }: ProviderPanelProps) {
  const observation = provider.observation;
  const percent = observation?.remainingPercent;
  const Icon = providerIcons[provider.providerId];
  const sourceLabel = provider.isFixture
    ? 'Browser connector sample'
    : observation?.sourceType === 'browser_extension'
      ? 'Browser connector'
      : observation?.sourceType === 'cli'
        ? 'Local CLI'
        : observation?.sourceType === 'manual'
          ? 'Manual entry'
          : 'No source';

  return (
    <article className="provider-panel" data-provider={provider.providerId}>
      <header className="provider-panel__header">
        <span className="provider-panel__icon" aria-hidden="true"><Icon /></span>
        <span className="provider-panel__identity">
          <strong>{provider.displayName}</strong>
          <small>{sourceLabel}</small>
        </span>
        <span className="provider-panel__status" data-status={provider.status}>
          {provider.isFixture ? 'Preview' : provider.status === 'connected' ? 'Online' : provider.status.replace(/_/g, ' ')}
        </span>
      </header>

      <div className="provider-panel__metrics">
        <div>
          <span className="provider-panel__label">Remaining allowance</span>
          <strong className="provider-panel__percent">{percent === undefined ? '—' : `${percent}%`}</strong>
        </div>
        <div>
          <span className="provider-panel__label">Reset in</span>
          <span className="provider-panel__reset"><Clock3 aria-hidden="true" size={18} />{formatResetCountdown(observation?.resetAt, now)}</span>
        </div>
      </div>

      <progress className="provider-panel__progress" max="100" value={percent ?? 0} aria-label={`${provider.displayName} remaining allowance`} />
      <div className="provider-panel__scale"><span>{percent ?? 0}% remaining</span><span>100% allowance</span></div>

      <footer className="provider-panel__footer">
        <div>
          <span className="provider-panel__label">Data source</span>
          <span className="provider-panel__source"><PlugZap aria-hidden="true" size={16} />{sourceLabel}</span>
        </div>
        <div>
          <span className="provider-panel__label">Last refreshed</span>
          <time dateTime={observation?.observedAt}>{observation ? new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(new Date(observation.observedAt)) : 'Never'}</time>
          <small>{observation ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(observation.observedAt)) : 'No observations'}</small>
        </div>
      </footer>
    </article>
  );
}
