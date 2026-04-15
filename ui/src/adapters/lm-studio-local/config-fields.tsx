import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import { RemoteModelDropdown } from "../remote-model-dropdown";
import { resolveLmStudioBaseUrlMode, resolveLmStudioCompanyBaseUrl } from "./base-url";
import { Field, DraftInput } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const baseUrlHint =
  "Choose whether this agent inherits the company LM Studio server or uses its own URL.";
const modelHint =
  "Model id as shown in LM Studio. Must be loaded in LM Studio and must support tool calling.";

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
  const companyBaseUrl = resolveLmStudioCompanyBaseUrl(selectedCompany);

  const currentMode = resolveLmStudioBaseUrlMode(
    isCreate ? values!.lmStudioBaseUrlMode : eff("adapterConfig", "baseUrlMode", config.baseUrlMode),
    isCreate ? values!.url : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? "")),
  );

  const currentModel = isCreate
    ? (values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));

  const currentBaseUrl = isCreate
    ? (values!.url ?? "")
    : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""));

  function onModelChange(v: string) {
    if (isCreate) set!({ model: v });
    else mark("adapterConfig", "model", v || undefined);
  }

  function onModeChange(nextMode: "company" | "custom") {
    if (isCreate) {
      set!({
        lmStudioBaseUrlMode: nextMode,
        url: nextMode === "custom" ? (values!.url?.trim() || companyBaseUrl) : values!.url,
      });
      return;
    }

    mark("adapterConfig", "baseUrlMode", nextMode);
    if (nextMode === "custom" && !currentBaseUrl.trim()) {
      mark("adapterConfig", "baseUrl", companyBaseUrl);
    }
  }

  return (
    <>
      <Field label="Base URL source" hint={baseUrlHint}>
        <select
          value={currentMode}
          onChange={(e) => onModeChange(e.target.value === "custom" ? "custom" : "company")}
          className={inputClass}
        >
          <option value="company">Use company setting</option>
          <option value="custom">Use custom URL</option>
        </select>
      </Field>

      {currentMode === "company" ? (
        <div className="rounded-md border border-dashed border-border/80 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          Using company LM Studio URL: <span className="font-mono text-foreground">{companyBaseUrl}</span>
        </div>
      ) : (
        <Field label="Base URL" hint="This agent-only URL overrides the company setting.">
          <DraftInput
            value={currentBaseUrl}
            onCommit={(v) =>
              isCreate
                ? set!({ url: v })
                : mark("adapterConfig", "baseUrl", v || undefined)
            }
            immediate
            className={inputClass}
            placeholder={companyBaseUrl}
          />
        </Field>
      )}

      <Field label="Model" hint={modelHint}>
        <RemoteModelDropdown
          models={models}
          value={currentModel}
          onChange={onModelChange}
          placeholder="local-model"
          refetchModels={refetchModels}
          isFetchingModels={isFetchingModels}
        />
      </Field>
    </>
  );
}
