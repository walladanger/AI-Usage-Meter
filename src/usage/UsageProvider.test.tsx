import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { UsageController, UsageProvider, useUsage } from './usageStore';

function UsageReadout() {
  const { providers } = useUsage();
  return <span>{providers[0]?.observation?.remainingPercent ?? 'none'}</span>;
}

describe('UsageProvider', () => {
  test('publishes controller updates to React consumers', () => {
    const controller = new UsageController([
      { providerId: 'openai', displayName: 'ChatGPT / Codex', status: 'no_data' },
    ], []);

    const view = render(<UsageProvider controller={controller}><UsageReadout /></UsageProvider>);
    expect(screen.getByText('none')).toBeInTheDocument();

    controller.setManualObservation({
      providerId: 'openai', remainingPercent: 63, usedPercent: 37, observedAt: '2026-09-03T12:00:00.000Z', sourceType: 'manual', confidence: 'manual',
    });
    view.rerender(<UsageProvider controller={controller}><UsageReadout /></UsageProvider>);

    expect(screen.getByText('63')).toBeInTheDocument();
  });
});
