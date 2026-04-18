import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useDialog } from "../context/DialogContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { companiesApi } from "../api/companies";
import { queryKeys } from "../lib/queryKeys";
import { formatCents, relativeTime } from "../lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Pencil,
  Check,
  X,
  Plus,
  MoreHorizontal,
  Trash2,
  Users,
  CircleDot,
  DollarSign,
  Calendar,
} from "lucide-react";

export function Companies() {
  const { t } = useTranslation();
  const {
    companies,
    selectedCompanyId,
    setSelectedCompanyId,
    loading,
    error,
  } = useCompany();
  const { openOnboarding } = useDialog();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: queryKeys.companies.stats,
    queryFn: () => companiesApi.stats(),
  });

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Bulk-select state. Set of company IDs the user has checkbox-selected for
  // potential deletion. Independent from `selectedCompanyId` (which is the
  // global "currently active" company in app context).
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(() => new Set());
  const [confirmingBulkDelete, setConfirmingBulkDelete] = useState(false);

  function toggleBulkSelected(companyId: string) {
    setBulkSelected((prev) => {
      const next = new Set(prev);
      if (next.has(companyId)) next.delete(companyId);
      else next.add(companyId);
      return next;
    });
  }

  function clearBulkSelection() {
    setBulkSelected(new Set());
    setConfirmingBulkDelete(false);
  }

  const editMutation = useMutation({
    mutationFn: ({ id, newName }: { id: string; newName: string }) =>
      companiesApi.update(id, { name: newName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => companiesApi.remove(id),
    onSuccess: (_data, deletedId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      setConfirmDeleteId(null);
      // Drop from bulk-selection if user single-deleted via dropdown.
      setBulkSelected((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
    },
  });

  // Bulk delete: fan out to the existing single-delete endpoint with
  // Promise.allSettled so one failure doesn't abort the rest. For 2-3 companies
  // this is fine; if/when batches grow, swap to a server-side bulk endpoint.
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => companiesApi.remove(id)),
      );
      const failures: string[] = [];
      const succeeded: string[] = [];
      results.forEach((result, i) => {
        if (result.status === "fulfilled") succeeded.push(ids[i]);
        else failures.push(ids[i]);
      });
      return { succeeded, failures };
    },
    onSuccess: ({ succeeded, failures }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.stats });
      // If the active company was among the deleted ones, switch to whichever
      // remains. CompanyContext re-fetches and clears selection itself when
      // none survive; we only switch eagerly if a survivor exists.
      if (selectedCompanyId && succeeded.includes(selectedCompanyId)) {
        const survivor = companies.find((c) => !succeeded.includes(c.id));
        if (survivor) setSelectedCompanyId(survivor.id);
      }
      if (failures.length === 0) {
        clearBulkSelection();
      } else {
        // Keep failed IDs selected so the user can retry; drop succeeded.
        setBulkSelected(new Set(failures));
        setConfirmingBulkDelete(false);
        pushToast({
          title: t("companies.bulkDeleteFailed", { count: failures.length }),
          tone: "error",
        });
      }
    },
  });

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.companies") }]);
  }, [setBreadcrumbs]);

  function startEdit(companyId: string, currentName: string) {
    setEditingId(companyId);
    setEditName(currentName);
  }

  function saveEdit() {
    if (!editingId || !editName.trim()) return;
    editMutation.mutate({ id: editingId, newName: editName.trim() });
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
  }

  const bulkSelectedCount = bulkSelected.size;
  const selectedIdsList = Array.from(bulkSelected);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        <Button size="sm" onClick={() => openOnboarding()}>
          <Plus className="h-3.5 w-3.5 mr-1.5" />
          {t("companies.newCompany")}
        </Button>
      </div>

      <div className="h-6">
        {loading && <p className="text-sm text-muted-foreground">{t("companies.loadingCompanies")}</p>}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
      </div>

      {bulkSelectedCount > 0 && (
        <div
          role="region"
          aria-label="Bulk actions"
          className="sticky top-0 z-10 flex items-center justify-between gap-3 rounded-md border border-border bg-card px-4 py-2 shadow-sm"
        >
          <span className="text-sm font-medium">
            {t("companies.selectedCount", { count: bulkSelectedCount })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={clearBulkSelection}
              disabled={bulkDeleteMutation.isPending}
            >
              {t("companies.clearSelection")}
            </Button>
            {confirmingBulkDelete ? (
              <>
                <span className="text-xs text-destructive font-medium mr-2">
                  {t("companies.bulkDeleteConfirm", { count: bulkSelectedCount })}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setConfirmingBulkDelete(false)}
                  disabled={bulkDeleteMutation.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => bulkDeleteMutation.mutate(selectedIdsList)}
                  disabled={bulkDeleteMutation.isPending}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                  {bulkDeleteMutation.isPending
                    ? t("common.deleting")
                    : t("common.delete")}
                </Button>
              </>
            ) : (
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setConfirmingBulkDelete(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                {t("companies.deleteSelected")}
              </Button>
            )}
          </div>
        </div>
      )}

      <div className="grid gap-4">
        {companies.map((company) => {
          const selected = company.id === selectedCompanyId;
          const isEditing = editingId === company.id;
          const isConfirmingDelete = confirmDeleteId === company.id;
          const isBulkSelected = bulkSelected.has(company.id);
          const companyStats = stats?.[company.id];
          const agentCount = companyStats?.agentCount ?? 0;
          const issueCount = companyStats?.issueCount ?? 0;
          const budgetPct =
            company.budgetMonthlyCents > 0
              ? Math.round(
                  (company.spentMonthlyCents / company.budgetMonthlyCents) * 100,
                )
              : 0;

          return (
            <div
              key={company.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedCompanyId(company.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setSelectedCompanyId(company.id);
                }
              }}
              className={`group text-left bg-card border rounded-lg p-5 transition-colors cursor-pointer ${
                selected
                  ? "border-primary ring-1 ring-primary"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              {/* Header row: bulk-select checkbox + name + menu */}
              <div className="flex items-start justify-between gap-3">
                {/*
                  Bulk-select checkbox. Hidden until hovered or already
                  selected, so it doesn't compete with the company name in
                  the resting state. Click is stopped from bubbling to the
                  card-level row click that switches active company.
                */}
                <div
                  className={`pt-0.5 ${
                    isBulkSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    aria-label={`Select ${company.name}`}
                    checked={isBulkSelected}
                    onCheckedChange={() => toggleBulkSelected(company.id)}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  {isEditing ? (
                    <div
                      className="flex items-center gap-2"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEdit();
                          if (e.key === "Escape") cancelEdit();
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={saveEdit}
                        disabled={editMutation.isPending}
                      >
                        <Check className="h-3.5 w-3.5 text-green-500" />
                      </Button>
                      <Button variant="ghost" size="icon-xs" onClick={cancelEdit}>
                        <X className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-base">{company.name}</h3>
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          company.status === "active"
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : company.status === "paused"
                              ? "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {company.status}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          startEdit(company.id, company.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  {company.description && !isEditing && (
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {company.description}
                    </p>
                  )}
                </div>

                {/* Three-dot menu */}
                <div onClick={(e) => e.stopPropagation()}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-muted-foreground opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem
                        onClick={() => startEdit(company.id, company.name)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        {t("common.rename")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onClick={() => setConfirmDeleteId(company.id)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {t("companies.deleteCompany")}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              {/* Stats row */}
              <div className="flex items-center gap-3 sm:gap-5 mt-4 text-sm text-muted-foreground flex-wrap">
                <div className="flex items-center gap-1.5">
                  <Users className="h-3.5 w-3.5" />
                  <span>
                    {agentCount} {agentCount === 1 ? t("common.agent") : t("common.agents")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CircleDot className="h-3.5 w-3.5" />
                  <span>
                    {issueCount} {issueCount === 1 ? t("common.issue") : t("common.issues")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 tabular-nums">
                  <DollarSign className="h-3.5 w-3.5" />
                  <span>
                    {formatCents(company.spentMonthlyCents)}
                    {company.budgetMonthlyCents > 0
                      ? <> / {formatCents(company.budgetMonthlyCents)} <span className="text-xs">({budgetPct}%)</span></>
                      : <span className="text-xs ml-1">{t("companies.unlimitedBudget")}</span>}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 ml-auto">
                  <Calendar className="h-3.5 w-3.5" />
                  <span>{t("companies.created")}{relativeTime(company.createdAt)}</span>
                </div>
              </div>

              {/* Delete confirmation */}
              {isConfirmingDelete && (
                <div
                  className="mt-4 flex items-center justify-between bg-destructive/5 border border-destructive/20 rounded-md px-4 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <p className="text-sm text-destructive font-medium">
                    {t("companies.deleteConfirm")}
                  </p>
                  <div className="flex items-center gap-2 ml-4 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setConfirmDeleteId(null)}
                      disabled={deleteMutation.isPending}
                    >
                      {t("common.cancel")}
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => deleteMutation.mutate(company.id)}
                      disabled={deleteMutation.isPending}
                    >
                      {deleteMutation.isPending ? t("common.deleting") : t("common.delete")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
