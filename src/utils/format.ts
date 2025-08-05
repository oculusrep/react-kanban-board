// utils/format.ts

export function formatCurrency(value: number | null | undefined, decimals = 0) {
  if (value === null || value === undefined || isNaN(value)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}



export function formatPercent(val: number | null | undefined, digits = 2) {
  if (typeof val !== "number" || isNaN(val)) return "";
  return `${val.toFixed(digits)}%`;
}

export function formatIntegerPercent(
  value: number | null | undefined
): string {
  if (typeof value !== "number") return "";
  return Math.round(value) + "%";
}
