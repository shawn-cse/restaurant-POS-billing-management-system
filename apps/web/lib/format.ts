/**
 * Shared currency formatting utility for UrbanBite Restaurant.
 * Standardizes presentation across the entire application as:
 *   TK. 50.00
 *   TK. 250.00
 *   TK. 1,250.00
 *   TK. 12,500.00
 *
 * Internal ISO currency code: BDT
 * Visible representation: "TK. <amount>" (The Taka symbol '৳' is strictly omitted).
 */
export function formatCurrency(
  value: number | string | null | undefined,
  _currency = "BDT",
  _locale = "en-US",
): string {
  const rawNum = typeof value === "string" ? Number(value) : (value ?? 0);
  const amount = Number.isFinite(rawNum) ? rawNum : 0;

  const formatted = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  return `TK. ${formatted}`;
}

export function formatNumber(
  value: number | string | null | undefined,
  digits = 2,
): string {
  const rawNum = typeof value === "string" ? Number(value) : (value ?? 0);
  const amount = Number.isFinite(rawNum) ? rawNum : 0;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(amount);
}
