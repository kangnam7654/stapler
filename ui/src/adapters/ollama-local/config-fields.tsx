import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import { RemoteModelDropdown } from "../remote-model-dropdown";
import { InheritableField } from "../../components/InheritableField";
import { DraftInput } from "../../components/agent-config-primitives";

const DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434";

const baseUrlHint =
  "Ollama HTTP server URL. The adapter calls /v1/chat/completions on this host. Leave as-is to inherit from the company setting.";
const modelHint =
  "Ollama model id (e.g. llama3.1, qwen2.5). Must be pulled locally and must support tool calling.";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function OllamaLocalConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
  models,
  refetchModels,
  isFetchingModels,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();
  const companyBaseUrl =
    selectedCompany?.adapterDefaults?.ollama_local?.baseUrl?.trim() ||
    DEFAULT_OLLAMA_BASE_URL;

  // ---- Current values ----

  const currentBaseUrl: string | undefined = isCreate
    ? (values!.url || undefined)
    : (() => {
        const raw = eff("adapterConfig", "baseUrl", config.baseUrl);
        return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
      })();

  const currentModel: string | undefined = isCreate
    ? (values!.model ?? undefined)
    : (() => {
        const raw = eff("adapterConfig", "model", config.model);
        return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
      })();

  // ---- Change handlers ----

  function onBaseUrlChange(v: string | undefined) {
    if (isCreate) {
      set!({ url: v ?? "" });
    } else {
      mark("adapterConfig", "baseUrl", v || undefined);
    }
  }

  function onModelChange(v: string | undefined) {
    if (isCreate) {
      set!({ model: v ?? "" });
    } else {
      mark("adapterConfig", "model", v || undefined);
    }
  }

  // Resolved value for the model field (company default if no override)
  const resolvedModel =
    currentModel ??
    String(selectedCompany?.adapterDefaults?.ollama_local?.model ?? "");
  const companyDefaultModel =
    selectedCompany?.adapterDefaults?.ollama_local?.model != null
      ? String(selectedCompany.adapterDefaults.ollama_local.model)
      : undefined;

  return (
    <>
      <InheritableField
        label="Base URL"
        hint={baseUrlHint}
        value={currentBaseUrl}
        resolvedValue={companyBaseUrl}
        companyDefault={companyBaseUrl}
        onChange={onBaseUrlChange}
        renderField={(props) => (
          <DraftInput
            value={props.value}
            onCommit={props.onChange}
            immediate
            className={inputClass}
            placeholder={DEFAULT_OLLAMA_BASE_URL}
          />
        )}
      />

      <InheritableField
        label="Model"
        hint={modelHint}
        value={currentModel}
        resolvedValue={resolvedModel}
        companyDefault={companyDefaultModel}
        onChange={onModelChange}
        renderField={(props) => (
          <RemoteModelDropdown
            models={models}
            value={props.value}
            onChange={props.onChange}
            placeholder="llama3.1"
            refetchModels={refetchModels}
            isFetchingModels={isFetchingModels}
          />
        )}
      />
    </>
  );
}
