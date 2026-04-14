import { useState, useMemo } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "../lib/utils";

interface Model {
  id: string;
  label: string;
}

interface RemoteModelDropdownProps {
  models: Model[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  refetchModels?: () => void;
  isFetchingModels?: boolean;
}

/**
 * A self-contained model dropdown for adapters with dynamic model listing
 * (LM Studio, Ollama). Includes search, custom-model entry, and a refresh button.
 */
export function RemoteModelDropdown({
  models,
  value,
  onChange,
  placeholder = "Select model",
  refetchModels,
  isFetchingModels,
}: RemoteModelDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return models;
    return models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
    );
  }, [models, search]);

  const searchTrimmed = search.trim();
  const isCustom = Boolean(
    searchTrimmed && !models.some((m) => m.id.toLowerCase() === searchTrimmed.toLowerCase()),
  );

  function select(id: string) {
    onChange(id);
    setOpen(false);
    setSearch("");
  }

  const selectedLabel = models.find((m) => m.id === value)?.label ?? value;

  return (
    <div className="flex items-center gap-1.5">
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between"
          >
            <span className={cn(!value && "text-muted-foreground")}>
              {value ? selectedLabel : placeholder}
            </span>
            <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-1" align="start">
          <div className="relative mb-1">
            <input
              className="w-full px-2 py-1.5 pr-6 text-xs bg-transparent outline-none border-b border-border placeholder:text-muted-foreground/50"
              placeholder="Search or type model name..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
            {search && (
              <button
                type="button"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setSearch("")}
              >
                <svg aria-hidden="true" focusable="false" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}
          </div>
          <div className="max-h-[240px] overflow-y-auto">
            {/* Current value when not in list */}
            {value && !models.some((m) => m.id === value) && (
              <button
                type="button"
                className="flex items-center w-full px-2 py-1.5 text-sm rounded bg-accent/50"
                onClick={() => select(value)}
              >
                <span className="block w-full text-left truncate font-mono text-xs" title={value}>
                  {value}
                </span>
                <span className="shrink-0 ml-auto text-[9px] font-medium px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 border border-green-500/20">
                  current
                </span>
              </button>
            )}
            {/* Use typed custom name */}
            {isCustom && (
              <button
                type="button"
                className="flex items-center justify-between gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50"
                onClick={() => select(searchTrimmed)}
              >
                <span className="text-muted-foreground">Use</span>
                <span className="text-xs font-mono truncate">{searchTrimmed}</span>
              </button>
            )}
            {/* Model list */}
            {filtered.map((m) => (
              <button
                key={m.id}
                type="button"
                className={cn(
                  "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                  m.id === value && "bg-accent",
                )}
                onClick={() => select(m.id)}
              >
                <span className="block w-full text-left truncate font-mono text-xs" title={m.id}>
                  {m.label}
                </span>
              </button>
            ))}
            {filtered.length === 0 && !isCustom && (
              <p className="px-2 py-2 text-xs text-muted-foreground">
                {models.length === 0
                  ? "No models found. Make sure the server is running and has a model loaded, then click refresh."
                  : "No models match your search."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {refetchModels && (
        <button
          type="button"
          onClick={refetchModels}
          disabled={isFetchingModels}
          title="Refresh model list"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", isFetchingModels && "animate-spin")} />
        </button>
      )}
    </div>
  );
}
