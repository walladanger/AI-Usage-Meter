import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { fixtureProviders } from '../../usage/fixtureUsage';
import { SourcesPage } from './SourcesPage';

describe('SourcesPage', () => {
  test('does not interpret an empty manual percentage as exhausted', async () => {
    const user = userEvent.setup();
    const save = vi.fn().mockResolvedValue(undefined);
    render(<SourcesPage providers={fixtureProviders} onOpenSetup={() => undefined} onManualObservation={save} />);

    await user.click(screen.getByRole('button', { name: 'Save manual value' }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('remainingPercent');
  });
});
