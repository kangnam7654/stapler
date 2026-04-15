import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import {
  OfficeCanvas,
  type OfficeCanvasHandle,
} from "../components/simulation/OfficeCanvas";
import { SimulationControls } from "../components/simulation/SimulationControls";
import { AgentDetailPanel } from "../components/simulation/AgentDetailPanel";
import { KanbanDetailPanel } from "../components/simulation/KanbanDetailPanel";
import { DelegationWalkthroughPanel } from "../components/simulation/DelegationWalkthroughPanel";
import { useSimulationState } from "../hooks/useSimulationState";
import { ErrorBoundary } from "../components/ErrorBoundary";

export function Simulation() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { state, selectAgent, selectIssue, moveIssue } =
    useSimulationState(selectedCompanyId);

  const canvasRef = useRef<OfficeCanvasHandle>(null);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      {selectedCompanyId ? (
        <ErrorBoundary>
          <OfficeCanvas
            ref={canvasRef}
            state={state}
            onAgentClick={selectAgent}
            onIssueClick={selectIssue}
            onIssueDrop={moveIssue}
          />
        </ErrorBoundary>
      ) : (
        <div className="flex h-full w-full items-center justify-center px-6">
          <div className="max-w-lg rounded-xl border bg-background/90 p-6 text-center shadow-sm">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Simulation</div>
            <h1 className="mt-2 text-xl font-bold">데모를 시작할 회사를 먼저 만들어요</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              왼쪽 패널의 첫 단계에서 회사가 생성되면, 그 다음부터 CEO, C-Level, 직원, 이슈가 차례로 화면에 나타납니다.
            </p>
          </div>
        </div>
      )}
      <DelegationWalkthroughPanel />
      {selectedCompanyId && (
        <>
          <SimulationControls
            onZoomIn={() => canvasRef.current?.zoomIn()}
            onZoomOut={() => canvasRef.current?.zoomOut()}
            onResetView={() => canvasRef.current?.resetView()}
          />
          {state.selectedAgent && (
            <AgentDetailPanel
              agentId={state.selectedAgent}
              companyId={selectedCompanyId}
              onClose={() => selectAgent(null)}
            />
          )}
          {state.selectedIssue && (
            <KanbanDetailPanel
              issueId={state.selectedIssue}
              onClose={() => selectIssue(null)}
            />
          )}
        </>
      )}
    </div>
  );
}
