# Office Simulation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pixel-art virtual office page (`/simulation`) that visualizes agent activity as a game-like simulation using PixiJS.

**Architecture:** PixiJS renders a 4-layer canvas (tilemap, kanban, agents, effects) driven by a React hook (`useSimulationState`) that combines existing REST queries and WebSocket events. React overlays handle detail panels and controls. No new API endpoints.

**Tech Stack:** PixiJS 8, React 19, React Query 5, WebSocket (existing LiveUpdatesProvider), Vitest, shadcn/ui, i18next

**Design doc:** `docs/llm/office-simulation.md`

---

### Task 1: Install PixiJS and scaffold empty page

**Files:**
- Modify: `ui/package.json`
- Create: `ui/src/pages/Simulation.tsx`
- Modify: `ui/src/App.tsx:160-178`
- Modify: `ui/src/components/Sidebar.tsx:113-119`
- Modify: `ui/src/i18n/ko.json:89-109`
- Modify: `ui/src/lib/queryKeys.ts`

- [ ] **Step 1: Install pixi.js**

```bash
cd ui && pnpm add pixi.js
```

Note: `@pixi/react` is not used — we mount the PixiJS Application manually via `useRef` for full control. PixiJS v8 removed the old `@pixi/react` compatibility.

- [ ] **Step 2: Add i18n keys**

In `ui/src/i18n/ko.json`, add inside the `"nav"` object (after `"newProject"` line 108):

```json
"simulation": "시뮬레이션"
```

Also add a new top-level section:

```json
"simulation": {
  "title": "시뮬레이션",
  "kanban": {
    "backlog": "백로그",
    "todo": "할 일",
    "inProgress": "진행 중",
    "inReview": "리뷰 중",
    "done": "완료"
  },
  "status": {
    "working": "작업 중",
    "idle": "대기",
    "paused": "일시정지",
    "error": "오류",
    "pendingApproval": "승인 대기"
  },
  "controls": {
    "zoomIn": "확대",
    "zoomOut": "축소",
    "resetView": "초기화"
  },
  "emptyOffice": "에이전트가 없습니다. 에이전트를 추가하면 사무실에 나타납니다."
}
```

- [ ] **Step 3: Create empty Simulation page**

Create `ui/src/pages/Simulation.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";

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
      <p className="text-muted-foreground">{t("simulation.title")}</p>
    </div>
  );
}
```

- [ ] **Step 4: Register route**

In `ui/src/App.tsx`, add import at top with other page imports:

```tsx
import { Simulation } from "./pages/Simulation";
```

Add route inside `boardRoutes()` before the `design-guide` route (before line 175):

```tsx
<Route path="simulation" element={<Simulation />} />
```

- [ ] **Step 5: Add sidebar menu item**

In `ui/src/components/Sidebar.tsx`, add import for `Gamepad2` icon:

```tsx
import { Gamepad2 } from "lucide-react";
```

Add nav item inside the "회사" section (after the `activity` item, line 118):

```tsx
<SidebarNavItem to="/simulation" label={t("nav.simulation")} icon={Gamepad2} />
```

- [ ] **Step 6: Add query keys for simulation**

In `ui/src/lib/queryKeys.ts`, add before the closing `};` (before line 148):

```ts
simulation: {
  state: (companyId: string) => ["simulation", companyId] as const,
},
```

- [ ] **Step 7: Verify**

```bash
cd ui && pnpm dev
```

Open `http://localhost:3100/simulation`. Verify: page loads with "시뮬레이션" text, sidebar shows Simulation menu item with gamepad icon, breadcrumb shows "시뮬레이션".

- [ ] **Step 8: Commit**

```bash
git add ui/package.json ui/pnpm-lock.yaml ui/src/pages/Simulation.tsx ui/src/App.tsx ui/src/components/Sidebar.tsx ui/src/i18n/ko.json ui/src/lib/queryKeys.ts
git commit -m "feat(simulation): scaffold empty page with route and sidebar nav"
```

---

### Task 2: OfficeCanvas with PixiJS Application

**Files:**
- Create: `ui/src/components/simulation/OfficeCanvas.tsx`
- Modify: `ui/src/pages/Simulation.tsx`

- [ ] **Step 1: Create OfficeCanvas component**

Create `ui/src/components/simulation/OfficeCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Application } from "pixi.js";

interface OfficeCanvasProps {
  width: number;
  height: number;
}

export function OfficeCanvas({ width, height }: OfficeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    appRef.current = app;

    const init = async () => {
      await app.init({
        width,
        height,
        background: 0x2d1b69,
        antialias: false,
        resolution: 1,
      });
      // Pixel art: disable smoothing
      app.canvas.style.imageRendering = "pixelated";
      container.appendChild(app.canvas);
    };

    init();

    return () => {
      app.destroy(true);
      appRef.current = null;
    };
  }, [width, height]);

  return <div ref={containerRef} className="overflow-hidden rounded-lg" />;
}
```

- [ ] **Step 2: Wire OfficeCanvas into Simulation page**

Replace `ui/src/pages/Simulation.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { OfficeCanvas } from "../components/simulation/OfficeCanvas";

const CANVAS_WIDTH = 960;
const CANVAS_HEIGHT = 640;

export function Simulation() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <OfficeCanvas width={CANVAS_WIDTH} height={CANVAS_HEIGHT} />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open `http://localhost:3100/simulation`. Verify: a dark purple 960x640 canvas appears centered on the page.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/simulation/OfficeCanvas.tsx ui/src/pages/Simulation.tsx
git commit -m "feat(simulation): mount PixiJS canvas with Application"
```

---

### Task 3: SimulationLayer interface and TilemapLayer — static office

**Files:**
- Create: `ui/src/components/simulation/layers/types.ts`
- Create: `ui/src/components/simulation/layers/TilemapLayer.ts`
- Create: `ui/src/components/simulation/layers/layout.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Define layout constants**

Create `ui/src/components/simulation/layers/layout.ts`:

```ts
// Office dimensions
export const OFFICE_WIDTH = 960;
export const OFFICE_HEIGHT = 640;

// Wall
export const WALL_HEIGHT = 140;
export const WALL_COLOR = 0x2d1b69;
export const WALL_TOP_COLOR = 0x1a0f3d;
export const WALL_BORDER_COLOR = 0x4a3580;

// Floor
export const FLOOR_COLOR_A = 0x3d2b6b;
export const FLOOR_COLOR_B = 0x352563;
export const FLOOR_TILE_SIZE = 32;

// Table columns: 4 long vertical tables
export const TABLE_COUNT = 4;
export const TABLE_WIDTH = 28; // "통통한" table
export const TABLE_COLOR = 0x8b6914;
export const TABLE_HIGHLIGHT = 0xa07828;

// Table positions (x-center of each table)
export const TABLE_X = [120, 280, 440, 600];
export const TABLE_TOP = 160; // starts below wall
export const TABLE_BOTTOM = 600; // near bottom

// Seats: 5 rows per table, 2 sides (left/right)
export const ROWS_PER_TABLE = 5;
export const ROW_SPACING = 88; // vertical spacing between rows
export const SEAT_OFFSET_X = 50; // horizontal distance from table center to seat

// Monitor
export const MONITOR_WIDTH = 24;
export const MONITOR_HEIGHT = 18;
export const MONITOR_COLOR = 0x222222;
export const MONITOR_BORDER_COLOR = 0x444444;
export const MONITOR_ON_COLOR = 0x22c55e;
export const MONITOR_OFF_COLOR = 0x1a1a1a;

// Chair
export const CHAIR_WIDTH = 20;
export const CHAIR_HEIGHT = 12;
export const CHAIR_COLOR = 0x4a4a4a;

// Decoration positions
export const COFFEE_MACHINE_POS = { x: 820, y: 180 };
export const PLANT_POSITIONS = [
  { x: 820, y: 300 },
  { x: 840, y: 450 },
  { x: 750, y: 560 },
];
export const WINDOW_POSITIONS = [
  { x: 40, y: 30, w: 50, h: 60 },
  { x: 860, y: 30, w: 50, h: 60 },
];
export const POSTER_POS = { x: 30, y: 25, w: 36, h: 48 };
export const CLOCK_POS = { x: 900, y: 30, r: 14 };

// Kanban board on wall
export const KANBAN_POS = { x: 330, y: 15, w: 300, h: 110 };

// Derive seat pixel positions
export function getSeatPosition(column: number, row: number, side: "left" | "right") {
  const tableX = TABLE_X[column];
  const x = side === "left" ? tableX - SEAT_OFFSET_X : tableX + SEAT_OFFSET_X;
  const y = TABLE_TOP + 20 + row * ROW_SPACING;
  return { x, y };
}
```

