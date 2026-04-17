import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import {
  ToggleField,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { LocalWorkspaceRuntimeFields } from "../local-workspace-runtime-fields";
import { InheritableField } from "../../components/InheritableField";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime. Note: Codex may still auto-apply repo-scoped AGENTS.md files from the workspace.";

export function CodexLocalConfigFields({
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
  const bypassEnabled =
    config.dangerouslyBypassApprovalsAndSandbox === true || config.dangerouslyBypassSandbox === true;

  const companyInstructionsFilePath =
    selectedCompany?.adapterDefaults?.codex_local?.instructionsFilePath != null
      ? String(selectedCompany.adapterDefaults.codex_local.instructionsFilePath)
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
      <ToggleField
        label="Bypass sandbox"
        hint={help.dangerouslyBypassSandbox}
        checked={
          isCreate
            ? values!.dangerouslyBypassSandbox
            : eff(
                "adapterConfig",
                "dangerouslyBypassApprovalsAndSandbox",
                bypassEnabled,
              )
        }
        onChange={(v) =>
          isCreate
            ? set!({ dangerouslyBypassSandbox: v })
            : mark("adapterConfig", "dangerouslyBypassApprovalsAndSandbox", v)
        }
      />
      <ToggleField
        label="Enable search"
        hint={help.search}
        checked={
          isCreate
            ? values!.search
            : eff("adapterConfig", "search", !!config.search)
        }
        onChange={(v) =>
          isCreate
            ? set!({ search: v })
            : mark("adapterConfig", "search", v)
        }
      />
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
