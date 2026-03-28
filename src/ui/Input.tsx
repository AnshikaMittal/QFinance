import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
}

export function Input({ label, error, helperText, icon, className = '', id, ...props }: InputProps) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={inputId} className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
      )}
      <div className="relative">
        {icon && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
            {icon}
          </span>
        )}
        <input
          id={inputId}
          className={`
            w-full px-3.5 py-2.5 rounded-xl text-sm
            bg-gray-50 dark:bg-gray-800/50
            border border-gray-200 dark:border-gray-700
            text-gray-900 dark:text-gray-100
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 dark:focus:border-blue-400
            transition-all duration-150
            ${icon ? 'pl-10' : ''}
            ${error ? 'border-red-400 dark:border-red-500 focus:ring-red-500/40' : ''}
            ${className}
          `.trim()}
          {...props}
        />
      </div>
      {error && <p className="text-xs text-red-500 dark:text-red-400 animate-slide-down">{error}</p>}
      {helperText && !error && <p className="text-xs text-gray-400 dark:text-gray-500">{helperText}</p>}
    </div>
  );
}
