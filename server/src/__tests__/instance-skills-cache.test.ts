import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import {
  createInstanceSkillsCache,
  makeInstanceSkillId,
} from "../services/instance-skills-cache.js";

const cleanupDirs = new Set<string>();

afterEach(async () => {
  await Promise.all(
    Array.from(cleanupDirs, (d) => fs.rm(d, { recursive: true, force: true })),
  );
  cleanupDirs.clear();
});

async function makeTempDir(prefix: string) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  cleanupDirs.add(dir);
  return dir;
}

async function writeSkillDir(
  root: string,
  name: string,
  frontmatter: { name?: string; description?: string } = {},
) {
  const dir = path.join(root, name);
  await fs.mkdir(dir, { recursive: true });
  const fm = Object.entries(frontmatter)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
  await fs.writeFile(
    path.join(dir, "SKILL.md"),
    `---\n${fm || `name: ${name}`}\n---\n\n# ${name}\n`,
  );
  return dir;
}

describe("makeInstanceSkillId", () => {
  it("returns a stable UUID-shaped string for the same key", () => {
    const id1 = makeInstanceSkillId("claude/research");
    const id2 = makeInstanceSkillId("claude/research");
    expect(id1).toBe(id2);
    expect(id1).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("returns different IDs for different keys", () => {
    expect(makeInstanceSkillId("claude/a")).not.toBe(makeInstanceSkillId("claude/b"));
  });
});

describe("instanceSkillsCache — claude_code skills", () => {
  it("loads skills from the claude skills directory", async () => {
    const root = await makeTempDir("cc-skills-");
    await writeSkillDir(root, "research", {
      name: "Research",
      description: "Multi-source research",
    });
    await writeSkillDir(root, "auto-dev", { name: "Auto Dev" });

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    const result = await cache.scan();

    expect(result.claudeCodeCount).toBe(2);
    expect(result.pluginCount).toBe(0);
    expect(result.count).toBe(2);

    const skills = cache.getAll();
    const research = skills.find((s) => s.key === "claude/research");
    expect(research).toBeDefined();
    expect(research!.name).toBe("Research");
    expect(research!.description).toBe("Multi-source research");
    expect(research!.sourceType).toBe("claude_code");
    expect(research!.sourceLabel).toBe("Claude Code");
    expect(research!.slug).toBe("research");
  });

  it("skips workspace directories", async () => {
    const root = await makeTempDir("cc-skills-ws-");
    await writeSkillDir(root, "real-skill");
    await writeSkillDir(root, "auto-dev-workspace");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const keys = cache.getAll().map((s) => s.key);
    expect(keys).toContain("claude/real-skill");
    expect(keys).not.toContain("claude/auto-dev-workspace");
  });

  it("skips _shared directory", async () => {
    const root = await makeTempDir("cc-skills-shared-");
    await writeSkillDir(root, "good-skill");
    const sharedDir = path.join(root, "_shared");
    await fs.mkdir(sharedDir);
    await fs.writeFile(path.join(sharedDir, "SKILL.md"), "---\nname: shared\n---\n");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const keys = cache.getAll().map((s) => s.key);
    expect(keys).not.toContain("claude/_shared");
  });

  it("skips directories without SKILL.md", async () => {
    const root = await makeTempDir("cc-skills-nomd-");
    const noMdDir = path.join(root, "no-skill-md");
    await fs.mkdir(noMdDir);
    await fs.writeFile(path.join(noMdDir, "README.md"), "nothing");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    expect(cache.getAll()).toHaveLength(0);
  });

  it("returns empty list when claudeSkillsDir does not exist", async () => {
    const cache = createInstanceSkillsCache({
      claudeSkillsDir: "/nonexistent/path/that/does/not/exist",
      pluginsCacheDir: null,
    });
    const result = await cache.scan();
    expect(result.count).toBe(0);
    expect(cache.getAll()).toHaveLength(0);
  });

  it("getById returns skill by deterministic id", async () => {
    const root = await makeTempDir("cc-skills-byid-");
    await writeSkillDir(root, "pdf");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    const skill = cache.getAll()[0];
    expect(cache.getById(skill.id)).toBe(skill);
    expect(cache.getById("nonexistent-id")).toBeUndefined();
  });
});

describe("instanceSkillsCache — claude_plugin skills", () => {
  it("loads skills from plugin cache directories", async () => {
    const cacheRoot = await makeTempDir("cc-plugins-");
    const skillsDir = path.join(
      cacheRoot,
      "claude-plugins-official",
      "superpowers",
      "5.0.7",
      "skills",
    );
    await writeSkillDir(skillsDir, "brainstorming", {
      name: "Brainstorming",
      description: "Idea refinement",
    });
    await writeSkillDir(skillsDir, "writing-plans", { name: "Writing Plans" });

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: null,
      pluginsCacheDir: cacheRoot,
    });
    const result = await cache.scan();

    expect(result.pluginCount).toBe(2);
    expect(result.claudeCodeCount).toBe(0);

    const brainstorm = cache.getAll().find((s) => s.key === "claude-plugins/superpowers/brainstorming");
    expect(brainstorm).toBeDefined();
    expect(brainstorm!.sourceType).toBe("claude_plugin");
    expect(brainstorm!.pluginName).toBe("superpowers");
    expect(brainstorm!.pluginVersion).toBe("5.0.7");
    expect(brainstorm!.sourceLabel).toBe("superpowers 5.0.7");
  });

  it("returns empty list when pluginsCacheDir does not exist", async () => {
    const cache = createInstanceSkillsCache({
      claudeSkillsDir: null,
      pluginsCacheDir: "/nonexistent/plugins/cache",
    });
    const result = await cache.scan();
    expect(result.pluginCount).toBe(0);
  });
});

describe("instanceSkillsCache — getByKey", () => {
  it("looks up a skill by key", async () => {
    const root = await makeTempDir("cc-skills-bykey-");
    await writeSkillDir(root, "research");

    const cache = createInstanceSkillsCache({
      claudeSkillsDir: root,
      pluginsCacheDir: null,
    });
    await cache.scan();

    expect(cache.getByKey("claude/research")).toBeDefined();
    expect(cache.getByKey("claude/nonexistent")).toBeUndefined();
  });
});
