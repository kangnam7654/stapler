import { z } from "zod";

export const workspacePathSchema = z
  .union([z.string(), z.null()])
  .transform((v) => {
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  })
  .superRefine((v, ctx) => {
    if (v === null) return;
    if (v.length > 1024) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "path > 1024 chars" });
      return;
    }
    if (!/^(\/|~\/)/.test(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "absolute path required (/... or ~/...)",
      });
    }
  });

export type WorkspacePath = z.infer<typeof workspacePathSchema>;
