import { useEffect, useRef, useState } from 'react';
import { KeyRound, Trash2 } from 'lucide-react';
import {
  createRuntimeProviderCredentialsService,
  type ProviderCredentialStatus,
  type ProviderCredentialsService,
} from '../../settings/providerCredentialsService';
import type { ProviderId } from '../../usage/usageTypes';
import '../shared/featurePages.css';
import './providersSettings.css';

interface ProviderDefinition {
  id: ProviderId;
  label: string;
  /** Whether an automatic connector exists at all. */
  connector: 'available' | 'unavailable';
  keyLabel: string;
  guidance: string;
}

/**
 * Wording here follows docs/provider-capability-matrix.md and must not overstate what a key
 * unlocks. Both supported connectors read *organization API* usage and cost — never
 * subscription allowance, which no provider exposes programmatically.
 */
const PROVIDERS: readonly ProviderDefinition[] = [
  {
    id: 'openai',
    label: 'OpenAI',
    connector: 'available',
    keyLabel: 'Admin API key',
    guidance: 'Requires an organization admin key (Settings → Organization → Admin keys). Reads API token usage and cost. It cannot report ChatGPT or Codex plan allowance — no endpoint exists for that.',
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    connector: 'available',
    keyLabel: 'Admin API key (sk-ant-admin01-…)',
    guidance: 'Requires an organization admin key; the Admin API is unavailable to individual accounts, and workspace-scoped keys are rejected. Reads API token usage and cost, not Claude Pro/Max allowance.',
  },
  {
    id: 'google',
    label: 'Google Gemini',
    connector: 'unavailable',
    keyLabel: 'Not applicable',
    guidance: 'Google publishes no single Gemini usage endpoint. Usage would have to be derived from Cloud Monitoring time-series with a GCP project and OAuth. Until that is built and verified, Gemini uses manual entry.',
  },
];

interface Props {
  service?: ProviderCredentialsService;
}

type StatusMap = Partial<Record<ProviderId, ProviderCredentialStatus>>;

export function ProvidersSettingsCard({ service = createRuntimeProviderCredentialsService() }: Props) {
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [drafts, setDrafts] = useState<Partial<Record<ProviderId, string>>>({});
  const [message, setMessage] = useState<Partial<Record<ProviderId, string>>>({});
  const [busy, setBusy] = useState<ProviderId | null>(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    void (async () => {
      for (const provider of PROVIDERS) {
        if (provider.connector !== 'available') continue;
        try {
          const status = await service.status(provider.id);
          if (active.current) setStatuses((current) => ({ ...current, [provider.id]: status }));
        } catch {
          // A credential store that cannot be read is reported per-provider on the next action.
        }
      }
    })();
    return () => { active.current = false; };
  }, [service]);

  const save = async (providerId: ProviderId) => {
    const secret = (drafts[providerId] ?? '').trim();
    if (!secret) {
      setMessage((current) => ({ ...current, [providerId]: 'Enter a key before saving.' }));
      return;
    }
    setBusy(providerId);
    setMessage((current) => ({ ...current, [providerId]: '' }));
    try {
      const status = await service.store(providerId, secret);
      if (!active.current) return;
      setStatuses((current) => ({ ...current, [providerId]: status }));
      // Clear the draft immediately so the key does not linger in React state.
      setDrafts((current) => ({ ...current, [providerId]: '' }));
      setMessage((current) => ({ ...current, [providerId]: 'Saved to Windows Credential Manager.' }));
    } catch (error) {
      if (!active.current) return;
      const text = error && typeof error === 'object' && 'message' in error
        ? String((error as { message: unknown }).message)
        : 'The key could not be saved.';
      setMessage((current) => ({ ...current, [providerId]: text }));
    } finally {
      if (active.current) setBusy(null);
    }
  };

  const remove = async (providerId: ProviderId) => {
    setBusy(providerId);
    setMessage((current) => ({ ...current, [providerId]: '' }));
    try {
      const status = await service.remove(providerId);
      if (!active.current) return;
      setStatuses((current) => ({ ...current, [providerId]: status }));
      setMessage((current) => ({ ...current, [providerId]: 'Key removed.' }));
    } catch {
      if (active.current) {
        setMessage((current) => ({ ...current, [providerId]: 'The key could not be removed.' }));
      }
    } finally {
      if (active.current) setBusy(null);
    }
  };

  return (
    <article className="feature-card feature-card--wide providers-card">
      <h2>Providers</h2>
      <p>
        API keys are stored in the Windows Credential Manager — never in settings, the local
        database, logs, or this application&apos;s files. A saved key is never shown again; only
        its last characters are displayed so you can recognise it.
      </p>
      <p className="providers-card__caveat">
        These connectors read <strong>organization API usage and cost</strong>. No provider offers an
        API for subscription allowance (ChatGPT/Codex, Claude Pro/Max, Gemini app), so those
        figures still come from manual entry.
      </p>

      <div className="providers-card__list">
        {PROVIDERS.map((provider) => {
          const status = statuses[provider.id];
          const unavailable = provider.connector === 'unavailable';
          const inputId = `provider-key-${provider.id}`;
          return (
            <section className="providers-card__item" key={provider.id} aria-labelledby={`provider-${provider.id}-name`}>
              <header className="providers-card__header">
                <strong id={`provider-${provider.id}-name`}>{provider.label}</strong>
                <span className="providers-card__state" data-configured={status?.configured ? 'yes' : 'no'}>
                  {unavailable
                    ? 'Manual entry only'
                    : status?.configured
                      ? `Configured · ${status.hint ?? ''}`
                      : 'Not configured'}
                </span>
              </header>
              <p className="providers-card__guidance">{provider.guidance}</p>

              {unavailable ? null : (
                <div className="feature-form-row providers-card__row">
                  <label className="feature-field providers-card__field" htmlFor={inputId}>
                    {provider.keyLabel}
                    <input
                      id={inputId}
                      type="password"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder={status?.configured ? 'Enter a new key to replace the stored one' : 'Paste the admin key'}
                      value={drafts[provider.id] ?? ''}
                      onChange={(event) => {
                        const { value } = event.target;
                        setDrafts((current) => ({ ...current, [provider.id]: value }));
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="feature-button"
                    disabled={busy === provider.id}
                    onClick={() => { void save(provider.id); }}
                  >
                    <KeyRound size={16} />
                    {busy === provider.id ? 'Saving…' : 'Save key'}
                  </button>
                  {status?.configured ? (
                    <button
                      type="button"
                      className="feature-button feature-button--quiet"
                      disabled={busy === provider.id}
                      onClick={() => { void remove(provider.id); }}
                    >
                      <Trash2 size={16} />
                      Remove
                    </button>
                  ) : null}
                </div>
              )}

              {message[provider.id] ? (
                <p className="feature-form-message" role="status">{message[provider.id]}</p>
              ) : null}
            </section>
          );
        })}
      </div>
    </article>
  );
}
