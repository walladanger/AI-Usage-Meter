import { render, screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import userEvent from '@testing-library/user-event';
import { SettingsProvider } from '../settings/settingsStore';
import { createMemorySettingsAdapter, createSettingsService, defaultSettings } from '../settings/settingsService';

test('renders the full-height navigation and custom title-bar actions', () => {
  render(<AppShell />);

  expect(screen.getByRole('navigation')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /minimize/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /maximize/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
});

test('uses generic settings for the initial and updated navigation collapse state', async () => {
  const user = userEvent.setup();
  const service = createSettingsService(createMemorySettingsAdapter());
  render(
    <SettingsProvider service={service} initialSettings={{ ...defaultSettings, navigationCollapsed: true }}>
      <AppShell />
    </SettingsProvider>,
  );

  expect(screen.getByRole('navigation')).toHaveAttribute('data-collapsed', 'true');
  await user.click(screen.getByRole('button', { name: /expand navigation/i }));
  await expect(service.load()).resolves.toMatchObject({ navigationCollapsed: false });
});

test('renders content for the selected navigation route', async () => {
  const user = userEvent.setup();
  render(<AppShell renderRoute={(route) => <h1>{route} content</h1>} />);

  expect(screen.getByRole('heading', { name: 'overview content' })).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'History' }));
  expect(screen.getByRole('heading', { name: 'history content' })).toBeInTheDocument();
});

test('honors an external navigation request', () => {
  const view = render(<AppShell requestedRoute="overview" renderRoute={(route) => <h1>{route} content</h1>} />);
  view.rerender(<AppShell requestedRoute="settings" renderRoute={(route) => <h1>{route} content</h1>} />);
  expect(screen.getByRole('heading', { name: 'settings content' })).toBeInTheDocument();
});
