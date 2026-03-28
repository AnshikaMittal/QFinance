import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../../src/ui/Modal';

describe('Modal', () => {
  it('renders nothing when closed', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Test">Content</Modal>);
    expect(screen.queryByText('Content')).toBeNull();
  });

  it('renders content when open', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="Test">Content</Modal>);
    expect(screen.getByText('Content')).toBeDefined();
  });

  it('renders title', () => {
    render(<Modal isOpen={true} onClose={vi.fn()} title="My Modal">Body</Modal>);
    expect(screen.getByText('My Modal')).toBeDefined();
  });

  it('calls onClose when X button clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test">Body</Modal>);
    const closeBtn = screen.getByRole('button');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn();
    render(<Modal isOpen={true} onClose={onClose} title="Test">Body</Modal>);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
