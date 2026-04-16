import { describe, expect, it } from "vitest";
import { evaluateDelegationRoute, type DelegationRoutingAgent } from "./delegation-routing.js";

const ceo: DelegationRoutingAgent = {
  id: "ceo",
  name: "CEO",
  role: "ceo",
  status: "active",
  reportsTo: null,
};

const cto: DelegationRoutingAgent = {
  id: "cto",
  name: "CTO",
  role: "cto",
  status: "active",
  reportsTo: "ceo",
};

const frontend: DelegationRoutingAgent = {
  id: "frontend",
  name: "Frontend",
  role: "engineer",
  status: "active",
  reportsTo: "cto",
};

const pm: DelegationRoutingAgent = {
  id: "pm",
  name: "PM",
  role: "pm",
  status: "active",
  reportsTo: "ceo",
};

describe("evaluateDelegationRoute", () => {
  it("prefers product squad membership over reporting lines in matrix mode", () => {
    const decision = evaluateDelegationRoute({
      agents: [ceo, cto, frontend, pm],
      teams: [{
        id: "checkout",
        name: "Checkout Squad",
        kind: "product_squad",
        parentTeamId: null,
        leadAgentId: "pm",
        status: "active",
      }],
      memberships: [
        { teamId: "checkout", agentId: "pm", roleInTeam: "lead", isPrimary: true },
        { teamId: "checkout", agentId: "frontend", roleInTeam: "member", isPrimary: true },
      ],
      delegatorAgentId: "pm",
      delegateAgentId: "frontend",
    });

    expect(decision.kind).toBe("same_team");
    expect(decision.severity).toBe("ok");
    expect(decision.recommendedPath).toEqual(["pm", "frontend"]);
  });

  it("routes cross-team work through the target team lead as a soft warning", () => {
    const decision = evaluateDelegationRoute({
      agents: [ceo, cto, frontend, pm],
      teams: [
        {
          id: "growth",
          name: "Growth Squad",
          kind: "product_squad",
          parentTeamId: null,
          leadAgentId: "pm",
          status: "active",
        },
        {
          id: "checkout",
          name: "Checkout Squad",
          kind: "product_squad",
          parentTeamId: null,
          leadAgentId: "cto",
          status: "active",
        },
      ],
      memberships: [
        { teamId: "growth", agentId: "pm", roleInTeam: "lead", isPrimary: true },
        { teamId: "checkout", agentId: "cto", roleInTeam: "lead", isPrimary: true },
        { teamId: "checkout", agentId: "frontend", roleInTeam: "member", isPrimary: true },
      ],
      delegatorAgentId: "pm",
      delegateAgentId: "frontend",
    });

    expect(decision.kind).toBe("cross_team");
    expect(decision.severity).toBe("warning");
    expect(decision.recommendedNextDelegateId).toBe("cto");
    expect(decision.recommendedPath).toEqual(["pm", "cto", "frontend"]);
  });

  it("falls back to org chart skip-level routing when no team membership exists", () => {
    const decision = evaluateDelegationRoute({
      agents: [ceo, cto, frontend],
      delegatorAgentId: "ceo",
      delegateAgentId: "frontend",
    });

    expect(decision.kind).toBe("skip_level");
    expect(decision.severity).toBe("warning");
    expect(decision.recommendedNextDelegateId).toBe("cto");
    expect(decision.recommendedPath).toEqual(["ceo", "cto", "frontend"]);
  });

  it("uses role fallback only when org parent and team membership are missing", () => {
    const floatingEngineer = {
      ...frontend,
      reportsTo: null,
    };
    const decision = evaluateDelegationRoute({
      agents: [ceo, cto, floatingEngineer],
      delegatorAgentId: "ceo",
      delegateAgentId: "frontend",
    });

    expect(decision.kind).toBe("missing_org_parent");
    expect(decision.expectedManagerRole).toBe("cto");
    expect(decision.expectedManagerAgentId).toBe("cto");
    expect(decision.recommendedPath).toEqual(["ceo", "cto", "frontend"]);
  });
});
