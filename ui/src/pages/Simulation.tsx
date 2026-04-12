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
import { useSimulationState } from "../hooks/useSimulationState";

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

  if (!selectedCompanyId) return null;

  return (
    <div className="relative flex h-full w-full items-center justify-center">
      <OfficeCanvas
        ref={canvasRef}
        state={state}
        onAgentClick={selectAgent}
        onIssueClick={selectIssue}
        onIssueDrop={moveIssue}
      />
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
    </div>
  );
}
