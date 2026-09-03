import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fixtureHistory, fixtureNow, fixtureProviders } from '../../usage/fixtureUsage';
import { Dashboard } from './Dashboard';

vi.mock('echarts-for-react/lib/core', () => ({
  default: () => <div data-testid="usage-trend-chart-canvas" />,
}));

test('renders all provider allowances and opens the seven-day chart externally', async () => {
  const user = userEvent.setup();
  const onRefresh = vi.fn();
  const onPopOutChart = vi.fn();

  render(
    <Dashboard
      providers={fixtureProviders}
      history={fixtureHistory}
      now={fixtureNow}
      onRefresh={onRefresh}
      onPopOutChart={onPopOutChart}
    />,
  );

  expect(screen.getByRole('heading', { name: 'Command Center' })).toBeInTheDocument();
  expect(screen.getByText('ChatGPT / Codex')).toBeInTheDocument();
  expect(screen.getByText('Claude / Claude Code')).toBeInTheDocument();
  expect(screen.getByText('Gemini')).toBeInTheDocument();
  expect(screen.getByText('72%')).toBeInTheDocument();
  expect(screen.getByText('38%')).toBeInTheDocument();
  expect(screen.getByText('84%')).toBeInTheDocument();
  expect(screen.getByText('2h 14m')).toBeInTheDocument();
  expect(screen.getByText('47m')).toBeInTheDocument();
  expect(screen.getByText('11h 28m')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Refresh all providers' }));
  expect(onRefresh).toHaveBeenCalledOnce();

  await user.click(screen.getByRole('button', { name: 'Open seven-day usage in a new window' }));
  expect(onPopOutChart).toHaveBeenCalledOnce();
});

test('does not present fixture observations as live provider data', () => {
  render(
    <Dashboard
      providers={fixtureProviders}
      history={fixtureHistory}
      now={fixtureNow}
      onRefresh={vi.fn()}
      onPopOutChart={vi.fn()}
    />,
  );

  expect(screen.getByText('Preview data')).toBeInTheDocument();
  expect(screen.queryByText('Provider-reported via browser connector')).not.toBeInTheDocument();
});