- [ ] **Step 2: Define layer interface**

Create `ui/src/components/simulation/layers/types.ts`:

```ts
import type { Container } from "pixi.js";

export interface SimulationLayer {
  container: Container;
  update(deltaTime: number): void;
  destroy(): void;
}
```

- [ ] **Step 3: Implement TilemapLayer**

Create `ui/src/components/simulation/layers/TilemapLayer.ts`:

```ts
import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import * as L from "./layout";

export class TilemapLayer implements SimulationLayer {
  container: Container;

  constructor() {
    this.container = new Container();
    this.drawWall();
    this.drawFloor();
    this.drawTables();
    this.drawSeats();
    this.drawDecorations();
  }

  private drawWall() {
    const wall = new Graphics();
    // Gradient effect: two rects
    wall.rect(0, 0, L.OFFICE_WIDTH, L.WALL_HEIGHT);
    wall.fill(L.WALL_COLOR);
    // Darker top portion
    wall.rect(0, 0, L.OFFICE_WIDTH, L.WALL_HEIGHT / 2);
    wall.fill(L.WALL_TOP_COLOR);
    // Border line at bottom
    wall.rect(0, L.WALL_HEIGHT - 4, L.OFFICE_WIDTH, 4);
    wall.fill(L.WALL_BORDER_COLOR);
    this.container.addChild(wall);

    // Windows
    for (const win of L.WINDOW_POSITIONS) {
      const w = new Graphics();
      w.rect(win.x, win.y, win.w, win.h);
      w.fill(0x0f2440);
      w.stroke({ color: L.WALL_BORDER_COLOR, width: 3 });
      // Cross
      w.moveTo(win.x, win.y + win.h / 2);
      w.lineTo(win.x + win.w, win.y + win.h / 2);
      w.stroke({ color: L.WALL_BORDER_COLOR, width: 2 });
      w.moveTo(win.x + win.w / 2, win.y);
      w.lineTo(win.x + win.w / 2, win.y + win.h);
      w.stroke({ color: L.WALL_BORDER_COLOR, width: 2 });
      this.container.addChild(w);
    }

    // Poster
    const poster = new Graphics();
    poster.rect(L.POSTER_POS.x, L.POSTER_POS.y, L.POSTER_POS.w, L.POSTER_POS.h);
    poster.fill(0x3d5a80);
    poster.stroke({ color: L.WALL_BORDER_COLOR, width: 2 });
    this.container.addChild(poster);
    const rocketText = new Text({ text: "🚀", style: { fontSize: 16 } });
    rocketText.x = L.POSTER_POS.x + 8;
    rocketText.y = L.POSTER_POS.y + 12;
    this.container.addChild(rocketText);

    // Clock
    const clock = new Graphics();
    clock.circle(L.CLOCK_POS.x, L.CLOCK_POS.y, L.CLOCK_POS.r);
    clock.fill(0xf5f0e8);
    clock.stroke({ color: L.WALL_BORDER_COLOR, width: 2 });
    this.container.addChild(clock);
  }

  private drawFloor() {
    const floor = new Graphics();
    for (let y = L.WALL_HEIGHT; y < L.OFFICE_HEIGHT; y += L.FLOOR_TILE_SIZE) {
      for (let x = 0; x < L.OFFICE_WIDTH; x += L.FLOOR_TILE_SIZE) {
        const isEven = ((x / L.FLOOR_TILE_SIZE) + (y / L.FLOOR_TILE_SIZE)) % 2 === 0;
        floor.rect(x, y, L.FLOOR_TILE_SIZE, L.FLOOR_TILE_SIZE);
        floor.fill(isEven ? L.FLOOR_COLOR_A : L.FLOOR_COLOR_B);
      }
    }
    this.container.addChild(floor);
  }

  private drawTables() {
    for (const tableX of L.TABLE_X) {
      const table = new Graphics();
      const x = tableX - L.TABLE_WIDTH / 2;
      table.roundRect(x, L.TABLE_TOP, L.TABLE_WIDTH, L.TABLE_BOTTOM - L.TABLE_TOP, 3);
      table.fill(L.TABLE_COLOR);
      // Highlight stripe
      table.rect(x + 2, L.TABLE_TOP, 4, L.TABLE_BOTTOM - L.TABLE_TOP);
      table.fill(L.TABLE_HIGHLIGHT);
      this.container.addChild(table);
    }
  }

  private drawSeats() {
    for (let col = 0; col < L.TABLE_COUNT; col++) {
      for (let row = 0; row < L.ROWS_PER_TABLE; row++) {
        for (const side of ["left", "right"] as const) {
          const pos = L.getSeatPosition(col, row, side);

          // Monitor (facing toward table)
          const monitorX = side === "left"
            ? pos.x + 10
            : pos.x - 10 - L.MONITOR_WIDTH;
          const monitor = new Graphics();
          monitor.roundRect(monitorX, pos.y - L.MONITOR_HEIGHT / 2, L.MONITOR_WIDTH, L.MONITOR_HEIGHT, 2);
          monitor.fill(L.MONITOR_COLOR);
          monitor.stroke({ color: L.MONITOR_BORDER_COLOR, width: 2 });
          // Screen (off by default)
          monitor.rect(monitorX + 3, pos.y - L.MONITOR_HEIGHT / 2 + 3, L.MONITOR_WIDTH - 6, L.MONITOR_HEIGHT - 6);
          monitor.fill(L.MONITOR_OFF_COLOR);
          this.container.addChild(monitor);

          // Chair (facing toward table)
          const chairX = side === "left"
            ? pos.x - L.CHAIR_WIDTH / 2 - 4
            : pos.x - L.CHAIR_WIDTH / 2 + 4;
          const chair = new Graphics();
          chair.roundRect(chairX, pos.y - L.CHAIR_HEIGHT / 2, L.CHAIR_WIDTH, L.CHAIR_HEIGHT, 3);
          chair.fill(L.CHAIR_COLOR);
          this.container.addChild(chair);
        }
      }
    }
  }

  private drawDecorations() {
    // Coffee machine
    const coffee = new Graphics();
    coffee.roundRect(L.COFFEE_MACHINE_POS.x, L.COFFEE_MACHINE_POS.y, 22, 30, 2);
    coffee.fill(0x555555);
    coffee.stroke({ color: 0x666666, width: 1 });
    this.container.addChild(coffee);
    const coffeeEmoji = new Text({ text: "☕", style: { fontSize: 12 } });
    coffeeEmoji.x = L.COFFEE_MACHINE_POS.x + 3;
    coffeeEmoji.y = L.COFFEE_MACHINE_POS.y + 6;
    this.container.addChild(coffeeEmoji);

    // Plants
    for (const pos of L.PLANT_POSITIONS) {
      const plant = new Text({ text: "🌿", style: { fontSize: 18 } });
      plant.x = pos.x;
      plant.y = pos.y;
      this.container.addChild(plant);
    }
  }

  update(_deltaTime: number): void {
    // Static layer, no updates needed
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 4: Wire TilemapLayer into OfficeCanvas**

Replace `ui/src/components/simulation/OfficeCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { TilemapLayer } from "./layers/TilemapLayer";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";

