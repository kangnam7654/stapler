import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentTeamMemberships, agents, teams } from "@paperclipai/db";
import type {
  AgentTeamMembership,
  CompanyTeamsSnapshot,
  CreateTeam,
  Team,
  UpdateAgentTeamMembership,
  UpdateTeam,
  UpsertAgentTeamMembership,
} from "@paperclipai/shared";
import { conflict, notFound, unprocessable } from "../errors.js";
import { logActivity } from "./activity-log.js";

type TeamRow = typeof teams.$inferSelect;
type MembershipRow = typeof agentTeamMemberships.$inferSelect;

function normalizeTeam(row: TeamRow): Team {
  return {
    ...row,
    kind: row.kind as Team["kind"],
    status: row.status as Team["status"],
  };
}

function normalizeMembership(row: MembershipRow): AgentTeamMembership {
  return {
    ...row,
    roleInTeam: row.roleInTeam as AgentTeamMembership["roleInTeam"],
  };
}

export function teamService(db: Db) {
  async function assertAgent(companyId: string, agentId: string | null | undefined, label: string) {
    if (!agentId) return null;
    const agent = await db
      .select({ id: agents.id, companyId: agents.companyId, status: agents.status })
      .from(agents)
      .where(eq(agents.id, agentId))
      .then((rows) => rows[0] ?? null);
    if (!agent || agent.companyId !== companyId) throw notFound(`${label} agent not found`);
    if (agent.status === "terminated") throw conflict(`${label} agent is terminated`);
    return agent;
  }

  async function assertTeam(companyId: string, teamId: string | null | undefined, label = "Team") {
    if (!teamId) return null;
    const team = await db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.companyId, companyId)))
      .then((rows) => rows[0] ?? null);
    if (!team) throw notFound(`${label} not found`);
    return team;
  }

  function assertNotSelfParent(teamId: string, parentTeamId: string | null | undefined) {
    if (parentTeamId && teamId === parentTeamId) {
      throw unprocessable("A team cannot be its own parent");
    }
  }

  async function assertNoParentCycle(companyId: string, teamId: string, parentTeamId: string | null | undefined) {
    if (!parentTeamId) return;
    const rows = await db.select().from(teams).where(eq(teams.companyId, companyId));
    const byId = new Map(rows.map((row) => [row.id, row]));
    let current = byId.get(parentTeamId);
    const seen = new Set<string>();
    while (current) {
      if (current.id === teamId) throw unprocessable("Team parent would create a cycle");
      if (seen.has(current.id)) return;
      seen.add(current.id);
      current = current.parentTeamId ? byId.get(current.parentTeamId) : undefined;
    }
  }

  async function list(companyId: string): Promise<CompanyTeamsSnapshot> {
    const [teamRows, membershipRows] = await Promise.all([
      db
        .select()
        .from(teams)
        .where(eq(teams.companyId, companyId))
        .orderBy(asc(teams.name)),
      db
        .select()
        .from(agentTeamMemberships)
        .where(eq(agentTeamMemberships.companyId, companyId)),
    ]);
    return {
      teams: teamRows.map(normalizeTeam),
      memberships: membershipRows.map(normalizeMembership),
    };
  }

  async function create(companyId: string, input: CreateTeam, actor: { actorType: "agent" | "user"; actorId: string; agentId: string | null; runId: string | null }) {
    await Promise.all([
      assertTeam(companyId, input.parentTeamId, "Parent team"),
      assertAgent(companyId, input.leadAgentId, "Lead"),
    ]);

    const now = new Date();
    const created = await db.transaction(async (tx) => {
      const [team] = await tx
        .insert(teams)
        .values({
          companyId,
          name: input.name.trim(),
          kind: input.kind ?? "product_squad",
          parentTeamId: input.parentTeamId ?? null,
          leadAgentId: input.leadAgentId ?? null,
          status: "active",
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      if (!team) throw new Error("Team creation failed");

      if (input.leadAgentId) {
        await tx
          .update(agentTeamMemberships)
          .set({ isPrimary: false, updatedAt: now })
          .where(and(eq(agentTeamMemberships.companyId, companyId), eq(agentTeamMemberships.agentId, input.leadAgentId)));
        await tx.insert(agentTeamMemberships).values({
          companyId,
          teamId: team.id,
          agentId: input.leadAgentId,
          roleInTeam: "lead",
          isPrimary: true,
          createdAt: now,
          updatedAt: now,
        });
      }

      return team;
    });

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "team.created",
      entityType: "team",
      entityId: created.id,
      details: { kind: created.kind, leadAgentId: created.leadAgentId },
    });

    return normalizeTeam(created);
  }

  async function update(companyId: string, teamId: string, input: UpdateTeam, actor: { actorType: "agent" | "user"; actorId: string; agentId: string | null; runId: string | null }) {
    const existing = await assertTeam(companyId, teamId);
    if (!existing) throw notFound("Team not found");
    assertNotSelfParent(teamId, input.parentTeamId);
    await Promise.all([
      input.parentTeamId !== undefined ? assertTeam(companyId, input.parentTeamId, "Parent team") : Promise.resolve(),
      input.leadAgentId !== undefined ? assertAgent(companyId, input.leadAgentId, "Lead") : Promise.resolve(),
      input.parentTeamId !== undefined ? assertNoParentCycle(companyId, teamId, input.parentTeamId) : Promise.resolve(),
    ]);

    const patch: Partial<typeof teams.$inferInsert> = { updatedAt: new Date() };
    if (input.name !== undefined) patch.name = input.name.trim();
    if (input.kind !== undefined) patch.kind = input.kind;
    if (input.parentTeamId !== undefined) patch.parentTeamId = input.parentTeamId ?? null;
    if (input.leadAgentId !== undefined) patch.leadAgentId = input.leadAgentId ?? null;
    if (input.status !== undefined) patch.status = input.status;

    const [updated] = await db
      .update(teams)
      .set(patch)
      .where(and(eq(teams.id, existing.id), eq(teams.companyId, companyId)))
      .returning();
    if (!updated) throw notFound("Team not found");

    if (input.leadAgentId !== undefined && existing.leadAgentId && existing.leadAgentId !== input.leadAgentId) {
      await db
        .update(agentTeamMemberships)
        .set({ roleInTeam: "member", updatedAt: new Date() })
        .where(and(
          eq(agentTeamMemberships.companyId, companyId),
          eq(agentTeamMemberships.teamId, updated.id),
          eq(agentTeamMemberships.agentId, existing.leadAgentId),
          eq(agentTeamMemberships.roleInTeam, "lead"),
        ));
    }

    if (input.leadAgentId) {
      const now = new Date();
      await db
        .insert(agentTeamMemberships)
        .values({
          companyId,
          teamId: updated.id,
          agentId: input.leadAgentId,
          roleInTeam: "lead",
          isPrimary: false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [agentTeamMemberships.agentId, agentTeamMemberships.teamId],
          set: {
            roleInTeam: "lead",
            updatedAt: now,
          },
        });
    }

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "team.updated",
      entityType: "team",
      entityId: updated.id,
      details: { status: updated.status },
    });

    return normalizeTeam(updated);
  }

  async function upsertMembership(companyId: string, teamId: string, input: UpsertAgentTeamMembership, actor: { actorType: "agent" | "user"; actorId: string; agentId: string | null; runId: string | null }) {
    await Promise.all([
      assertTeam(companyId, teamId),
      assertAgent(companyId, input.agentId, "Member"),
    ]);

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      if (input.isPrimary) {
        await tx
          .update(agentTeamMemberships)
          .set({ isPrimary: false, updatedAt: now })
          .where(and(eq(agentTeamMemberships.companyId, companyId), eq(agentTeamMemberships.agentId, input.agentId)));
      }

      const [membership] = await tx
        .insert(agentTeamMemberships)
        .values({
          companyId,
          teamId,
          agentId: input.agentId,
          roleInTeam: input.roleInTeam ?? "member",
          isPrimary: input.isPrimary ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [agentTeamMemberships.agentId, agentTeamMemberships.teamId],
          set: {
            roleInTeam: input.roleInTeam ?? "member",
            isPrimary: input.isPrimary ?? false,
            updatedAt: now,
          },
        })
        .returning();
      if (!membership) throw new Error("Team membership update failed");
      return membership;
    });

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "team.membership.upserted",
      entityType: "team",
      entityId: teamId,
      details: { memberAgentId: input.agentId, roleInTeam: updated.roleInTeam, isPrimary: updated.isPrimary },
    });

    return normalizeMembership(updated);
  }

  async function updateMembership(companyId: string, teamId: string, membershipId: string, input: UpdateAgentTeamMembership, actor: { actorType: "agent" | "user"; actorId: string; agentId: string | null; runId: string | null }) {
    await assertTeam(companyId, teamId);
    const existing = await db
      .select()
      .from(agentTeamMemberships)
      .where(and(eq(agentTeamMemberships.id, membershipId), eq(agentTeamMemberships.companyId, companyId), eq(agentTeamMemberships.teamId, teamId)))
      .then((rows) => rows[0] ?? null);
    if (!existing) throw notFound("Team membership not found");

    const now = new Date();
    const updated = await db.transaction(async (tx) => {
      if (input.isPrimary) {
        await tx
          .update(agentTeamMemberships)
          .set({ isPrimary: false, updatedAt: now })
          .where(and(eq(agentTeamMemberships.companyId, companyId), eq(agentTeamMemberships.agentId, existing.agentId)));
      }

      const patch: Partial<typeof agentTeamMemberships.$inferInsert> = { updatedAt: now };
      if (input.roleInTeam !== undefined) patch.roleInTeam = input.roleInTeam;
      if (input.isPrimary !== undefined) patch.isPrimary = input.isPrimary;
      const [membership] = await tx
        .update(agentTeamMemberships)
        .set(patch)
        .where(eq(agentTeamMemberships.id, existing.id))
        .returning();
      if (!membership) throw notFound("Team membership not found");
      return membership;
    });

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "team.membership.updated",
      entityType: "team",
      entityId: teamId,
      details: { membershipId, memberAgentId: updated.agentId },
    });

    return normalizeMembership(updated);
  }

  async function removeMembership(companyId: string, teamId: string, membershipId: string, actor: { actorType: "agent" | "user"; actorId: string; agentId: string | null; runId: string | null }) {
    await assertTeam(companyId, teamId);
    const [removed] = await db
      .delete(agentTeamMemberships)
      .where(and(eq(agentTeamMemberships.id, membershipId), eq(agentTeamMemberships.companyId, companyId), eq(agentTeamMemberships.teamId, teamId)))
      .returning();
    if (!removed) throw notFound("Team membership not found");

    void logActivity(db, {
      companyId,
      actorType: actor.actorType,
      actorId: actor.actorId,
      agentId: actor.agentId,
      runId: actor.runId,
      action: "team.membership.removed",
      entityType: "team",
      entityId: teamId,
      details: { membershipId, memberAgentId: removed.agentId },
    });

    return normalizeMembership(removed);
  }

  return {
    list,
    create,
    update,
    upsertMembership,
    updateMembership,
    removeMembership,
  };
}
