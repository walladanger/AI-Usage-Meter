import { Terminal } from 'lucide-react';
import type { CodexWindowView, ProviderUsageState } from '../../usage/usageTypes';
import { formatResetCountdown } from '../../usage/usageMath';
import './codexAllowance.css';

export interface CodexAllowanceCardProps {
  providers: ProviderUsageState[];
  now: string;
}

function windowRow(window: CodexWindowView | undefined, fallbackLabel: string, now: string) {
  if (!window) return null;
  return (
    <div className="codex-allowance__window" key={window.label ?? fallbackLabel}>
      <div>
        <strong>{window.label ?? fallbackLabel}</strong>
        <span>{window.resetsAt ? formatResetCountdown(window.resetsAt, now) : 'Reset time unavailable'}</span>
      </div>
      <b data-exhausted={window.remainingPercent <= 0 ? 'yes' : undefined}>
        {Math.round(window.remainingPercent)}%
      </b>
    </div>
  );
}

/**
 * ChatGPT/Codex allowance detail.
 *
 * The dashboard already shows the binding percentage and its countdown. This adds what has
 * no equivalent elsewhere: both quota windows side by side, the plan, and — most usefully —
 * any unused rate-limit reset, since a user can be blocked while holding one.
 */
export function CodexAllowanceCard({ providers, now }: CodexAllowanceCardProps) {
  const entry = providers.find((provider) => provider.observation?.codexAllowance);
  const allowance = entry?.observation?.codexAllowance;
  if (!allowance) return null;

  return (
    <article className="feature-card feature-card--wide codex-allowance">
      <h2><Terminal size={17} /> ChatGPT / Codex allowance</h2>
      <p>
        Read from the Codex CLI on this machine, using your existing sign-in. This is the one
        source that reports how much allowance is <strong>left</strong> rather than what has
        been spent — no provider offers that over an API.
      </p>

      {allowance.rateLimitReached && allowance.resetCreditsAvailable > 0 ? (
        <p className="codex-allowance__notice" role="status">
          You have reached a limit, but <strong>{allowance.resetCreditsAvailable} unused
          rate-limit reset{allowance.resetCreditsAvailable === 1 ? '' : 's'}</strong> available
          on your account. Codex can spend one to clear the window immediately.
        </p>
      ) : null}

      <div className="codex-allowance__windows">
        {windowRow(allowance.primary, 'Primary window', now)}
        {windowRow(allowance.secondary, 'Secondary window', now)}
      </div>

      <dl className="codex-allowance__meta">
        {allowance.planType ? (
          <div><dt>Plan</dt><dd>{allowance.planType}</dd></div>
        ) : null}
        <div>
          <dt>Credits</dt>
          <dd>
            {allowance.unlimited
              ? 'Unlimited'
              : allowance.hasCredits
                ? (allowance.creditBalance ?? 'Available')
                : 'None'}
          </dd>
        </div>
        <div><dt>Resets available</dt><dd>{allowance.resetCreditsAvailable}</dd></div>
        {allowance.cliVersion ? (
          <div><dt>Source</dt><dd>{allowance.cliVersion}</dd></div>
        ) : null}
      </dl>
    </article>
  );
}
