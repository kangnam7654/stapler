import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowRightLeft,
  Bot,
  Building2,
  CheckCircle2,
  Circle,
  ClipboardList,
  Play,
  RefreshCw,
  Users,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../../context/CompanyContext";
import { agentsApi } from "../../api/agents";
import { companiesApi } from "../../api/companies";
import { issuesApi } from "../../api/issues";
import { queryKeys } from "../../lib/queryKeys";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";

type DemoStepId =
  | "create-company"
  | "create-ceo"
  | "create-clevel"
  | "create-employee"
  | "create-issue"
  | "delegate-clevel"
  | "delegate-employee"
  | "checkout"
  | "done";

type DemoEvent = {
  id: string;
  label: string;
  detail: string;
  at: string;
};

type DemoState = {
  companyId: string | null;
  ceoId: string | null;
  cLevelId: string | null;
  employeeId: string | null;
  issueId: string | null;
};

const DEMO_STEPS: Array<{
  id: DemoStepId;
  title: string;
  description: string;
  icon: typeof Building2;
  actionLabel: string;
}> = [
  {
    id: "create-company",
    title: "회사 만들기",
    description: "데모 전용 회사를 새로 만들고, 그 회사를 작업 컨텍스트로 고정합니다.",
    icon: Building2,
    actionLabel: "회사를 생성",
  },
  {
    id: "create-ceo",
    title: "CEO 만들기",
    description: "작업을 시작하고 위임의 출발점이 되는 CEO 에이전트를 만듭니다.",
    icon: Bot,
    actionLabel: "CEO 생성",
  },
  {
    id: "create-clevel",
    title: "TEST C-Level 만들기",
    description: "중간 위임과 검토 역할을 맡는 C-Level 에이전트를 추가합니다.",
    icon: Users,
    actionLabel: "C-Level 생성",
  },
  {
    id: "create-employee",
    title: "일반 직원 만들기",
    description: "실제로 일을 수행할 일반 직원 에이전트를 만듭니다.",
    icon: Bot,
    actionLabel: "직원 생성",
  },
  {
    id: "create-issue",
    title: "테스트 이슈 만들기",
    description: "CEO에게 먼저 할당된 테스트 이슈를 생성합니다.",
    icon: ClipboardList,
    actionLabel: "이슈 생성",
  },
  {
    id: "delegate-clevel",
    title: "C-Level로 위임",
    description: "CEO가 이슈를 TEST C-Level에게 넘기는 장면을 보여줍니다.",
    icon: ArrowRightLeft,
    actionLabel: "C-Level로 넘기기",
  },
  {
    id: "delegate-employee",
    title: "직원에게 위임",
    description: "C-Level이 다시 일반 직원에게 넘기면서 소유권이 이동합니다.",
    icon: ArrowRightLeft,
    actionLabel: "직원에게 넘기기",
  },
  {
    id: "checkout",
    title: "직원 체크아웃",
    description: "직원이 이슈를 체크아웃해서 실제 수행 상태로 바꿉니다.",
    icon: Play,
    actionLabel: "체크아웃",
  },
  {
    id: "done",
    title: "완료 처리",
    description: "마지막으로 Done 처리해서 전체 흐름을 끝냅니다.",
    icon: CheckCircle2,
    actionLabel: "완료로 마킹",
  },
];

function stepIndex(stepId: DemoStepId) {
  return DEMO_STEPS.findIndex((step) => step.id === stepId);
}

