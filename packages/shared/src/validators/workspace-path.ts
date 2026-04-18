import { z } from "zod";

export const workspacePathSchema = z
  .string()
  .nullable()
  .transform((v) => {
    if (v === null) return null;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  })
  .superRefine((v, ctx) => {
    if (v === null) return;
    if (v.length > 1024) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Path must be 1024 characters or fewer.",
      });
      return;
    }
    if (!/^(\/|~\/)/.test(v)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Path must be an absolute POSIX path starting with / or ~/.",
      });
    }
  });

export type WorkspacePath = z.infer<typeof workspacePathSchema>;
