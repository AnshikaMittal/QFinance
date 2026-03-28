import React from 'react';

interface ProgressBarProps {
  value: number;
  max?: number;
  color?: string;
  showLabel?: boolean;
  size?: 'sm' | 'md';
}

export function ProgressBar({ value, max = 100, color = '#3b82f6', showLabel = false, size = 'md' }: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);
  const barColor = percent > 90 ? '#ef4444' : percent > 75 ? '#f97316' : color;

  return (
    <div className="flex items-center gap-2.5">
      <div className={`flex-1 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}>
        <div
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${percent}%`, backgroundColor: barColor }}
        />
      </div>
      {showLabel && (
        <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 tabular-nums min-w-[3rem] text-right">
          {percent.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
