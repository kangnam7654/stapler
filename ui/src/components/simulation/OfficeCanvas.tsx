import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { Application } from "pixi.js";
import type { IssueStatus } from "@paperclipai/shared";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";
import { TilemapLayer } from "./layers/TilemapLayer";
import { KanbanLayer } from "./layers/KanbanLayer";
import { AgentLayer } from "./layers/AgentLayer";
import { EffectLayer } from "./layers/EffectLayer";
import type { SimulationState } from "./types";

const MIN_ZOOM = 0.5;
const MAX_ZOOM = 2;
const ZOOM_STEP = 0.2;
const WHEEL_ZOOM_STEP = 0.1;

export interface OfficeCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
  onIssueDrop: (issueId: string, newStatus: IssueStatus) => void;
}

export const OfficeCanvas = forwardRef<OfficeCanvasHandle, OfficeCanvasProps>(
  function OfficeCanvas(
    { state, onAgentClick, onIssueClick, onIssueDrop },
    ref,
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const appRef = useRef<Application | null>(null);
    const agentLayerRef = useRef<AgentLayer | null>(null);
    const kanbanLayerRef = useRef<KanbanLayer | null>(null);
    const effectLayerRef = useRef<EffectLayer | null>(null);

    const scaleRef = useRef(1);
    const panRef = useRef({ x: 0, y: 0 });

    useImperativeHandle(
      ref,
      () => ({
        zoomIn: () => {
          const app = appRef.current;
          if (!app) return;
          scaleRef.current = Math.min(
            MAX_ZOOM,
            scaleRef.current + ZOOM_STEP,
          );
          app.stage.scale.set(scaleRef.current);
        },
        zoomOut: () => {
          const app = appRef.current;
          if (!app) return;
          scaleRef.current = Math.max(
            MIN_ZOOM,
            scaleRef.current - ZOOM_STEP,
          );
          app.stage.scale.set(scaleRef.current);
        },
        resetView: () => {
          const app = appRef.current;
          if (!app) return;
          scaleRef.current = 1;
          panRef.current = { x: 0, y: 0 };
          app.stage.scale.set(1);
          app.stage.x = 0;
          app.stage.y = 0;
        },
      }),
      [],
    );

    useEffect(() => {
      const container = containerRef.current;
      if (!container) return;

      const app = new Application();
      let tilemapLayer: TilemapLayer | null = null;
      let kanbanLayer: KanbanLayer | null = null;
      let agentLayer: AgentLayer | null = null;
      let effectLayer: EffectLayer | null = null;
      // destroyed: set by cleanup to signal that unmount happened.
      // initialized: set after app.init() resolves — only safe to call
      // app.destroy() once this is true (PixiJS ResizePlugin registers
      // _cancelResize during init; calling destroy before that throws).
      let destroyed = false;
      let initialized = false;

      // Mouse handlers registered after init — we capture references here so
      // the cleanup function can detach them even if init has already resolved.
      let wheelHandler: ((e: WheelEvent) => void) | null = null;
      let mouseDownHandler: ((e: MouseEvent) => void) | null = null;
      let mouseMoveHandler: ((e: MouseEvent) => void) | null = null;
      let mouseUpHandler: (() => void) | null = null;
      let contextMenuHandler: ((e: MouseEvent) => void) | null = null;
      let registeredCanvas: HTMLCanvasElement | null = null;

      (async () => {
        await app.init({
          width: OFFICE_WIDTH,
          height: OFFICE_HEIGHT,
          background: 0x2d1b69,
          antialias: false,
          resolution: 1,
        });

        if (destroyed) {
          // Cleanup ran while init was in-flight (React StrictMode double-invoke).
          // Now that init has completed it is safe to destroy.
          app.destroy(true);
          return;
        }

        initialized = true;
        appRef.current = app;
        app.canvas.style.imageRendering = "pixelated";
        container.appendChild(app.canvas);

        // Layer 1: Tilemap (floor, walls, furniture)
        tilemapLayer = new TilemapLayer();
        app.stage.addChild(tilemapLayer.container);

        // Layer 2: Kanban board (wall overlay with issue cards)
        kanbanLayer = new KanbanLayer();
        kanbanLayer.setOnIssueClick(onIssueClick);
        kanbanLayer.setOnIssueDrop(onIssueDrop);
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

        // --- Zoom (mouse wheel) ---
        wheelHandler = (e: WheelEvent) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? -WHEEL_ZOOM_STEP : WHEEL_ZOOM_STEP;
          scaleRef.current = Math.max(
            MIN_ZOOM,
            Math.min(MAX_ZOOM, scaleRef.current + delta),
          );
          app.stage.scale.set(scaleRef.current);
        };

        // --- Pan (middle/right mouse drag) ---
        let isPanning = false;
        let lastPanPos = { x: 0, y: 0 };

        mouseDownHandler = (e: MouseEvent) => {
          if (e.button === 1 || e.button === 2) {
            isPanning = true;
            lastPanPos = { x: e.clientX, y: e.clientY };
            e.preventDefault();
          }
        };

        mouseMoveHandler = (e: MouseEvent) => {
          if (!isPanning) return;
          const dx = e.clientX - lastPanPos.x;
          const dy = e.clientY - lastPanPos.y;
          panRef.current.x += dx;
          panRef.current.y += dy;
          app.stage.x = panRef.current.x;
          app.stage.y = panRef.current.y;
          lastPanPos = { x: e.clientX, y: e.clientY };
        };

        mouseUpHandler = () => {
          isPanning = false;
        };

        contextMenuHandler = (e: MouseEvent) => {
          e.preventDefault();
        };

        registeredCanvas = app.canvas;
        registeredCanvas.addEventListener("wheel", wheelHandler, {
          passive: false,
        });
        registeredCanvas.addEventListener("mousedown", mouseDownHandler);
        registeredCanvas.addEventListener("mousemove", mouseMoveHandler);
        registeredCanvas.addEventListener("mouseup", mouseUpHandler);
        registeredCanvas.addEventListener("contextmenu", contextMenuHandler);
      })();

      return () => {
        destroyed = true;
        if (registeredCanvas) {
          if (wheelHandler) {
            registeredCanvas.removeEventListener("wheel", wheelHandler);
          }
          if (mouseDownHandler) {
            registeredCanvas.removeEventListener(
              "mousedown",
              mouseDownHandler,
            );
          }
          if (mouseMoveHandler) {
            registeredCanvas.removeEventListener(
              "mousemove",
              mouseMoveHandler,
            );
          }
          if (mouseUpHandler) {
            registeredCanvas.removeEventListener("mouseup", mouseUpHandler);
          }
          if (contextMenuHandler) {
            registeredCanvas.removeEventListener(
              "contextmenu",
              contextMenuHandler,
            );
          }
        }
        agentLayerRef.current = null;
        kanbanLayerRef.current = null;
        effectLayerRef.current = null;
        appRef.current = null;
        if (initialized) {
          // Only safe to destroy after app.init() has fully resolved.
          // If still in-flight, the async block above will handle destroy
          // once init completes (it checks `destroyed` after await).
          effectLayer?.destroy();
          agentLayer?.destroy();
          kanbanLayer?.destroy();
          tilemapLayer?.destroy();
          app.destroy(true);
        }
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
  },
);