function nowStamp() {
  return new Date().toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function DelegationWalkthroughPanel() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { createCompany, selectedCompany } = useCompany();

  const [demo, setDemo] = useState<DemoState>({
    companyId: null,
    ceoId: null,
    cLevelId: null,
    employeeId: null,
    issueId: null,
  });
  const [currentStep, setCurrentStep] = useState<DemoStepId>("create-company");
  const [busyStep, setBusyStep] = useState<DemoStepId | null>(null);
  const [finished, setFinished] = useState(false);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const completedUntil = useMemo(() => {
    const currentIndex = stepIndex(currentStep);
    return new Set(DEMO_STEPS.slice(0, currentIndex).map((step) => step.id));
  }, [currentStep]);

  const createAgent = useMutation({
    mutationFn: async (input: {
      companyId: string;
      name: string;
      role: "ceo" | "chro" | "engineer";
      title: string;
      reportsTo?: string | null;
    }) =>
      agentsApi.create(input.companyId, {
        name: input.name,
        role: input.role,
        title: input.title,
        adapterType: "process",
        adapterConfig: {},
        runtimeConfig: {},
        reportsTo: input.reportsTo ?? null,
      }),
  });

  const createIssue = useMutation({
    mutationFn: async (input: { companyId: string; ceoId: string }) =>
      issuesApi.create(input.companyId, {
        title: "Delegation walkthrough issue",
        description: "Create, delegate, checkout, and complete this issue in the browser.",
        priority: "high",
        status: "todo",
        assigneeAgentId: input.ceoId,
      }),
  });

  const updateIssue = useMutation({
    mutationFn: async (input: { issueId: string; assigneeAgentId?: string | null; status?: string }) =>
      issuesApi.update(input.issueId, {
        ...(input.assigneeAgentId === undefined ? {} : { assigneeAgentId: input.assigneeAgentId }),
        ...(input.status === undefined ? {} : { status: input.status }),
      }),
  });

  const checkoutIssue = useMutation({
    mutationFn: async (input: { issueId: string; agentId: string }) =>
      issuesApi.checkout(input.issueId, input.agentId),
  });

  const pushEvent = (label: string, detail: string) => {
    setEvents((current) => [
      {
        id: crypto.randomUUID(),
        label,
        detail,
        at: nowStamp(),
      },
      ...current,
    ]);
  };

  const advance = async () => {
    const step = DEMO_STEPS[stepIndex(currentStep)];
    if (!step || busyStep || finished) return;

    setBusyStep(step.id);
    setError(null);

    try {
      switch (step.id) {
        case "create-company": {
          const company = await createCompany({
            name: `Delegation Demo ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`,
            description: "Guided delegation demo company",
            budgetMonthlyCents: 0,
          });
          setDemo((current) => ({ ...current, companyId: company.id }));
          pushEvent("회사 생성", `${company.name} · ${company.id.slice(0, 8)}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
          break;
        }
        case "create-ceo": {
          if (!demo.companyId) throw new Error("먼저 회사를 만들어야 합니다.");
          const ceo = await createAgent.mutateAsync({
            companyId: demo.companyId,
            name: "CEO",
            role: "ceo",
            title: "Chief Executive Officer",
          });
          setDemo((current) => ({ ...current, ceoId: ceo.id }));
          pushEvent("CEO 생성", `${ceo.name} · ${ceo.id.slice(0, 8)}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(demo.companyId) });
          break;
        }
        case "create-clevel": {
          if (!demo.companyId || !demo.ceoId) throw new Error("먼저 CEO를 만들어야 합니다.");
          const cLevel = await createAgent.mutateAsync({
            companyId: demo.companyId,
            name: "TEST C-Level",
            role: "chro",
            title: "Test C-Level",
            reportsTo: demo.ceoId,
          });
          setDemo((current) => ({ ...current, cLevelId: cLevel.id }));
          pushEvent("C-Level 생성", `${cLevel.name} · ${cLevel.id.slice(0, 8)}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(demo.companyId) });
          break;
        }
        case "create-employee": {
          if (!demo.companyId || !demo.cLevelId) throw new Error("먼저 C-Level을 만들어야 합니다.");
          const employee = await createAgent.mutateAsync({
            companyId: demo.companyId,
            name: "General Employee",
            role: "engineer",
            title: "Engineer",
            reportsTo: demo.cLevelId,
          });
          setDemo((current) => ({ ...current, employeeId: employee.id }));
          pushEvent("직원 생성", `${employee.name} · ${employee.id.slice(0, 8)}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.agents.list(demo.companyId) });
          break;
        }
        case "create-issue": {
          if (!demo.companyId || !demo.ceoId) throw new Error("먼저 CEO를 만들어야 합니다.");
          const issue = await createIssue.mutateAsync({
            companyId: demo.companyId,
            ceoId: demo.ceoId,
          });
          setDemo((current) => ({ ...current, issueId: issue.id }));
          pushEvent("이슈 생성", `${issue.title} · ${issue.id.slice(0, 8)}`);
          await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(demo.companyId) });
          break;
        }
        case "delegate-clevel": {
          if (!demo.issueId || !demo.cLevelId) throw new Error("이슈와 C-Level이 필요합니다.");
          await updateIssue.mutateAsync({
            issueId: demo.issueId,
            assigneeAgentId: demo.cLevelId,
          });
          pushEvent("위임", "CEO → TEST C-Level");
          await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(demo.companyId ?? "") });
          break;
        }
        case "delegate-employee": {
          if (!demo.issueId || !demo.employeeId) throw new Error("이슈와 직원이 필요합니다.");
          await updateIssue.mutateAsync({
            issueId: demo.issueId,
            assigneeAgentId: demo.employeeId,
          });
          pushEvent("위임", "TEST C-Level → General Employee");
          await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(demo.companyId ?? "") });
          break;
        }
        case "checkout": {
          if (!demo.issueId || !demo.employeeId) throw new Error("이슈와 직원이 필요합니다.");
          await checkoutIssue.mutateAsync({
            issueId: demo.issueId,
            agentId: demo.employeeId,
          });
          pushEvent("체크아웃", "General Employee가 이슈를 실제 수행 상태로 가져감");
          await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(demo.companyId ?? "") });
          break;
        }
        case "done": {
          if (!demo.issueId) throw new Error("이슈가 필요합니다.");
          await updateIssue.mutateAsync({
            issueId: demo.issueId,
            status: "done",
          });
          pushEvent("완료", "General Employee가 작업을 Done 처리");
          await queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(demo.companyId ?? "") });
          break;
        }
      }

      const next = DEMO_STEPS[stepIndex(step.id) + 1];
      if (next) {
        setCurrentStep(next.id);
      } else {
        setFinished(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "데모 단계를 진행하지 못했습니다.");
    } finally {
      setBusyStep(null);
    }
  };

  const resetDemo = () => {
    setDemo({
      companyId: null,
      ceoId: null,
      cLevelId: null,
      employeeId: null,
      issueId: null,
    });
    setCurrentStep("create-company");
    setBusyStep(null);
    setFinished(false);
    setError(null);
    setEvents([]);
  };

  const companyLabel = selectedCompany?.name ?? "회사 선택됨";
  const issueProgress =
    DEMO_STEPS.length === 0 ? 0 : ((stepIndex(currentStep) + 1) / DEMO_STEPS.length) * 100;

  return (
    <Card className="absolute left-4 top-4 z-10 w-[430px] border-border/70 bg-background/95 shadow-xl backdrop-blur supports-[backdrop-filter]:bg-background/85">
      <CardHeader className="space-y-2 border-b pb-4">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Browser demo</Badge>
              <Badge variant="outline">{companyLabel}</Badge>
            </div>
            <CardTitle className="text-base">위임 흐름을 눈으로 따라보기</CardTitle>
            <p className="text-sm text-muted-foreground">
              버튼을 한 번씩 누르면 회사, CEO, C-Level, 직원, 이슈, 위임, checkout, done까지 실제 API로 진행됩니다.
            </p>
          </div>
          <Button variant="outline" size="icon-sm" onClick={resetDemo} title="리셋">
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>진행률</span>
            <span>{Math.round(issueProgress)}%</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div
              className="h-2 rounded-full bg-primary transition-all"
              style={{ width: `${Math.max(8, issueProgress)}%` }}
            />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">회사</div>
            <div className="mt-1 text-sm font-medium">{demo.companyId ? "생성됨" : "대기 중"}</div>
            <div className="mt-1 text-xs text-muted-foreground font-mono">
              {demo.companyId ? demo.companyId.slice(0, 8) : "—"}
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="text-xs text-muted-foreground">이슈</div>
            <div className="mt-1 text-sm font-medium">{demo.issueId ? "생성됨" : "대기 중"}</div>
            <div className="mt-1 text-xs text-muted-foreground font-mono">
              {demo.issueId ? demo.issueId.slice(0, 8) : "—"}
            </div>
          </div>
        </div>

        <ScrollArea className="h-[340px] pr-2">
          <div className="space-y-2">
            {DEMO_STEPS.map((step) => {
              const active = step.id === currentStep && !(finished && step.id === "done");
              const done = completedUntil.has(step.id) || (finished && step.id === "done");
              const Icon = step.icon;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    if (active) void advance();
                  }}
                  className={[
                    "w-full rounded-lg border px-3 py-3 text-left transition",
                    active ? "border-primary bg-primary/5" : "border-border bg-card hover:bg-muted/40",
                  ].join(" ")}
                >
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border bg-background">
                      {done ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      ) : active ? (
                        <Play className="h-4 w-4 text-primary" />
                      ) : (
                        <Circle className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-semibold">{step.title}</span>
                        {active && <Badge variant="secondary">진행 중</Badge>}
                        {done && !active && <Badge variant="outline">완료</Badge>}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{step.description}</p>
                      <p className="mt-2 text-xs font-medium text-primary">{step.actionLabel}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <Separator />

        <div className="space-y-3">
          <div className="flex items-center justify-between">
              <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">현재 단계</div>
              <div className="text-sm font-medium">
                {finished ? "완료" : DEMO_STEPS[stepIndex(currentStep)]?.title ?? "완료"}
              </div>
            </div>
            <Button onClick={() => void advance()} disabled={busyStep !== null || finished}>
              {busyStep ? "진행 중..." : "다음 단계"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>

          <div className="rounded-lg border bg-muted/20 p-3 text-sm">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">상태 요약</span>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div>CEO: {demo.ceoId ? demo.ceoId.slice(0, 8) : "대기"}</div>
              <div>TEST C-Level: {demo.cLevelId ? demo.cLevelId.slice(0, 8) : "대기"}</div>
              <div>직원: {demo.employeeId ? demo.employeeId.slice(0, 8) : "대기"}</div>
              <div>이슈: {demo.issueId ? demo.issueId.slice(0, 8) : "대기"}</div>
            </div>
          </div>

          {error && (
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">실행 로그</div>
            <div className="text-xs text-muted-foreground">{events.length}건</div>
          </div>
          <div className="rounded-lg border bg-background">
            <ScrollArea className="h-40">
              <div className="divide-y">
                {events.length === 0 ? (
                  <div className="px-3 py-4 text-sm text-muted-foreground">
                    아직 시작하지 않았어요. 첫 단계부터 눌러보세요.
                  </div>
                ) : (
                  events.map((event) => (
                    <div key={event.id} className="px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">{event.label}</span>
                        <span className="text-xs text-muted-foreground">{event.at}</span>
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">{event.detail}</div>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
