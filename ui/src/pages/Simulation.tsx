import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { OfficeCanvas } from "../components/simulation/OfficeCanvas";

export function Simulation() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full w-full items-center justify-center">
      <OfficeCanvas />
    </div>
  );
}
