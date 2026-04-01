# Agent-to-Agent Messaging Channel

## Purpose

에이전트 간 직접 메시지를 주고받는 채널을 구축한다. CEO가 CHRO에게 "시니어 엔지니어 3명 채용해"라고 지시하고, CHRO가 CTO에게 "기술 인터뷰 기준 공유해줘"라고 요청하는 등 — 이슈 할당 없이 에이전트 간 자유로운 커뮤니케이션이 가능해야 한다.

**완료 기준:**
- 에이전트 A가 에이전트 B에게 메시지를 보내면 B가 wake되어 메시지를 처리할 수 있다
- 메시지에 대한 답장이 thread로 연결된다
- UI에서 에이전트별 메시지 inbox를 볼 수 있다
- WebSocket을 통해 실시간 알림이 전달된다

---

## File Changes

### New Files

| File | Purpose |
|------|---------|
| `packages/db/src/schema/agent_messages.ts` | 메시지 테이블 스키마 |
| `packages/db/src/migrations/XXXX_agent_messages.sql` | DB migration |
| `server/src/services/agent-messaging.ts` | 메시지 CRUD + 발송 로직 서비스 |
| `server/src/routes/agent-messages.ts` | REST API 엔드포인트 |
| `ui/src/pages/AgentMessages.tsx` | 에이전트 메시지 inbox UI |

### Modified Files

| File | Change |
|------|--------|
| `packages/db/src/schema/index.ts` | `agentMessages` export 추가 |
| `packages/shared/src/constants.ts` | `LIVE_EVENT_TYPES`에 `"agent.message.received"` 추가 |
| `server/src/index.ts` | `agentMessageRoutes` 라우터 마운트 |
| `ui/src/App.tsx` 또는 라우터 | 메시지 페이지 라우트 추가 |

---

## DB Schema

### `agent_messages` table

```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  thread_id UUID REFERENCES agent_messages(id),
  sender_agent_id UUID NOT NULL REFERENCES agents(id),
  recipient_agent_id UUID NOT NULL REFERENCES agents(id),
  message_type TEXT NOT NULL DEFAULT 'direct',
  body TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'sent',
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agent_messages_recipient_idx
  ON agent_messages (company_id, recipient_agent_id, status, created_at DESC);
CREATE INDEX agent_messages_sender_idx
  ON agent_messages (company_id, sender_agent_id, created_at DESC);
CREATE INDEX agent_messages_thread_idx
  ON agent_messages (thread_id, created_at ASC);
```

**Columns:**

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | PK |
| `company_id` | UUID | FK → companies |
| `thread_id` | UUID, nullable | FK → agent_messages(id). null = 새 스레드의 첫 메시지, non-null = 해당 스레드의 답장 |
| `sender_agent_id` | UUID | FK → agents. 보낸 에이전트 |
| `recipient_agent_id` | UUID | FK → agents. 받는 에이전트 |
| `message_type` | TEXT | `direct` (일반), `delegation` (업무 위임), `request` (요청), `report` (보고) |
| `body` | TEXT | 메시지 본문 |
| `payload` | JSONB | 구조화된 데이터 (이슈 ID 참조, 첨부 등) |
| `status` | TEXT | `sent`, `read`, `archived` |
| `read_at` | TIMESTAMPTZ | 수신자가 읽은 시각 |
| `created_at` | TIMESTAMPTZ | 생성 시각 |
| `updated_at` | TIMESTAMPTZ | 수정 시각 |

**Thread model:** `thread_id`가 null이면 스레드의 root 메시지. 답장은 `thread_id`에 root 메시지 ID를 참조. flat thread (depth 1).

---

## Implementation Order

### Step 1: DB schema + migration

**Target:** `packages/db/src/schema/agent_messages.ts`, `packages/db/src/schema/index.ts`

1. Drizzle 스키마 정의: `agentMessages` table (위 SQL 구조대로)
2. `schema/index.ts`에 `export { agentMessages } from "./agent_messages.js"` 추가
3. Migration SQL 파일 생성

### Step 2: Service layer

**Target:** `server/src/services/agent-messaging.ts`

Function: `agentMessagingService(db: Db)`

Returns:
```ts
{
  send(companyId: string, input: SendMessageInput): Promise<AgentMessage>
  listInbox(companyId: string, agentId: string, opts?: ListOpts): Promise<AgentMessage[]>
  listThread(threadId: string): Promise<AgentMessage[]>
  markRead(messageId: string, agentId: string): Promise<AgentMessage>
  markThreadRead(threadId: string, agentId: string): Promise<number>
}
```

**`send()` flow:**
1. Validate sender and recipient exist in same company
2. Validate sender has permission (same company, not terminated)
3. If `threadId` provided, validate thread root exists and recipient matches
4. Insert `agent_messages` row
5. Publish live event: `publishLiveEvent({ companyId, type: "agent.message.received", payload: { messageId, senderId, recipientId } })`
6. Wake recipient agent: `heartbeat.wakeup(recipientId, { source: "on_demand", triggerDetail: "callback", reason: "message_received", payload: { messageId, senderAgentId, messageType } })`
7. Log activity: `logActivity(db, { action: "agent.message_sent", ... })`

**`listInbox()` params:**
```ts
interface ListOpts {
  status?: "sent" | "read" | "archived";
  limit?: number;       // default 50
  cursor?: string;      // created_at cursor for pagination
}
```
- Query: `WHERE recipient_agent_id = ? AND status IN (?) ORDER BY created_at DESC LIMIT ?`
- thread_id가 null인 것만 반환 (root messages) + 각 thread의 최신 reply count

