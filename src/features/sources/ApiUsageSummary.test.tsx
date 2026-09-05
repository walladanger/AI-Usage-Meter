import { render, screen, within } from '@testing-library/react';
import { expect, test } from 'vitest';
import { ApiUsageSummary } from './ApiUsageSummary';
import type { ApiUsageMetrics, ProviderUsageState } from '../../usage/usageTypes';

function provider(overrides: Partial<ApiUsageMetrics> = {}, providerId: 'openai' | 'anthropic' = 'openai'): ProviderUsageState {
  const apiUsage: ApiUsageMetrics = {
    windowStart: '2026-08-06T00:00:00Z',
    windowEnd: '2026-09-05T00:00:00Z',
    inputTokens: 1_250_000,
    outputTokens: 310_000,
    cachedInputTokens: 40_000,
    totalTokens: 1_560_000,
    requests: 4820,
    costUsd: 6.72,
    costUnitUnverified: false,
    daily: [],
    source: 'openai_usage_api',
    ...overrides,
  };
  return {
    providerId,
    displayName: providerId === 'openai' ? 'ChatGPT / Codex' : 'Claude / Claude Code',
    status: 'connected',
    observation: {
      providerId,
      observedAt: '2026-09-05T12:00:00Z',
      sourceType: 'api',
      confidence: 'reported',
      apiUsage,
    },
  };
}

test('renders nothing when no provider has API usage', () => {
  const { container } = render(<ApiUsageSummary providers={[]} />);
  expect(container).toBeEmptyDOMElement();
});

test('shows token totals, requests, and cost for a connected provider', () => {
  render(<ApiUsageSummary providers={[provider()]} />);

  expect(screen.getByText('1,250,000')).toBeInTheDocument();
  expect(screen.getByText('310,000')).toBeInTheDocument();
  expect(screen.getByText('1,560,000')).toBeInTheDocument();
  expect(screen.getByText('4,820')).toBeInTheDocument();
  expect(screen.getByText('$6.72')).toBeInTheDocument();
});

test('names the data source so a figure can be traced back', () => {
  render(<ApiUsageSummary providers={[provider()]} />);

  expect(screen.getByText(/OpenAI Usage \+ Costs API/)).toBeInTheDocument();
});

test('an unconfirmed cost unit is marked rather than shown as a settled amount', () => {
  render(<ApiUsageSummary providers={[
    provider({ costUsd: 12.72, costUnitUnverified: true, source: 'anthropic_admin_api' }, 'anthropic'),
  ]} />);

  expect(screen.getByText(/\(unit unconfirmed\)/)).toBeInTheDocument();
  expect(screen.getByText(/not yet confirmed against a real account/)).toBeInTheDocument();
});

test('a missing cost reads as unavailable rather than zero', () => {
  const base = provider();
  const { costUsd: _omitted, ...withoutCost } = base.observation!.apiUsage!;
  const target: ProviderUsageState = {
    ...base,
    observation: { ...base.observation!, apiUsage: withoutCost },
  };

  render(<ApiUsageSummary providers={[target]} />);

  expect(screen.getByText('Unavailable')).toBeInTheDocument();
});

test('states that these figures are spend, not allowance', () => {
  render(<ApiUsageSummary providers={[provider()]} />);

  expect(screen.getByText(/API spend, not subscription allowance/)).toBeInTheDocument();
});

test('requests are omitted when the provider does not report them', () => {
  render(<ApiUsageSummary providers={[
    provider({ requests: 0, source: 'anthropic_admin_api' }, 'anthropic'),
  ]} />);

  const item = screen.getByText('Claude / Claude Code').closest('section');
  expect(item).not.toBeNull();
  expect(within(item as HTMLElement).queryByText('Requests')).toBeNull();
});
