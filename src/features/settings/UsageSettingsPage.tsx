import { useState } from 'react';
import { ColorProfilePopover } from '../../design-system/ColorProfilePopover';
import { useTheme } from '../../design-system/themeStore';
import { useSettings } from '../../settings/settingsStore';
import { createRuntimeStartupService } from '../../settings/startupService';
import '../shared/featurePages.css';

export function UsageSettingsPage() {
  const { settings, update } = useSettings();
  const { selection, setSelection } = useTheme();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const usage = settings.usage;
  const setLaunchOnStartup = async (enabled: boolean) => {
    setStartupError(null);
    try {
      await createRuntimeStartupService().setEnabled(enabled);
      await update({ usage: { ...usage, launchOnStartup: enabled } });
    } catch {
      setStartupError('Windows startup registration could not be changed. Other settings are unaffected.');
    }
  };

  return <section className="feature-page" aria-labelledby="settings-page-title">
    <header className="feature-page__hero"><span className="feature-page__eyebrow">Preferences</span><h1 id="settings-page-title">Settings</h1><p>Choose refresh, notifications, tray behavior, retention, and appearance. Credentials are never stored here.</p></header>
    <div className="feature-page__grid">
      <article className="feature-card"><h2>Refresh and history</h2><label className="feature-field">Refresh interval<select value={usage.refreshMinutes} onChange={(event) => { void update({ usage: { ...usage, refreshMinutes: Number(event.target.value) as typeof usage.refreshMinutes } }); }}><option value={1}>Every minute</option><option value={5}>Every 5 minutes</option><option value={10}>Every 10 minutes</option><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option><option value={0}>Manual only</option></select></label><label className="feature-field">History retention<select value={usage.retentionDays} onChange={(event) => { void update({ usage: { ...usage, retentionDays: Number(event.target.value) } }); }}><option value={30}>30 days</option><option value={90}>90 days</option><option value={365}>1 year</option></select></label></article>
      <article className="feature-card"><h2>Notifications and tray</h2><label className="feature-toggle"><span><strong>Windows notifications</strong><small>Off by default; uses your selected thresholds.</small></span><input type="checkbox" checked={usage.notificationsEnabled} onChange={(event) => { void update({ usage: { ...usage, notificationsEnabled: event.target.checked } }); }} /></label><label className="feature-toggle"><span><strong>Start minimized</strong><small>Open directly in the notification area.</small></span><input type="checkbox" checked={usage.startMinimized} onChange={(event) => { void update({ usage: { ...usage, startMinimized: event.target.checked } }); }} /></label><label className="feature-toggle"><span><strong>Launch on Windows startup</strong><small>Native startup registration is applied on Windows.</small></span><input type="checkbox" checked={usage.launchOnStartup} onChange={(event) => { void setLaunchOnStartup(event.target.checked); }} /></label>{startupError ? <p className="feature-error" role="alert">{startupError}</p> : null}</article>
      <article className="feature-card feature-card--wide"><h2>Appearance</h2><p>Keep the smoky utility surface and choose the accent used for focus and selection.</p><button type="button" className="feature-button" aria-expanded={appearanceOpen} onClick={() => setAppearanceOpen((current) => !current)}>Choose color profile</button>{appearanceOpen ? <ColorProfilePopover value={selection} onChange={setSelection} onClose={() => setAppearanceOpen(false)} /> : null}</article>
    </div>
  </section>;
}
