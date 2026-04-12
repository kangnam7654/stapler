import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { OfficeCanvas } from "../components/simulation/OfficeCanvas";
import { useSimulationState } from "../hooks/useSimulationState";

export function Simulation() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  const { state, selectAgent, selectIssue } =
    useSimulationState(selectedCompanyId);

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <OfficeCanvas
        state={state}
        onAgentClick={selectAgent}
        onIssueClick={selectIssue}
      />
    </div>
  );
}
