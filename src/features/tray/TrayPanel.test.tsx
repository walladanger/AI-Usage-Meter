import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { fixtureNow, fixtureProviders } from '../../usage/fixtureUsage';
import { TrayPanel } from './TrayPanel';

describe('TrayPanel', () => {
  test('shows compact provider values and exposes utility actions', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<TrayPanel providers={fixtureProviders} now={fixtureNow} onOpenDashboard={() => undefined} onOpenSettings={() => undefined} onRefresh={refresh} onClosePanel={() => undefined} onExit={() => undefined} />);

    expect(screen.getByText('Claude / Claude Code')).toBeInTheDocument();
    expect(screen.getByText('38%')).toBeInTheDocument();
    expect(screen.getByText('47m')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.getByRole('button', { name: 'Exit application' })).toBeInTheDocument();
  });
});
