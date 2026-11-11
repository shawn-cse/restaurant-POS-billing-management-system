import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const EXPENSE_CATEGORIES = [
  "Rent",
  "Electricity",
  "Utilities",
  "Staff Salary",
  "Maintenance",
  "Supplies",
  "Marketing",
  "Other",
] as const;

export const expenseSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  spentOn: isoDate,
  category: z.string().trim().min(1).max(60),
  amount: z.coerce.number().positive(),
  note: z.string().max(500).optional(),
  paidFromCash: z.boolean().default(false),
});
export type ExpenseDto = z.infer<typeof expenseSchema>;

export const updateExpenseSchema = expenseSchema.partial();
export type UpdateExpenseDto = z.infer<typeof updateExpenseSchema>;

export const cashClosingSchema = z.object({
  businessDate: isoDate,
  openingFloat: z.coerce.number().min(0).default(0),
  countedCash: z.coerce.number().min(0),
  note: z.string().max(300).optional(),
});
export type CashClosingDto = z.infer<typeof cashClosingSchema>;
