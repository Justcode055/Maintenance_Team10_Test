import { z } from "zod";

// Accepts both standard RFC-4122 UUIDs and database test fixture UUIDs (e.g. 11111111-1111-1111-1111-111111111111)
const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);

export const createWorkOrderSchema = z.object({
  location_id: uuidSchema,
  description: z.string().trim().min(1),
  category_id: uuidSchema,
  title: z.string().trim().min(1).max(200),
});

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).optional(),
  location_id: uuidSchema.optional(),
  category_id: uuidSchema.optional(),
}).refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field is required",
});

export const assignWorkOrderSchema = z.object({
  staff_id: uuidSchema.optional(),
});

export const resolveWorkOrderSchema = z.object({
  resolution_notes: z.string().trim().min(1),
});

export const createPartnerWorkOrderSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
  description: z.string().trim().min(1, "Description is required"),
  activity_id: z.string().trim().optional(),
  schedule: z.string().trim().optional(),
  category: z.string().trim().optional(),
  category_id: uuidSchema.optional(),
  location: z.string().trim().optional(),
  location_id: uuidSchema.optional(),
});

export const updatePartnerWorkOrderSchema = z
  .object({
    activity_id: z.string().trim().optional(),
    work_order_id: uuidSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().min(1).optional(),
    location: z.string().trim().optional(),
    location_id: uuidSchema.optional(),
    category: z.string().trim().optional(),
    category_id: uuidSchema.optional(),
    action: z.enum(["update", "cancel"]).optional(),
  })
  .refine((data) => data.activity_id || data.work_order_id, {
    message: "Either activity_id or work_order_id is required",
  });

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;
export type ResolveWorkOrderInput = z.infer<typeof resolveWorkOrderSchema>;
export type CreatePartnerWorkOrderInput = z.infer<typeof createPartnerWorkOrderSchema>;
export type UpdatePartnerWorkOrderInput = z.infer<typeof updatePartnerWorkOrderSchema>;
