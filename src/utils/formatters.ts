export const formatCurrency = (amount: number | null | undefined): string => {
  if (amount == null || isNaN(amount)) return '$0.00';
  return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

export const formatPercent = (percent: number | null | undefined): string => {
  if (percent == null || isNaN(percent)) return '0.0%';
  return `${percent.toFixed(1)}%`;
};