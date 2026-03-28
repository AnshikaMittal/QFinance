import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Select } from '../../../src/ui/Select';

describe('Select', () => {
  const options = [
    { value: 'a', label: 'Option A' },
    { value: 'b', label: 'Option B' },
    { value: 'c', label: 'Option C' },
  ];

  it('renders all options', () => {
    render(<Select options={options} />);
    expect(screen.getByText('Option A')).toBeDefined();
    expect(screen.getByText('Option B')).toBeDefined();
    expect(screen.getByText('Option C')).toBeDefined();
  });

  it('renders with label', () => {
    render(<Select label="Category" options={options} />);
    expect(screen.getByLabelText('Category')).toBeDefined();
  });

  it('renders placeholder', () => {
    render(<Select options={options} placeholder="Choose one" />);
    expect(screen.getByText('Choose one')).toBeDefined();
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<Select label="Pick" options={options} onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Pick'), { target: { value: 'b' } });
    expect(onChange).toHaveBeenCalled();
  });

  it('shows error', () => {
    render(<Select options={options} error="Required" />);
    expect(screen.getByText('Required')).toBeDefined();
  });
});
