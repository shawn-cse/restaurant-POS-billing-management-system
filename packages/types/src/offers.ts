import { z } from "zod";

export const offerTypeSchema = z.enum(["PERCENTAGE", "FIXED"]);
export type OfferTypeDto = z.infer<typeof offerTypeSchema>;

export const offerDtoSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Offer name must be at least 2 characters")
      .max(100, "Offer name cannot exceed 100 characters"),
    description: z.string().trim().max(500).optional().nullable(),
    type: offerTypeSchema,
    value: z.number().positive("Discount value must be greater than zero"),
    minOrderAmount: z.number().min(0, "Minimum order amount cannot be negative").default(0),
    maxDiscount: z.number().min(0, "Max discount cap cannot be negative").optional().nullable(),
    startsAt: z.union([z.string().datetime(), z.string().min(10), z.date()]),
    expiresAt: z.union([z.string().datetime(), z.string().min(10), z.date()]),
    isActive: z.boolean().default(true),
  })
  .refine(
    (data) => {
      if (data.type === "PERCENTAGE" && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage discount cannot exceed 100%",
      path: ["value"],
    },
  )
  .refine(
    (data) => {
      const start = new Date(data.startsAt).getTime();
      const end = new Date(data.expiresAt).getTime();
      return end > start;
    },
    {
      message: "Expiration date must be after the start date",
      path: ["expiresAt"],
    },
  );

export type OfferDto = z.infer<typeof offerDtoSchema>;

export const offerUpdateDtoSchema = z
  .object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional().nullable(),
    type: offerTypeSchema.optional(),
    value: z.number().positive("Discount value must be greater than zero").optional(),
    minOrderAmount: z.number().min(0).optional(),
    maxDiscount: z.number().min(0).optional().nullable(),
    startsAt: z.union([z.string().datetime(), z.string().min(10), z.date()]).optional(),
    expiresAt: z.union([z.string().datetime(), z.string().min(10), z.date()]).optional(),
    isActive: z.boolean().optional(),
  })
  .refine(
    (data) => {
      if (data.type === "PERCENTAGE" && data.value !== undefined && data.value > 100) {
        return false;
      }
      return true;
    },
    {
      message: "Percentage discount cannot exceed 100%",
      path: ["value"],
    },
  );

export type OfferUpdateDto = z.infer<typeof offerUpdateDtoSchema>;

export const evaluateOfferDtoSchema = z.object({
  offerId: z.string().min(1, "Offer ID is required"),
  subtotal: z.number().min(0, "Subtotal must be non-negative"),
});

export type EvaluateOfferDto = z.infer<typeof evaluateOfferDtoSchema>;

export interface OfferEvaluationResult {
  valid: boolean;
  discountAmount: number;
  reason?: string;
  offerId?: string;
  offerName?: string;
  offerType?: OfferTypeDto;
  offerValue?: number;
}
