import React from 'react';

interface BadgeProps {
  children: React.ReactNode;
  color?: string;
  variant?: 'solid' | 'outline' | 'subtle';
  size?: 'sm' | 'md';
}

export function Badge({ children, color = '#6b7280', variant = 'subtle', size = 'sm' }: BadgeProps) {
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm';

  const style: React.CSSProperties =
    variant === 'solid'
      ? { backgroundColor: color, color: '#fff' }
      : variant === 'outline'
      ? { borderColor: color, color }
      : { backgroundColor: `${color}18`, color };

  return (
    <span
      className={`
        inline-flex items-center rounded-lg font-medium
        ${variant === 'outline' ? 'border' : ''}
        ${sizeClasses}
      `.trim()}
      style={style}
    >
      {children}
    </span>
  );
}
