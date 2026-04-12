# Office Simulation — Agent Visualization

## Purpose

Stapler의 AI 에이전트 활동을 픽셀 아트 가상 사무실로 시각화하는 풀스크린 페이지(`/simulation`).
에이전트가 사무실에서 돌아다니고, 업무를 받으면 자리에 앉아 컴퓨터를 하는 게임 같은 인터페이스를 제공한다.

**완료 기준:**
- `/simulation` 라우트에 픽셀 아트 사무실이 렌더링된다
- 에이전트 상태(idle/running/paused/error)에 따라 캐릭터가 배회하거나 자리에 앉는다
- 칸반보드가 실제 issue 상태를 반영하고, 카드 드래그로 상태를 변경할 수 있다
- WebSocket 이벤트로 실시간 업데이트된다
- 에이전트/이슈 클릭 시 상세 패널이 표시된다

## File Changes

### New files

| Path | Description |
|------|-------------|
| `ui/src/pages/Simulation.tsx` | 풀스크린 시뮬레이션 페이지. `OfficeCanvas` + 오버레이 패널 조합 |
| `ui/src/components/simulation/OfficeCanvas.tsx` | PixiJS Application 래퍼. 4개 레이어를 생성하고 `useSimulationState` 훅의 상태를 레이어에 전달 |
| `ui/src/components/simulation/layers/TilemapLayer.ts` | 바닥(체크 타일), 벽, 긴 테이블 4개, 모니터, 의자, 커피머신, 화분, 창문, 시계, 포스터 렌더링 |
| `ui/src/components/simulation/layers/KanbanLayer.ts` | 벽면 칸반보드. issue 상태별 컬럼(open/in_progress/in_review/done/closed). 카드 클릭 및 드래그 이벤트 emit |
| `ui/src/components/simulation/layers/AgentLayer.ts` | 역할별 캐릭터 스프라이트. 자리 배정, idle 배회 로직(pathfinding), working 착석 애니메이션, 상태 전환 |
| `ui/src/components/simulation/layers/EffectLayer.ts` | 말풍선(현재 task 텍스트), 상태 아이콘(zzZ, ❗, 🙋), 파티클(완료 체크마크) |
| `ui/src/components/simulation/sprites/index.ts` | 스프라이트 시트 로딩, 역할→스프라이트 매핑 (CEO=네이비 정장, Engineer=보라 후드티 등) |
| `ui/src/components/simulation/AgentDetailPanel.tsx` | 에이전트 클릭 시 사이드 패널. 이름, 역할, 현재 task, 상태, 최근 activity 표시. React + shadcn/ui |
| `ui/src/components/simulation/KanbanDetailPanel.tsx` | 칸반 카드 클릭 시 이슈 상세 패널. React + shadcn/ui |
| `ui/src/components/simulation/SimulationControls.tsx` | Canvas 위 오버레이 컨트롤. 줌 in/out 버튼 |
| `ui/src/hooks/useSimulationState.ts` | agents 쿼리 + issues 쿼리 + WebSocket 이벤트를 결합하여 시뮬레이션 상태 객체 생성 |
| `ui/src/assets/sprites/office-tilemap.png` | 바닥, 벽, 테이블, 가구 타일 스프라이트 시트 |
| `ui/src/assets/sprites/characters.png` | 역할별 캐릭터 스프라이트 시트 (idle walk 프레임, seated 프레임) |
| `ui/src/assets/sprites/effects.png` | 말풍선, 파티클, 상태 아이콘 스프라이트 시트 |

### Modified files

| Path | Description |
|------|-------------|
| `ui/src/App.tsx` | `/simulation` 라우트 추가 |
| `ui/src/components/Sidebar.tsx` (또는 해당 사이드바 컴포넌트) | Simulation 메뉴 항목 추가 |
| `ui/package.json` | `pixi.js`, `@pixi/react` 의존성 추가 |

## Implementation Order

### Step 1: 프로젝트 셋업

- `ui/package.json`에 `pixi.js`, `@pixi/react` 추가
- `ui/src/pages/Simulation.tsx` 빈 페이지 생성
- `ui/src/App.tsx`에 `/simulation` 라우트 등록
- 사이드바에 Simulation 메뉴 추가
- **검증**: 페이지 접근 가능, 빈 화면 표시

### Step 2: 사무실 타일맵 렌더링

- `OfficeCanvas.tsx`: PixiJS Application 생성, Canvas를 DOM에 마운트
- `TilemapLayer.ts`: 정적 사무실 렌더링
  - 벽 (상단 영역, 그라데이션 배경)
  - 바닥 (체크 패턴 타일)
  - 긴 테이블 4개 (세로, 통통한 너비)
  - 각 테이블 양쪽 5행에 모니터 + 의자
  - 장식: 커피머신, 화분, 창문, 시계, 포스터
