import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { AdapterEnvironmentTestResult, AdapterDetectionResult } from "@paperclipai/shared";
import { useLocation, useNavigate, useParams } from "@/lib/router";
import { useDialog } from "../context/DialogContext";
import { useCompany } from "../context/CompanyContext";
import { companiesApi } from "../api/companies";
import { goalsApi } from "../api/goals";
import { agentsApi } from "../api/agents";
import { queryKeys } from "../lib/queryKeys";
import { Dialog, DialogPortal } from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "../lib/utils";
import {
  extractModelName,
  extractProviderIdWithFallback
} from "../lib/model-utils";
import { getUIAdapter } from "../adapters";
import { defaultCreateValues } from "./agent-config-defaults";
import { parseOnboardingGoalInput } from "../lib/onboarding-goal";
import { launchOnboarding } from "../lib/onboarding-launch";
import { onboardingApi } from "../api/onboarding";
import {
  DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX,
  DEFAULT_CODEX_LOCAL_MODEL
} from "@paperclipai/adapter-codex-local";
import { DEFAULT_CURSOR_LOCAL_MODEL } from "@paperclipai/adapter-cursor-local";
import { DEFAULT_GEMINI_LOCAL_MODEL } from "@paperclipai/adapter-gemini-local";
import { DEFAULT_LM_STUDIO_BASE_URL } from "@paperclipai/adapter-lm-studio-local";
import { DEFAULT_OLLAMA_BASE_URL } from "@paperclipai/adapter-ollama-local";
import { resolveRouteOnboardingOptions } from "../lib/onboarding-route";
import { AsciiArtAnimation } from "./AsciiArtAnimation";
import { OpenCodeLogoIcon } from "./OpenCodeLogoIcon";
import {
  Building2,
  Bot,
  Code,
  Gem,
  ListTodo,
  Rocket,
  ArrowLeft,
  ArrowRight,
  Terminal,
  Sparkles,
  MousePointer2,
  Check,
  Loader2,
  ChevronDown,
  Cpu,
  Server,
  X
} from "lucide-react";
import { HermesIcon } from "./HermesIcon";

type Step = 1 | 2 | 3;
type AdapterType =
  | "claude_local"
  | "codex_local"
  | "gemini_local"
  | "hermes_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "ollama_local"
  | "lm_studio_local"
  | "http"
  | "openclaw_gateway";

const DEFAULT_TASK_DESCRIPTION = `You are the CEO. You set the direction for the company.

- hire a founding engineer
- write a hiring plan
- break the roadmap into concrete tasks and start delegating work`;

