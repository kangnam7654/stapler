import { Link } from "lucide-react";
import { cn } from "../lib/utils";
import { HintIcon } from "./agent-config-primitives";

/**
 * Props passed to the render-prop function when the field is in custom (editable) mode.
 */
export interface InheritableFieldInputProps {
  /** The current custom value to display. */
  value: string;
  /** Called when the user commits a new value. */
  onChange: (value: string) => void;
  /** Whether the input should be read-only (always false in custom mode). */
  readOnly: false;
  className: string;
}

export interface InheritableFieldProps {
  /** Visible label for the field. */
  label: string;
  /** Optional tooltip hint text. */
  hint?: string;
  /**
   * The agent's own override value, or `undefined` when inheriting.
   * Pass `undefined` to put the field into "inherit" mode.
   */
  value: string | undefined;
  /**
   * The resolved value after merging company defaults + agent overrides.
   * Displayed as a read-only preview when in inherit mode.
   */
  resolvedValue: string;
  /**
   * Called when the user makes a change.
   * Receives `undefined` when the user resets back to inherit.
   */
  onChange: (value: string | undefined) => void;
  /**
   * Whether the company has a default set for this field.
   * When true an "Inherited from company" badge is shown and a
   * "Reset to company default" button appears in custom mode.
   */
  companyDefault?: string;
  /**
   * Render prop for the editable input. Receives `InheritableFieldInputProps`.
   * When omitted a plain text `<input>` is rendered.
   */
  renderField?: (props: InheritableFieldInputProps) => React.ReactNode;
}

const inputClass =
  "w-full rounded-md border border-border px-2.5 py-1.5 bg-transparent outline-none text-sm font-mono placeholder:text-muted-foreground/40";

/**
 * `<InheritableField>` wraps any adapter config input with a
 * two-mode toggle: **Inherit** (read-only, shows company value + badge) and
 * **Custom** (editable, shows "Reset" button when a company default exists).
 *
 * Three UI states:
 * 1. **Inherit** — `value` is `undefined` and `companyDefault` is set.
 *    Grey read-only preview + "Inherited from company" badge + [Override] button.
 * 2. **Custom** — `value` is a non-undefined string.
 *    Editable field + optional [Reset to company default] button.
 * 3. **Unset, no default** — `value` is `undefined` and `companyDefault` is not set.
 *    Editable empty field with warning note.
 *
 * @example
 * <InheritableField
 *   label="Base URL"
 *   value={agentConfig.baseUrl}
 *   resolvedValue={resolved.baseUrl ?? ""}
 *   companyDefault={companyDefaults.baseUrl}
 *   onChange={(v) => mark("adapterConfig", "baseUrl", v)}
 *   renderField={(props) => <DraftInput {...props} onCommit={props.onChange} />}
 * />
 */
export function InheritableField({
  label,
  hint,
  value,
  resolvedValue,
  onChange,
  companyDefault,
  renderField,
}: InheritableFieldProps) {
  const isInheriting = value === undefined && companyDefault !== undefined;
  const hasCompanyDefault = companyDefault !== undefined && companyDefault !== "";

  function handleOverride() {
    // Seed the custom input with whatever is currently resolved
    onChange(resolvedValue);
  }

  function handleReset() {
    onChange(undefined);
  }

  const inputProps: InheritableFieldInputProps = {
    value: value ?? "",
    onChange,
    readOnly: false,
    className: inputClass,
  };

  return (
    <div>
      {/* Label row */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        {hint && <HintIcon text={hint} />}
        {isInheriting && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5",
              "text-[9px] font-medium leading-none",
              "bg-blue-500/10 text-blue-400 border border-blue-500/20",
            )}
            aria-label="Inherited from company default"
          >
            <Link className="h-2.5 w-2.5" aria-hidden="true" />
            Inherited from company
          </span>
        )}
      </div>

      {/* Field body */}
      {isInheriting ? (
        /* --- Inherit state --- */
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex-1 rounded-md border border-dashed border-border/80",
              "bg-muted/20 px-2.5 py-1.5 text-sm font-mono text-muted-foreground",
              "min-h-[2rem] flex items-center",
            )}
            aria-readonly="true"
          >
            {resolvedValue || <span className="opacity-40">—</span>}
          </div>
          <button
            type="button"
            onClick={handleOverride}
            className={cn(
              "shrink-0 rounded-md border border-border px-2 py-1",
              "text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground",
              "transition-colors",
            )}
          >
            Override
          </button>
        </div>
      ) : value === undefined ? (
        /* --- Unset, no company default --- */
        <div className="space-y-1">
          {renderField ? (
            renderField(inputProps)
          ) : (
            <input
              className={inputClass}
              value=""
              onChange={(e) => onChange(e.target.value || undefined)}
            />
          )}
          <p className="text-[10px] text-amber-500/80">
            No company default set — this field will be empty unless you provide a value.
          </p>
        </div>
      ) : (
        /* --- Custom state --- */
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="flex-1">
              {renderField ? (
                renderField(inputProps)
              ) : (
                <input
                  className={inputClass}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                />
              )}
            </div>
            {hasCompanyDefault && (
              <button
                type="button"
                onClick={handleReset}
                className={cn(
                  "shrink-0 rounded-md border border-border px-2 py-1",
                  "text-xs text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  "transition-colors whitespace-nowrap",
                )}
              >
                Reset
              </button>
            )}
          </div>
          {hasCompanyDefault && (
            <p className="text-[10px] text-muted-foreground/60">
              Company default:{" "}
              <span className="font-mono">{companyDefault}</span>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