export function OfficeCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    appRef.current = app;
    let tilemap: TilemapLayer | null = null;

    const init = async () => {
      await app.init({
        width: OFFICE_WIDTH,
        height: OFFICE_HEIGHT,
        background: 0x2d1b69,
        antialias: false,
        resolution: 1,
      });
      app.canvas.style.imageRendering = "pixelated";
      container.appendChild(app.canvas);

      tilemap = new TilemapLayer();
      app.stage.addChild(tilemap.container);
    };

    init();

    return () => {
      tilemap?.destroy();
      app.destroy(true);
      appRef.current = null;
    };
  }, []);

  return <div ref={containerRef} className="overflow-hidden rounded-lg" />;
}
```

Update `ui/src/pages/Simulation.tsx` to remove width/height props:

```tsx
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
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <OfficeCanvas />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Open `http://localhost:3100/simulation`. Verify: pixel art office renders with checkered floor, purple wall, 4 long vertical tables, monitors and chairs at each seat position, windows, poster, clock, coffee machine, and plants.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/simulation/layers/
git commit -m "feat(simulation): render static pixel art office with TilemapLayer"
```

---

### Task 4: useSimulationState hook — agents and issues data

**Files:**
- Create: `ui/src/hooks/useSimulationState.ts`
- Create: `ui/src/components/simulation/types.ts`

- [ ] **Step 1: Define simulation types**

Create `ui/src/components/simulation/types.ts`:

```ts
import type { Agent, AgentStatus } from "@paperclipai/shared";
import type { Issue, IssueStatus } from "@paperclipai/shared";

export interface SeatAssignment {
  agentId: string;
  column: number;   // 0-3
  row: number;       // 0-4
  side: "left" | "right";
  pixelX: number;
  pixelY: number;
}

export type AgentBehavior = "working" | "idle-walking" | "paused" | "error" | "pending-approval";

export interface AgentSimState {
  agent: Agent;
  seat: SeatAssignment;
  behavior: AgentBehavior;
  currentTask: string | null;
  walkTarget: { x: number; y: number } | null;
}

export interface KanbanState {
  columns: Map<IssueStatus, Issue[]>;
}

export interface AnimationEvent {
  id: string;
  type: "bubble" | "status-icon" | "particle";
  targetAgentId?: string;
  text?: string;
  icon?: string;
  createdAt: number;
}

export interface SimulationState {
  agents: Map<string, AgentSimState>;
  kanban: KanbanState;
  effects: AnimationEvent[];
  selectedAgent: string | null;
  selectedIssue: string | null;
}
```

- [ ] **Step 2: Create useSimulationState hook**

Create `ui/src/hooks/useSimulationState.ts`:

```ts
import { useMemo, useState, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../lib/queryKeys";
import { agentsApi } from "../api/agents";
import { issuesApi } from "../api/issues";
import { getSeatPosition } from "../components/simulation/layers/layout";
import type { AgentSimState, AgentBehavior, KanbanState, SimulationState, AnimationEvent } from "../components/simulation/types";
import type { Agent, IssueStatus } from "@paperclipai/shared";
import { ISSUE_STATUSES } from "@paperclipai/shared";

function agentStatusToBehavior(status: string): AgentBehavior {
  switch (status) {
    case "running":
    case "active":
      return "working";
    case "paused":
      return "paused";
    case "error":
      return "error";
    case "pending_approval":
      return "pending-approval";
    default:
      return "idle-walking";
  }
}

function assignSeats(agents: Agent[]): Map<string, AgentSimState> {
  const result = new Map<string, AgentSimState>();
  const eligible = agents
    .filter((a) => a.status !== "terminated")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  let seatIndex = 0;
  for (const agent of eligible) {
    const column = Math.floor(seatIndex / 10); // 10 seats per column (5 rows x 2 sides)
    const withinColumn = seatIndex % 10;
    const row = Math.floor(withinColumn / 2);
    const side: "left" | "right" = withinColumn % 2 === 0 ? "left" : "right";

    if (column >= 4) break; // max 40 seats

    const { x: pixelX, y: pixelY } = getSeatPosition(column, row, side);

    result.set(agent.id, {
      agent,
      seat: { agentId: agent.id, column, row, side, pixelX, pixelY },
      behavior: agentStatusToBehavior(agent.status),
      currentTask: null,
      walkTarget: null,
    });

    seatIndex++;
  }
  return result;
}

export function useSimulationState(companyId: string) {
  const queryClient = useQueryClient();
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [selectedIssue, setSelectedIssue] = useState<string | null>(null);
  const [effects] = useState<AnimationEvent[]>([]);

  const { data: agentsData } = useQuery({
    queryKey: queryKeys.agents.list(companyId),
    queryFn: () => agentsApi.list(companyId),
    enabled: !!companyId,
  });

  const { data: issuesData } = useQuery({
    queryKey: queryKeys.issues.list(companyId),
    queryFn: () => issuesApi.list(companyId),
    enabled: !!companyId,
  });

  const agents = useMemo(() => {
    if (!agentsData) return new Map<string, AgentSimState>();
    return assignSeats(agentsData);
  }, [agentsData]);

  const kanban = useMemo<KanbanState>(() => {
    const columns = new Map<IssueStatus, typeof issuesData>();
    for (const status of ISSUE_STATUSES) {
      columns.set(status, []);
    }
    if (issuesData) {
      for (const issue of issuesData) {
        const list = columns.get(issue.status as IssueStatus);
        if (list) list.push(issue);
      }
    }
    return { columns };
  }, [issuesData]);

  const moveIssueMutation = useMutation({
    mutationFn: ({ issueId, newStatus }: { issueId: string; newStatus: IssueStatus }) =>
      issuesApi.update(issueId, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.issues.list(companyId) });
    },
  });

  const state = useMemo<SimulationState>(
    () => ({
      agents,
      kanban,
      effects,
      selectedAgent,
      selectedIssue,
    }),
    [agents, kanban, effects, selectedAgent, selectedIssue],
  );

  const selectAgent = useCallback((id: string | null) => {
    setSelectedAgent(id);
    setSelectedIssue(null);
  }, []);

  const selectIssue = useCallback((id: string | null) => {
    setSelectedIssue(id);
    setSelectedAgent(null);
  }, []);

  const moveIssue = useCallback(
    (issueId: string, newStatus: IssueStatus) => {
      moveIssueMutation.mutate({ issueId, newStatus });
    },
    [moveIssueMutation],
  );

  return { state, selectAgent, selectIssue, moveIssue };
}
```

- [ ] **Step 3: Verify typecheck**

```bash
cd /Users/kangnam/projects/stapler && pnpm -r typecheck
```

Expected: passes without errors related to simulation files. If there are import resolution issues with `@paperclipai/shared`, check the exact export paths and adjust imports.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/simulation/types.ts ui/src/hooks/useSimulationState.ts
git commit -m "feat(simulation): add useSimulationState hook with seat assignment"
```

---

### Task 5: AgentLayer — character rendering and seat placement

