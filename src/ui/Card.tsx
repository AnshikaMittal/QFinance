import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  hoverable?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const paddingClasses = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
  lg: 'p-6',
};

export function Card({ children, className = '', padding = 'md', hoverable = false, onClick, style }: CardProps) {
  const interactive = hoverable || onClick;

  return (
    <div
      className={`
        bg-white dark:bg-gray-900 rounded-2xl
        border border-gray-200/60 dark:border-gray-800
        shadow-sm dark:shadow-none
        animate-fade-in
        ${interactive ? 'cursor-pointer card-hover transition-all duration-200' : ''}
        ${paddingClasses[padding]}
        ${className}
      `.trim()}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      style={style}
    >
      {children}
    </div>
  );
}