- 스프라이트 에셋 없이 PixiJS Graphics API로 도형 기반 렌더링 (V1)
- **검증**: `/simulation`에서 정적 사무실이 보인다

### Step 3: 칸반보드 렌더링

- `KanbanLayer.ts`: 벽면에 칸반보드 렌더링
  - 실제 issue 상태별 컬럼: open, in_progress, in_review, done, closed
  - 각 이슈를 카드로 표시 (제목 축약 텍스트)
- `useSimulationState.ts`: `useQuery`로 issues 데이터 fetch, 상태별 그룹핑
- 칸반보드에 데이터 바인딩
- **검증**: 실제 이슈가 칸반보드 카드로 표시된다

### Step 4: 에이전트 캐릭터 배치

- `AgentLayer.ts`: 에이전트 캐릭터 렌더링
  - 역할별 색상 매핑 (CEO=#1e3a5f, Engineer=#4a1d96, Designer=#b45309, QA=#831843, PM=#7c2d12, DevOps=#065f46, 기타=#6b7280)
  - V1: PixiJS Graphics로 도형 캐릭터 (머리+몸통+다리)
  - 좌석 배정 알고리즘: agent 목록을 순회하며 Col1-Row1-Left부터 순서대로 배정
- `useSimulationState.ts`: `useQuery`로 agents 데이터 fetch, 좌석 배정 상태 계산
- **검증**: 에이전트가 자기 자리에 표시된다

### Step 5: 에이전트 상태 애니메이션

- `AgentLayer.ts`에 상태별 행동 추가:
  - `running`/`active`: 배정된 자리에 앉아있음, 모니터 on
  - `idle`: 자리에서 일어나 사무실 내 랜덤 위치로 이동 (단순 직선 이동 + easing)
  - `paused`: 자리에 앉아있되 모니터 off, zzZ 이펙트
  - `error`: 자리에 앉아있고 ❗ 아이콘
  - `pending_approval`: 자리에 앉아있고 🙋 아이콘
  - `terminated`: 표시하지 않음 (빈 자리)
- idle 배회: 커피머신, 화분, 다른 에이전트 근처 등 랜덤 목적지
- **검증**: 에이전트 상태에 따라 다른 행동이 보인다

### Step 6: WebSocket 실시간 연동

- `useSimulationState.ts`에 `LiveUpdatesProvider`의 WebSocket 이벤트 구독 추가
- 이벤트 → 상태 업데이트 매핑:
  - `agent.status` → 에이전트 상태 변경, 자리 이동 또는 배회 시작 트리거
  - `heartbeat.run.status` → 모니터 화면 상태 변경
  - `heartbeat.run.event` → 말풍선 텍스트 업데이트
  - `activity.logged` → 이펙트 큐에 애니메이션 이벤트 추가
- React Query 캐시 무효화와 시뮬레이션 상태 업데이트 연동
- **검증**: 다른 탭에서 에이전트 상태를 변경하면 시뮬레이션에 실시간 반영된다

### Step 7: 이펙트 레이어

- `EffectLayer.ts`:
  - 말풍선: 에이전트 머리 위에 현재 task 또는 이모지 표시. PixiJS Text + 배경 Graphics
  - 상태 아이콘: zzZ (paused), ❗ (error), 🙋 (pending_approval), ☕ (idle)
  - 완료 파티클: issue 완료 시 체크마크 이펙트
- **검증**: 말풍선과 아이콘이 상태에 맞게 표시된다

### Step 8: 인터랙션 — 클릭

- `AgentLayer.ts`: 캐릭터에 PixiJS 이벤트 리스너 추가, 클릭 시 콜백 emit
- `KanbanLayer.ts`: 카드에 클릭 이벤트 리스너 추가
- `OfficeCanvas.tsx`: 클릭 이벤트를 React 상태로 브릿지
- `AgentDetailPanel.tsx`: 선택된 에이전트의 상세 정보 표시 (이름, 역할, 현재 task, 상태, 최근 activity). 기존 `AgentProperties.tsx` 패턴 참고
- `KanbanDetailPanel.tsx`: 선택된 이슈 상세 표시. 기존 `IssueDetail.tsx` 패턴 참고
- **검증**: 에이전트/칸반 카드 클릭 시 사이드 패널이 열린다

### Step 9: 인터랙션 — 칸반 드래그

- `KanbanLayer.ts`에 드래그 앤 드롭 추가:
  - 카드를 다른 컬럼으로 드래그
  - 드롭 시 `PATCH /issues/:id` API 호출로 상태 변경
- `useSimulationState.ts`에 mutation 추가
- **검증**: 카드 드래그로 이슈 상태가 실제로 변경된다

### Step 10: 줌 & 컨트롤

- `SimulationControls.tsx`: Canvas 위 오버레이
  - 줌 in/out 버튼
  - PixiJS stage의 scale + position 조절
- 마우스 휠 줌, 드래그로 패닝
- **검증**: 줌/패닝으로 사무실을 자유롭게 탐색할 수 있다

## Function/API Signatures

### useSimulationState hook

```typescript
interface SeatAssignment {
  agentId: string;
  column: number;    // 0-3
  row: number;       // 0-4
  side: 'left' | 'right';
  pixelX: number;
  pixelY: number;
}

interface AgentSimState {
  agent: Agent;
  seat: SeatAssignment;
  behavior: 'working' | 'idle-walking' | 'paused' | 'error' | 'pending-approval';
  currentTask: string | null;    // 말풍선 텍스트
  walkTarget: { x: number; y: number } | null;
}

interface KanbanState {
  columns: Map<IssueStatus, Issue[]>;
}

interface SimulationState {
  agents: Map<string, AgentSimState>;
  kanban: KanbanState;
  effects: AnimationEvent[];
  selectedAgent: string | null;
  selectedIssue: string | null;
}

function useSimulationState(companyId: string): {
  state: SimulationState;
  selectAgent: (id: string | null) => void;
  selectIssue: (id: string | null) => void;
  moveIssue: (issueId: string, newStatus: IssueStatus) => void;
}
```

### OfficeCanvas component

```typescript
interface OfficeCanvasProps {
  state: SimulationState;
  onAgentClick: (agentId: string) => void;
  onIssueClick: (issueId: string) => void;
  onIssueDrop: (issueId: string, newStatus: IssueStatus) => void;
}

function OfficeCanvas(props: OfficeCanvasProps): React.ReactElement
```

### Layer classes

```typescript
// 모든 레이어는 같은 인터페이스
interface SimulationLayer {
  container: PIXI.Container;
  update(state: SimulationState, deltaTime: number): void;
  destroy(): void;
}

class TilemapLayer implements SimulationLayer { ... }
class KanbanLayer implements SimulationLayer { ... }
class AgentLayer implements SimulationLayer { ... }
class EffectLayer implements SimulationLayer { ... }
```

## Constraints

1. PixiJS import는 `OfficeCanvas.tsx`에만 한다. 다른 React 컴포넌트는 PixiJS에 의존하지 않는다.
2. Layer 클래스는 순수 PixiJS 코드. React를 import하지 않는다.
3. 상세 패널(AgentDetailPanel, KanbanDetailPanel)은 기존 shadcn/ui 컴포넌트와 동일한 스타일을 사용한다.
4. V1에서 스프라이트 에셋은 PixiJS Graphics API로 도형 기반 렌더링한다. 전용 PNG 스프라이트 시트는 이후 교체 가능하도록 `sprites/index.ts`에서 추상화한다.
5. 좌석 배정은 agent 생성 순서(createdAt)로 Col1-Row1-Left부터 순서대로 채운다. terminated 에이전트는 건너뛴다.
6. idle 배회는 단순 직선 이동 + easing. A* pathfinding은 V1에서 불필요하다.
7. 새 API 엔드포인트를 추가하지 않는다. 기존 REST + WebSocket을 그대로 사용한다.
8. 기존 `LiveUpdatesProvider` 컨텍스트를 통해 WebSocket 이벤트를 수신한다. 별도 WebSocket 연결을 만들지 않는다.
9. i18n: 칸반 컬럼 헤더 등 UI 텍스트는 i18next를 통해 한/영 지원한다.
10. 테이블 너비는 목업보다 두껍게 — 최소 24px 이상으로 잡는다.

## Decisions

- **렌더링 엔진**: PixiJS 선택. Raw Canvas는 스프라이트/애니메이션 직접 구현 부담이 크고, CSS/DOM은 캐릭터 이동 성능과 픽셀 아트 표현에 한계.
- **배치 방식**: 풀스크린 독립 페이지 선택. 대시보드 위젯은 인터랙션 공간 부족으로 V1 이후로 연기.
- **비주얼 스타일**: 픽셀 아트 선택. 아이소메트릭은 에셋 제작 난이도가 높고, 플랫/미니멀은 게임 느낌이 약함.
- **레이아웃**: 세로 긴 테이블 4컬럼 × 5행 고정. 동적 레이아웃은 픽셀 아트에서 자연스러운 배치가 어려움.
- **캐릭터 구분**: 역할별 고정 스프라이트(색상+의상). 아이콘 기반이나 단순 색상보다 게임적 몰입감이 높음.
- **칸반 컬럼**: 실제 issue 상태 그대로 매핑. 3컬럼 축약보다 정보량이 많고 기존 데이터 모델과 1:1 대응.