**Files:**
- Create: `ui/src/components/simulation/layers/AgentLayer.ts`
- Create: `ui/src/components/simulation/sprites/index.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Define role-to-color sprite mapping**

Create `ui/src/components/simulation/sprites/index.ts`:

```ts
// Role → color mapping for V1 (Graphics-based, no PNG sprites yet)
export const ROLE_COLORS: Record<string, { body: number; label: string }> = {
  ceo: { body: 0x1e3a5f, label: "CEO" },
  chro: { body: 0x4c1d95, label: "CHRO" },
  cto: { body: 0x065f46, label: "CTO" },
  cmo: { body: 0x9d174d, label: "CMO" },
  cfo: { body: 0x78350f, label: "CFO" },
  engineer: { body: 0x4a1d96, label: "ENG" },
  designer: { body: 0xb45309, label: "DES" },
  pm: { body: 0x7c2d12, label: "PM" },
  qa: { body: 0x831843, label: "QA" },
  devops: { body: 0x065f46, label: "OPS" },
  researcher: { body: 0x9333ea, label: "RES" },
  general: { body: 0x6b7280, label: "GEN" },
};

export function getRoleVisual(role: string) {
  return ROLE_COLORS[role] ?? ROLE_COLORS.general;
}
```

- [ ] **Step 2: Create AgentLayer**

Create `ui/src/components/simulation/layers/AgentLayer.ts`:

```ts
import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { AgentSimState } from "../types";
import { getRoleVisual } from "../sprites";

const HEAD_SIZE = 12;
const BODY_W = 14;
const BODY_H = 12;
const SKIN_COLOR = 0xfbbf6e;
const EYE_COLOR = 0x333333;
const LEG_COLOR = 0x2d2d3d;

interface AgentSprite {
  container: Container;
  agentId: string;
}

export class AgentLayer implements SimulationLayer {
  container: Container;
  private sprites: Map<string, AgentSprite> = new Map();
  private onAgentClick: ((agentId: string) => void) | null = null;

  constructor() {
    this.container = new Container();
  }

  setOnAgentClick(callback: (agentId: string) => void) {
    this.onAgentClick = callback;
  }

  updateAgents(agents: Map<string, AgentSimState>) {
    // Remove sprites for agents no longer present
    for (const [id, sprite] of this.sprites) {
      if (!agents.has(id)) {
        this.container.removeChild(sprite.container);
        sprite.container.destroy({ children: true });
        this.sprites.delete(id);
      }
    }

    // Add or update sprites
    for (const [id, agentState] of agents) {
      let sprite = this.sprites.get(id);

      if (!sprite) {
        sprite = this.createAgentSprite(id, agentState);
        this.sprites.set(id, sprite);
        this.container.addChild(sprite.container);
      }

      // Position at seat
      const { pixelX, pixelY } = agentState.seat;
      sprite.container.x = pixelX;
      sprite.container.y = pixelY;
    }
  }

  private createAgentSprite(agentId: string, state: AgentSimState): AgentSprite {
    const container = new Container();
    container.eventMode = "static";
    container.cursor = "pointer";

    const visual = getRoleVisual(state.agent.role);

    // Head
    const head = new Graphics();
    head.roundRect(-HEAD_SIZE / 2, -HEAD_SIZE - BODY_H / 2, HEAD_SIZE, HEAD_SIZE, 2);
    head.fill(SKIN_COLOR);
    container.addChild(head);

    // Eyes
    const eyes = new Graphics();
    eyes.circle(-2, -BODY_H / 2 - HEAD_SIZE / 2 + 1, 1.5);
    eyes.circle(2, -BODY_H / 2 - HEAD_SIZE / 2 + 1, 1.5);
    eyes.fill(EYE_COLOR);
    container.addChild(eyes);

    // Body
    const body = new Graphics();
    body.roundRect(-BODY_W / 2, -BODY_H / 2, BODY_W, BODY_H, 2);
    body.fill(visual.body);
    container.addChild(body);

    // Legs
    const legs = new Graphics();
    legs.roundRect(-4, BODY_H / 2, 3, 5, 1);
    legs.roundRect(1, BODY_H / 2, 3, 5, 1);
    legs.fill(LEG_COLOR);
    container.addChild(legs);

    // Name label
    const label = new Text({
      text: state.agent.name.slice(0, 8),
      style: { fontSize: 8, fill: 0xcccccc },
    });
    label.anchor.set(0.5, 0);
    label.y = BODY_H / 2 + 7;
    container.addChild(label);

    // Click handler
    container.on("pointertap", () => {
      this.onAgentClick?.(agentId);
    });

    return { container, agentId };
  }

  update(_deltaTime: number): void {
    // Animations handled in Task 6 (idle walking)
  }

