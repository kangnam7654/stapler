import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@/lib/router";
import { onboardingApi } from "../api/onboarding";
import { useToast } from "../context/ToastContext";
import { cn } from "../lib/utils";
import {
  Building2,
  Bot,
  ListTodo,
  Activity,
  UserPlus,
  DollarSign,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  PartyPopper,
} from "lucide-react";

const STORAGE_KEY_PREFIX = "paperclip.gettingStarted";

function storageKey(companyId: string, suffix: string) {
  return `${STORAGE_KEY_PREFIX}.${companyId}.${suffix}`;
}

function readBool(key: string): boolean {
  try {
    return window.localStorage.getItem(key) === "true";
  } catch {
    return false;
  }
}

function writeBool(key: string, value: boolean) {
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // Ignore storage failures
  }
}

interface GettingStartedPanelProps {
  companyId: string;
  companyPrefix: string;
}

const STEP_ICONS = [Building2, Bot, ListTodo, Activity, UserPlus, DollarSign] as const;

export function GettingStartedPanel({ companyId, companyPrefix }: GettingStartedPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pushToast } = useToast();
  const prevCompletedRef = useRef<Set<number>>(new Set());

  const [collapsed, setCollapsed] = useState(() =>
    readBool(storageKey(companyId, "collapsed")),
  );
  const [dismissed, setDismissed] = useState(() =>
    readBool(storageKey(companyId, "dismissed")),
  );

  const { data: progress } = useQuery({
    queryKey: ["onboarding-progress", companyId],
    queryFn: () => onboardingApi.getProgress(companyId),
    refetchInterval: 5_000,
    enabled: !dismissed,
  });

  const completedSteps = progress?.completedSteps ?? [];
  const totalSteps = progress?.totalSteps ?? 6;
  const currentStep = progress?.currentStep ?? 1;
  const completedCount = completedSteps.length;

  // Toast when step 4 completes
  useEffect(() => {
    if (!progress) return;
    const prevSet = prevCompletedRef.current;
    const newSet = new Set(progress.completedSteps);

    if (newSet.has(4) && !prevSet.has(4)) {
      pushToast({
        title: t("onboarding.agentStarted"),
        tone: "success",
      });
    }

    prevCompletedRef.current = newSet;
  }, [progress, pushToast, t]);

  // Auto-collapse after 3 seconds when all complete
  useEffect(() => {
    if (completedCount < totalSteps) return;
    const timer = window.setTimeout(() => {
      setCollapsed(true);
      writeBool(storageKey(companyId, "collapsed"), true);
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [completedCount, totalSteps, companyId]);

  const handleCollapse = useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      writeBool(storageKey(companyId, "collapsed"), next);
      return next;
    });
  }, [companyId]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    writeBool(storageKey(companyId, "dismissed"), true);
  }, [companyId]);

  if (dismissed) return null;

  const stepLabels = [
    t("onboarding.step1CreateCompany"),
    t("onboarding.step2ConnectAgent"),
    t("onboarding.step3CreateTask"),
    t("onboarding.step4AgentActivity"),
    t("onboarding.step5AddAgent"),
    t("onboarding.step6SetBudget"),
  ];

  const stepNavTargets = [
    `/${companyPrefix}/companies`,
    `/${companyPrefix}/agents/new`,
    `/${companyPrefix}/issues`,
    `/${companyPrefix}/activity`,
    `/${companyPrefix}/agents/new`,
    `/${companyPrefix}/costs`,
  ];

  if (collapsed) {
    return (
      <button
        onClick={handleCollapse}
        className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full bg-primary px-3 py-2 text-primary-foreground text-sm font-medium shadow-lg hover:bg-primary/90 transition-colors"
      >
        <CheckCircle2 className="h-4 w-4" />
        {t("onboarding.stepsCompleted", {
          completed: completedCount,
          total: totalSteps,
        })}
        <ChevronUp className="h-3 w-3" />
      </button>
    );
  }

  return (
    <div className="w-72 shrink-0 border-l border-border bg-background overflow-y-auto">
      <div className="p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">{t("onboarding.gettingStarted")}</h3>
          <div className="flex items-center gap-1">
            <button
              onClick={handleCollapse}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label="Collapse"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
            <button
              onClick={handleDismiss}
              className="rounded p-1 text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">
              {t("onboarding.stepsCompleted", {
                completed: completedCount,
                total: totalSteps,
              })}
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted">
            <div
              className="h-1.5 rounded-full bg-primary transition-[width] duration-500"
              style={{ width: `${(completedCount / totalSteps) * 100}%` }}
            />
          </div>
        </div>

        {/* All complete */}
        {completedCount >= totalSteps && (
          <div className="flex items-center gap-2 rounded-md border border-green-300 dark:border-green-500/40 bg-green-50 dark:bg-green-500/10 px-3 py-2.5 text-sm text-green-700 dark:text-green-300 mb-4 animate-in fade-in slide-in-from-bottom-1 duration-300">
            <PartyPopper className="h-4 w-4 shrink-0" />
            <span className="font-medium">{t("onboarding.allComplete")}</span>
          </div>
        )}

        {/* Contextual tip */}
        {currentStep === 4 && !completedSteps.includes(4) && (
          <div className="rounded-md border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-3 py-2 text-xs text-blue-700 dark:text-blue-300 mb-4">
            {t("onboarding.agentWorking")}
          </div>
        )}

        {/* Checklist */}
        <div className="space-y-1">
          {stepLabels.map((label, idx) => {
            const stepNum = idx + 1;
            const isCompleted = completedSteps.includes(stepNum);
            const isActive = currentStep === stepNum && !isCompleted;
            const Icon = STEP_ICONS[idx];

            return (
              <button
                key={stepNum}
                disabled={isCompleted}
                onClick={() => {
                  if (!isCompleted) {
                    navigate(stepNavTargets[idx]);
                  }
                }}
                className={cn(
                  "flex items-center gap-3 w-full rounded-md px-3 py-2 text-sm transition-colors text-left",
                  isCompleted
                    ? "text-muted-foreground cursor-default"
                    : isActive
                    ? "bg-accent/50 text-foreground font-medium"
                    : "hover:bg-accent/30 text-foreground/80 cursor-pointer",
                )}
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500" />
                ) : (
                  <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                )}
                <span className="flex-1 min-w-0 truncate">{label}</span>
                {!isCompleted && (
                  <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
