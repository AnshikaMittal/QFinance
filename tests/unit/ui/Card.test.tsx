import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Card } from '../../../src/ui/Card';

describe('Card', () => {
  it('renders children', () => {
    render(<Card>Hello</Card>);
    expect(screen.getByText('Hello')).toBeDefined();
  });

  it('applies padding classes', () => {
    const { container } = render(<Card padding="lg">Content</Card>);
    expect(container.firstChild).toHaveClass('p-6');
  });

  it('handles click events when onClick provided', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Clickable</Card>);
    fireEvent.click(screen.getByText('Clickable'));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('has role=button when onClick provided', () => {
    const onClick = vi.fn();
    render(<Card onClick={onClick}>Clickable</Card>);
    const el = screen.getByText('Clickable').closest('[role="button"]');
    expect(el).not.toBeNull();
  });

  it('does not have role=button without onClick', () => {
    render(<Card>Static</Card>);
    const el = screen.getByText('Static').closest('[role="button"]');
    expect(el).toBeNull();
  });
});
