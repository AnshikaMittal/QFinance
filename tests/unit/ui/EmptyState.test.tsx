import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from '../../../src/ui/EmptyState';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState icon={<span>icon</span>} title="No data" description="Add some items" />);
    expect(screen.getByText('No data')).toBeDefined();
    expect(screen.getByText('Add some items')).toBeDefined();
  });

  it('renders icon', () => {
    render(<EmptyState icon={<span data-testid="icon">X</span>} title="Empty" description="Nothing here" />);
    expect(screen.getByTestId('icon')).toBeDefined();
  });
});
