import { z } from "zod";
import { COMPANY_STATUSES } from "../constants.js";
import { workspacePathSchema } from "./workspace-path.js";

const logoAssetIdSchema = z.string().uuid().nullable().optional();
const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable().optional();

const adapterProviderConfigSchema = z
  .record(z.string(), z.unknown())
  .optional();

const adapterDefaultsSchema = z
  .record(z.string(), adapterProviderConfigSchema)
  .nullable()
  .optional();

export type AdapterDefaults = NonNullable<z.infer<typeof adapterDefaultsSchema>>;

export const createCompanySchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  budgetMonthlyCents: z.number().int().nonnegative().optional().default(0),
  workspaceRootPath: workspacePathSchema.optional(),
});

export type CreateCompany = z.infer<typeof createCompanySchema>;

export const updateCompanySchema = createCompanySchema
  .partial()
  .extend({
    status: z.enum(COMPANY_STATUSES).optional(),
    spentMonthlyCents: z.number().int().nonnegative().optional(),
    requireBoardApprovalForNewAgents: z.boolean().optional(),
    brandColor: brandColorSchema,
    logoAssetId: logoAssetIdSchema,
    adapterDefaults: adapterDefaultsSchema,
    workspaceRootPath: workspacePathSchema.optional(),
  });

export type UpdateCompany = z.infer<typeof updateCompanySchema>;

export const updateCompanyBrandingSchema = z
  .object({
    name: z.string().min(1).optional(),
    description: z.string().nullable().optional(),
    brandColor: brandColorSchema,
    logoAssetId: logoAssetIdSchema,
  })
  .strict()
  .refine(
    (value) =>
      value.name !== undefined
      || value.description !== undefined
      || value.brandColor !== undefined
      || value.logoAssetId !== undefined,
    "At least one branding field must be provided",
  );

export type UpdateCompanyBranding = z.infer<typeof updateCompanyBrandingSchema>;
