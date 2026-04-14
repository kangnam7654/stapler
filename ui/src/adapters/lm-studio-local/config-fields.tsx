import type { AdapterConfigFieldsProps } from "../types";
import { RemoteModelDropdown } from "../remote-model-dropdown";
import { Field, DraftInput } from "../../components/agent-config-primitives";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

const baseUrlHint =
  "LM Studio server URL. The adapter calls its OpenAI-compatible /v1/chat/completions endpoint.";
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
  const currentModel = isCreate
    ? (values!.model ?? "")
    : eff("adapterConfig", "model", String(config.model ?? ""));

  function onModelChange(v: string) {
    if (isCreate) set!({ model: v });
    else mark("adapterConfig", "model", v || undefined);
  }

  return (
    <>
      <Field label="Base URL" hint={baseUrlHint}>
        <DraftInput
          value={
            isCreate
              ? values!.url ?? ""
              : eff("adapterConfig", "baseUrl", String(config.baseUrl ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ url: v })
              : mark("adapterConfig", "baseUrl", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="http://localhost:1234"
        />
      </Field>
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
