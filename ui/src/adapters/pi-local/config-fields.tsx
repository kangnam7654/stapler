import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import { DraftInput } from "../../components/agent-config-primitives";
import { ChoosePathButton } from "../../components/PathInstructionsModal";
import { InheritableField } from "../../components/InheritableField";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";
const instructionsFileHint =
  "Absolute path to a markdown file (e.g. AGENTS.md) that defines this agent's behavior. Injected into the system prompt at runtime.";

export function PiLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  hideInstructionsFile,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();

  if (hideInstructionsFile) return null;

  const companyInstructionsFilePath =
    selectedCompany?.adapterDefaults?.pi_local?.instructionsFilePath != null
      ? String(selectedCompany.adapterDefaults.pi_local.instructionsFilePath)
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
  );
}
