import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import {
  ToggleField,
  DraftInput,
  DraftNumberInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import { InheritableField } from "../../components/InheritableField";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function ClaudeLocalConfigFields({
  mode,
  isCreate,
  adapterType,
  values,
  set,
  config,
  eff,
  mark,
  models,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();

  const companyInstructionsFilePath =
    selectedCompany?.adapterDefaults?.claude_local?.instructionsFilePath != null
      ? String(selectedCompany.adapterDefaults.claude_local.instructionsFilePath)
      : undefined;

  const currentInstructionsFilePath: string | undefined = isCreate
    ? (values!.instructionsFilePath || undefined)
    : (() => {
        const raw = eff("adapterConfig", "instructionsFilePath", config.instructionsFilePath);
        return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
      })();

  function onInstructionsFilePathChange(v: string | undefined) {
    if (isCreate) {
      set!({ instructionsFilePath: v ?? "" });
    } else {
      mark("adapterConfig", "instructionsFilePath", v || undefined);
    }
  }

  const resolvedInstructionsFilePath =
    currentInstructionsFilePath ?? companyInstructionsFilePath ?? "";

  return (
    <>
      {!hideInstructionsFile && (
        <InheritableField
          label="Agent instructions file"
          hint={instructionsFileHint}
          value={currentInstructionsFilePath}
          resolvedValue={resolvedInstructionsFilePath}
          companyDefault={companyInstructionsFilePath}
          onChange={onInstructionsFilePathChange}
          renderField={(props) => (
            <div className="flex items-center gap-2">
              <DraftInput
                value={props.value}
                onCommit={props.onChange}
                immediate
                className={inputClass}
                placeholder="/absolute/path/to/AGENTS.md"
              />
              <ChoosePathButton />
            </div>
          )}
        />
      )}
      <LocalWorkspaceRuntimeFields
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
        eff={eff}
        mode={mode}
        adapterType={adapterType}
        models={models}
      />
    </>
  );
}

export function ClaudeLocalAdvancedFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();

  const companyMaxTurnsPerRun =
    selectedCompany?.adapterDefaults?.claude_local?.maxTurnsPerRun != null
      ? String(selectedCompany.adapterDefaults.claude_local.maxTurnsPerRun)
      : undefined;

  const currentMaxTurnsPerRun: string | undefined = isCreate
    ? (values!.maxTurnsPerRun != null ? String(values!.maxTurnsPerRun) : undefined)
    : (() => {
        const raw = eff("adapterConfig", "maxTurnsPerRun", config.maxTurnsPerRun);
        return raw != null && raw !== 300 ? String(raw) : undefined;
      })();

  function onMaxTurnsChange(v: string | undefined) {
    if (isCreate) {
      set!({ maxTurnsPerRun: v ? Number(v) : undefined });
    } else {
      const parsed = v ? Number(v) : undefined;
      mark("adapterConfig", "maxTurnsPerRun", parsed && parsed > 0 ? parsed : undefined);
    }
  }

  const resolvedMaxTurns =
    currentMaxTurnsPerRun ?? companyMaxTurnsPerRun ?? "300";

  return (
    <>
      <ToggleField
        label="Enable Chrome"
        hint={help.chrome}
        checked={
          isCreate
            ? values!.chrome
            : eff("adapterConfig", "chrome", config.chrome === true)
        }
        onChange={(v) =>
          isCreate
            ? set!({ chrome: v })
            : mark("adapterConfig", "chrome", v)
        }
      />
      <ToggleField
        label="Skip permissions"
        hint={help.dangerouslySkipPermissions}
        checked={
          isCreate
            ? values!.dangerouslySkipPermissions
            : eff(
                "adapterConfig",
                "dangerouslySkipPermissions",
                config.dangerouslySkipPermissions !== false,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslySkipPermissions: v })
            : mark("adapterConfig", "dangerouslySkipPermissions", v)
        }
      />
      <InheritableField
        label="Max turns per run"
        hint={help.maxTurnsPerRun}
        value={currentMaxTurnsPerRun}
        resolvedValue={resolvedMaxTurns}
        companyDefault={companyMaxTurnsPerRun}
        onChange={onMaxTurnsChange}
        renderField={(props) => (
          <DraftNumberInput
            value={props.value ? Number(props.value) : 300}
            onCommit={(v) => { props.onChange(String(v)); }}
            immediate
            className={inputClass}
          />
        )}
      />
    </>
  );
}
