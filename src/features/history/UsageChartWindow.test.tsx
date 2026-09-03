import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { UsageHistoryPoint } from '../../usage/usageTypes';
import { UsageChartWindow } from './UsageChartWindow';

vi.mock('../dashboard/UsageTrendChart', () => ({ UsageTrendChart: () => <div data-testid="usage-chart" /> }));

describe('UsageChartWindow', () => {
  test('renders the seven-day chart as a focused standalone surface', () => {
    const history: UsageHistoryPoint[] = [{ observedAt: '2026-09-03T12:00:00.000Z', openai: 37 }];

    render(<UsageChartWindow history={history} />);

    expect(screen.getByRole('heading', { name: 'Seven-day usage trend' })).toBeInTheDocument();
    expect(screen.getByTestId('usage-chart')).toBeInTheDocument();
  });
});
