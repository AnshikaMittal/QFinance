import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../../src/ui/Badge';

describe('Badge', () => {
  it('renders children text', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('applies custom color', () => {
    const { container } = render(<Badge color="#ef4444">Warning</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.style.color).toBe('rgb(239, 68, 68)');
  });

  it('renders outline variant', () => {
    const { container } = render(<Badge variant="outline">Outline</Badge>);
    const badge = container.firstChild as HTMLElement;
    expect(badge.className).toContain('border');
  });
});
