import { z } from "zod";

// Accepts both standard RFC-4122 UUIDs and database test fixture UUIDs (e.g. 11111111-1111-1111-1111-111111111111)
const uuidSchema = z.string().regex(
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
  "Invalid UUID",
);
export const partnerReferenceSchema = z.string().trim().min(1).max(200).regex(
  /^[A-Za-z0-9][A-Za-z0-9_.:-]*$/, "Invalid partner reference",
);
const descriptionSchema = z.string().trim().min(1).max(10000);

export const listWorkOrdersQuerySchema = z.object({
  status: z.enum(["OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "CLOSED"]).optional(),
  location_id: uuidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

export const createWorkOrderSchema = z.object({
  location_id: uuidSchema,
  description: descriptionSchema,
  category_id: uuidSchema,
  title: z.string().trim().min(1).max(200),
}).strict();

export const updateWorkOrderSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: descriptionSchema.optional(),
  location_id: uuidSchema.optional(),
  category_id: uuidSchema.optional(),
}).strict().refine((value) => Object.keys(value).length > 0, {
  message: "At least one editable field is required",
});

export const assignWorkOrderSchema = z.object({
  staff_id: uuidSchema.optional(),
}).strict();

export const resolveWorkOrderSchema = z.object({
  resolution_notes: z.string().trim().min(1).max(10000),
}).strict();

export const createPartnerWorkOrderSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200, "Title cannot exceed 200 characters"),
  description: descriptionSchema,
  activity_id: partnerReferenceSchema.optional(),
  idempotency_key: partnerReferenceSchema.optional(),
  schedule: z.string().trim().min(1).max(1000).optional(),
  category: z.string().trim().min(1).max(100).optional(),
  category_id: uuidSchema.optional(),
  location: z.string().trim().min(1).max(300).optional(),
  location_id: uuidSchema.optional(),
}).strict();

export const partnerLookupSchema = z.object({
  activity_id: partnerReferenceSchema.optional(),
  work_order_id: uuidSchema.optional(),
}).strict().refine((value) => value.activity_id || value.work_order_id, {
  message: "Provide activity_id or work_order_id",
});

export const updatePartnerWorkOrderSchema = z
  .object({
    activity_id: partnerReferenceSchema.optional(),
    work_order_id: uuidSchema.optional(),
    title: z.string().trim().min(1).max(200).optional(),
    description: descriptionSchema.optional(),
    location: z.string().trim().min(1).max(300).optional(),
    location_id: uuidSchema.optional(),
    category: z.string().trim().min(1).max(100).optional(),
    category_id: uuidSchema.optional(),
    action: z.enum(["update", "cancel"]).optional(),
  }).strict()
  .refine((data) => data.activity_id || data.work_order_id, {
    message: "Either activity_id or work_order_id is required",
  });

export type CreateWorkOrderInput = z.infer<typeof createWorkOrderSchema>;
export type UpdateWorkOrderInput = z.infer<typeof updateWorkOrderSchema>;
export type AssignWorkOrderInput = z.infer<typeof assignWorkOrderSchema>;
export type ResolveWorkOrderInput = z.infer<typeof resolveWorkOrderSchema>;
export type CreatePartnerWorkOrderInput = z.infer<typeof createPartnerWorkOrderSchema>;
export type UpdatePartnerWorkOrderInput = z.infer<typeof updatePartnerWorkOrderSchema>;
