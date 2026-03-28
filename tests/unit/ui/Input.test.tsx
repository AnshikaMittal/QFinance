import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Input } from '../../../src/ui/Input';

describe('Input', () => {
  it('renders with label', () => {
    render(<Input label="Email" />);
    expect(screen.getByLabelText('Email')).toBeDefined();
  });

  it('shows error message', () => {
    render(<Input label="Name" error="Required field" />);
    expect(screen.getByText('Required field')).toBeDefined();
  });

  it('shows helper text when no error', () => {
    render(<Input label="Name" helperText="Enter your name" />);
    expect(screen.getByText('Enter your name')).toBeDefined();
  });

  it('hides helper text when error is shown', () => {
    render(<Input label="Name" error="Required" helperText="Enter name" />);
    expect(screen.queryByText('Enter name')).toBeNull();
  });

  it('fires onChange', () => {
    const onChange = vi.fn();
    render(<Input label="Test" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Test'), { target: { value: 'hello' } });
    expect(onChange).toHaveBeenCalled();
  });
});
