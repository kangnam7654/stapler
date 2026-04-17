import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import {
  DraftInput,
  help,
} from "../../components/agent-config-primitives";
import { InheritableField } from "../../components/InheritableField";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function formatArgList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .join(", ");
  }
  return typeof value === "string" ? value : "";
}

function parseCommaArgs(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function ProcessConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();

  // ---- Inheritable field: command ----
  const companyCommand =
    selectedCompany?.adapterDefaults?.process?.command != null
      ? String(selectedCompany.adapterDefaults.process.command)
      : undefined;

  const currentCommand: string | undefined = isCreate
    ? (values!.command || undefined)
    : (() => {
        const raw = eff("adapterConfig", "command", config.command);
        return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
      })();

  function onCommandChange(v: string | undefined) {
    if (isCreate) {
      set!({ command: v ?? "" });
    } else {
      mark("adapterConfig", "command", v || undefined);
    }
  }

  const resolvedCommand = currentCommand ?? companyCommand ?? "";

  // ---- Inheritable field: args ----
  const companyArgs =
    selectedCompany?.adapterDefaults?.process?.args != null
      ? formatArgList(selectedCompany.adapterDefaults.process.args)
      : undefined;

  const currentArgs: string | undefined = isCreate
    ? (values!.args || undefined)
    : (() => {
        const raw = eff("adapterConfig", "args", config.args);
        const formatted = formatArgList(raw);
        return formatted.length > 0 ? formatted : undefined;
      })();

  function onArgsChange(v: string | undefined) {
    if (isCreate) {
      set!({ args: v ?? "" });
    } else {
      const parsed = v ? parseCommaArgs(v) : undefined;
      mark("adapterConfig", "args", parsed && parsed.length > 0 ? parsed : undefined);
    }
  }

  const resolvedArgs = currentArgs ?? companyArgs ?? "";

  return (
    <>
      <InheritableField
        label="Command"
        hint={help.command}
        value={currentCommand}
        resolvedValue={resolvedCommand}
        companyDefault={companyCommand}
        onChange={onCommandChange}
        renderField={(props) => (
          <DraftInput
            value={props.value}
            onCommit={props.onChange}
            immediate
            className={inputClass}
            placeholder="e.g. node, python"
          />
        )}
      />
      <InheritableField
        label="Args (comma-separated)"
        hint={help.args}
        value={currentArgs}
        resolvedValue={resolvedArgs}
        companyDefault={companyArgs}
        onChange={onArgsChange}
        renderField={(props) => (
          <DraftInput
            value={props.value}
            onCommit={props.onChange}
            immediate
            className={inputClass}
            placeholder="e.g. script.js, --flag"
          />
        )}
      />
    </>
  );
}
