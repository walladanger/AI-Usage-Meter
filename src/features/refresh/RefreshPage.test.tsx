import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fixtureProviders } from '../../usage/fixtureUsage';
import { RefreshPage } from './RefreshPage';

test('shows why refresh has no updates when automatic sources are unavailable', async () => {
  const user = userEvent.setup();
  render(
    <RefreshPage
      providers={fixtureProviders}
      onRefresh={vi.fn().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0 })}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Refresh all providers' }));

  expect(screen.getByRole('status')).toHaveTextContent(
    'No automatic source is available in this build. Use Sources to enter a manual value.',
  );
});
