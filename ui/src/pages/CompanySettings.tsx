import React, { ChangeEvent, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Link } from "@/lib/router";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { useToast } from "../context/ToastContext";
import { companiesApi } from "../api/companies";
import { accessApi } from "../api/access";
import { agentsApi } from "../api/agents";
import { assetsApi } from "../api/assets";
import { queryKeys } from "../lib/queryKeys";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Check, Download, Upload, ChevronRight, Users, Layers, Plus } from "lucide-react";
import { CompanyPatternIcon } from "../components/CompanyPatternIcon";
import {
  Field,
  ToggleField,
  HintIcon
} from "../components/agent-config-primitives";
import { listUIAdapters } from "../adapters/registry";
import type { AdapterConfigFieldsProps } from "../adapters/types";
import { BulkApplyModal } from "../components/BulkApplyModal";

type AgentSnippetInput = {
  onboardingTextUrl: string;
  connectionCandidates?: string[] | null;
  testResolutionUrl?: string | null;
};

export function CompanySettings() {
  const {
    companies,
    selectedCompany,
    selectedCompanyId,
    setSelectedCompanyId
  } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  // General settings local state
  const [companyName, setCompanyName] = useState("");
  const [description, setDescription] = useState("");
  const [brandColor, setBrandColor] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoUploadError, setLogoUploadError] = useState<string | null>(null);

  // Sync local state from selected company
  useEffect(() => {
    if (!selectedCompany) return;
    setCompanyName(selectedCompany.name);
    setDescription(selectedCompany.description ?? "");
    setBrandColor(selectedCompany.brandColor ?? "");
    setLogoUrl(selectedCompany.logoUrl ?? "");
  }, [selectedCompany]);

  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSnippet, setInviteSnippet] = useState<string | null>(null);
  const [snippetCopied, setSnippetCopied] = useState(false);
  const [snippetCopyDelightId, setSnippetCopyDelightId] = useState(0);

  const generalDirty =
    !!selectedCompany &&
    (companyName !== selectedCompany.name ||
      description !== (selectedCompany.description ?? "") ||
      brandColor !== (selectedCompany.brandColor ?? ""));

  const generalMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description: string | null;
      brandColor: string | null;
    }) => companiesApi.update(selectedCompanyId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const settingsMutation = useMutation({
    mutationFn: (requireApproval: boolean) =>
      companiesApi.update(selectedCompanyId!, {
        requireBoardApprovalForNewAgents: requireApproval
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
    }
  });

  const inviteMutation = useMutation({
    mutationFn: () =>
      accessApi.createOpenClawInvitePrompt(selectedCompanyId!),
    onSuccess: async (invite) => {
      setInviteError(null);
      const base = window.location.origin.replace(/\/+$/, "");
      const onboardingTextLink =
        invite.onboardingTextUrl ??
        invite.onboardingTextPath ??
        `/api/invites/${invite.token}/onboarding.txt`;
      const absoluteUrl = onboardingTextLink.startsWith("http")
        ? onboardingTextLink
        : `${base}${onboardingTextLink}`;
      setSnippetCopied(false);
      setSnippetCopyDelightId(0);
      let snippet: string;
      try {
        const manifest = await accessApi.getInviteOnboarding(invite.token);
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates:
            manifest.onboarding.connectivity?.connectionCandidates ?? null,
          testResolutionUrl:
            manifest.onboarding.connectivity?.testResolutionEndpoint?.url ??
            null
        });
      } catch {
        snippet = buildAgentSnippet({
          onboardingTextUrl: absoluteUrl,
          connectionCandidates: null,
          testResolutionUrl: null
        });
      }
      setInviteSnippet(snippet);
      try {
        await navigator.clipboard.writeText(snippet);
        setSnippetCopied(true);
        setSnippetCopyDelightId((prev) => prev + 1);
        setTimeout(() => setSnippetCopied(false), 2000);
      } catch {
        /* clipboard may not be available */
      }
      queryClient.invalidateQueries({
        queryKey: queryKeys.sidebarBadges(selectedCompanyId!)
      });
    },
    onError: (err) => {
      setInviteError(
        err instanceof Error ? err.message : t("settings.generateInvitePrompt")
      );
    }
  });

  const syncLogoState = (nextLogoUrl: string | null) => {
    setLogoUrl(nextLogoUrl ?? "");
    void queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
  };

  const logoUploadMutation = useMutation({
    mutationFn: (file: File) =>
      assetsApi
        .uploadCompanyLogo(selectedCompanyId!, file)
        .then((asset) => companiesApi.update(selectedCompanyId!, { logoAssetId: asset.assetId })),
    onSuccess: (company) => {
      syncLogoState(company.logoUrl);
      setLogoUploadError(null);
    }
  });

  const clearLogoMutation = useMutation({
    mutationFn: () => companiesApi.update(selectedCompanyId!, { logoAssetId: null }),
    onSuccess: (company) => {
      setLogoUploadError(null);
      syncLogoState(company.logoUrl);
    }
  });

  function handleLogoFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.currentTarget.value = "";
    if (!file) return;
    setLogoUploadError(null);
    logoUploadMutation.mutate(file);
  }

  function handleClearLogo() {
    clearLogoMutation.mutate();
  }

  useEffect(() => {
    setInviteError(null);
    setInviteSnippet(null);
    setSnippetCopied(false);
    setSnippetCopyDelightId(0);
  }, [selectedCompanyId]);

  const archiveMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.archive(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  const deleteMutation = useMutation({
    mutationFn: ({
      companyId,
      nextCompanyId
    }: {
      companyId: string;
      nextCompanyId: string | null;
    }) => companiesApi.remove(companyId).then(() => ({ nextCompanyId })),
    onSuccess: async ({ nextCompanyId }) => {
      if (nextCompanyId) {
        setSelectedCompanyId(nextCompanyId);
      }
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.all
      });
      await queryClient.invalidateQueries({
        queryKey: queryKeys.companies.stats
      });
    }
  });

  useEffect(() => {
    setBreadcrumbs([
      { label: selectedCompany?.name ?? t("common.name"), href: "/dashboard" },
      { label: t("settings.title") }
    ]);
  }, [setBreadcrumbs, selectedCompany?.name, t]);

  if (!selectedCompany) {
    return (
      <div className="text-sm text-muted-foreground">
        {t("dashboard.selectCompany")}
      </div>
    );
  }

  function handleSaveGeneral() {
    generalMutation.mutate({
      name: companyName.trim(),
      description: description.trim() || null,
      brandColor: brandColor || null
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-5 w-5 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t("settings.title")}</h1>
      </div>

      {/* General */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.general")}
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <Field label={t("settings.companyName")} hint={t("settings.companyNameDesc")}>
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
            />
          </Field>
          <Field
            label={t("settings.description")}
            hint={t("settings.descriptionHint")}
          >
            <input
              className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none"
              type="text"
              value={description}
              placeholder={t("settings.descriptionPlaceholder")}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>
        </div>
      </div>

      {/* Appearance */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.appearance")}
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-start gap-4">
            <div className="shrink-0">
              <CompanyPatternIcon
                companyName={companyName || selectedCompany.name}
                logoUrl={logoUrl || null}
                brandColor={brandColor || null}
                className="rounded-[14px]"
              />
            </div>
            <div className="flex-1 space-y-3">
              <Field
                label={t("settings.logo")}
                hint={t("settings.logoUploadHint")}
              >
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
                    onChange={handleLogoFileChange}
                    className="w-full rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none file:mr-4 file:rounded-md file:border-0 file:bg-muted file:px-2.5 file:py-1 file:text-xs"
                  />
                  {logoUrl && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleClearLogo}
                        disabled={clearLogoMutation.isPending}
                      >
                        {clearLogoMutation.isPending ? t("settings.removing") : t("settings.removeLogo")}
                      </Button>
                    </div>
                  )}
                  {(logoUploadMutation.isError || logoUploadError) && (
                    <span className="text-xs text-destructive">
                      {logoUploadError ??
                        (logoUploadMutation.error instanceof Error
                          ? logoUploadMutation.error.message
                          : t("settings.logoUploadFailed"))}
                    </span>
                  )}
                  {clearLogoMutation.isError && (
                    <span className="text-xs text-destructive">
                      {clearLogoMutation.error.message}
                    </span>
                  )}
                  {logoUploadMutation.isPending && (
                    <span className="text-xs text-muted-foreground">{t("settings.uploadingLogo")}</span>
                  )}
                </div>
              </Field>
              <Field
                label={t("settings.brandColor")}
                hint={t("settings.brandColorDesc")}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={brandColor || "#6366f1"}
                    onChange={(e) => setBrandColor(e.target.value)}
                    className="h-8 w-8 cursor-pointer rounded border border-border bg-transparent p-0"
                  />
                  <input
                    type="text"
                    value={brandColor}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "" || /^#[0-9a-fA-F]{0,6}$/.test(v)) {
                        setBrandColor(v);
                      }
                    }}
                    placeholder={t("common.auto")}
                    className="w-28 rounded-md border border-border bg-transparent px-2.5 py-1.5 text-sm font-mono outline-none"
                  />
                  {brandColor && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setBrandColor("")}
                      className="text-xs text-muted-foreground"
                    >
                      {t("common.clear")}
                    </Button>
                  )}
                </div>
              </Field>
            </div>
          </div>
        </div>
      </div>

      {/* Save button for General + Appearance */}
      {generalDirty && (
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={handleSaveGeneral}
            disabled={generalMutation.isPending || !companyName.trim()}
          >
            {generalMutation.isPending ? t("common.saving") : t("common.save")}
          </Button>
          {generalMutation.isSuccess && (
            <span className="text-xs text-muted-foreground">{t("common.saved")}</span>
          )}
          {generalMutation.isError && (
            <span className="text-xs text-destructive">
              {generalMutation.error instanceof Error
                  ? generalMutation.error.message
                  : t("common.failedToSave")}
            </span>
          )}
        </div>
      )}

      {/* Hiring */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.hiring")}
        </div>
        <div className="rounded-md border border-border px-4 py-3">
          <ToggleField
            label={t("settings.requireBoardApproval")}
            hint={t("settings.requireBoardApprovalDesc")}
            checked={!!selectedCompany.requireBoardApprovalForNewAgents}
            onChange={(v) => settingsMutation.mutate(v)}
          />
        </div>
      </div>

      {/* Adapter Defaults */}
      <AdapterDefaultsSection
        selectedCompany={selectedCompany}
        selectedCompanyId={selectedCompanyId!}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
        }}
      />

      {/* Invites */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.invites")}
        </div>
        <div className="space-y-3 rounded-md border border-border px-4 py-4">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground">
              {t("settings.generateOpenClawInvite")}
            </span>
            <HintIcon text={t("settings.generateOpenClawInvite")} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate()}
              disabled={inviteMutation.isPending}
            >
              {inviteMutation.isPending
                ? t("common.generating")
                : t("settings.generateInvitePrompt")}
            </Button>
          </div>
          {inviteError && (
            <p className="text-sm text-destructive">{inviteError}</p>
          )}
          {inviteSnippet && (
            <div className="rounded-md border border-border bg-muted/30 p-2">
              <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                  {t("settings.openClawInvitePrompt")}
                </div>
                {snippetCopied && (
                  <span
                    key={snippetCopyDelightId}
                    className="flex items-center gap-1 text-xs text-green-600 animate-pulse"
                  >
                    <Check className="h-3 w-3" />
                    {t("common.copied")}
                  </span>
                )}
              </div>
              <div className="mt-1 space-y-1.5">
                <textarea
                  className="h-[28rem] w-full rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none"
                  value={inviteSnippet}
                  readOnly
                />
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteSnippet);
                        setSnippetCopied(true);
                        setSnippetCopyDelightId((prev) => prev + 1);
                        setTimeout(() => setSnippetCopied(false), 2000);
                      } catch {
                        /* clipboard may not be available */
                      }
                    }}
                  >
                    {snippetCopied ? t("settings.copiedSnippet") : t("settings.copySnippet")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Import / Export */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {t("settings.companyPackages")}
        </div>
        <div className="rounded-md border border-border px-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.importExportMoved")}
          </p>
          <div className="mt-3 flex items-center gap-2">
            <Button size="sm" variant="outline" asChild>
              <Link to="/company/export">
                <Download className="mr-1.5 h-3.5 w-3.5" />
                {t("common.export")}
              </Link>
            </Button>
            <Button size="sm" variant="outline" asChild>
              <Link to="/company/import">
                <Upload className="mr-1.5 h-3.5 w-3.5" />
                {t("common.import")}
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="space-y-4">
        <div className="text-xs font-medium text-destructive uppercase tracking-wide">
          {t("settings.dangerZone")}
        </div>
        <div className="space-y-3 rounded-md border border-destructive/40 bg-destructive/5 px-4 py-4">
          <p className="text-sm text-muted-foreground">
            {t("settings.archiveDesc")}
          </p>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="destructive"
              disabled={
                archiveMutation.isPending ||
                selectedCompany.status === "archived"
              }
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `${t("settings.archiveCompany")} "${selectedCompany.name}"? ${t("settings.archiveDesc")}`
                );
                if (!confirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                archiveMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {archiveMutation.isPending
                ? t("common.archiving")
                : selectedCompany.status === "archived"
                ? t("settings.alreadyArchived")
                : t("settings.archiveCompany")}
            </Button>
            {archiveMutation.isError && (
              <span className="text-xs text-destructive">
                {archiveMutation.error instanceof Error
                  ? archiveMutation.error.message
                  : t("settings.archiveCompany")}
              </span>
            )}
            <Button
              size="sm"
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (!selectedCompanyId) return;
                const confirmed = window.confirm(
                  `"${selectedCompany.name}" 회사를 완전히 삭제합니다. 이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?`
                );
                if (!confirmed) return;
                const doubleConfirmed = window.confirm(
                  `정말로 삭제하시겠습니까? 모든 에이전트, 이슈, 프로젝트 데이터가 영구적으로 삭제됩니다.`
                );
                if (!doubleConfirmed) return;
                const nextCompanyId =
                  companies.find(
                    (company) =>
                      company.id !== selectedCompanyId &&
                      company.status !== "archived"
                  )?.id ?? null;
                deleteMutation.mutate({
                  companyId: selectedCompanyId,
                  nextCompanyId
                });
              }}
            >
              {deleteMutation.isPending ? "삭제 중..." : "회사 완전 삭제"}
            </Button>
            {deleteMutation.isError && (
              <span className="text-xs text-destructive">
                {deleteMutation.error instanceof Error
                  ? deleteMutation.error.message
                  : "삭제 실패"}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── AdapterDefaultsSection ───────────────────────────────────────────────────

interface AdapterDefaultsSectionProps {
  selectedCompany: NonNullable<ReturnType<typeof useCompany>["selectedCompany"]>;
  selectedCompanyId: string;
  onSaved: () => void;
}

/**
 * Section that renders ProviderDefaultCards for adapters that are either
 * (a) configured (have stored defaults), (b) in use by at least one agent in
 * this company, or (c) explicitly added by the user via the dropdown.
 *
 * Unused adapters are tucked under a "+ 어댑터 기본값 추가" dropdown at the
 * bottom to keep the section scannable. A top-level "모든 에이전트 일괄 변경"
 * button opens the global BulkApplyModal.
 */
function AdapterDefaultsSection({
  selectedCompany,
  selectedCompanyId,
  onSaved,
}: AdapterDefaultsSectionProps) {
  const [globalModalOpen, setGlobalModalOpen] = useState(false);
  const [explicitlyAdded, setExplicitlyAdded] = useState<Set<string>>(new Set());
  const [autoOpen, setAutoOpen] = useState<Set<string>>(new Set());

  const { data: agents = [] } = useQuery({
    queryKey: queryKeys.agents.list(selectedCompanyId),
    queryFn: () => agentsApi.list(selectedCompanyId),
  });

  const allAdapters = useMemo(() => listUIAdapters(), []);
  const defaults = (selectedCompany.adapterDefaults as Record<string, Record<string, unknown>> | null) ?? {};

  // An adapter is "in use" if at least one company agent has that adapterType.
  const inUseTypes = useMemo(() => {
    const set = new Set<string>();
    for (const agent of agents) {
      if (agent.adapterType) set.add(agent.adapterType);
    }
    return set;
  }, [agents]);

  // Visible = configured ∪ in-use ∪ explicitly added.
  const visibleTypes = useMemo(() => {
    const set = new Set<string>(explicitlyAdded);
    for (const adapter of allAdapters) {
      if (inUseTypes.has(adapter.type)) set.add(adapter.type);
      const stored = defaults[adapter.type];
      if (stored && Object.keys(stored).length > 0) set.add(adapter.type);
    }
    return set;
  }, [allAdapters, inUseTypes, defaults, explicitlyAdded]);

  const visibleAdapters = allAdapters.filter((a) => visibleTypes.has(a.type));
  const hiddenAdapters = allAdapters.filter((a) => !visibleTypes.has(a.type));

  const handleAdd = (type: string) => {
    setExplicitlyAdded((prev) => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });
    setAutoOpen((prev) => {
      const next = new Set(prev);
      next.add(type);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          어댑터 기본값
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setGlobalModalOpen(true)}
          className="gap-1.5"
          aria-label="모든 에이전트 어댑터 일괄 변경"
        >
          <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          모든 에이전트 일괄 변경
        </Button>
      </div>
      <p className="text-xs text-muted-foreground -mt-2">
        에이전트가 사용하거나 기본값이 설정된 어댑터만 표시됩니다. 에이전트에서 해당 필드를 override하지 않으면 여기 값이 사용됩니다.
      </p>
      <div className="space-y-2">
        {visibleAdapters.length === 0 ? (
          <p className="text-xs text-muted-foreground italic px-1 py-2">
            아직 설정된 어댑터가 없습니다. 아래에서 추가하세요.
          </p>
        ) : (
          visibleAdapters.map((adapter) => (
            <ProviderDefaultCard
              key={adapter.type}
              providerId={adapter.type}
              label={adapter.label}
              ConfigFields={adapter.ConfigFields}
              initialDefaults={defaults[adapter.type] ?? {}}
              companyId={selectedCompanyId}
              onSaved={onSaved}
              defaultOpen={autoOpen.has(adapter.type)}
              inUse={inUseTypes.has(adapter.type)}
            />
          ))
        )}
      </div>

      {hiddenAdapters.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="gap-1.5 text-muted-foreground hover:text-foreground"
              aria-label="어댑터 기본값 추가"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              어댑터 추가 ({hiddenAdapters.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
            {hiddenAdapters.map((adapter) => (
              <DropdownMenuItem
                key={adapter.type}
                onSelect={() => handleAdd(adapter.type)}
              >
                {adapter.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <BulkApplyModal
        companyId={selectedCompanyId}
        scope={{ kind: "global" }}
        open={globalModalOpen}
        onOpenChange={setGlobalModalOpen}
      />
    </div>
  );
}

// ── ProviderDefaultCard ──────────────────────────────────────────────────────

interface ProviderDefaultCardProps {
  providerId: string;
  label: string;
  ConfigFields: React.ComponentType<AdapterConfigFieldsProps>;
  /** Current stored defaults for this provider (from company.adapterDefaults). */
  initialDefaults: Record<string, unknown>;
  companyId: string;
  onSaved: () => void;
  /** Whether to render the card expanded by default. */
  defaultOpen?: boolean;
  /** True if at least one company agent uses this adapter type. */
  inUse?: boolean;
}

/**
 * Collapsible card for editing a single provider's company-level defaults.
 *
 * Renders the provider's ConfigFields in edit mode using a synthetic dirty-state
 * overlay (`eff` + `mark`) so the same component used in agent edit views can be
 * reused here without modification.
 *
 * On save, calls PUT /api/companies/:companyId/adapter-defaults/:providerId with
 * the merged (initialDefaults + dirty overrides) payload.
 *
 * Phase 8 will wire up the "Apply to agents" button to open the bulk-apply modal.
 */
function ProviderDefaultCard({
  providerId,
  label,
  ConfigFields,
  initialDefaults,
  companyId,
  onSaved,
  defaultOpen = false,
  inUse = false,
}: ProviderDefaultCardProps) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(defaultOpen);
  // dirty holds only fields the user has explicitly changed since last save/load.
  const [dirty, setDirty] = useState<Record<string, unknown>>({});
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  // Reset dirty state when the card is opened or when saved defaults change.
  // This ensures the card reflects the latest persisted values on re-open.
  useEffect(() => {
    setDirty({});
  }, [initialDefaults]);

  const isDirty = Object.keys(dirty).length > 0;

  // eff: read the effective value — dirty overlay wins, else original default.
  const eff = <T,>(_group: "adapterConfig", field: string, original: T): T => {
    return field in dirty ? (dirty[field] as T) : original;
  };

  // mark: set a dirty override. undefined means "remove from dirty" (reset to default).
  const mark = (_group: "adapterConfig", field: string, value: unknown) => {
    setDirty((prev) => {
      if (value === undefined) {
        const next = { ...prev };
        delete next[field];
        return next;
      }
      return { ...prev, [field]: value };
    });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = { ...initialDefaults, ...dirty };
      // Remove keys explicitly set to undefined by mark().
      // (mark() removes undefined keys from dirty, so this handles explicit nulls.)
      const cleaned = Object.fromEntries(
        Object.entries(payload).filter(([, v]) => v !== undefined),
      );
      return companiesApi.putAdapterDefaults(companyId, providerId, cleaned);
    },
    onSuccess: () => {
      setDirty({});
      pushToast({ title: `${label} 기본값 저장됨`, tone: "success" });
      onSaved();
    },
    onError: (err) => {
      pushToast({
        title: `${label} 기본값 저장 실패`,
        body: err instanceof Error ? err.message : String(err),
        tone: "error",
      });
    },
  });

  // The effective company defaults (persisted + any unsaved dirty state).
  // We pass the persisted initialDefaults to the modal so the diff is accurate.
  const companyDefaults = initialDefaults;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="rounded-md border border-border">
        {/* Card header — always visible */}
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left hover:bg-accent/30 transition-colors rounded-md"
            aria-expanded={open}
          >
            <div className="flex items-center gap-2">
              <ChevronRight
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                aria-hidden="true"
              />
              <span className="text-sm font-medium">{label}</span>
              {inUse && (
                <span className="text-[10px] text-muted-foreground/70">
                  사용 중
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isDirty && (
                <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                  미저장
                </span>
              )}
            </div>
          </button>
        </CollapsibleTrigger>

        {/* Card body — collapsible */}
        <CollapsibleContent>
          <div className="border-t border-border px-4 py-4 space-y-4">
            {/* Config fields rendered in defaults-edit mode */}
            <div className="space-y-3">
              <ConfigFields
                mode="edit"
                isCreate={false}
                adapterType={providerId}
                values={null}
                set={null}
                config={initialDefaults}
                eff={eff}
                mark={mark}
                models={[]}
              />
            </div>

            {/* Action row */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/50">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setBulkModalOpen(true)}
                className="gap-1.5"
                aria-label={`${label} 기본값을 에이전트에 일괄 적용`}
              >
                <Users className="h-3.5 w-3.5" aria-hidden="true" />
                에이전트에 일괄 적용...
              </Button>

              <div className="flex items-center gap-2">
                {saveMutation.isError && (
                  <span className="text-xs text-destructive">
                    {saveMutation.error instanceof Error
                      ? saveMutation.error.message
                      : "저장 실패"}
                  </span>
                )}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => saveMutation.mutate()}
                  disabled={!isDirty || saveMutation.isPending}
                >
                  {saveMutation.isPending ? "저장 중..." : "저장"}
                </Button>
              </div>
            </div>
          </div>
        </CollapsibleContent>
      </div>

      <BulkApplyModal
        companyId={companyId}
        scope={{
          kind: "provider",
          providerId,
          providerLabel: label,
          companyDefaults,
        }}
        open={bulkModalOpen}
        onOpenChange={setBulkModalOpen}
      />
    </Collapsible>
  );
}

function buildAgentSnippet(input: AgentSnippetInput) {
  const candidateUrls = buildCandidateOnboardingUrls(input);
  const resolutionTestUrl = buildResolutionTestUrl(input);

  const candidateList =
    candidateUrls.length > 0
      ? candidateUrls.map((u) => `- ${u}`).join("\n")
      : "- (No candidate URLs available yet.)";

  const connectivityBlock =
    candidateUrls.length === 0
      ? `No candidate URLs are available. Ask your user to configure a reachable hostname in Paperclip, then retry.
Suggested steps:
- choose a hostname that resolves to the Paperclip host from your runtime
- run: pnpm paperclipai allowed-hostname <host>
- restart Paperclip
- verify with: curl -fsS http://<host>:3100/api/health
- regenerate this invite snippet`
      : `If none are reachable, ask your user to add a reachable hostname in Paperclip, restart, and retry.
Suggested command:
- pnpm paperclipai allowed-hostname <host>
Then verify with: curl -fsS <base-url>/api/health`;

  const resolutionLine = resolutionTestUrl
    ? `\nYou MUST test Paperclip-to-gateway reachability, call: ${resolutionTestUrl}?url=<urlencoded-gateway-url> (using the hostname that worked above). Do not assume your 172.x is necessarily reachable from Paperclip. Test it. `
    : "";

  return `You're invited to join a Paperclip organization.

The URLs you should try are:
${candidateList}

Connectivity guidance:
If you are running on a different machine than Paperclip, Paperclip must be reachable at one of the hostnames used above.
Verify the hostname works from your runtime with: GET <base-url>/api/health

${connectivityBlock}

For your "agentName", just use your own agent name (OpenClaw or whatever your name is) and send it directly.
You also need to send a gateway URL that Paperclip can access. Check your config and include that URL.${resolutionLine}

---

This onboarding flow is for OpenClaw Gateway.
When you submit the join request, use:
- \`adapterType: "openclaw_gateway"\`
- \`agentDefaultsPayload.url\` as your \`ws://\` or \`wss://\` gateway URL
- \`agentDefaultsPayload.headers["x-openclaw-token"]\` with your gateway token
- (legacy accepted) \`agentDefaultsPayload.headers["x-openclaw-auth"]\`
- Keep device auth enabled (recommended). If \`devicePrivateKeyPem\` is omitted, Paperclip will generate and persist one during join so pairing approvals remain stable.
- Only use \`disableDeviceAuth=true\` for special environments where pairing cannot be completed.

Do NOT use \`/v1/responses\` or \`/hooks/*\` in this join flow.

Before you do anything, please respond to your user that you understand the instructions and you're going to work on them. Then do the step above in another session called "paperclip-onboarding" and then tell your user when you're done. Update your user in intermediate steps along the way so they know what's going on.

Then after you've connected to Paperclip (exchanged keys etc.) you MUST review and follow the onboarding instructions in onboarding.txt they give you.

`;
}

function buildCandidateOnboardingUrls(input: AgentSnippetInput): string[] {
  const candidates = (input.connectionCandidates ?? [])
    .map((candidate) => candidate.trim())
    .filter(Boolean);
  const urls = new Set<string>();
  let onboardingUrl: URL | null = null;

  try {
    onboardingUrl = new URL(input.onboardingTextUrl);
    urls.add(onboardingUrl.toString());
  } catch {
    const trimmed = input.onboardingTextUrl.trim();
    if (trimmed) {
      urls.add(trimmed);
    }
  }

  if (!onboardingUrl) {
    for (const candidate of candidates) {
      urls.add(candidate);
    }
    return Array.from(urls);
  }

  const onboardingPath = `${onboardingUrl.pathname}${onboardingUrl.search}`;
  for (const candidate of candidates) {
    try {
      const base = new URL(candidate);
      urls.add(`${base.origin}${onboardingPath}`);
    } catch {
      urls.add(candidate);
    }
  }

  return Array.from(urls);
}

function buildResolutionTestUrl(input: AgentSnippetInput): string | null {
  const explicit = input.testResolutionUrl?.trim();
  if (explicit) return explicit;

  try {
    const onboardingUrl = new URL(input.onboardingTextUrl);
    const testPath = onboardingUrl.pathname.replace(
      /\/onboarding\.txt$/,
      "/test-resolution"
    );
    return `${onboardingUrl.origin}${testPath}`;
  } catch {
    return null;
  }
}

