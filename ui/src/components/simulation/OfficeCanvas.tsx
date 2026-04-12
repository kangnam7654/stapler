import { useRef, useEffect } from "react";
import { Application } from "pixi.js";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";
import { TilemapLayer } from "./layers/TilemapLayer";
import { KanbanLayer } from "./layers/KanbanLayer";
import { AgentLayer } from "./layers/AgentLayer";
import { EffectLayer } from "./layers/EffectLayer";
import type { SimulationState } from "./types";

interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
}

export function OfficeCanvas({
  state,
  onAgentClick,
  onIssueClick,
}: OfficeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const agentLayerRef = useRef<AgentLayer | null>(null);
  const kanbanLayerRef = useRef<KanbanLayer | null>(null);
  const effectLayerRef = useRef<EffectLayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let tilemapLayer: TilemapLayer | null = null;
    let kanbanLayer: KanbanLayer | null = null;
    let agentLayer: AgentLayer | null = null;
    let effectLayer: EffectLayer | null = null;
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

      // Layer 1: Tilemap (floor, walls, furniture)
      tilemapLayer = new TilemapLayer();
      app.stage.addChild(tilemapLayer.container);

      // Layer 2: Kanban board (wall overlay with issue cards)
      kanbanLayer = new KanbanLayer();
      kanbanLayer.setOnIssueClick(onIssueClick);
      app.stage.addChild(kanbanLayer.container);
      kanbanLayerRef.current = kanbanLayer;

      // Layer 3: Agents
      agentLayer = new AgentLayer();
      agentLayer.setOnAgentClick(onAgentClick);
      app.stage.addChild(agentLayer.container);
      agentLayerRef.current = agentLayer;

      // Layer 4: Effects (speech bubbles, status icons) — topmost
      effectLayer = new EffectLayer();
      app.stage.addChild(effectLayer.container);
      effectLayerRef.current = effectLayer;

      // Initial render
      agentLayer.updateAgents(state.agents);
      kanbanLayer.updateKanban(state.kanban);
      effectLayer.updateEffects(state.agents);

      // Animation ticker
      app.ticker.add(() => {
        agentLayerRef.current?.update(app.ticker.deltaTime);
      });
    })();

    return () => {
      destroyed = true;
      agentLayerRef.current = null;
      kanbanLayerRef.current = null;
      effectLayerRef.current = null;
      effectLayer?.destroy();
      agentLayer?.destroy();
      kanbanLayer?.destroy();
      tilemapLayer?.destroy();
      app.destroy(true);
    };
    // Only run init once on mount; updates happen via the separate useEffects below
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    agentLayerRef.current?.updateAgents(state.agents);
    effectLayerRef.current?.updateEffects(state.agents);
  }, [state.agents]);

  useEffect(() => {
    kanbanLayerRef.current?.updateKanban(state.kanban);
  }, [state.kanban]);

  return <div ref={containerRef} />;
}
