export function formatCurrency(amount: number, currency = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatDate(date: Date, format: 'short' | 'long' | 'iso' = 'short'): string {
  if (format === 'iso') return date.toISOString().split('T')[0] ?? '';
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: format,
  }).format(date);
}

export function formatPercent(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}
