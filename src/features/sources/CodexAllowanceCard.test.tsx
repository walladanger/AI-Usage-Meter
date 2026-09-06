import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { CodexAllowanceCard } from './CodexAllowanceCard';
import type { CodexAllowanceDetail, ProviderUsageState } from '../../usage/usageTypes';

const NOW = '2026-09-05T16:00:00Z';

function provider(overrides: Partial<CodexAllowanceDetail> = {}): ProviderUsageState {
  const codexAllowance: CodexAllowanceDetail = {
    planType: 'plus',
    primary: { usedPercent: 100, remainingPercent: 0, windowMinutes: 300, resetsAt: '2026-09-05T17:38:50Z', label: '5-hour window' },
    secondary: { usedPercent: 34, remainingPercent: 66, windowMinutes: 10080, resetsAt: '2026-09-11T14:46:04Z', label: 'weekly window' },
    creditBalance: '0',
    hasCredits: false,
    unlimited: false,
    rateLimitReached: true,
    resetCreditsAvailable: 1,
    cliVersion: 'codex-cli 0.148.0-alpha.9',
    source: 'codex_cli',
    ...overrides,
  };
  return {
    providerId: 'openai',
    displayName: 'ChatGPT / Codex',
    status: 'connected',
    observation: {
      providerId: 'openai',
      observedAt: NOW,
      sourceType: 'cli',
      confidence: 'reported',
      remainingPercent: 0,
      codexAllowance,
    },
  };
}

test('renders nothing when no provider reports Codex allowance', () => {
  const { container } = render(<CodexAllowanceCard providers={[]} now={NOW} />);
  expect(container).toBeEmptyDOMElement();
});

test('shows both quota windows with their remaining percentages', () => {
  render(<CodexAllowanceCard providers={[provider()]} now={NOW} />);

  expect(screen.getByText('5-hour window')).toBeInTheDocument();
  expect(screen.getByText('weekly window')).toBeInTheDocument();
  expect(screen.getByText('0%')).toBeInTheDocument();
  expect(screen.getByText('66%')).toBeInTheDocument();
});

test('surfaces an unused reset when the user is actually blocked', () => {
  render(<CodexAllowanceCard providers={[provider()]} now={NOW} />);

  // The point of this notice: being blocked while holding an unused reset is easy to miss.
  expect(screen.getByText(/1 unused\s+rate-limit reset/)).toBeInTheDocument();
});

test('the reset notice is hidden when nothing is blocked', () => {
  render(<CodexAllowanceCard providers={[provider({ rateLimitReached: false })]} now={NOW} />);

  expect(screen.queryByText(/unused\s+rate-limit reset/)).toBeNull();
});

test('the reset notice is hidden when no reset is available to spend', () => {
  render(<CodexAllowanceCard providers={[provider({ resetCreditsAvailable: 0 })]} now={NOW} />);

  expect(screen.queryByText(/unused\s+rate-limit reset/)).toBeNull();
});

test('reports credits as None rather than implying a balance exists', () => {
  render(<CodexAllowanceCard providers={[provider()]} now={NOW} />);
  expect(screen.getByText('None')).toBeInTheDocument();
});

test('an unlimited plan is labelled as such', () => {
  render(<CodexAllowanceCard providers={[provider({ unlimited: true })]} now={NOW} />);
  expect(screen.getByText('Unlimited')).toBeInTheDocument();
});

test('a window with no reset time says so instead of showing a bogus countdown', () => {
  render(<CodexAllowanceCard providers={[provider({
    primary: { usedPercent: 10, remainingPercent: 90, label: 'primary window' },
    secondary: undefined,
  })]} now={NOW} />);

  expect(screen.getByText('Reset time unavailable')).toBeInTheDocument();
});

test('names the CLI version so a figure can be traced to its source', () => {
  render(<CodexAllowanceCard providers={[provider()]} now={NOW} />);
  expect(screen.getByText('codex-cli 0.148.0-alpha.9')).toBeInTheDocument();
});
