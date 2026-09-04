import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { StartupErrorBoundary } from './StartupErrorBoundary';

function BrokenDashboard(): never {
  throw new Error('Dashboard import failed');
}

describe('StartupErrorBoundary', () => {
  test('keeps a readable diagnostic screen visible when the dashboard render crashes', () => {
    const report = vi.fn();

    render(<StartupErrorBoundary report={report}><BrokenDashboard /></StartupErrorBoundary>);

    expect(screen.getByRole('heading', { name: 'AI Usage Meter could not start' })).toBeInTheDocument();
    expect(screen.getByText('Dashboard import failed')).toBeInTheDocument();
    expect(report).toHaveBeenCalledWith('React render failure: Dashboard import failed');
  });
});