  destroy(): void {
    this.sprites.clear();
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 3: Wire AgentLayer into OfficeCanvas**

Update `ui/src/components/simulation/OfficeCanvas.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { TilemapLayer } from "./layers/TilemapLayer";
import { AgentLayer } from "./layers/AgentLayer";
import { OFFICE_WIDTH, OFFICE_HEIGHT } from "./layers/layout";
import type { SimulationState } from "./types";

interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
}

export function OfficeCanvas({ state, onAgentClick, onIssueClick }: OfficeCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const agentLayerRef = useRef<AgentLayer | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    appRef.current = app;
    let tilemap: TilemapLayer | null = null;

    const init = async () => {
      await app.init({
        width: OFFICE_WIDTH,
        height: OFFICE_HEIGHT,
        background: 0x2d1b69,
        antialias: false,
        resolution: 1,
      });
      app.canvas.style.imageRendering = "pixelated";
      container.appendChild(app.canvas);

      // Layer 1: Tilemap
      tilemap = new TilemapLayer();
      app.stage.addChild(tilemap.container);

      // Layer 3: Agents (Layer 2 = Kanban, added in Task 7)
      const agentLayer = new AgentLayer();
      agentLayer.setOnAgentClick(onAgentClick);
      agentLayerRef.current = agentLayer;
      app.stage.addChild(agentLayer.container);
    };

    init();

    return () => {
      agentLayerRef.current?.destroy();
      agentLayerRef.current = null;
      tilemap?.destroy();
      app.destroy(true);
      appRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Update agent positions when state changes
  useEffect(() => {
    agentLayerRef.current?.updateAgents(state.agents);
  }, [state.agents]);

  return <div ref={containerRef} className="overflow-hidden rounded-lg" />;
}
```

Update `ui/src/pages/Simulation.tsx` to pass state:

```tsx
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
  const { state, selectAgent, selectIssue } = useSimulationState(selectedCompanyId ?? "");

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) return null;

  return (
    <div className="flex h-full w-full items-center justify-center bg-background p-4">
      <OfficeCanvas
        state={state}
        onAgentClick={selectAgent}
        onIssueClick={selectIssue}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Open `http://localhost:3100/simulation` with agents in the company. Verify: pixel-art characters appear at desk positions, each with role-appropriate body color and name label.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/simulation/sprites/ ui/src/components/simulation/layers/AgentLayer.ts ui/src/components/simulation/OfficeCanvas.tsx ui/src/pages/Simulation.tsx
git commit -m "feat(simulation): render agent characters at assigned seats"
```

---

### Task 6: Agent state animations — idle walking and working

**Files:**
- Modify: `ui/src/components/simulation/layers/AgentLayer.ts`
- Modify: `ui/src/components/simulation/layers/layout.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Add walk target constants to layout**

Append to `ui/src/components/simulation/layers/layout.ts`:

```ts
// Idle walk destinations (areas agents wander to when idle)
export const IDLE_DESTINATIONS = [
  COFFEE_MACHINE_POS,
  ...PLANT_POSITIONS,
  { x: 750, y: 200 },  // lounge area
  { x: 780, y: 400 },  // corridor
  { x: 700, y: 500 },  // near exit
];

export function getRandomIdleDestination(): { x: number; y: number } {
  const dest = IDLE_DESTINATIONS[Math.floor(Math.random() * IDLE_DESTINATIONS.length)];
  // Add some randomness
  return {
    x: dest.x + (Math.random() - 0.5) * 40,
    y: dest.y + (Math.random() - 0.5) * 40,
  };
}
```

- [ ] **Step 2: Add animation state tracking to AgentLayer**

Update `AgentLayer.ts` — add walk state and `update()` logic. Replace the `AgentSprite` interface and add animation tracking:

At the top of the file, add:

```ts
import { getRandomIdleDestination } from "./layout";

const WALK_SPEED = 0.8; // pixels per frame
const IDLE_PAUSE_MIN = 120; // frames to pause at destination
const IDLE_PAUSE_MAX = 300;
```

Replace the `AgentSprite` interface:

```ts
interface AgentSprite {
  container: Container;
  agentId: string;
  walkState: {
    targetX: number;
    targetY: number;
    paused: boolean;
    pauseTimer: number;
  } | null;
  seatX: number;
  seatY: number;
  behavior: string;
}
```

- [ ] **Step 3: Update createAgentSprite to include walk state**

In the `createAgentSprite` method, change the return to:

```ts
return {
  container,
  agentId,
  walkState: null,
  seatX: state.seat.pixelX,
  seatY: state.seat.pixelY,
  behavior: state.behavior,
};
```

- [ ] **Step 4: Update the updateAgents method to handle behavior changes**

In `updateAgents`, replace the position update block:

```ts
// Update behavior and position
sprite.behavior = agentState.behavior;
sprite.seatX = agentState.seat.pixelX;
sprite.seatY = agentState.seat.pixelY;

if (agentState.behavior === "idle-walking") {
  // Start wandering if not already
  if (!sprite.walkState) {
    const dest = getRandomIdleDestination();
    sprite.walkState = { targetX: dest.x, targetY: dest.y, paused: false, pauseTimer: 0 };
  }
} else {
  // Go back to seat
  sprite.walkState = null;
  sprite.container.x = sprite.seatX;
  sprite.container.y = sprite.seatY;
}
```

- [ ] **Step 5: Implement the update loop**

Replace the `update` method:

```ts
update(_deltaTime: number): void {
  for (const sprite of this.sprites.values()) {
    if (sprite.behavior !== "idle-walking" || !sprite.walkState) continue;

    const ws = sprite.walkState;

    if (ws.paused) {
      ws.pauseTimer--;
      if (ws.pauseTimer <= 0) {
        // Pick new destination
        const dest = getRandomIdleDestination();
        ws.targetX = dest.x;
        ws.targetY = dest.y;
        ws.paused = false;
      }
      continue;
    }

    // Move toward target
    const dx = ws.targetX - sprite.container.x;
    const dy = ws.targetY - sprite.container.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < 2) {
      // Arrived — pause
      ws.paused = true;
      ws.pauseTimer = IDLE_PAUSE_MIN + Math.random() * (IDLE_PAUSE_MAX - IDLE_PAUSE_MIN);
    } else {
      sprite.container.x += (dx / dist) * WALK_SPEED;
      sprite.container.y += (dy / dist) * WALK_SPEED;
    }
  }
}
```

- [ ] **Step 6: Add ticker to OfficeCanvas**

In `OfficeCanvas.tsx`, inside the `init()` function, after adding the agent layer, add:

```ts
// Game loop
app.ticker.add(() => {
  agentLayerRef.current?.update(app.ticker.deltaTime);
});
```

- [ ] **Step 7: Verify**

Open `/simulation` with a mix of running and idle agents. Verify: working agents sit at desks, idle agents wander around the office smoothly.

- [ ] **Step 8: Commit**

```bash
git add ui/src/components/simulation/layers/AgentLayer.ts ui/src/components/simulation/layers/layout.ts ui/src/components/simulation/OfficeCanvas.tsx
git commit -m "feat(simulation): add idle walking and working animations"
```

---

### Task 7: KanbanLayer — wall board with issue cards

**Files:**
- Create: `ui/src/components/simulation/layers/KanbanLayer.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Create KanbanLayer**

Create `ui/src/components/simulation/layers/KanbanLayer.ts`:

```ts
import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { KanbanState } from "../types";
import * as L from "./layout";
import type { IssueStatus } from "@paperclipai/shared";

const COLUMN_LABELS: Record<string, string> = {
  backlog: "BACKLOG",
  todo: "TODO",
  in_progress: "PROGRESS",
  in_review: "REVIEW",
  done: "DONE",
};

const COLUMN_COLORS: Record<string, number> = {
  backlog: 0x6b7280,
  todo: 0xef4444,
  in_progress: 0xeab308,
  in_review: 0x6366f1,
  done: 0x22c55e,
};

const STATUSES_TO_SHOW: IssueStatus[] = ["backlog", "todo", "in_progress", "in_review", "done"];
const CARD_HEIGHT = 10;
const CARD_GAP = 3;
const MAX_CARDS_PER_COL = 6;

export class KanbanLayer implements SimulationLayer {
  container: Container;
  private boardContainer: Container;
  private cardsContainer: Container;
  private onIssueClick: ((issueId: string) => void) | null = null;

  constructor() {
    this.container = new Container();
    this.boardContainer = new Container();
    this.cardsContainer = new Container();

    this.drawBoard();
    this.container.addChild(this.boardContainer);
    this.container.addChild(this.cardsContainer);
  }

  setOnIssueClick(callback: (issueId: string) => void) {
    this.onIssueClick = callback;
  }

  private drawBoard() {
    const { x, y, w, h } = L.KANBAN_POS;
    const bg = new Graphics();
    bg.roundRect(x, y, w, h, 3);
    bg.fill(0xf5f0e8);
    this.boardContainer.addChild(bg);

    // Title
    const title = new Text({
      text: "KANBAN BOARD",
      style: { fontSize: 8, fill: 0x333333, fontWeight: "bold", letterSpacing: 1 },
    });
    title.x = x + w / 2 - title.width / 2;
    title.y = y + 4;
    this.boardContainer.addChild(title);

    // Column backgrounds
    const colWidth = (w - 12) / STATUSES_TO_SHOW.length;
    const colStartX = x + 6;
    const colStartY = y + 18;
    const colHeight = h - 24;

    for (let i = 0; i < STATUSES_TO_SHOW.length; i++) {
      const status = STATUSES_TO_SHOW[i];
      const cx = colStartX + i * (colWidth + 1);

      const colBg = new Graphics();
      colBg.roundRect(cx, colStartY, colWidth - 1, colHeight, 2);
      colBg.fill(0xe8e3d8);
      this.boardContainer.addChild(colBg);

      // Column header
      const header = new Text({
        text: COLUMN_LABELS[status] ?? status.toUpperCase(),
        style: { fontSize: 6, fill: 0x666666, fontWeight: "bold" },
      });
      header.x = cx + (colWidth - 1) / 2 - header.width / 2;
      header.y = colStartY + 2;
      this.boardContainer.addChild(header);
    }
  }

  updateKanban(kanban: KanbanState) {
    // Clear existing cards
    this.cardsContainer.removeChildren();

    const { x, w, y: boardY } = L.KANBAN_POS;
    const colWidth = (w - 12) / STATUSES_TO_SHOW.length;
    const colStartX = x + 6;
    const cardStartY = boardY + 30;

    for (let i = 0; i < STATUSES_TO_SHOW.length; i++) {
      const status = STATUSES_TO_SHOW[i];
      const issues = kanban.columns.get(status) ?? [];
      const cx = colStartX + i * (colWidth + 1);
      const color = COLUMN_COLORS[status] ?? 0x6b7280;

      const visibleIssues = issues.slice(0, MAX_CARDS_PER_COL);
      for (let j = 0; j < visibleIssues.length; j++) {
        const issue = visibleIssues[j];
        const cardY = cardStartY + j * (CARD_HEIGHT + CARD_GAP);

        const card = new Graphics();
        card.roundRect(cx + 1, cardY, colWidth - 3, CARD_HEIGHT, 1);
        card.fill({ color, alpha: 0.5 - j * 0.05 });
        card.eventMode = "static";
        card.cursor = "pointer";
        card.on("pointertap", () => {
          this.onIssueClick?.(issue.id);
        });
        this.cardsContainer.addChild(card);
      }

      // Show overflow count
      if (issues.length > MAX_CARDS_PER_COL) {
        const overflow = new Text({
          text: `+${issues.length - MAX_CARDS_PER_COL}`,
          style: { fontSize: 6, fill: 0x999999 },
        });
        overflow.x = cx + (colWidth - 1) / 2 - overflow.width / 2;
        overflow.y = cardStartY + MAX_CARDS_PER_COL * (CARD_HEIGHT + CARD_GAP);
        this.cardsContainer.addChild(overflow);
      }
    }
  }

  update(_deltaTime: number): void {
    // Static display, updates via updateKanban()
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Wire KanbanLayer into OfficeCanvas**

In `OfficeCanvas.tsx`, add imports and refs:

```ts
import { KanbanLayer } from "./layers/KanbanLayer";
```

Add ref:

```ts
const kanbanLayerRef = useRef<KanbanLayer | null>(null);
```

In `init()`, add KanbanLayer between tilemap and agent layer:

```ts
// Layer 2: Kanban
const kanbanLayer = new KanbanLayer();
kanbanLayer.setOnIssueClick(onIssueClick);
kanbanLayerRef.current = kanbanLayer;
app.stage.addChild(kanbanLayer.container);
```

Add cleanup in return:

```ts
kanbanLayerRef.current?.destroy();
kanbanLayerRef.current = null;
```

Add useEffect for kanban state:

```ts
useEffect(() => {
  kanbanLayerRef.current?.updateKanban(state.kanban);
}, [state.kanban]);
```

- [ ] **Step 3: Verify**

Open `/simulation` with issues in the company. Verify: kanban board on the wall shows issue cards grouped by status, clicking a card logs the issue ID (detail panel comes in Task 9).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/simulation/layers/KanbanLayer.ts ui/src/components/simulation/OfficeCanvas.tsx
git commit -m "feat(simulation): add kanban board with issue status cards"
```

---

### Task 8: EffectLayer — speech bubbles and status icons

**Files:**
- Create: `ui/src/components/simulation/layers/EffectLayer.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Create EffectLayer**

Create `ui/src/components/simulation/layers/EffectLayer.ts`:

```ts
import { Container, Graphics, Text } from "pixi.js";
import type { SimulationLayer } from "./types";
import type { AgentSimState } from "../types";

const BUBBLE_PADDING_X = 4;
const BUBBLE_PADDING_Y = 2;
const BUBBLE_Y_OFFSET = -28;
const STATUS_ICON_Y_OFFSET = -36;

const STATUS_ICONS: Record<string, string> = {
  paused: "💤",
  error: "❗",
  "pending-approval": "🙋",
  "idle-walking": "☕",
};

export class EffectLayer implements SimulationLayer {
  container: Container;
  private bubbles: Map<string, Container> = new Map();
  private icons: Map<string, Container> = new Map();

  constructor() {
    this.container = new Container();
  }

  updateEffects(agents: Map<string, AgentSimState>) {
    // Remove stale bubbles/icons
    for (const [id, bubble] of this.bubbles) {
      if (!agents.has(id)) {
        this.container.removeChild(bubble);
        bubble.destroy({ children: true });
        this.bubbles.delete(id);
      }
    }
    for (const [id, icon] of this.icons) {
      if (!agents.has(id)) {
        this.container.removeChild(icon);
        icon.destroy({ children: true });
        this.icons.delete(id);
      }
    }

    for (const [id, agentState] of agents) {
      this.updateBubble(id, agentState);
      this.updateStatusIcon(id, agentState);
    }
  }

  private updateBubble(agentId: string, state: AgentSimState) {
    // Remove existing bubble
    const existing = this.bubbles.get(agentId);
    if (existing) {
      this.container.removeChild(existing);
      existing.destroy({ children: true });
      this.bubbles.delete(agentId);
    }

    // Only show bubble for working agents with a task
    if (state.behavior !== "working" || !state.currentTask) return;

    const bubbleContainer = new Container();

    const text = new Text({
      text: state.currentTask.slice(0, 20),
      style: { fontSize: 7, fill: 0x333333 },
    });

    const bg = new Graphics();
    const bgW = text.width + BUBBLE_PADDING_X * 2;
    const bgH = text.height + BUBBLE_PADDING_Y * 2;
    bg.roundRect(-bgW / 2, 0, bgW, bgH, 4);
    bg.fill({ color: 0xffffff, alpha: 0.9 });
    // Triangle pointer
    bg.moveTo(-3, bgH);
    bg.lineTo(0, bgH + 3);
    bg.lineTo(3, bgH);
    bg.fill({ color: 0xffffff, alpha: 0.9 });

    text.anchor.set(0.5, 0);
    text.x = 0;
    text.y = BUBBLE_PADDING_Y;

    bubbleContainer.addChild(bg);
    bubbleContainer.addChild(text);
    bubbleContainer.x = state.seat.pixelX;
    bubbleContainer.y = state.seat.pixelY + BUBBLE_Y_OFFSET - bgH;

    this.bubbles.set(agentId, bubbleContainer);
    this.container.addChild(bubbleContainer);
  }

  private updateStatusIcon(agentId: string, state: AgentSimState) {
    const existing = this.icons.get(agentId);
    if (existing) {
      this.container.removeChild(existing);
      existing.destroy({ children: true });
      this.icons.delete(agentId);
    }

    const iconText = STATUS_ICONS[state.behavior];
    if (!iconText) return;
    // Don't show coffee icon for working agents
    if (state.behavior === "idle-walking" && state.currentTask) return;

    const iconContainer = new Container();
    const icon = new Text({ text: iconText, style: { fontSize: 10 } });
    icon.anchor.set(0.5, 0.5);

    iconContainer.addChild(icon);

    // Follow agent position (for walking agents)
    iconContainer.x = state.seat.pixelX;
    iconContainer.y = state.seat.pixelY + STATUS_ICON_Y_OFFSET;

    this.icons.set(agentId, iconContainer);
    this.container.addChild(iconContainer);
  }

  update(_deltaTime: number): void {
    // Icons could bob/animate here in future
  }

  destroy(): void {
    this.bubbles.clear();
    this.icons.clear();
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 2: Wire EffectLayer into OfficeCanvas**

In `OfficeCanvas.tsx`, add import, ref, init, cleanup, and useEffect following the same pattern as AgentLayer and KanbanLayer. EffectLayer should be the topmost layer (added last to stage).

Add ref:
```ts
const effectLayerRef = useRef<EffectLayer | null>(null);
```

In `init()`, after agent layer:
```ts
// Layer 4: Effects
const effectLayer = new EffectLayer();
effectLayerRef.current = effectLayer;
app.stage.addChild(effectLayer.container);
```

Add effect:
```ts
useEffect(() => {
  effectLayerRef.current?.updateEffects(state.agents);
}, [state.agents]);
```

- [ ] **Step 3: Verify**

Open `/simulation`. Verify: paused agents show 💤, error agents show ❗, idle agents show ☕. Working agents with currentTask (once WebSocket is wired in Task 10) will show speech bubbles.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/simulation/layers/EffectLayer.ts ui/src/components/simulation/OfficeCanvas.tsx
git commit -m "feat(simulation): add speech bubbles and status icons"
```

---

### Task 9: Detail panels — agent and issue click

**Files:**
- Create: `ui/src/components/simulation/AgentDetailPanel.tsx`
- Create: `ui/src/components/simulation/KanbanDetailPanel.tsx`
- Modify: `ui/src/pages/Simulation.tsx`

- [ ] **Step 1: Create AgentDetailPanel**

Create `ui/src/components/simulation/AgentDetailPanel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { queryKeys } from "../../lib/queryKeys";
import { agentsApi } from "../../api/agents";
import { Button } from "../ui/button";
import { StatusBadge } from "../StatusBadge";

interface AgentDetailPanelProps {
  agentId: string;
  companyId: string;
  onClose: () => void;
}

export function AgentDetailPanel({ agentId, companyId, onClose }: AgentDetailPanelProps) {
  const { t } = useTranslation();
  const { data: agent } = useQuery({
    queryKey: queryKeys.agents.detail(agentId),
    queryFn: () => agentsApi.get(agentId),
  });

  if (!agent) return null;

  return (
    <div className="absolute right-4 top-4 z-10 w-72 rounded-lg border border-border bg-background p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{agent.name}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("agents.detail.role")}</span>
          <span className="capitalize">{agent.role}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("agents.detail.status")}</span>
          <StatusBadge status={agent.status} />
        </div>
        {agent.title && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t("agents.detail.title")}</span>
            <span>{agent.title}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create KanbanDetailPanel**

Create `ui/src/components/simulation/KanbanDetailPanel.tsx`:

```tsx
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { queryKeys } from "../../lib/queryKeys";
import { issuesApi } from "../../api/issues";
import { Button } from "../ui/button";
import { StatusBadge } from "../StatusBadge";

interface KanbanDetailPanelProps {
  issueId: string;
  onClose: () => void;
}

export function KanbanDetailPanel({ issueId, onClose }: KanbanDetailPanelProps) {
  const { t } = useTranslation();
  const { data: issue } = useQuery({
    queryKey: queryKeys.issues.detail(issueId),
    queryFn: () => issuesApi.get(issueId),
  });

  if (!issue) return null;

  return (
    <div className="absolute right-4 top-4 z-10 w-72 rounded-lg border border-border bg-background p-4 shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">{issue.title}</h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2 text-xs">
        <div className="flex justify-between">
          <span className="text-muted-foreground">{t("common.status")}</span>
          <StatusBadge status={issue.status} />
        </div>
        {issue.description && (
          <p className="text-muted-foreground">{issue.description.slice(0, 100)}</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire panels into Simulation page**

Update `ui/src/pages/Simulation.tsx`:

```tsx
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useCompany } from "../context/CompanyContext";
import { useBreadcrumbs } from "../context/BreadcrumbContext";
import { OfficeCanvas } from "../components/simulation/OfficeCanvas";
import { AgentDetailPanel } from "../components/simulation/AgentDetailPanel";
import { KanbanDetailPanel } from "../components/simulation/KanbanDetailPanel";
import { useSimulationState } from "../hooks/useSimulationState";

export function Simulation() {
  const { t } = useTranslation();
  const { selectedCompanyId } = useCompany();
  const { setBreadcrumbs } = useBreadcrumbs();
  const { state, selectAgent, selectIssue } = useSimulationState(selectedCompanyId ?? "");

  useEffect(() => {
    setBreadcrumbs([{ label: t("nav.simulation") }]);
  }, [setBreadcrumbs, t]);

  if (!selectedCompanyId) return null;

  return (
    <div className="relative flex h-full w-full items-center justify-center bg-background p-4">
      <OfficeCanvas
        state={state}
        onAgentClick={selectAgent}
        onIssueClick={selectIssue}
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
```

- [ ] **Step 4: Verify**

Open `/simulation`. Click an agent character — verify the detail panel appears on the right with name, role, status. Click a kanban card — verify issue detail panel appears. Click the X — panel closes.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/simulation/AgentDetailPanel.tsx ui/src/components/simulation/KanbanDetailPanel.tsx ui/src/pages/Simulation.tsx
git commit -m "feat(simulation): add agent and issue detail panels on click"
```

---

### Task 10: WebSocket real-time updates

**Files:**
- Modify: `ui/src/hooks/useSimulationState.ts`

- [ ] **Step 1: Subscribe to live events for simulation state updates**

The existing `LiveUpdatesProvider` already invalidates React Query caches when WebSocket events arrive. Since `useSimulationState` uses `useQuery` for agents and issues, it automatically re-renders when these queries are invalidated.

However, we need to handle `currentTask` text from heartbeat events. Update `useSimulationState.ts`:

Add a `useEffect` that subscribes to custom events dispatched by `LiveUpdatesProvider`. Read the `LiveUpdatesProvider` source to find the exact event dispatch mechanism — if it invalidates query keys, the agents query will re-fetch and `assignSeats` will recompute behaviors.

For `currentTask` text updates (from `heartbeat.run.event`), add a state map:

```ts
const [taskTexts, setTaskTexts] = useState<Map<string, string>>(new Map());
```

In the `assignSeats` result, merge `taskTexts`:

```ts
const agents = useMemo(() => {
  if (!agentsData) return new Map<string, AgentSimState>();
  const result = assignSeats(agentsData);
  // Merge task texts
  for (const [id, text] of taskTexts) {
    const agent = result.get(id);
    if (agent) {
      agent.currentTask = text;
    }
  }
  return result;
}, [agentsData, taskTexts]);
```

Since `LiveUpdatesProvider` already handles the WebSocket connection and invalidates queries, the simulation state will auto-update when agents change status. The `taskTexts` state can be populated later via a custom event listener if needed, or by reading from the `heartbeat_runs` query.

- [ ] **Step 2: Verify**

Open `/simulation` in one tab. In another tab, change an agent's status (pause/resume). Verify: the simulation reflects the change in real time — character moves to/from seat, status icon updates.

- [ ] **Step 3: Commit**

```bash
git add ui/src/hooks/useSimulationState.ts
git commit -m "feat(simulation): wire WebSocket live updates to simulation state"
```

---

### Task 11: Kanban card drag-and-drop

**Files:**
- Modify: `ui/src/components/simulation/layers/KanbanLayer.ts`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`

- [ ] **Step 1: Add drag-and-drop to KanbanLayer**

In `KanbanLayer.ts`, add drag state and a drop callback:

```ts
private onIssueDrop: ((issueId: string, newStatus: IssueStatus) => void) | null = null;

setOnIssueDrop(callback: (issueId: string, newStatus: IssueStatus) => void) {
  this.onIssueDrop = callback;
}
```

In `updateKanban`, when creating cards, add drag events:

```ts
card.eventMode = "static";
card.cursor = "grab";

let dragging = false;
let dragOffsetX = 0;
let dragOffsetY = 0;
const originalX = cx + 1;
const originalY = cardY;

card.on("pointerdown", (e) => {
  dragging = true;
  const pos = e.global;
  dragOffsetX = pos.x - card.x;
  dragOffsetY = pos.y - card.y;
  card.alpha = 0.7;
  card.cursor = "grabbing";
});

card.on("globalpointermove", (e) => {
  if (!dragging) return;
  card.x = e.global.x - dragOffsetX;
  card.y = e.global.y - dragOffsetY;
});

card.on("pointerup", () => {
  if (!dragging) return;
  dragging = false;
  card.alpha = 1;
  card.cursor = "grab";

  // Determine which column the card was dropped on
  const cardCenterX = card.x + (colWidth - 3) / 2;
  const colStartXPos = L.KANBAN_POS.x + 6;
  const totalColWidth = colWidth + 1;

  let droppedColIndex = Math.floor((cardCenterX - colStartXPos) / totalColWidth);
  droppedColIndex = Math.max(0, Math.min(droppedColIndex, STATUSES_TO_SHOW.length - 1));
  const newStatus = STATUSES_TO_SHOW[droppedColIndex];

  if (newStatus !== status) {
    this.onIssueDrop?.(issue.id, newStatus);
  } else {
    // Snap back
    card.x = originalX;
    card.y = originalY;
  }
});

card.on("pointerupoutside", () => {
  if (!dragging) return;
  dragging = false;
  card.alpha = 1;
  card.cursor = "grab";
  card.x = originalX;
  card.y = originalY;
});
```

- [ ] **Step 2: Wire drop callback in OfficeCanvas**

In `OfficeCanvas.tsx`, pass `onIssueDrop` prop to KanbanLayer:

```ts
kanbanLayer.setOnIssueDrop((issueId, newStatus) => {
  props.onIssueDrop(issueId, newStatus);
});
```

Update `OfficeCanvasProps`:

```ts
interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
  onIssueDrop: (issueId: string, newStatus: IssueStatus) => void;
}
```

In `Simulation.tsx`, pass `moveIssue`:

```tsx
<OfficeCanvas
  state={state}
  onAgentClick={selectAgent}
  onIssueClick={selectIssue}
  onIssueDrop={moveIssue}
/>
```

- [ ] **Step 3: Verify**

Drag a kanban card from one column to another. Verify: the issue status changes (API call made), card moves to new column on re-render.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/simulation/layers/KanbanLayer.ts ui/src/components/simulation/OfficeCanvas.tsx ui/src/pages/Simulation.tsx
git commit -m "feat(simulation): add kanban card drag-and-drop for status changes"
```

---

### Task 12: Zoom, pan, and controls overlay

**Files:**
- Create: `ui/src/components/simulation/SimulationControls.tsx`
- Modify: `ui/src/components/simulation/OfficeCanvas.tsx`
- Modify: `ui/src/pages/Simulation.tsx`

- [ ] **Step 1: Add zoom/pan to OfficeCanvas**

In `OfficeCanvas.tsx`, add zoom and pan state via refs:

```ts
const scaleRef = useRef(1);
const panRef = useRef({ x: 0, y: 0 });
const isPanningRef = useRef(false);
const lastPanPosRef = useRef({ x: 0, y: 0 });
```

After `app.init()`, add mouse wheel zoom:

```ts
app.canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  scaleRef.current = Math.max(0.5, Math.min(2, scaleRef.current + delta));
  app.stage.scale.set(scaleRef.current);
});
```

Add pan via middle-click or right-click drag:

```ts
app.canvas.addEventListener("mousedown", (e) => {
  if (e.button === 1 || e.button === 2) { // middle or right click
    isPanningRef.current = true;
    lastPanPosRef.current = { x: e.clientX, y: e.clientY };
    e.preventDefault();
  }
});

app.canvas.addEventListener("mousemove", (e) => {
  if (!isPanningRef.current) return;
  const dx = e.clientX - lastPanPosRef.current.x;
  const dy = e.clientY - lastPanPosRef.current.y;
  panRef.current.x += dx;
  panRef.current.y += dy;
  app.stage.x = panRef.current.x;
  app.stage.y = panRef.current.y;
  lastPanPosRef.current = { x: e.clientX, y: e.clientY };
});

app.canvas.addEventListener("mouseup", () => {
  isPanningRef.current = false;
});

app.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
```

Expose zoom methods via ref for external controls:

```ts
// Add to OfficeCanvasProps
onZoomIn?: () => void;
onZoomOut?: () => void;
onResetView?: () => void;
```

Actually, let's use an imperative handle. Add `useImperativeHandle` with `forwardRef`:

Replace the component signature and add:

```tsx
import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

export interface OfficeCanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
}

export const OfficeCanvas = forwardRef<OfficeCanvasHandle, OfficeCanvasProps>(
  function OfficeCanvas(props, ref) {
    // ... existing code ...

    useImperativeHandle(ref, () => ({
      zoomIn: () => {
        if (!appRef.current) return;
        scaleRef.current = Math.min(2, scaleRef.current + 0.2);
        appRef.current.stage.scale.set(scaleRef.current);
      },
      zoomOut: () => {
        if (!appRef.current) return;
        scaleRef.current = Math.max(0.5, scaleRef.current - 0.2);
        appRef.current.stage.scale.set(scaleRef.current);
      },
      resetView: () => {
        if (!appRef.current) return;
        scaleRef.current = 1;
        panRef.current = { x: 0, y: 0 };
        appRef.current.stage.scale.set(1);
        appRef.current.stage.x = 0;
        appRef.current.stage.y = 0;
      },
    }));

    // ... rest of component
  }
);
```

- [ ] **Step 2: Create SimulationControls**

Create `ui/src/components/simulation/SimulationControls.tsx`:

```tsx
import { useTranslation } from "react-i18next";
import { ZoomIn, ZoomOut, Maximize2 } from "lucide-react";
import { Button } from "../ui/button";

interface SimulationControlsProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetView: () => void;
}

export function SimulationControls({ onZoomIn, onZoomOut, onResetView }: SimulationControlsProps) {
  const { t } = useTranslation();

  return (
    <div className="absolute bottom-4 right-4 z-10 flex gap-1">
      <Button variant="outline" size="sm" onClick={onZoomIn} title={t("simulation.controls.zoomIn")}>
        <ZoomIn className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onZoomOut} title={t("simulation.controls.zoomOut")}>
        <ZoomOut className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" onClick={onResetView} title={t("simulation.controls.resetView")}>
        <Maximize2 className="h-4 w-4" />
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Wire controls into Simulation page**

Update `Simulation.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { OfficeCanvas, type OfficeCanvasHandle } from "../components/simulation/OfficeCanvas";
import { SimulationControls } from "../components/simulation/SimulationControls";

// Inside component:
const canvasRef = useRef<OfficeCanvasHandle>(null);

// In JSX:
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
```

- [ ] **Step 4: Verify**

Open `/simulation`. Verify: scroll wheel zooms in/out, right-click drag pans, zoom buttons work, reset button restores default view.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/simulation/SimulationControls.tsx ui/src/components/simulation/OfficeCanvas.tsx ui/src/pages/Simulation.tsx
git commit -m "feat(simulation): add zoom, pan, and controls overlay"
```

---

### Task 13: Final typecheck, build, and cleanup

**Files:**
- All simulation files

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/kangnam/projects/stapler && pnpm -r typecheck
```

Fix any type errors.

- [ ] **Step 2: Run build**

```bash
pnpm build
```

Fix any build errors.

- [ ] **Step 3: Run tests**

```bash
pnpm test:run
```

Ensure no existing tests are broken.

- [ ] **Step 4: Manual verification**

Open `http://localhost:3100/simulation` and verify all features:
1. Pixel art office renders (wall, floor, tables, furniture)
2. Kanban board shows real issues by status
3. Agent characters sit at assigned desks
4. Idle agents wander around
5. Status icons appear (💤, ❗, ☕)
6. Clicking agent opens detail panel
7. Clicking kanban card opens issue panel
8. Dragging kanban card changes issue status
9. Zoom/pan works (scroll wheel, right-click drag, buttons)
10. Real-time updates work (change agent status in another tab)

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "feat(simulation): complete V1 pixel art office simulation"
```
