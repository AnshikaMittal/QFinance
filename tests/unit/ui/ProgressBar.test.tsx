import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProgressBar } from '../../../src/ui/ProgressBar';

describe('ProgressBar', () => {
  it('renders without crashing', () => {
    const { container } = render(<ProgressBar value={50} />);
    expect(container.firstChild).toBeDefined();
  });

  it('shows label when showLabel is true', () => {
    const { container } = render(<ProgressBar value={50} showLabel />);
    const label = container.querySelector('span');
    expect(label?.textContent).toBe('50%');
  });

  it('caps at 100%', () => {
    const { container } = render(<ProgressBar value={150} showLabel />);
    const label = container.querySelector('span');
    expect(label?.textContent).toBe('100%');
  });

  it('floors at 0%', () => {
    const { container } = render(<ProgressBar value={-10} showLabel />);
    const label = container.querySelector('span');
    expect(label?.textContent).toBe('0%');
  });
});
