import { z } from "zod";
import {
  AGENT_TEAM_MEMBERSHIP_ROLES,
  TEAM_KINDS,
  TEAM_STATUSES,
} from "../constants.js";

const nullableUuidSchema = z.string().uuid().optional().nullable();

export const teamKindSchema = z.enum(TEAM_KINDS);
export const teamStatusSchema = z.enum(TEAM_STATUSES);
export const agentTeamMembershipRoleSchema = z.enum(AGENT_TEAM_MEMBERSHIP_ROLES);

export const createTeamSchema = z.object({
  name: z.string().min(1).max(200),
  kind: teamKindSchema.optional().default("product_squad"),
  parentTeamId: nullableUuidSchema,
  leadAgentId: nullableUuidSchema,
});

export type CreateTeam = z.input<typeof createTeamSchema>;

export const updateTeamSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  kind: teamKindSchema.optional(),
  parentTeamId: nullableUuidSchema,
  leadAgentId: nullableUuidSchema,
  status: teamStatusSchema.optional(),
});

export type UpdateTeam = z.infer<typeof updateTeamSchema>;

export const upsertAgentTeamMembershipSchema = z.object({
  agentId: z.string().uuid(),
  roleInTeam: agentTeamMembershipRoleSchema.optional().default("member"),
  isPrimary: z.boolean().optional().default(false),
});

export type UpsertAgentTeamMembership = z.input<typeof upsertAgentTeamMembershipSchema>;

export const updateAgentTeamMembershipSchema = z.object({
  roleInTeam: agentTeamMembershipRoleSchema.optional(),
  isPrimary: z.boolean().optional(),
});

export type UpdateAgentTeamMembership = z.infer<typeof updateAgentTeamMembershipSchema>;
