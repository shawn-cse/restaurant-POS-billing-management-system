import { z } from "zod";

export const tableStatusSchema = z.enum([
  "AVAILABLE",
  "OCCUPIED",
  "RESERVED",
  "CLEANING",
  "OUT_OF_SERVICE",
]);
export type TableStatusDto = z.infer<typeof tableStatusSchema>;

export const floorSchema = z.object({
  name: z.string().min(1),
  sortOrder: z.number().int().default(0),
});
export type FloorDto = z.infer<typeof floorSchema>;

export const floorUpdateSchema = floorSchema.partial();
export type FloorUpdateDto = z.infer<typeof floorUpdateSchema>;

export const tableSchema = z.object({
  floorId: z.string(),
  number: z.string().min(1),
  name: z.string().optional(),
  capacity: z.number().int().positive().default(2),
  posX: z.number().default(0),
  posY: z.number().default(0),
  width: z.number().positive().default(80),
  height: z.number().positive().default(80),
  rotation: z.number().default(0),
  shape: z.enum(["square", "round", "rect"]).default("square"),
  color: z.string().optional(),
  notes: z.string().optional(),
  isActive: z.boolean().default(true).optional(),
});
export type TableDto = z.infer<typeof tableSchema>;

export const tableUpdateSchema = tableSchema.omit({ floorId: true }).partial();
export type TableUpdateDto = z.infer<typeof tableUpdateSchema>;

export const tableStatusUpdateSchema = z.object({
  status: tableStatusSchema,
  assignedWaiterId: z.string().optional(),
  override: z.boolean().optional(),
  reason: z.string().optional(),
});
export type TableStatusUpdateDto = z.infer<typeof tableStatusUpdateSchema>;

export const tableReleaseSchema = z.object({
  force: z.boolean().optional(),
  reason: z.string().optional(),
});
export type TableReleaseDto = z.infer<typeof tableReleaseSchema>;

export const bulkTableCreateSchema = z.object({
  floorId: z.string(),
  numbers: z.array(z.string().min(1)).min(1).max(100),
  capacity: z.number().int().positive().default(2),
  shape: z.enum(["square", "round", "rect"]).default("square"),
  color: z.string().optional(),
});
export type BulkTableCreateDto = z.infer<typeof bulkTableCreateSchema>;

export const tableLayoutUpdateSchema = z.object({
  id: z.string(),
  posX: z.number(),
  posY: z.number(),
  width: z.number(),
  height: z.number(),
  rotation: z.number(),
});
export type TableLayoutUpdateDto = z.infer<typeof tableLayoutUpdateSchema>;
