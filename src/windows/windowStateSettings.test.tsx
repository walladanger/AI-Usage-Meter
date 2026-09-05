import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { vi } from 'vitest';
import { SettingsProvider, useSettings } from '../settings/settingsStore';
import { useNativeWindowStateLifecycle, useWindowStateSettings } from './windowState';
import { createMemorySettingsAdapter, createSettingsService, defaultSettings } from '../settings/settingsService';

function InvalidStateSaveProbe() {
  const { save } = useWindowStateSettings('main');
  const [result, setResult] = useState('idle');
  const saveInvalid = async () => {
    try {
      await save({ bounds: { x: 0, y: 0, width: 0, height: 100 }, maximized: false });
      setResult('accepted');
    } catch { setResult('rejected'); }
  };
  return <><button type="button" onClick={() => void saveInvalid()}>Save invalid state</button><output>{result}</output></>;
}

test('settings hook rejects invalid state instead of persisting raw bounds', async () => {
  const user = userEvent.setup();
  render(<SettingsProvider><InvalidStateSaveProbe /></SettingsProvider>);

  await user.click(screen.getByRole('button', { name: 'Save invalid state' }));
  expect(await screen.findByText('rejected')).toBeInTheDocument();
});

function LifecycleProbe() {
  useNativeWindowStateLifecycle('main', {
    capture: async () => ({ bounds: { x: -840, y: 30, width: 840, height: 560 }, maximized: false }),
    restore: async () => undefined,
  });
  return null;
}

test('persists captured native state during lifecycle cleanup', async () => {
  const service = createSettingsService(createMemorySettingsAdapter());
  const { unmount } = render(<SettingsProvider service={service} initialSettings={defaultSettings}><LifecycleProbe /></SettingsProvider>);

  unmount();

  await vi.waitFor(async () => expect((await service.load()).extensionSettings).toEqual({
    nativeWindowStates: { main: { version: 1, bounds: { x: -840, y: 30, width: 840, height: 560 }, maximized: false } },
  }));
});

function CountingProbe() {
  useNativeWindowStateLifecycle('main', {
    capture: async () => ({ bounds: { x: 10, y: 20, width: 840, height: 560 }, maximized: false }),
    restore: async () => undefined,
  });
  const { settings, update } = useSettings();
  return (
    <button type="button" onClick={() => void update({ navigationCollapsed: !settings.navigationCollapsed })}>
      Toggle navigation
    </button>
  );
}

// Regression: 0.1.6 re-ran the lifecycle effect whenever `save` changed identity, and
// its cleanup called persist() -> save() -> new identity -> cleanup, writing settings
// ~148x/second until the app was killed. One user-initiated change must cause one write.
test('a settings change does not trigger a window-state save feedback loop', async () => {
  const user = userEvent.setup();
  let writes = 0;
  const service = createSettingsService({
    async read() { return null; },
    async write() { writes += 1; },
    async clear() { /* nothing persisted in this probe */ },
  });

  render(
    <SettingsProvider service={service} initialSettings={defaultSettings}>
      <CountingProbe />
    </SettingsProvider>,
  );

  await user.click(screen.getByRole('button', { name: 'Toggle navigation' }));
  await new Promise((resolve) => setTimeout(resolve, 250));

  expect(writes).toBe(1);
});
