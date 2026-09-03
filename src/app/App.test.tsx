import { render, screen } from '@testing-library/react';
import { UsageController } from '../usage/usageStore';
import { App } from './App';

test('renders the AI Usage Meter application root', () => {
  render(<App />);
  expect(screen.getByText('AI Usage Meter')).toBeInTheDocument();
});

test('renders dashboard values from the provided usage controller', () => {
  const controller = new UsageController([
    {
      providerId: 'openai', displayName: 'ChatGPT / Codex', status: 'connected',
      observation: { providerId: 'openai', remainingPercent: 63, usedPercent: 37, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'manual', confidence: 'manual' },
    },
  ], []);

  render(<App usageController={controller} />);

  expect(screen.getByText('63%')).toBeInTheDocument();
  expect(screen.queryByText('Preview data')).not.toBeInTheDocument();
});
