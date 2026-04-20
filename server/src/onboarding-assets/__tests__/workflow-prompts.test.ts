// This spec is intentionally written RED against yet-to-be-landed onboarding
// prompt changes (plan: doc/plans/2026-04-21-multi-agent-12-step-workflow.md).
// Each assertion pins a specific, contract-level phrase that the 12-step workflow
// depends on; weakening the phrase should force a deliberate review of both the
// prompt and the runtime handshake that consumes it.
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, "..");

function read(relPath: string): string {
  const p = resolve(ASSETS, relPath);
  return readFileSync(p, "utf8");
}

/**
 * Safe-read for files that may not yet exist in the pre-implementation RED
 * state. Returns `null` when missing; callers treat that as a definitive
 * assertion failure instead of an ENOENT crash that aborts the whole file.
 */
function readIfExists(relPath: string): string | null {
  const p = resolve(ASSETS, relPath);
  if (!existsSync(p)) return null;
  return readFileSync(p, "utf8");
}

describe("onboarding-assets/company-docs/WORKFLOW-HIRING.md", () => {
  const path = resolve(ASSETS, "company-docs/WORKFLOW-HIRING.md");

  it("exists", () => {
    expect(existsSync(path)).toBe(true);
  });

  it("defines the 5-turn and 3-turn variants plus CEO-only solo path", () => {
    const c = readIfExists("company-docs/WORKFLOW-HIRING.md");
    expect(c, "WORKFLOW-HIRING.md must exist").not.toBeNull();
    expect(c).toContain("5 turns");
    expect(c).toContain("3 turns");
    expect(c).toContain("CEO substitutes");
  });

  it("references the agent-hires endpoint and enforces active-only agent counting", () => {
    const c = readIfExists("company-docs/WORKFLOW-HIRING.md");
    expect(c, "WORKFLOW-HIRING.md must exist").not.toBeNull();
    expect(c).toContain("agent-hires");
    expect(c).toMatch(/status=active/);
  });

  it("defines best-fit critic selection for out-of-domain hires", () => {
    const c = readIfExists("company-docs/WORKFLOW-HIRING.md");
    expect(c, "WORKFLOW-HIRING.md must exist").not.toBeNull();
    expect(c).toContain("best-fit");
  });

  it("defines concurrent same-role consolidation", () => {
    const c = readIfExists("company-docs/WORKFLOW-HIRING.md");
    expect(c, "WORKFLOW-HIRING.md must exist").not.toBeNull();
    expect(c!.toLowerCase()).toContain("consolidat");
  });

  it("defines the reject-loop cap inside hiring (3 rejections escalate to CEO)", () => {
    const c = readIfExists("company-docs/WORKFLOW-HIRING.md");
    expect(c, "WORKFLOW-HIRING.md must exist").not.toBeNull();
    expect(c).toMatch(/3\s+rejections?/);
  });
});

describe("onboarding-assets/ceo/HEARTBEAT.md", () => {
  it("§6 Delegation points at WORKFLOW-HIRING.md and requires org-shape check", () => {
    const c = read("ceo/HEARTBEAT.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
    expect(c).toMatch(/status=active/);
  });

  it("no longer carries the bare 'paperclip-create-agent skill' instruction", () => {
    const c = read("ceo/HEARTBEAT.md");
    // Bare recommendation removed; skill may still be mentioned as the underlying actuator but must be tied to WORKFLOW-HIRING.
    expect(c).not.toMatch(/^- Use `paperclip-create-agent` skill when hiring new agents\.$/m);
  });
});

describe("onboarding-assets/c-level/AGENTS.md", () => {
  it("requires WORKFLOW-HIRING.md and forbids direct hiring", () => {
    const c = read("c-level/AGENTS.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
    expect(c).toMatch(/do not hire directly/i);
  });
});

describe("onboarding-assets/default/AGENTS.md", () => {
  it("mandates child-issue decomposition with parentId", () => {
    const c = read("default/AGENTS.md");
    expect(c).toContain("parentId");
    expect(c.toLowerCase()).toContain("child issue");
  });

  it("defines the depends-on / blocked convention", () => {
    const c = read("default/AGENTS.md");
    expect(c).toContain("depends on #");
    expect(c).toContain("blocked");
  });

  it("requires out-of-skill escalation (worker does not self-hire)", () => {
    const c = read("default/AGENTS.md");
    expect(c.toLowerCase()).toContain("out-of-skill");
  });

  it("defines the 2-heartbeat non-dependency blocker rule", () => {
    const c = read("default/AGENTS.md");
    expect(c).toMatch(/two heartbeats|2 heartbeats/i);
  });
});

describe("onboarding-assets/company-docs/WORKFLOW-CEO.md", () => {
  it("adds Org-Shape Branching section before Delegation Routing", () => {
    const c = read("company-docs/WORKFLOW-CEO.md");
    expect(c).toContain("Org-Shape Branching");
    const orgIdx = c.indexOf("Org-Shape Branching");
    const delIdx = c.indexOf("Delegation Routing");
    expect(orgIdx).toBeGreaterThan(-1);
    expect(delIdx).toBeGreaterThan(-1);
    expect(orgIdx).toBeLessThan(delIdx);
  });

  it("requires Epic closure as in_review with a synthesis comment", () => {
    const c = read("company-docs/WORKFLOW-CEO.md");
    expect(c).toContain("in_review");
    expect(c.toLowerCase()).toContain("synthesis");
  });
});

describe("onboarding-assets/company-docs/WORKFLOW-EXEC.md", () => {
  it("triggers WORKFLOW-HIRING when a worker is missing", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c).toContain("WORKFLOW-HIRING.md");
  });

  it("defines reopen vs corrective-issue policy", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c.toLowerCase()).toContain("reopen");
    expect(c.toLowerCase()).toContain("corrective");
  });

  it("defines 3-rework escalation to CEO", () => {
    const c = read("company-docs/WORKFLOW-EXEC.md");
    expect(c).toMatch(/3\s*rework/i);
  });
});

describe("required-reading cross-references", () => {
  // The `../../../docs/<name>.md` paths in c-level/AGENTS.md are runtime-resolved
  // by the agent framework, not simple filesystem paths. So we don't validate them
  // relative to the source tree. We only check that each document name mentioned in
  // Required Reading exists as a sibling in company-docs (where they live at build time).
  //
  // Structural invariant: the `## Required Reading` section MUST exist and MUST
  // list at least one doc. If a future refactor renames the header, the
  // `names.length > 0` assertion fires and forces the rename to be reviewed
  // rather than silently skipping the cross-reference validation.
  it("every Required Reading doc name mentioned in c-level/AGENTS.md exists in company-docs/", () => {
    const c = read("c-level/AGENTS.md");
    expect(c, "c-level/AGENTS.md must declare a `## Required Reading` section").toContain(
      "## Required Reading",
    );
    const readingBlock = c.split("## Required Reading")[1]?.split("## ")[0] ?? "";
    const names = [...readingBlock.matchAll(/([A-Z0-9_-]+\.md)/g)].map((m) => m[1]);
    expect(
      names.length,
      "Required Reading must list at least one .md doc name",
    ).toBeGreaterThan(0);
    for (const name of names) {
      const candidate = resolve(ASSETS, "company-docs", name);
      expect(existsSync(candidate), `expected company-docs/${name} to exist`).toBe(true);
    }
  });
});
