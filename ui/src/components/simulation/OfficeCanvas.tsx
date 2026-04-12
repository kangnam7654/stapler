import { useRef, useEffect } from "react";
import { Application } from "pixi.js";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";
import { TilemapLayer } from "./layers/TilemapLayer";
import { AgentLayer } from "./layers/AgentLayer";
import type { SimulationState } from "./types";

interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
}

export function OfficeCanvas({
  state,
  onAgentClick,
  onIssueClick: _onIssueClick,
}: OfficeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentLayerRef = useRef<AgentLayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let tilemapLayer: TilemapLayer | null = null;
    let agentLayer: AgentLayer | null = null;
    let destroyed = false;

    (async () => {
      await app.init({
        width: OFFICE_WIDTH,
        height: OFFICE_HEIGHT,
        background: 0x2d1b69,
        antialias: false,
        resolution: 1,
      });

      if (destroyed) {
        app.destroy(true);
        return;
      }

      app.canvas.style.imageRendering = "pixelated";
      container.appendChild(app.canvas);

      tilemapLayer = new TilemapLayer();
      app.stage.addChild(tilemapLayer.container);

      agentLayer = new AgentLayer();
      agentLayer.setOnAgentClick(onAgentClick);
      app.stage.addChild(agentLayer.container);
      agentLayerRef.current = agentLayer;

      // Initial render of agents
      agentLayer.updateAgents(state.agents);
    })();

    return () => {
      destroyed = true;
      agentLayerRef.current = null;
      agentLayer?.destroy();
      tilemapLayer?.destroy();
      app.destroy(true);
    };
    // Only run init once on mount; agent updates happen via the separate useEffect below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    agentLayerRef.current?.updateAgents(state.agents);
  }, [state.agents]);

  return <div ref={containerRef} />;
}
