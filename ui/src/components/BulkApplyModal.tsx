/**
 * BulkApplyModal — composite modal for pushing adapter-config changes to agents.
 *
 * Accepts a `scope` prop:
 *   - `{ kind: "provider", providerId, providerLabel, companyDefaults }` — per-provider
 *     "에이전트에 일괄 적용" flow (inherit or override selected fields).
 *   - `{ kind: "global" }` — company-wide adapter swap wizard (swap-adapter mode).
 *
 * Usage:
 *   <BulkApplyModal
 *     companyId={companyId}
 *     scope={{ kind: "provider", providerId: "lm_studio_local", providerLabel: "LM Studio", companyDefaults: {...} }}
 *     open={open}
 *     onOpenChange={setOpen}
 *   />
 */

import {
  Dialog,
  DialogContent,
} from "./ui/dialog";
import { ProviderScopedModal } from "./BulkApplyModal/ProviderScopedModal";
import { GlobalModal } from "./BulkApplyModal/GlobalModal";

export type BulkApplyScope =
  | {
      kind: "provider";
      providerId: string;
      providerLabel: string;
      companyDefaults: Record<string, unknown>;
    }
  | { kind: "global" };

interface BulkApplyModalProps {
  companyId: string;
  scope: BulkApplyScope;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BulkApplyModal({
  companyId,
  scope,
  open,
  onOpenChange,
}: BulkApplyModalProps) {
  function handleClose() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        aria-modal="true"
      >
        {scope.kind === "provider" ? (
          <ProviderScopedModal
            companyId={companyId}
            providerId={scope.providerId}
            providerLabel={scope.providerLabel}
            companyDefaults={scope.companyDefaults}
            onClose={handleClose}
          />
        ) : (
          <GlobalModal companyId={companyId} onClose={handleClose} />
        )}
      </DialogContent>
    </Dialog>
  );
}
