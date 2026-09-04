import { Check, ChevronLeft, ChevronRight, Puzzle, SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';
import type { ProviderId, SourceType } from '../../usage/usageTypes';
import { withTimeout } from '../../runtime/withTimeout';
import '../shared/featurePages.css';

export interface SetupDraft {
  providerId: ProviderId;
  sourceType: Extract<SourceType, 'browser_extension' | 'manual'>;
  refreshMinutes: 5 | 10 | 15 | 30;
  notificationsEnabled: boolean;
}

export interface SetupFlowProps {
  initialDraft?: SetupDraft;
  saveDraft(draft: SetupDraft): Promise<void>;
  onComplete?: (draft: SetupDraft) => void;
  report?: (level: 'info' | 'warn' | 'error', message: string) => void;
}

const defaultDraft: SetupDraft = {
  providerId: 'openai',
  sourceType: 'manual',
  refreshMinutes: 5,
  notificationsEnabled: false,
};

const providers: Array<{ id: ProviderId; label: string; detail: string }> = [
  { id: 'openai', label: 'ChatGPT / Codex', detail: 'Subscription allowance and reset timing' },
  { id: 'anthropic', label: 'Claude / Claude Code', detail: 'Current window and reset timing' },
  { id: 'google', label: 'Gemini', detail: 'Gemini allowance and quota timing' },
];

export function SetupFlow({ initialDraft = defaultDraft, saveDraft, onComplete, report = () => undefined }: SetupFlowProps) {
  const [step, setStep] = useState(1);
  const [draft, setDraft] = useState(initialDraft);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const advance = async () => {
    report('info', `Setup save started; step=${step}; provider=${draft.providerId}; source=${draft.sourceType}.`);
    setSaving(true);
    setSaveError(null);
    try {
      if (draft.sourceType !== 'manual') throw new Error('Automatic provider connections are not installed yet.');
      await withTimeout(saveDraft(draft), 5000, 'Settings save timed out after 5 seconds.');
      report('info', `Setup save completed; step=${step}.`);
      if (step === 4) onComplete?.(draft);
      else setStep((current) => current + 1);
    } catch (error) {
      report('error', `Setup save failed; step=${step}; reason=${error instanceof Error ? error.message : 'unknown'}.`);
      setSaveError('Setup could not be saved. Your choices remain on this screen.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="setup-flow" aria-labelledby="setup-title">
      <header className="feature-page__hero">
        <span className="feature-page__eyebrow">Guided setup · Saves as you go</span>
        <h1 id="setup-title">Set up your first monitor</h1>
        <p>Connect one personal allowance now. Add the other providers whenever you’re ready.</p>
      </header>

      <ol className="setup-flow__steps" aria-label="Setup progress">
        {['Provider', 'Connection', 'Defaults', 'Finish'].map((label, index) => {
          const number = index + 1;
          return <li key={label} data-active={step === number} data-complete={step > number}><span>{step > number ? <Check size={14} /> : number}</span>{label}</li>;
        })}
      </ol>

      <div className="feature-card setup-flow__content">
        {step === 1 ? <>
          <h2>Select your first provider</h2>
          <p>Each monitor is independent, so one provider can fail without interrupting the others.</p>
          <div className="setup-flow__choices setup-flow__choices--three">
            {providers.map((provider) => <button key={provider.id} type="button" aria-pressed={draft.providerId === provider.id} onClick={() => setDraft((current) => ({ ...current, providerId: provider.id }))}><strong>{provider.label}</strong><span>{provider.detail}</span></button>)}
          </div>
        </> : null}

        {step === 2 ? <>
          <h2>Choose how to connect</h2>
          <p>Manual entry is available now. Automatic provider connections are planned but not installed in this release.</p>
          <div className="setup-flow__choices">
            <button type="button" disabled aria-pressed={draft.sourceType === 'browser_extension'}><Puzzle size={20} /><strong>Browser companion · Not installed yet</strong><span>Automatic provider connections are planned for a future release.</span></button>
            <button type="button" aria-pressed={draft.sourceType === 'manual'} onClick={() => setDraft((current) => ({ ...current, sourceType: 'manual' }))}><SlidersHorizontal size={20} /><strong>Manual entry</strong><span>Enter remaining percentage and reset time yourself. You can switch later.</span></button>
          </div>
        </> : null}

        {step === 3 ? <>
          <h2>Set initial defaults</h2>
          <p>Notifications remain off unless you explicitly enable them.</p>
          <label className="feature-field">Refresh interval<select value={draft.refreshMinutes} onChange={(event) => setDraft((current) => ({ ...current, refreshMinutes: Number(event.target.value) as SetupDraft['refreshMinutes'] }))}><option value={5}>Every 5 minutes</option><option value={10}>Every 10 minutes</option><option value={15}>Every 15 minutes</option><option value={30}>Every 30 minutes</option></select></label>
          <label className="feature-toggle"><span><strong>Windows notifications</strong><small>Notify when enabled thresholds are crossed.</small></span><input type="checkbox" checked={draft.notificationsEnabled} onChange={(event) => setDraft((current) => ({ ...current, notificationsEnabled: event.target.checked }))} /></label>
        </> : null}

        {step === 4 ? <>
          <h2>Setup is ready</h2>
          <p>Your provider, connection method, and defaults are ready to save.</p>
          <dl className="setup-flow__summary"><div><dt>Provider</dt><dd>{providers.find((provider) => provider.id === draft.providerId)?.label}</dd></div><div><dt>Connection</dt><dd>{draft.sourceType === 'browser_extension' ? 'Browser companion' : 'Manual entry'}</dd></div><div><dt>Refresh</dt><dd>{draft.refreshMinutes} minutes</dd></div></dl>
        </> : null}
        {saveError ? <p className="feature-error" role="alert">{saveError}</p> : null}
      </div>

      <footer className="setup-flow__footer">
        <button type="button" className="feature-button feature-button--quiet" disabled={step === 1 || saving} onClick={() => setStep((current) => current - 1)}><ChevronLeft size={16} />Back</button>
        <button type="button" className="feature-button" disabled={saving || (step >= 2 && draft.sourceType !== 'manual')} onClick={() => { void advance(); }}>{saving ? 'Saving…' : step === 4 ? 'Finish' : 'Save and continue'}<ChevronRight size={16} /></button>
      </footer>
    </section>
  );
}
