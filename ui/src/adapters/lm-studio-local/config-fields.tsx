import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import { RemoteModelDropdown } from "../remote-model-dropdown";
import { InheritableField } from "../../components/InheritableField";
import { DraftInput } from "../../components/agent-config-primitives";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@paperclipai/adapter-lm-studio-local";

// Legacy `baseUrlMode` field is no longer written by the UI. Existing persisted
// values are silently ignored — server-side normalisation strips them on the
// next save. Removal migration is tracked in Phase 6.

const baseUrlHint =
  "LM Studio HTTP server URL. Leave as-is to inherit from the company setting.";
const modelHint =
  "Model id as shown in LM Studio. Must be loaded in LM Studio and must support tool calling.";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

export function LmStudioLocalConfigFields({
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
    selectedCompany?.adapterDefaults?.lm_studio_local?.baseUrl?.trim() ||
    DEFAULT_LM_STUDIO_BASE_URL;

  // ---- Current values ----

  // In create mode `values.url` holds the base URL draft. A non-empty value
  // means the user has set a custom URL; undefined/empty means inherit.
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
    String(selectedCompany?.adapterDefaults?.lm_studio_local?.model ?? "");
  const companyDefaultModel =
    selectedCompany?.adapterDefaults?.lm_studio_local?.model != null
      ? String(selectedCompany.adapterDefaults.lm_studio_local.model)
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
            placeholder={DEFAULT_LM_STUDIO_BASE_URL}
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
            placeholder="local-model"
            refetchModels={refetchModels}
            isFetchingModels={isFetchingModels}
          />
        )}
      />
    </>
  );
}