export function OnboardingWizard() {
  const { t } = useTranslation();
  const { onboardingOpen, onboardingOptions, closeOnboarding } = useDialog();
  const { companies, setSelectedCompanyId, loading: companiesLoading } = useCompany();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const location = useLocation();
  const { companyPrefix } = useParams<{ companyPrefix?: string }>();
  const [routeDismissed, setRouteDismissed] = useState(false);

  const routeOnboardingOptions =
    companyPrefix && companiesLoading
      ? null
      : resolveRouteOnboardingOptions({
          pathname: location.pathname,
          companyPrefix,
          companies,
        });
  const effectiveOnboardingOpen =
    onboardingOpen || (routeOnboardingOptions !== null && !routeDismissed);
  const effectiveOnboardingOptions = onboardingOpen
    ? onboardingOptions
    : routeOnboardingOptions ?? {};

  const initialStep = effectiveOnboardingOptions.initialStep ?? 1;
  const existingCompanyId = effectiveOnboardingOptions.companyId;

  const [step, setStep] = useState<Step>(initialStep);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");

  // Step 1
  const [companyName, setCompanyName] = useState("");
  const [companyGoal, setCompanyGoal] = useState("");

  // Step 2
  const [agentName, setAgentName] = useState("CEO");
  const [adapterType, setAdapterType] = useState<AdapterType>("claude_local");
  const [model, setModel] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [url, setUrl] = useState("");
  const [adapterEnvResult, setAdapterEnvResult] =
    useState<AdapterEnvironmentTestResult | null>(null);
  const [adapterEnvError, setAdapterEnvError] = useState<string | null>(null);
  const [adapterEnvLoading, setAdapterEnvLoading] = useState(false);
  const [forceUnsetAnthropicApiKey, setForceUnsetAnthropicApiKey] =
    useState(false);
  const [unsetAnthropicLoading, setUnsetAnthropicLoading] = useState(false);
  const [showMoreAdapters, setShowMoreAdapters] = useState(false);

  // Detection state
  const [adapterDetection, setAdapterDetection] = useState<AdapterDetectionResult | null>(null);
  const [detectionLoading, setDetectionLoading] = useState(false);
  const [recommendationMode, setRecommendationMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);

  // Step 3
  const [taskTitle, setTaskTitle] = useState(
    "Hire your first engineer and create a hiring plan"
  );
  const [taskDescription, setTaskDescription] = useState(
    DEFAULT_TASK_DESCRIPTION
  );

  // Auto-grow textarea for task description
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const autoResizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, []);

  // Created entity IDs — pre-populate from existing company when skipping step 1
  const [createdCompanyId, setCreatedCompanyId] = useState<string | null>(
    existingCompanyId ?? null
  );
  const [createdCompanyPrefix, setCreatedCompanyPrefix] = useState<
    string | null
  >(null);
  const [createdCompanyGoalId, setCreatedCompanyGoalId] = useState<string | null>(
    null
  );
  const [createdAgentId, setCreatedAgentId] = useState<string | null>(null);
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [createdIssueRef, setCreatedIssueRef] = useState<string | null>(null);

  useEffect(() => {
    setRouteDismissed(false);
  }, [location.pathname]);

  // Sync step and company when onboarding opens with options.
  // Keep this independent from company-list refreshes so Step 1 completion
  // doesn't get reset after creating a company.
  useEffect(() => {
    if (!effectiveOnboardingOpen) return;
    const cId = effectiveOnboardingOptions.companyId ?? null;
    setStep(effectiveOnboardingOptions.initialStep ?? 1);
    setCreatedCompanyId(cId);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedProjectId(null);
    setCreatedAgentId(null);
    setCreatedIssueRef(null);
  }, [
    effectiveOnboardingOpen,
    effectiveOnboardingOptions.companyId,
    effectiveOnboardingOptions.initialStep
  ]);

  // Backfill issue prefix for an existing company once companies are loaded.
  useEffect(() => {
    if (!effectiveOnboardingOpen || !createdCompanyId || createdCompanyPrefix) return;
    const company = companies.find((c) => c.id === createdCompanyId);
    if (company) setCreatedCompanyPrefix(company.issuePrefix);
  }, [effectiveOnboardingOpen, createdCompanyId, createdCompanyPrefix, companies]);

  // Resize textarea when step 3 is shown or description changes
  useEffect(() => {
    if (step === 3) autoResizeTextarea();
  }, [step, taskDescription, autoResizeTextarea]);

  // Debounce the URL so each keystroke in the LM Studio / Ollama Base URL
  // input doesn't fire a model-list fetch. 350ms balances "feels live" with
  // not hammering the remote server.
  const [debouncedUrl, setDebouncedUrl] = useState(url);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedUrl(url), 350);
    return () => clearTimeout(timer);
  }, [url]);

  const remoteServerAdapter =
    adapterType === "lm_studio_local" || adapterType === "ollama_local";
  const adapterModelsBaseUrl =
    remoteServerAdapter && debouncedUrl.trim().length > 0
      ? debouncedUrl.trim()
      : undefined;

  const {
    data: adapterModels,
    error: adapterModelsError,
    isLoading: adapterModelsLoading,
    isFetching: adapterModelsFetching
  } = useQuery({
    queryKey: createdCompanyId
      ? [
          ...queryKeys.agents.adapterModels(createdCompanyId, adapterType),
          adapterModelsBaseUrl ?? "default",
        ]
      : ["agents", "none", "adapter-models", adapterType, adapterModelsBaseUrl ?? "default"],
    queryFn: () =>
      agentsApi.adapterModels(createdCompanyId!, adapterType, adapterModelsBaseUrl),
    enabled: Boolean(createdCompanyId) && effectiveOnboardingOpen && step === 2
  });
  const isLocalAdapter =
    adapterType === "claude_local" ||
    adapterType === "codex_local" ||
    adapterType === "gemini_local" ||
    adapterType === "hermes_local" ||
    adapterType === "opencode_local" ||
    adapterType === "pi_local" ||
    adapterType === "cursor" ||
    adapterType === "ollama_local" ||
    adapterType === "lm_studio_local";
  const effectiveAdapterCommand =
    command.trim() ||
    (adapterType === "codex_local"
      ? "codex"
      : adapterType === "gemini_local"
        ? "gemini"
      : adapterType === "hermes_local"
        ? "hermes"
      : adapterType === "pi_local"
      ? "pi"
      : adapterType === "cursor"
      ? "agent"
      : adapterType === "opencode_local"
      ? "opencode"
      : "claude");

  useEffect(() => {
    if (step !== 2) return;
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
  }, [step, adapterType, model, command, args, url]);

  const selectedModel = (adapterModels ?? []).find((m) => m.id === model);
  const hasAnthropicApiKeyOverrideCheck =
    adapterEnvResult?.checks.some(
      (check) =>
        check.code === "claude_anthropic_api_key_overrides_subscription"
    ) ?? false;
  const shouldSuggestUnsetAnthropicApiKey =
    adapterType === "claude_local" &&
    adapterEnvResult?.status === "fail" &&
    hasAnthropicApiKeyOverrideCheck;
  const hasModelProbeWarning =
    adapterEnvResult?.checks.some(
      (check) =>
        check.level === "warn" &&
        (check.code.endsWith("_probe_failed") ||
          check.code.endsWith("_probe_timed_out"))
    ) ?? false;
  const filteredModels = useMemo(() => {
    const query = modelSearch.trim().toLowerCase();
    return (adapterModels ?? []).filter((entry) => {
      if (!query) return true;
      const provider = extractProviderIdWithFallback(entry.id, "");
      return (
        entry.id.toLowerCase().includes(query) ||
        entry.label.toLowerCase().includes(query) ||
        provider.toLowerCase().includes(query)
      );
    });
  }, [adapterModels, modelSearch]);
  const groupedModels = useMemo(() => {
    if (adapterType !== "opencode_local") {
      return [
        {
          provider: "models",
          entries: [...filteredModels].sort((a, b) => a.id.localeCompare(b.id))
        }
      ];
    }
    const groups = new Map<string, Array<{ id: string; label: string }>>();
    for (const entry of filteredModels) {
      const provider = extractProviderIdWithFallback(entry.id);
      const bucket = groups.get(provider) ?? [];
      bucket.push(entry);
      groups.set(provider, bucket);
    }
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([provider, entries]) => ({
        provider,
        entries: [...entries].sort((a, b) => a.id.localeCompare(b.id))
      }));
  }, [filteredModels, adapterType]);

  function reset() {
    setStep(1);
    setLoading(false);
    setError(null);
    setCompanyName("");
    setCompanyGoal("");
    setAgentName("CEO");
    setAdapterType("claude_local");
    setModel("");
    setCommand("");
    setArgs("");
    setUrl("");
    setAdapterEnvResult(null);
    setAdapterEnvError(null);
    setAdapterEnvLoading(false);
    setForceUnsetAnthropicApiKey(false);
    setUnsetAnthropicLoading(false);
    setAdapterDetection(null);
    setDetectionLoading(false);
    setRecommendationMode(false);
    setAdvancedOpen(false);
    setTaskTitle("Hire your first engineer and create a hiring plan");
    setTaskDescription(DEFAULT_TASK_DESCRIPTION);
    setCreatedCompanyId(null);
    setCreatedCompanyPrefix(null);
    setCreatedCompanyGoalId(null);
    setCreatedAgentId(null);
    setCreatedProjectId(null);
    setCreatedIssueRef(null);
  }

  function handleClose() {
    reset();
    closeOnboarding();
  }

  function buildAdapterConfig(): Record<string, unknown> {
    const adapter = getUIAdapter(adapterType);
    const trimmedUrl = url.trim();
    const config = adapter.buildAdapterConfig({
      ...defaultCreateValues,
      adapterType,
      model:
        adapterType === "codex_local"
          ? model || DEFAULT_CODEX_LOCAL_MODEL
          : adapterType === "gemini_local"
            ? model || DEFAULT_GEMINI_LOCAL_MODEL
          : adapterType === "cursor"
          ? model || DEFAULT_CURSOR_LOCAL_MODEL
          : model,
      command,
      args,
      url,
      // LM Studio defaults `lmStudioBaseUrlMode` to "company" which blocks
      // build-config from persisting `baseUrl`. In onboarding there is no
      // company default to inherit, so when the user enters a URL we treat
      // it as an explicit custom override.
      lmStudioBaseUrlMode:
        adapterType === "lm_studio_local" && trimmedUrl.length > 0
          ? "custom"
          : defaultCreateValues.lmStudioBaseUrlMode,
      dangerouslySkipPermissions:
        adapterType === "claude_local" || adapterType === "opencode_local",
      dangerouslyBypassSandbox:
        adapterType === "codex_local"
          ? DEFAULT_CODEX_LOCAL_BYPASS_APPROVALS_AND_SANDBOX
          : defaultCreateValues.dangerouslyBypassSandbox
    });
    if (adapterType === "claude_local" && forceUnsetAnthropicApiKey) {
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
    }
    return config;
  }

  async function runAdapterEnvironmentTest(
    adapterConfigOverride?: Record<string, unknown>
  ): Promise<AdapterEnvironmentTestResult | null> {
    if (!createdCompanyId) {
      setAdapterEnvError(
        "Create or select a company before testing adapter environment."
      );
      return null;
    }
    setAdapterEnvLoading(true);
    setAdapterEnvError(null);
    try {
      const result = await agentsApi.testEnvironment(
        createdCompanyId,
        adapterType,
        {
          adapterConfig: adapterConfigOverride ?? buildAdapterConfig()
        }
      );
      setAdapterEnvResult(result);
      return result;
    } catch (err) {
      setAdapterEnvError(
        err instanceof Error ? err.message : "Adapter environment test failed"
      );
      return null;
    } finally {
      setAdapterEnvLoading(false);
    }
  }

  async function runDetection() {
    setDetectionLoading(true);
    try {
      const result = await onboardingApi.detectAdapters();
      setAdapterDetection(result);
      if (result.detected.length === 0) {
        setRecommendationMode(true);
      } else {
        setRecommendationMode(false);
        // Auto-select the recommended adapter
        if (result.recommended) {
          setAdapterType(result.recommended.type as AdapterType);
          if (result.recommended.defaultModel) {
            setModel(result.recommended.defaultModel);
          }
          if (result.recommended.connectionInfo.command) {
            setCommand(result.recommended.connectionInfo.command);
          }
          if (result.recommended.connectionInfo.args?.length) {
            setArgs(result.recommended.connectionInfo.args.join(" "));
          }
          if (result.recommended.connectionInfo.baseUrl) {
            setUrl(result.recommended.connectionInfo.baseUrl);
          }
        }
      }
    } catch {
      // Detection failed — fall back to manual selection
      setRecommendationMode(true);
    } finally {
      setDetectionLoading(false);
    }
  }

  // Auto-detect adapters when step 2 mounts
  useEffect(() => {
    if (step !== 2 || adapterDetection || detectionLoading) return;
    void runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  async function handleStep1Next() {
    setLoading(true);
    setError(null);
    try {
      const company = await companiesApi.create({ name: companyName.trim() });
      setCreatedCompanyId(company.id);
      setCreatedCompanyPrefix(company.issuePrefix);
      setSelectedCompanyId(company.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });

      if (companyGoal.trim()) {
        const parsedGoal = parseOnboardingGoalInput(companyGoal);
        const goal = await goalsApi.create(company.id, {
          title: parsedGoal.title,
          ...(parsedGoal.description
            ? { description: parsedGoal.description }
            : {}),
          level: "company",
          status: "active"
        });
        setCreatedCompanyGoalId(goal.id);
        queryClient.invalidateQueries({
          queryKey: queryKeys.goals.list(company.id)
        });
      } else {
        setCreatedCompanyGoalId(null);
      }

      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create company");
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2Next() {
    if (!createdCompanyId) return;
    setLoading(true);
    setError(null);
    try {
      if (adapterType === "opencode_local") {
        const selectedModelId = model.trim();
        if (!selectedModelId) {
          setError(
            "OpenCode requires an explicit model in provider/model format."
          );
          return;
        }
        if (adapterModelsError) {
          setError(
            adapterModelsError instanceof Error
              ? adapterModelsError.message
              : "Failed to load OpenCode models."
          );
          return;
        }
        if (adapterModelsLoading || adapterModelsFetching) {
          setError(
            "OpenCode models are still loading. Please wait and try again."
          );
          return;
        }
        const discoveredModels = adapterModels ?? [];
        if (!discoveredModels.some((entry) => entry.id === selectedModelId)) {
          setError(
            discoveredModels.length === 0
              ? "No OpenCode models discovered. Run `opencode models` and authenticate providers."
              : `Configured OpenCode model is unavailable: ${selectedModelId}`
          );
          return;
        }
      }

      if (isLocalAdapter) {
        const result = adapterEnvResult ?? (await runAdapterEnvironmentTest());
        if (!result) return;
        if (result.checks.some((c) => c.level === "error")) return;
      }

      const agent = await agentsApi.create(createdCompanyId, {
        name: agentName.trim(),
        role: "ceo",
        adapterType,
        adapterConfig: buildAdapterConfig(),
        runtimeConfig: {
          heartbeat: {
            enabled: true,
            intervalSec: 3600,
            wakeOnDemand: true,
            cooldownSec: 10,
            maxConcurrentRuns: 1
          }
        }
      });
      setCreatedAgentId(agent.id);
      queryClient.invalidateQueries({
        queryKey: queryKeys.agents.list(createdCompanyId)
      });
      setStep(3);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleUnsetAnthropicApiKey() {
    if (!createdCompanyId || unsetAnthropicLoading) return;
    setUnsetAnthropicLoading(true);
    setError(null);
    setAdapterEnvError(null);
    setForceUnsetAnthropicApiKey(true);

    const configWithUnset = (() => {
      const config = buildAdapterConfig();
      const env =
        typeof config.env === "object" &&
        config.env !== null &&
        !Array.isArray(config.env)
          ? { ...(config.env as Record<string, unknown>) }
          : {};
      env.ANTHROPIC_API_KEY = { type: "plain", value: "" };
      config.env = env;
      return config;
    })();

    try {
      if (createdAgentId) {
        await agentsApi.update(
          createdAgentId,
          { adapterConfig: configWithUnset },
          createdCompanyId
        );
        queryClient.invalidateQueries({
          queryKey: queryKeys.agents.list(createdCompanyId)
        });
      }

      const result = await runAdapterEnvironmentTest(configWithUnset);
      if (result?.status === "fail") {
        setError(
          "Retried with ANTHROPIC_API_KEY unset in adapter config, but the environment test is still failing."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to unset ANTHROPIC_API_KEY and retry."
      );
    } finally {
      setUnsetAnthropicLoading(false);
    }
  }

  async function handleStep3Next() {
    if (!createdCompanyId || !createdAgentId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await launchOnboarding({
        companyId: createdCompanyId,
        agentId: createdAgentId,
        taskTitle,
        taskDescription,
        goalId: createdCompanyGoalId,
      });
      setCreatedProjectId(result.projectId);
      setCreatedIssueRef(result.issueRef);
      queryClient.invalidateQueries({
        queryKey: queryKeys.projects.list(createdCompanyId)
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.issues.list(createdCompanyId)
      });
      setSelectedCompanyId(createdCompanyId);
      reset();
      closeOnboarding();
      navigate(
        createdCompanyPrefix
          ? `/${createdCompanyPrefix}/issues/${result.issueRef}`
          : `/issues/${result.issueRef}`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create task");
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (step === 1 && companyName.trim()) handleStep1Next();
      else if (step === 2 && agentName.trim()) handleStep2Next();
      else if (step === 3 && taskTitle.trim()) handleStep3Next();
    }
  }

  if (!effectiveOnboardingOpen) return null;

  return (
    <Dialog
      open={effectiveOnboardingOpen}
      onOpenChange={(open) => {
        if (!open) {
          setRouteDismissed(true);
          handleClose();
        }
      }}
    >
      <DialogPortal>
        {/* Plain div instead of DialogOverlay — Radix's overlay wraps in
            RemoveScroll which blocks wheel events on our custom (non-DialogContent)
            scroll container. A plain div preserves the background without scroll-locking. */}
        <div className="fixed inset-0 z-50 bg-background" />
        <div className="fixed inset-0 z-50 flex" onKeyDown={handleKeyDown}>
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 left-4 z-10 rounded-sm p-1.5 text-muted-foreground/60 hover:text-foreground transition-colors"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">{t("common.close")}</span>
          </button>

          {/* Left half — form */}
          <div
            className={cn(
              "w-full flex flex-col overflow-y-auto transition-[width] duration-500 ease-in-out",
              step === 1 ? "md:w-1/2" : "md:w-full"
            )}
          >
            <div className="w-full max-w-md mx-auto my-auto px-8 py-12 shrink-0">
              {/* Progress tabs */}
              <div className="flex items-center gap-0 mb-8 border-b border-border">
                {(
                  [
                    { step: 1 as Step, label: t("onboarding.createCompany"), icon: Building2 },
                    { step: 2 as Step, label: t("onboarding.connectAiTool"), icon: Bot },
                    { step: 3 as Step, label: t("onboarding.firstMission"), icon: ListTodo }
                  ] as const
                ).map(({ step: s, label, icon: Icon }) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStep(s)}
                    className={cn(
                      "flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors cursor-pointer",
                      s === step
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground/70 hover:border-border"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Step content */}
              {step === 1 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Building2 className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("onboarding.createCompany")}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.companyName")}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 group">
                    <label
                      className={cn(
                        "text-xs mb-1 block transition-colors",
                        companyName.trim()
                          ? "text-foreground"
                          : "text-muted-foreground group-focus-within:text-foreground"
                      )}
                    >
                      {t("onboarding.companyName")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="Acme Corp"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div className="group">
                    <label
                      className={cn(
                        "text-xs mb-1 block transition-colors",
                        companyGoal.trim()
                          ? "text-foreground"
                          : "text-muted-foreground group-focus-within:text-foreground"
                      )}
                    >
                      {t("onboarding.companyGoal")}
                    </label>
                    <textarea
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[60px]"
                      placeholder={t("onboarding.goalPlaceholder")}
                      value={companyGoal}
                      onChange={(e) => setCompanyGoal(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <Bot className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("onboarding.connectAiTool")}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.chooseAdapter")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.agentName")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder="CEO"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      autoFocus
                    />
                  </div>

                  {/* Detection-based adapter selection */}
                  {detectionLoading && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t("onboarding.detecting")}
                    </div>
                  )}

                  {!detectionLoading && adapterDetection && adapterDetection.detected.length > 0 && !recommendationMode && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">
                        {t("onboarding.chooseAdapter")}
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {adapterDetection.detected.map((item) => {
                          const isRecommended = adapterDetection.recommended?.type === item.type;
                          return (
                            <button
                              key={item.type}
                              className={cn(
                                "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                                adapterType === item.type
                                  ? "border-foreground bg-accent"
                                  : "border-border hover:bg-accent/50"
                              )}
                              onClick={() => {
                                const nextType = item.type as AdapterType;
                                setAdapterType(nextType);
                                if (item.defaultModel) setModel(item.defaultModel);
                                if (item.connectionInfo.command) setCommand(item.connectionInfo.command);
                                if (item.connectionInfo.args?.length) setArgs(item.connectionInfo.args.join(" "));
                                if (item.connectionInfo.baseUrl) setUrl(item.connectionInfo.baseUrl);
                              }}
                            >
                              <span className="absolute -top-1.5 left-1.5 bg-blue-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                                {t("onboarding.detected")}
                              </span>
                              {isRecommended && (
                                <span className="absolute -top-1.5 right-1.5 bg-green-500 text-white text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-none">
                                  {t("onboarding.recommended")}
                                </span>
                              )}
                              <Bot className="h-4 w-4" />
                              <span className="font-medium">{item.name}</span>
                              {item.version && (
                                <span className="text-muted-foreground text-[10px]">
                                  v{item.version}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <button
                        className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => void runDetection()}
                      >
                        <Loader2 className={cn("h-3 w-3", detectionLoading && "animate-spin")} />
                        {t("onboarding.redetect")}
                      </button>
                    </div>
                  )}

                  {!detectionLoading && (recommendationMode || (!adapterDetection)) && !adapterDetection?.detected.length && (
                    <div>
                      <label className="text-xs text-muted-foreground mb-2 block">
                        {t("onboarding.whatAiService")}
                      </label>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { value: "claude_local" as const, label: "Anthropic (Claude)", icon: Sparkles },
                          { value: "codex_local" as const, label: "OpenAI (ChatGPT/Codex)", icon: Code },
                          { value: "gemini_local" as const, label: "Google (Gemini)", icon: Gem },
                          { value: "ollama_local" as const, label: t("onboarding.noInstallNeeded") + " (Ollama)", icon: Cpu },
                          { value: "openclaw_gateway" as const, label: t("onboarding.iDontKnow"), icon: Bot }
                        ].map((opt) => (
                          <button
                            key={opt.value}
                            className={cn(
                              "flex items-center gap-3 rounded-md border p-3 text-sm transition-colors",
                              adapterType === opt.value
                                ? "border-foreground bg-accent"
                                : "border-border hover:bg-accent/50"
                            )}
                            onClick={() => {
                              const nextType = opt.value as AdapterType;
                              setAdapterType(nextType);
                              if (nextType === "codex_local" && !model) setModel(DEFAULT_CODEX_LOCAL_MODEL);
                              else if (nextType === "gemini_local" && !model) setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                              else if (nextType !== "codex_local" && nextType !== "gemini_local") setModel("");
                            }}
                          >
                            <opt.icon className="h-4 w-4 shrink-0" />
                            <span className="font-medium">{opt.label}</span>
                          </button>
                        ))}
                      </div>
                      <button
                        className="flex items-center gap-1.5 mt-3 text-xs text-muted-foreground hover:text-foreground transition-colors"
                        onClick={() => void runDetection()}
                      >
                        <Loader2 className={cn("h-3 w-3", detectionLoading && "animate-spin")} />
                        {t("onboarding.redetect")}
                      </button>
                    </div>
                  )}

                  {/* Collapsible advanced settings */}
                  <div>
                    <button
                      className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      onClick={() => setAdvancedOpen((v) => !v)}
                    >
                      <ChevronDown
                        className={cn(
                          "h-3 w-3 transition-transform",
                          advancedOpen ? "rotate-0" : "-rotate-90"
                        )}
                      />
                      {t("onboarding.advancedSettings")}
                    </button>

                    {advancedOpen && (
                      <div className="mt-3 space-y-3">
                        {/* Adapter type radio cards */}
                        <div>
                          <label className="text-xs text-muted-foreground mb-2 block">
                            {t("onboarding.chooseAdapter")}
                          </label>
                          <div className="grid grid-cols-2 gap-2">
                            {[
                              {
                                value: "claude_local" as const,
                                label: "Claude Code",
                                icon: Sparkles,
                                desc: t("adapter.desc.claude_local")
                              },
                              {
                                value: "codex_local" as const,
                                label: "Codex",
                                icon: Code,
                                desc: t("adapter.desc.codex_local")
                              },
                              {
                                value: "gemini_local" as const,
                                label: "Gemini CLI",
                                icon: Gem,
                                desc: t("adapter.desc.gemini_local")
                              },
                              {
                                value: "opencode_local" as const,
                                label: "OpenCode",
                                icon: OpenCodeLogoIcon,
                                desc: t("adapter.desc.opencode_local")
                              },
                              {
                                value: "pi_local" as const,
                                label: "Pi",
                                icon: Terminal,
                                desc: t("adapter.desc.pi_local")
                              },
                              {
                                value: "cursor" as const,
                                label: "Cursor",
                                icon: MousePointer2,
                                desc: t("adapter.desc.cursor")
                              },
                              {
                                value: "ollama_local" as const,
                                label: "Ollama",
                                icon: Cpu,
                                desc: t("adapter.desc.ollama_local")
                              },
                              {
                                value: "lm_studio_local" as const,
                                label: "LM Studio",
                                icon: Server,
                                desc: t("adapter.desc.lm_studio_local")
                              },
                              {
                                value: "hermes_local" as const,
                                label: "Hermes Agent",
                                icon: HermesIcon,
                                desc: t("adapter.desc.hermes_local")
                              },
                              {
                                value: "openclaw_gateway" as const,
                                label: "OpenClaw Gateway",
                                icon: Bot,
                                desc: t("adapter.desc.openclaw_gateway"),
                                comingSoon: true,
                                disabledLabel: t("adapter.openclaw_gateway")
                              }
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                disabled={"comingSoon" in opt && !!opt.comingSoon}
                                className={cn(
                                  "flex flex-col items-center gap-1.5 rounded-md border p-3 text-xs transition-colors relative",
                                  "comingSoon" in opt && opt.comingSoon
                                    ? "border-border opacity-40 cursor-not-allowed"
                                    : adapterType === opt.value
                                    ? "border-foreground bg-accent"
                                    : "border-border hover:bg-accent/50"
                                )}
                                onClick={() => {
                                  if ("comingSoon" in opt && opt.comingSoon) return;
                                  const nextType = opt.value as AdapterType;
                                  setAdapterType(nextType);
                                  if (nextType === "codex_local" && !model) {
                                    setModel(DEFAULT_CODEX_LOCAL_MODEL);
                                    return;
                                  }
                                  if (nextType === "gemini_local" && !model) {
                                    setModel(DEFAULT_GEMINI_LOCAL_MODEL);
                                    return;
                                  }
                                  if (nextType === "cursor" && !model) {
                                    setModel(DEFAULT_CURSOR_LOCAL_MODEL);
                                    return;
                                  }
                                  if (nextType === "opencode_local") {
                                    if (!model.includes("/")) setModel("");
                                    return;
                                  }
                                  setModel("");
                                }}
                              >
                                <opt.icon className="h-4 w-4" />
                                <span className="font-medium">{opt.label}</span>
                                <span className="text-muted-foreground text-[10px]">
                                  {"comingSoon" in opt && opt.comingSoon
                                    ? ("disabledLabel" in opt ? (opt.disabledLabel as string) : "Coming soon")
                                    : opt.desc}
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Conditional adapter fields — model selector */}
                        {(adapterType === "claude_local" ||
                          adapterType === "codex_local" ||
                          adapterType === "gemini_local" ||
                          adapterType === "hermes_local" ||
                          adapterType === "opencode_local" ||
                          adapterType === "pi_local" ||
                          adapterType === "cursor" ||
                          adapterType === "lm_studio_local" ||
                          adapterType === "ollama_local") && (
                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">
                                {t("onboarding.model")}
                              </label>
                              <Popover
                                open={modelOpen}
                                onOpenChange={(next) => {
                                  setModelOpen(next);
                                  if (!next) setModelSearch("");
                                }}
                              >
                                <PopoverTrigger asChild>
                                  <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-sm hover:bg-accent/50 transition-colors w-full justify-between">
                                    <span
                                      className={cn(
                                        !model && "text-muted-foreground"
                                      )}
                                    >
                                      {selectedModel
                                        ? selectedModel.label
                                        : model ||
                                          (adapterType === "opencode_local"
                                            ? t("onboarding.chooseModel")
                                            : t("priority.default"))}
                                    </span>
                                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent
                                  className="w-[var(--radix-popover-trigger-width)] p-1"
                                  align="start"
                                >
                                  <input
                                    className="w-full px-2 py-1.5 text-xs bg-transparent outline-none border-b border-border mb-1 placeholder:text-muted-foreground/50"
                                    placeholder={`${t("common.search")}...`}
                                    value={modelSearch}
                                    onChange={(e) => setModelSearch(e.target.value)}
                                    autoFocus
                                  />
                                  {adapterType !== "opencode_local" && (
                                    <button
                                      className={cn(
                                        "flex items-center gap-2 w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                        !model && "bg-accent"
                                      )}
                                      onClick={() => {
                                        setModel("");
                                        setModelOpen(false);
                                      }}
                                    >
                                      {t("priority.default")}
                                    </button>
                                  )}
                                  <div className="max-h-[240px] overflow-y-auto">
                                    {groupedModels.map((group) => (
                                      <div
                                        key={group.provider}
                                        className="mb-1 last:mb-0"
                                      >
                                        {adapterType === "opencode_local" && (
                                          <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                                            {group.provider} ({group.entries.length})
                                          </div>
                                        )}
                                        {group.entries.map((m) => (
                                          <button
                                            key={m.id}
                                            className={cn(
                                              "flex items-center w-full px-2 py-1.5 text-sm rounded hover:bg-accent/50",
                                              m.id === model && "bg-accent"
                                            )}
                                            onClick={() => {
                                              setModel(m.id);
                                              setModelOpen(false);
                                            }}
                                          >
                                            <span
                                              className="block w-full text-left truncate"
                                              title={m.id}
                                            >
                                              {adapterType === "opencode_local"
                                                ? extractModelName(m.id)
                                                : m.label}
                                            </span>
                                          </button>
                                        ))}
                                      </div>
                                    ))}
                                  </div>
                                  {filteredModels.length === 0 && (
                                    <p className="px-2 py-1.5 text-xs text-muted-foreground">
                                      {t("common.noResults")}
                                    </p>
                                  )}
                                </PopoverContent>
                              </Popover>
                            </div>
                          </div>
                        )}

                        {(adapterType === "http" ||
                          adapterType === "openclaw_gateway" ||
                          adapterType === "lm_studio_local" ||
                          adapterType === "ollama_local") && (
                          <div>
                            <label className="text-xs text-muted-foreground mb-1 block">
                              {adapterType === "openclaw_gateway"
                                ? "Gateway URL"
                                : adapterType === "lm_studio_local"
                                ? "LM Studio Base URL"
                                : adapterType === "ollama_local"
                                ? "Ollama Base URL"
                                : "Webhook URL"}
                            </label>
                            <input
                              className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm font-mono outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                              placeholder={
                                adapterType === "openclaw_gateway"
                                  ? "ws://127.0.0.1:18789"
                                  : adapterType === "lm_studio_local"
                                  ? DEFAULT_LM_STUDIO_BASE_URL
                                  : adapterType === "ollama_local"
                                  ? DEFAULT_OLLAMA_BASE_URL
                                  : "https://..."
                              }
                              value={url}
                              onChange={(e) => setUrl(e.target.value)}
                            />
                            {(adapterType === "lm_studio_local" ||
                              adapterType === "ollama_local") && (
                              <p className="text-[11px] text-muted-foreground mt-1">
                                외부 서버에서 실행 중이면 호스트 주소를 입력하세요. 비워두면 기본값을 사용합니다.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Environment test section */}
                  {isLocalAdapter && (
                    <div className="space-y-2 rounded-md border border-border p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-xs font-medium">
                            {t("onboarding.testEnvironment")}
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            {t("onboarding.testEnvironment")}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2.5 text-xs"
                          disabled={adapterEnvLoading}
                          onClick={() => void runAdapterEnvironmentTest()}
                        >
                          {adapterEnvLoading ? t("common.testing") : t("onboarding.testEnvironment")}
                        </Button>
                      </div>

                      {adapterEnvError && (
                        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-2.5 py-2 text-[11px] text-destructive">
                          {adapterEnvError}
                        </div>
                      )}

                      {hasModelProbeWarning && (
                        <div className="flex items-start gap-2 rounded-md border border-amber-300/60 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <span className="mt-0.5 shrink-0">&#x26A0;</span>
                          <span>
                            {t("onboarding.modelProbeWarning", {
                              modelId: model || "unknown",
                            })}
                          </span>
                        </div>
                      )}

                      {adapterEnvResult &&
                      adapterEnvResult.status === "pass" ? (
                        <div className="flex items-center gap-2 rounded-md border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 px-3 py-2 text-xs text-green-700 dark:text-green-300 animate-in fade-in slide-in-from-bottom-1 duration-300">
                          <Check className="h-3.5 w-3.5 shrink-0" />
                          <span className="font-medium">{t("onboarding.environmentOk")}</span>
                        </div>
                      ) : adapterEnvResult ? (
                        <AdapterEnvironmentResult result={adapterEnvResult} />
                      ) : null}

                      {shouldSuggestUnsetAnthropicApiKey && (
                        <div className="rounded-md border border-amber-300/60 bg-amber-50/40 px-2.5 py-2 space-y-2">
                          <p className="text-[11px] text-amber-900/90 leading-relaxed">
                            Claude failed while{" "}
                            <span className="font-mono">ANTHROPIC_API_KEY</span>{" "}
                            is set. You can clear it in this CEO adapter config
                            and retry the probe.
                          </p>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs"
                            disabled={
                              adapterEnvLoading || unsetAnthropicLoading
                            }
                            onClick={() => void handleUnsetAnthropicApiKey()}
                          >
                            {unsetAnthropicLoading
                              ? t("common.resuming")
                              : t("onboarding.unsetApiKey")}
                          </Button>
                        </div>
                      )}

                      {adapterEnvResult && adapterEnvResult.status === "fail" && (
                        <div className="rounded-md border border-border/70 bg-muted/20 px-2.5 py-2 text-[11px] space-y-1.5">
                          <p className="font-medium">{t("onboarding.environmentError")}</p>
                          <p className="text-muted-foreground font-mono break-all">
                            {adapterType === "cursor"
                              ? `${effectiveAdapterCommand} -p --mode ask --output-format json \"Respond with hello.\"`
                              : adapterType === "codex_local"
                              ? `${effectiveAdapterCommand} exec --json -`
                              : adapterType === "gemini_local"
                                ? `${effectiveAdapterCommand} --output-format json "Respond with hello."`
                              : adapterType === "opencode_local"
                                ? `${effectiveAdapterCommand} run --format json "Respond with hello."`
                              : `${effectiveAdapterCommand} --print - --output-format stream-json --verbose`}
                          </p>
                          <p className="text-muted-foreground">
                            Prompt:{" "}
                            <span className="font-mono">Respond with hello.</span>
                          </p>
                          {adapterType === "cursor" ||
                          adapterType === "codex_local" ||
                          adapterType === "gemini_local" ||
                          adapterType === "opencode_local" ? (
                            <p className="text-muted-foreground">
                              If auth fails, set{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "CURSOR_API_KEY"
                                  : adapterType === "gemini_local"
                                    ? "GEMINI_API_KEY"
                                    : "OPENAI_API_KEY"}
                              </span>{" "}
                              in env or run{" "}
                              <span className="font-mono">
                                {adapterType === "cursor"
                                  ? "agent login"
                                  : adapterType === "codex_local"
                                    ? "codex login"
                                    : adapterType === "gemini_local"
                                      ? "gemini auth"
                                      : "opencode auth login"}
                              </span>
                              .
                            </p>
                          ) : (
                            <p className="text-muted-foreground">
                              If login is required, run{" "}
                              <span className="font-mono">claude login</span>{" "}
                              and retry.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div className="space-y-5">
                  <div className="flex items-center gap-3 mb-1">
                    <div className="bg-muted/50 p-2">
                      <ListTodo className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t("onboarding.firstMission")}</h3>
                      <p className="text-xs text-muted-foreground">
                        {t("onboarding.taskDescription")}
                      </p>
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.taskTitle")}
                    </label>
                    <input
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50"
                      placeholder={t("onboarding.taskTitle")}
                      value={taskTitle}
                      onChange={(e) => setTaskTitle(e.target.value)}
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">
                      {t("onboarding.taskDescription")}
                    </label>
                    <textarea
                      ref={textareaRef}
                      className="w-full rounded-md border border-border bg-transparent px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/50 resize-none min-h-[120px] max-h-[300px] overflow-y-auto"
                      placeholder={t("onboarding.taskDescription")}
                      value={taskDescription}
                      onChange={(e) => setTaskDescription(e.target.value)}
                    />
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="mt-3">
                  <p className="text-xs text-destructive">{error}</p>
                </div>
              )}

              {/* Footer navigation */}
              <div className="flex items-center justify-between mt-8">
                <div>
                  {step > 1 && step > (onboardingOptions.initialStep ?? 1) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setStep((step - 1) as Step)}
                      disabled={loading}
                    >
                      <ArrowLeft className="h-3.5 w-3.5 mr-1" />
                      {t("common.back")}
                    </Button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {step === 1 && (
                    <Button
                      size="sm"
                      disabled={!companyName.trim() || loading}
                      onClick={handleStep1Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? t("common.creating") : t("common.next")}
                    </Button>
                  )}
                  {step === 2 && (
                    <Button
                      size="sm"
                      disabled={
                        !agentName.trim() || loading || adapterEnvLoading
                      }
                      onClick={handleStep2Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <ArrowRight className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? t("common.creating") : t("common.next")}
                    </Button>
                  )}
                  {step === 3 && (
                    <Button
                      size="sm"
                      disabled={!taskTitle.trim() || loading}
                      onClick={handleStep3Next}
                    >
                      {loading ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      ) : (
                        <Rocket className="h-3.5 w-3.5 mr-1" />
                      )}
                      {loading ? t("common.creating") : t("onboarding.createAndStart")}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right half — ASCII art (hidden on mobile) */}
          <div
            className={cn(
              "hidden md:block overflow-hidden bg-[#1d1d1d] transition-[width,opacity] duration-500 ease-in-out",
              step === 1 ? "w-1/2 opacity-100" : "w-0 opacity-0"
            )}
          >
            <AsciiArtAnimation />
          </div>
        </div>
      </DialogPortal>
    </Dialog>
  );
}

function AdapterEnvironmentResult({
  result
}: {
  result: AdapterEnvironmentTestResult;
}) {
  const { t } = useTranslation();
  const statusLabel =
    result.status === "pass"
      ? t("onboarding.environmentOk")
      : result.status === "warn"
      ? "경고"
      : t("onboarding.environmentError");
  const statusClass =
    result.status === "pass"
      ? "text-green-700 dark:text-green-300 border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10"
      : result.status === "warn"
      ? "text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-500/10"
      : "text-red-700 dark:text-red-300 border-red-300 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10";

  return (
    <div className={`rounded-md border px-2.5 py-2 text-[11px] ${statusClass}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{statusLabel}</span>
        <span className="opacity-80">
          {new Date(result.testedAt).toLocaleTimeString()}
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {result.checks.map((check, idx) => (
          <div
            key={`${check.code}-${idx}`}
            className="leading-relaxed break-words"
          >
            <span className="font-medium uppercase tracking-wide opacity-80">
              {check.level}
            </span>
            <span className="mx-1 opacity-60">·</span>
            <span>{check.message}</span>
            {check.detail && (
              <span className="block opacity-75 break-all">
                ({check.detail})
              </span>
            )}
            {check.hint && (
              <span className="block opacity-90 break-words">
                Hint: {check.hint}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
