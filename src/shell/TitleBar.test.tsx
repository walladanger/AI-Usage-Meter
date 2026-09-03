import { render, screen } from '@testing-library/react';
import { TitleBar } from './TitleBar';

test('renders the AI Usage Meter product name', () => {
  render(<TitleBar />);

  expect(screen.getByText('AI Usage Meter')).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'AI Usage Meter' })).toBeInTheDocument();
});
