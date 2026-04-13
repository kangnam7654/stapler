import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface InstanceSkill {
  id: string;
  key: string;
  slug: string;
  name: string;
  description: string | null;
  diskPath: string;
  markdown: string;
  sourceType: "claude_code" | "claude_plugin";
  sourceLabel: string;
  pluginName?: string;
  pluginVersion?: string;
}

export interface InstanceSkillScanResult {
  count: number;
  claudeCodeCount: number;
  pluginCount: number;
}

export interface InstanceSkillsCacheOptions {
  claudeSkillsDir: string | null;
  pluginsCacheDir: string | null;
}

export function makeInstanceSkillId(key: string): string {
  const h = createHash("sha256").update(`instance-skill:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}

function parseFrontmatter(content: string): { name?: string; description?: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const result: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const k = line.slice(0, colonIdx).trim();
    const v = line.slice(colonIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (k) result[k] = v;
  }
  return { name: result["name"], description: result["description"] };
}

async function tryReadFile(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

async function tryReaddir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

async function scanClaudeSkillsDir(root: string): Promise<InstanceSkill[]> {
  const entries = await tryReaddir(root);
  const skills: InstanceSkill[] = [];

  for (const entry of entries) {
    if (entry === "_shared" || entry.endsWith("-workspace")) continue;
    const skillDir = path.join(root, entry);
    let stat: import("node:fs").Stats;
    try {
      stat = await fs.stat(skillDir);
    } catch {
      continue;
    }
    if (!stat.isDirectory()) continue;

    const skillMdPath = path.join(skillDir, "SKILL.md");
    const content = await tryReadFile(skillMdPath);
    if (!content) continue;

    const { name, description } = parseFrontmatter(content);
    const key = `claude/${entry}`;
    skills.push({
      id: makeInstanceSkillId(key),
      key,
      slug: entry,
      name: name ?? entry,
      description: description ?? null,
      diskPath: skillMdPath,
      markdown: content,
      sourceType: "claude_code",
      sourceLabel: "Claude Code",
    });
  }

  return skills;
}

async function scanPluginsCacheDir(cacheRoot: string): Promise<InstanceSkill[]> {
  const skills: InstanceSkill[] = [];
  const publishers = await tryReaddir(cacheRoot);

  for (const publisher of publishers) {
    const publisherDir = path.join(cacheRoot, publisher);
    const plugins = await tryReaddir(publisherDir);

    for (const pluginName of plugins) {
      const pluginDir = path.join(publisherDir, pluginName);
      const versions = await tryReaddir(pluginDir);

      for (const version of versions) {
        const skillsDir = path.join(pluginDir, version, "skills");
        const skillNames = await tryReaddir(skillsDir);

        for (const skillName of skillNames) {
          const skillDir = path.join(skillsDir, skillName);
          let stat: import("node:fs").Stats;
          try {
            stat = await fs.stat(skillDir);
          } catch {
            continue;
          }
          if (!stat.isDirectory()) continue;

          const skillMdPath = path.join(skillDir, "SKILL.md");
          const content = await tryReadFile(skillMdPath);
          if (!content) continue;

          const { name, description } = parseFrontmatter(content);
          const key = `claude-plugins/${pluginName}/${skillName}`;
          skills.push({
            id: makeInstanceSkillId(key),
            key,
            slug: skillName,
            name: name ?? skillName,
            description: description ?? null,
            diskPath: skillMdPath,
            markdown: content,
            sourceType: "claude_plugin",
            sourceLabel: `${pluginName} ${version}`,
            pluginName,
            pluginVersion: version,
          });
        }
      }
    }
  }

  return skills;
}

export function createInstanceSkillsCache(opts?: InstanceSkillsCacheOptions) {
  const defaultOpts: InstanceSkillsCacheOptions = {
    claudeSkillsDir: path.join(os.homedir(), ".claude", "skills"),
    pluginsCacheDir: path.join(os.homedir(), ".claude", "plugins", "cache"),
  };
  const options = opts ?? defaultOpts;

  const byId = new Map<string, InstanceSkill>();
  const byKey = new Map<string, InstanceSkill>();

  async function scan(): Promise<InstanceSkillScanResult> {
    byId.clear();
    byKey.clear();

    const claudeSkills = options.claudeSkillsDir
      ? await scanClaudeSkillsDir(options.claudeSkillsDir)
      : [];
    const pluginSkills = options.pluginsCacheDir
      ? await scanPluginsCacheDir(options.pluginsCacheDir)
      : [];

    for (const skill of [...claudeSkills, ...pluginSkills]) {
      byId.set(skill.id, skill);
      byKey.set(skill.key, skill);
    }

    return {
      count: byId.size,
      claudeCodeCount: claudeSkills.length,
      pluginCount: pluginSkills.length,
    };
  }

  return {
    scan,
    getAll: (): InstanceSkill[] => Array.from(byId.values()),
    getById: (id: string): InstanceSkill | undefined => byId.get(id),
    getByKey: (key: string): InstanceSkill | undefined => byKey.get(key),
  };
}

// Module-level singleton using default OS paths
export const instanceSkillsCache = createInstanceSkillsCache();
