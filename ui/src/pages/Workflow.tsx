import { useEffect } from "react";
import { useParams } from "@/lib/router";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { EmptyState } from "../components/EmptyState";
import { WorkflowInbox } from "../components/WorkflowInbox";
import { WorkflowRouteRulesPanel } from "../components/WorkflowRouteRulesPanel";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, GitBranch, ArrowRight } from "lucide-react";

export function Workflow() {
  const { t } = useTranslation();
  const { selectedCompanyId, selectedCompany } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { caseId } = useParams<{ caseId?: string }>();

  useEffect(() => {
    setBreadcrumbs([{ label: "Workflow" }]);
  }, [setBreadcrumbs]);

  if (!selectedCompanyId) {
    return <EmptyState icon={MessageSquare} message={t("dashboard.selectCompany")} />;
  }

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="rounded-full px-2.5 py-0.5">
                Workflow
              </Badge>
              <Badge variant="outline" className="rounded-full px-2.5 py-0.5">
                Company-scoped
              </Badge>
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">
              {selectedCompany?.name ?? "Selected company"} workflow
            </h2>
            <p className="max-w-2xl text-sm text-muted-foreground">
              하나의 요청을 접수하고, brief를 만들고, 리뷰한 뒤, 승인과 handoff까지 자연스럽게 이어가는 곳입니다.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <GitBranch className="h-4 w-4" />
            <span>Intake</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Brief</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Review</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Decision</span>
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Handoff</span>
          </div>
        </div>
      </div>

      <details className="rounded-2xl border border-border bg-card p-4">
        <summary className="cursor-pointer list-none text-sm font-medium text-muted-foreground">
          Advanced routing
        </summary>
        <div className="mt-4">
          <WorkflowRouteRulesPanel companyId={selectedCompanyId} />
        </div>
      </details>

      <WorkflowInbox companyId={selectedCompanyId} selectedCaseId={caseId ?? null} />
    </div>
  );
}
