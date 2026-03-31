# 조직도 드래그 앤 드롭 보고체계 변경

## 목적

조직도(OrgChart) 페이지에서 에이전트 카드를 드래그하여 다른 에이전트 위에 드롭하면 `reportsTo`가 변경되도록 한다.
완료 조건: 에이전트를 드래그하여 다른 에이전트에 드롭하면 `PATCH /api/agents/:id` 호출로 `reportsTo`가 업데이트되고, 조직도가 즉시 re-layout된다.

## 파일 변경 목록

| 파일 경로 | 변경 내용 |
|----------|----------|
| `ui/src/pages/OrgChart.tsx` | DndContext 추가, 카드를 draggable/droppable로 변경, 드롭 시 API 호출 + 쿼리 무효화 |

## 구현 순서

1. `OrgChart.tsx`에 `@dnd-kit/core` import 추가 (DndContext, useDraggable, useDroppable, DragOverlay)
2. 기존 카드 렌더링을 `OrgCardDraggable` 컴포넌트로 래핑 (useDraggable + useDroppable)
3. `DragOverlay`로 드래그 중 미리보기 카드 표시
4. `handleDragEnd`에서 드롭 대상 에이전트의 ID를 `reportsTo`로 PATCH 호출
5. 성공 시 org 쿼리 + agents 쿼리 무효화 → 자동 re-layout

## 함수/API 시그니처

```typescript
// 기존 API — 변경 없음
PATCH /api/agents/:id { reportsTo: string | null }

// 새 컴포넌트
function OrgCardDraggable({ node, agent, onNavigate }: {
  node: LayoutNode;
  agent: Agent | undefined;
  onNavigate: (agentId: string) => void;
}): JSX.Element;
```

## 제약 조건

- 자기 자신에게 드롭 불가
- 자기 하위 에이전트에게 드롭 불가 (순환 방지)
- CEO(최상위)를 다른 에이전트 밑으로 옮기는 것은 허용 (CEO가 여러 명일 수 있음)
- 빈 영역에 드롭하면 reportsTo를 null로 설정 (루트로 이동)

## 의사결정

**채택**: `@dnd-kit/core` — 이미 프로젝트에 설치되어 있고 KanbanBoard에서 사용 중
**기각**: HTML5 DnD — SVG 기반 레이아웃에서 호환성 문제
