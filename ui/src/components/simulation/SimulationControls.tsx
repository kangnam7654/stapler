import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "../ui/button";

interface SimulationControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export function SimulationControls({
  onZoomIn,
  onZoomOut,
  onResetView,
}: SimulationControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-4 right-4 z-10 flex gap-1">
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomIn}
        title={t("simulation.controls.zoomIn")}
      >
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onZoomOut}
        title={t("simulation.controls.zoomOut")}
      >
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={onResetView}
        title={t("simulation.controls.resetView")}
      >
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
