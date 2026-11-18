export function formatCurrency(
  value: number | string,
  _currency?: string,
  _locale?: string,
): string {
  const amount = typeof value === "string" ? Number(value) : value;
  const num = isNaN(amount) || amount === null || amount === undefined ? 0 : amount;
  const formatted =
    num % 1 === 0
      ? num.toLocaleString("en-US")
      : num.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        });
  return `TK. ${formatted}`;
}
