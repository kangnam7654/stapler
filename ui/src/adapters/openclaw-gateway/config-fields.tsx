import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useCompany } from "../../context/CompanyContext";
import type { AdapterConfigFieldsProps } from "../types";
import {
  Field,
  DraftInput,
  help,
} from "../../components/agent-config-primitives";
import { InheritableField } from "../../components/InheritableField";
import {
  PayloadTemplateJsonField,
  RuntimeServicesJsonField,
} from "../runtime-json-fields";

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

function SecretField({
  label,
  value,
  onCommit,
  placeholder,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
  placeholder?: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
        >
          {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        </button>
        <DraftInput
          value={value}
          onCommit={onCommit}
          immediate
          type={visible ? "text" : "password"}
          className={inputClass + " pl-8"}
          placeholder={placeholder}
        />
      </div>
    </Field>
  );
}

function parseScopes(value: unknown): string {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string").join(", ");
  }
  return typeof value === "string" ? value : "";
}

export function OpenClawGatewayConfigFields({
  isCreate,
  values,
  set,
  config,
  eff,
  mark,
}: AdapterConfigFieldsProps) {
  const { selectedCompany } = useCompany();

  const configuredHeaders =
    config.headers && typeof config.headers === "object" && !Array.isArray(config.headers)
      ? (config.headers as Record<string, unknown>)
      : {};
  const effectiveHeaders =
    (eff("adapterConfig", "headers", configuredHeaders) as Record<string, unknown>) ?? {};

  const effectiveGatewayToken = typeof effectiveHeaders["x-openclaw-token"] === "string"
    ? String(effectiveHeaders["x-openclaw-token"])
    : typeof effectiveHeaders["x-openclaw-auth"] === "string"
      ? String(effectiveHeaders["x-openclaw-auth"])
      : "";

  const commitGatewayToken = (rawValue: string) => {
    const nextValue = rawValue.trim();
    const nextHeaders: Record<string, unknown> = { ...effectiveHeaders };
    if (nextValue) {
      nextHeaders["x-openclaw-token"] = nextValue;
      delete nextHeaders["x-openclaw-auth"];
    } else {
      delete nextHeaders["x-openclaw-token"];
      delete nextHeaders["x-openclaw-auth"];
    }
    mark("adapterConfig", "headers", Object.keys(nextHeaders).length > 0 ? nextHeaders : undefined);
  };

  const sessionStrategy = eff(
    "adapterConfig",
    "sessionKeyStrategy",
    String(config.sessionKeyStrategy ?? "fixed"),
  );

  // ---- Inheritable field: paperclipApiUrl ----
  const companyPaperclipApiUrl =
    selectedCompany?.adapterDefaults?.openclaw_gateway?.paperclipApiUrl != null
      ? String(selectedCompany.adapterDefaults.openclaw_gateway.paperclipApiUrl)
      : undefined;

  const currentPaperclipApiUrl: string | undefined = (() => {
    const raw = eff("adapterConfig", "paperclipApiUrl", config.paperclipApiUrl);
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
  })();

  const resolvedPaperclipApiUrl =
    currentPaperclipApiUrl ?? companyPaperclipApiUrl ?? "";

  // ---- Inheritable field: role ----
  const companyRole =
    selectedCompany?.adapterDefaults?.openclaw_gateway?.role != null
      ? String(selectedCompany.adapterDefaults.openclaw_gateway.role)
      : undefined;

  const currentRole: string | undefined = (() => {
    const raw = eff("adapterConfig", "role", config.role);
    return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : undefined;
  })();

  const resolvedRole = currentRole ?? companyRole ?? "operator";

  // ---- Inheritable field: scopes ----
  const companyScopes =
    selectedCompany?.adapterDefaults?.openclaw_gateway?.scopes != null
      ? parseScopes(selectedCompany.adapterDefaults.openclaw_gateway.scopes)
      : undefined;

  const currentScopes: string | undefined = (() => {
    const raw = eff("adapterConfig", "scopes", config.scopes);
    const parsed = parseScopes(raw ?? config.scopes ?? ["operator.admin"]);
    // Treat default "operator.admin" as having no explicit value (allow inherit)
    return parsed && parsed !== "operator.admin" ? parsed : undefined;
  })();

  const resolvedScopes = currentScopes ?? companyScopes ?? "operator.admin";

  // ---- Inheritable field: waitTimeoutMs ----
  const companyWaitTimeoutMs =
    selectedCompany?.adapterDefaults?.openclaw_gateway?.waitTimeoutMs != null
      ? String(selectedCompany.adapterDefaults.openclaw_gateway.waitTimeoutMs)
      : undefined;

  const currentWaitTimeoutMs: string | undefined = (() => {
    const raw = eff("adapterConfig", "waitTimeoutMs", config.waitTimeoutMs);
    return raw != null && raw !== 120000 ? String(raw) : undefined;
  })();

  const resolvedWaitTimeoutMs = currentWaitTimeoutMs ?? companyWaitTimeoutMs ?? "120000";

  return (
    <>
      {/* Gateway URL is deployment-specific and not inheritable */}
      <Field label="Gateway URL" hint={help.webhookUrl}>
        <DraftInput
          value={
            isCreate
              ? values!.url
              : eff("adapterConfig", "url", String(config.url ?? ""))
          }
          onCommit={(v) =>
            isCreate
              ? set!({ url: v })
              : mark("adapterConfig", "url", v || undefined)
          }
          immediate
          className={inputClass}
          placeholder="ws://127.0.0.1:18789"
        />
      </Field>

      <PayloadTemplateJsonField
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
      />

      <RuntimeServicesJsonField
        isCreate={isCreate}
        values={values}
        set={set}
        config={config}
        mark={mark}
      />

      {!isCreate && (
        <>
          <InheritableField
            label="Paperclip API URL override"
            value={currentPaperclipApiUrl}
            resolvedValue={resolvedPaperclipApiUrl}
            companyDefault={companyPaperclipApiUrl}
            onChange={(v) => mark("adapterConfig", "paperclipApiUrl", v || undefined)}
            renderField={(props) => (
              <DraftInput
                value={props.value}
                onCommit={props.onChange}
                immediate
                className={inputClass}
                placeholder="https://paperclip.example"
              />
            )}
          />

          {/* Session strategy and session key are per-agent state, not inheritable */}
          <Field label="Session strategy">
            <select
              value={sessionStrategy}
              onChange={(e) => mark("adapterConfig", "sessionKeyStrategy", e.target.value)}
              className={inputClass}
            >
              <option value="fixed">Fixed</option>
              <option value="issue">Per issue</option>
              <option value="run">Per run</option>
            </select>
          </Field>

          {sessionStrategy === "fixed" && (
            <Field label="Session key">
              <DraftInput
                value={eff("adapterConfig", "sessionKey", String(config.sessionKey ?? "paperclip"))}
                onCommit={(v) => mark("adapterConfig", "sessionKey", v || undefined)}
                immediate
                className={inputClass}
                placeholder="paperclip"
              />
            </Field>
          )}

          {/* Gateway token contains secrets — preserve existing secret handling pattern */}
          <SecretField
            label="Gateway auth token (x-openclaw-token)"
            value={effectiveGatewayToken}
            onCommit={commitGatewayToken}
            placeholder="OpenClaw gateway token"
          />

          <InheritableField
            label="Role"
            value={currentRole}
            resolvedValue={resolvedRole}
            companyDefault={companyRole}
            onChange={(v) => mark("adapterConfig", "role", v || undefined)}
            renderField={(props) => (
              <DraftInput
                value={props.value}
                onCommit={props.onChange}
                immediate
                className={inputClass}
                placeholder="operator"
              />
            )}
          />

          <InheritableField
            label="Scopes (comma-separated)"
            value={currentScopes}
            resolvedValue={resolvedScopes}
            companyDefault={companyScopes}
            onChange={(v) => {
              const parsed = v
                ? v.split(",").map((entry) => entry.trim()).filter(Boolean)
                : undefined;
              mark("adapterConfig", "scopes", parsed && parsed.length > 0 ? parsed : undefined);
            }}
            renderField={(props) => (
              <DraftInput
                value={props.value}
                onCommit={props.onChange}
                immediate
                className={inputClass}
                placeholder="operator.admin"
              />
            )}
          />

          <InheritableField
            label="Wait timeout (ms)"
            value={currentWaitTimeoutMs}
            resolvedValue={resolvedWaitTimeoutMs}
            companyDefault={companyWaitTimeoutMs}
            onChange={(v) => {
              const parsed = v ? Number.parseInt(v.trim(), 10) : undefined;
              mark(
                "adapterConfig",
                "waitTimeoutMs",
                parsed != null && Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
              );
            }}
            renderField={(props) => (
              <DraftInput
                value={props.value}
                onCommit={props.onChange}
                immediate
                className={inputClass}
                placeholder="120000"
              />
            )}
          />

          <Field label="Device auth">
            <div className="text-xs text-muted-foreground leading-relaxed">
              Always enabled for gateway agents. Paperclip persists a device key during onboarding so pairing approvals
              remain stable across runs.
            </div>
          </Field>
        </>
      )}
    </>
  );
}
