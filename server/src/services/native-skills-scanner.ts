/**
 * Adapter for the Rust-backed skills scanner.
 *
 * Wraps `@paperclipai/skills-scanner-native` (native/skills-scanner in
 * the pnpm workspace) and maps its snake_case JSON output to the
 * internal camelCase `ImportedSkill` shape used by company-skills.ts.
 *
 * If the native binary is unavailable (not built, unsupported
 * platform, or load failure), `isNativeSkillsScannerAvailable` is
 * false and callers must use the pure-TS fallback.
 *
 * Set `PAPERCLIP_DISABLE_NATIVE_SKILLS=1` to force the fallback even
 * when the binary is present (useful for A/B debugging).
 */

import nativeBinding from "@paperclipai/skills-scanner-native";
import type {
  CompanySkillCompatibility,
  CompanySkillFileInventoryEntry,
  CompanySkillSourceType,
  CompanySkillTrustLevel,
} from "@paperclipai/shared";

// ── Public types ──────────────────────────────────────────────────────────

export type NativeImportedSkill = {
  key: string;
  slug: string;
  name: string;
  description: string | null;
  markdown: string;
  packageDir: string | null;
  sourceType: CompanySkillSourceType;
  sourceLocator: string | null;
  sourceRef: string | null;
  trustLevel: CompanySkillTrustLevel;
  compatibility: CompanySkillCompatibility;
  fileInventory: CompanySkillFileInventoryEntry[];
  metadata: Record<string, unknown> | null;
};

export type NativeWorkspaceScanResult = {
  workspaceCwd: string;
  skills: NativeImportedSkill[];
};

// ── Raw Rust JSON shape (snake_case) ──────────────────────────────────────

type RustFileInventoryEntry = {
  path: string;
  kind: CompanySkillFileInventoryEntry["kind"];
};

type RustImportedSkill = {
  key: string;
  slug: string;
  name: string;
  description: string | null;
  markdown: string;
  package_dir: string | null;
  source_type: CompanySkillSourceType;
  source_locator: string | null;
  source_ref: string | null;
  trust_level: CompanySkillTrustLevel;
  compatibility: CompanySkillCompatibility;
  file_inventory: RustFileInventoryEntry[];
  metadata: Record<string, unknown> | null;
};

type RustWorkspaceScanResult = {
  workspace_cwd: string;
  skills: RustImportedSkill[];
};

// ── Availability detection ────────────────────────────────────────────────

const disabledByEnv = process.env.PAPERCLIP_DISABLE_NATIVE_SKILLS === "1";

export const isNativeSkillsScannerAvailable: boolean =
  nativeBinding !== null && !disabledByEnv;

let startupLogged = false;
function logStartupOnce(): void {
  if (startupLogged) return;
  startupLogged = true;
  if (isNativeSkillsScannerAvailable) {
    // eslint-disable-next-line no-console
    console.info("[skills-scanner] native module active");
  } else if (disabledByEnv) {
    // eslint-disable-next-line no-console
    console.info(
      "[skills-scanner] native module disabled via PAPERCLIP_DISABLE_NATIVE_SKILLS=1 — using TS fallback",
    );
  } else {
    // eslint-disable-next-line no-console
    console.info(
      "[skills-scanner] native module not available — using TS fallback",
    );
  }
}

// ── Field mapping ─────────────────────────────────────────────────────────

function mapRustSkill(raw: RustImportedSkill): NativeImportedSkill {
  return {
    key: raw.key,
    slug: raw.slug,
    name: raw.name,
    description: raw.description,
    markdown: raw.markdown,
    packageDir: raw.package_dir,
    sourceType: raw.source_type,
    sourceLocator: raw.source_locator,
    sourceRef: raw.source_ref,
    trustLevel: raw.trust_level,
    compatibility: raw.compatibility,
    fileInventory: raw.file_inventory.map((entry) => ({
      path: entry.path,
      kind: entry.kind,
    })),
    metadata: raw.metadata,
  };
}

// ── Public API ────────────────────────────────────────────────────────────

/**
 * Scan a workspace using the native Rust module.
 *
 * Throws if the native module is unavailable — callers should check
 * `isNativeSkillsScannerAvailable` before calling this, and fall back
 * to the TS path on any thrown error.
 */
export async function scanWorkspaceSkillsNative(
  companyId: string,
  workspaceCwd: string,
): Promise<NativeWorkspaceScanResult> {
  logStartupOnce();

  if (!nativeBinding || disabledByEnv) {
    throw new Error(
      "native skills scanner unavailable (check isNativeSkillsScannerAvailable before calling)",
    );
  }

  const json = await nativeBinding.scanWorkspaceSkillsAsync(
    companyId,
    workspaceCwd,
  );
  const parsed = JSON.parse(json) as RustWorkspaceScanResult;

  return {
    workspaceCwd: parsed.workspace_cwd,
    skills: parsed.skills.map(mapRustSkill),
  };
}
