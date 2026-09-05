import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, test, vi } from 'vitest';
import { ProvidersSettingsCard } from './ProvidersSettingsCard';
import type { ProviderCredentialsService } from '../../settings/providerCredentialsService';

function service(overrides: Partial<ProviderCredentialsService> = {}): ProviderCredentialsService {
  return {
    status: async (providerId) => ({ providerId, configured: false }),
    store: async (providerId) => ({ providerId, configured: true, hint: '********cdef' }),
    remove: async (providerId) => ({ providerId, configured: false }),
    ...overrides,
  };
}

test('states that a non-workspace-scoped Anthropic key is acceptable', () => {
  render(<ProvidersSettingsCard service={service()} />);

  // Anthropic accepts a personal Organization-scoped key, not only sk-ant-admin01-.
  expect(screen.getByText(/NOT scoped to a workspace/)).toBeInTheDocument();
});

test('shows which providers are configured without revealing the key', async () => {
  render(<ProvidersSettingsCard service={service({
    status: async (providerId) => providerId === 'openai'
      ? { providerId, configured: true, hint: '********cdef' }
      : { providerId, configured: false },
  })} />);

  expect(await screen.findByText(/Configured · \*+cdef/)).toBeInTheDocument();
  expect(screen.queryByText(/sk-admin/)).not.toBeInTheDocument();
});

test('saving a key sends it once and then clears it from the form', async () => {
  const user = userEvent.setup();
  const store = vi.fn(async (providerId: 'openai' | 'anthropic' | 'google') => ({
    providerId,
    configured: true,
    hint: '********wxyz',
  }));
  render(<ProvidersSettingsCard service={service({ store })} />);

  const field = screen.getByLabelText(/Admin API key$/);
  await user.type(field, 'sk-admin-secret-wxyz');
  await user.click(screen.getAllByRole('button', { name: /Save key/ })[0]);

  expect(await screen.findByText('Saved to Windows Credential Manager.')).toBeInTheDocument();
  expect(store).toHaveBeenCalledWith('openai', 'sk-admin-secret-wxyz');
  // The secret must not linger in the input after it has been handed to the OS store.
  expect((field as HTMLInputElement).value).toBe('');
});

test('the key field is a password field so the value is not shown on screen', () => {
  render(<ProvidersSettingsCard service={service()} />);

  expect(screen.getByLabelText(/Admin API key$/)).toHaveAttribute('type', 'password');
});

test('saving nothing asks for a key instead of calling the credential store', async () => {
  const user = userEvent.setup();
  const store = vi.fn();
  render(<ProvidersSettingsCard service={service({ store })} />);

  await user.click(screen.getAllByRole('button', { name: /Save key/ })[0]);

  expect(await screen.findByText('Enter a key before saving.')).toBeInTheDocument();
  expect(store).not.toHaveBeenCalled();
});

test('a stored key can be removed', async () => {
  const user = userEvent.setup();
  const remove = vi.fn(async (providerId: 'openai' | 'anthropic' | 'google') => ({ providerId, configured: false }));
  render(<ProvidersSettingsCard service={service({
    status: async (providerId) => ({ providerId, configured: true, hint: '********cdef' }),
    remove,
  })} />);

  await user.click((await screen.findAllByRole('button', { name: /Remove/ }))[0]);

  expect(await screen.findByText('Key removed.')).toBeInTheDocument();
  expect(remove).toHaveBeenCalledWith('openai');
});

test('Gemini is presented as manual entry only, with no key field', async () => {
  render(<ProvidersSettingsCard service={service()} />);

  const gemini = screen.getByLabelText('Google Gemini').closest('section');
  expect(gemini).not.toBeNull();
  expect(within(gemini as HTMLElement).getByText('Manual entry only')).toBeInTheDocument();
  expect(within(gemini as HTMLElement).queryByRole('button', { name: /Save key/ })).toBeNull();
});

test('the card states that these connectors do not read subscription allowance', () => {
  render(<ProvidersSettingsCard service={service()} />);

  expect(screen.getByText(/organization API usage and cost/)).toBeInTheDocument();
  expect(screen.getByText(/No provider offers a REST API for allowance/i)).toBeInTheDocument();
});
