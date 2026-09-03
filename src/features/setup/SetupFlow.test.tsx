import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { SetupFlow } from './SetupFlow';

describe('SetupFlow', () => {
  test('saves the selected provider before advancing', async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue(undefined);
    render(<SetupFlow saveDraft={saveDraft} />);

    await user.click(screen.getByRole('button', { name: 'Save and continue' }));

    expect(saveDraft).toHaveBeenCalledWith(expect.objectContaining({ providerId: 'openai' }));
    expect(screen.getByRole('heading', { name: 'Choose how to connect' })).toBeInTheDocument();
  });
});