**`listThread()` flow:**
- `WHERE id = threadId OR thread_id = threadId ORDER BY created_at ASC`

**`markRead()` flow:**
- `UPDATE agent_messages SET status = 'read', read_at = now() WHERE id = ? AND recipient_agent_id = ?`

### Step 3: REST API routes

**Target:** `server/src/routes/agent-messages.ts`

Function: `agentMessageRoutes(db: Db)`

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/companies/:companyId/agents/:agentId/messages` | agent key or board | 메시지 발송 |
| `GET` | `/api/companies/:companyId/agents/:agentId/messages/inbox` | agent key or board | 수신함 목록 |
| `GET` | `/api/companies/:companyId/agents/:agentId/messages/sent` | agent key or board | 발신함 목록 |
| `GET` | `/api/companies/:companyId/messages/threads/:threadId` | agent key or board | 스레드 조회 |
| `PATCH` | `/api/companies/:companyId/messages/:messageId/read` | agent key or board | 읽음 처리 |

**POST body:**
```ts
{
  recipientAgentId: string;    // required
  messageType?: string;        // default "direct"
  body: string;                // required
  payload?: Record<string, unknown>;
  threadId?: string;           // 답장 시
}
```

**Auth:** agent key → sender는 해당 에이전트. board → sender는 body에서 명시적으로 지정 (보드 사용자가 에이전트 대신 보내기).

### Step 4: Shared constants update

**Target:** `packages/shared/src/constants.ts`

- `LIVE_EVENT_TYPES`에 `"agent.message.received"` 추가

### Step 5: Server router mount

**Target:** `server/src/index.ts`

- `import { agentMessageRoutes } from "./routes/agent-messages.js"`
- `app.use(agentMessageRoutes(db))`

### Step 6: UI — Agent Messages page

**Target:** `ui/src/pages/AgentMessages.tsx`

- 에이전트 선택 → inbox 표시
- 메시지 클릭 → thread 뷰
- 새 메시지 작성 (recipient 선택 + body)
- 실시간 업데이트: `agent.message.received` live event 구독

---

## Function/API Signatures

### Service

```ts
// server/src/services/agent-messaging.ts

interface SendMessageInput {
  senderAgentId: string;
  recipientAgentId: string;
  messageType?: "direct" | "delegation" | "request" | "report";
  body: string;
  payload?: Record<string, unknown>;
  threadId?: string | null;
}

interface AgentMessage {
  id: string;
  companyId: string;
  threadId: string | null;
  senderAgentId: string;
  recipientAgentId: string;
  messageType: string;
  body: string;
  payload: Record<string, unknown>;
  status: string;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ListOpts {
  status?: string;
  limit?: number;
  cursor?: string;
}

function agentMessagingService(db: Db): {
  send(companyId: string, input: SendMessageInput): Promise<AgentMessage>;
  listInbox(companyId: string, agentId: string, opts?: ListOpts): Promise<AgentMessage[]>;
  listSent(companyId: string, agentId: string, opts?: ListOpts): Promise<AgentMessage[]>;
  listThread(threadId: string): Promise<AgentMessage[]>;
  markRead(messageId: string, agentId: string): Promise<AgentMessage>;
  markThreadRead(threadId: string, agentId: string): Promise<number>;
  countUnread(companyId: string, agentId: string): Promise<number>;
}
```

### Validators

```ts
// packages/shared/src/validators/agent-message.ts

const sendAgentMessageSchema = z.object({
  recipientAgentId: z.string().uuid(),
  messageType: z.enum(["direct", "delegation", "request", "report"]).default("direct"),
  body: z.string().min(1).max(10000),
  payload: z.record(z.unknown()).optional().default({}),
  threadId: z.string().uuid().optional().nullable(),
});
```

---

## Constraints

1. sender와 recipient는 반드시 같은 company_id에 속해야 한다
2. terminated 상태의 에이전트는 메시지를 보내거나 받을 수 없다
3. thread_id는 반드시 thread_id가 null인 root 메시지를 가리켜야 한다 (nested thread 금지)
4. 메시지 발송 시 recipient agent를 자동으로 wake한다 (source: `"on_demand"`, triggerDetail: `"callback"`)
5. Board 사용자도 에이전트 대신 메시지를 열람할 수 있다 (관리 목적)
6. 기존 `issue_comments`, `approval_comments`와 독립적으로 동작한다 — 이슈에 종속되지 않는 자유 메시지
7. `body` 최대 10,000자

---

## Decisions

| 결정 | 선택 | 대안 (기각) |
|------|------|------------|
| Thread 구조 | flat (depth 1, thread_id → root) | nested tree — 복잡도 대비 이점 없음. 에이전트 간 대화는 선형적 |
| 저장소 | PostgreSQL `agent_messages` table | Redis pub/sub — 영속성 필요. 감사 추적에 DB 필수 |
| 실시간 전달 | 기존 `publishLiveEvent` + wake 큐 | 별도 WebSocket 채널 — 기존 인프라 재사용이 효율적 |
| 메시지 타입 | `direct`, `delegation`, `request`, `report` | 타입 없이 body만 — 에이전트가 메시지 의도를 파악하려면 구조화 필요 |
| 그룹 메시지 | 미지원 (1:1만) | 그룹 채널 — MVP 스코프 초과. 1:1로 시작 후 확장 가능 |
| Board에서 에이전트 대리 발송 | 지원 | Board 발송 불가 — 관리자가 CEO에게 직접 지시할 수 있어야 함 |
