# Hiring Workflow (WORKFLOW-HIRING)

C-Level 또는 CEO가 새 worker를 고용할 때 이 절차를 따른다. 이 문서는 `paperclip-create-agent` 스킬의 **외피(외적 프로토콜)**이며, 실제 액추에이션은 `POST /api/companies/{companyId}/agent-hires` + Board `hire_agent` approval을 사용한다.

## 0. Trigger

**C-Level 또는 CEO**(이하 통칭 요청자 `D`)가 계획을 분해하다가 기존에 없는 역할 `R`(예: `engineer`, `writer`, `designer`)의 worker가 필요하다고 판단한 경우에만 시작한다. CEO-only 모드에서는 §4 의 solo 경로로 직접 이동한다.

**먼저 재사용을 확인한다.** `GET /api/companies/{companyId}/agents?role=R&status=active`. `active`인 동일 역할 에이전트가 하나라도 있으면 신규 고용하지 않고 그 에이전트에 위임한다. 없을 때만 아래 절차로 진입한다.

Worker(`default` 페르소나)는 **절대** 직접 이 절차를 시작하지 않는다. 고용은 C-Level 또는 CEO 권한이다. Worker가 역량 밖 작업을 맞닥뜨리면 `default/AGENTS.md`의 "out-of-skill escalation" 규칙에 따라 C-Level에 보고하는 것까지만 수행한다.

## 1. Org-Shape Mode 결정

고용을 개시하기 직전에 현재 조직 형태를 조회한다:

```
GET /api/companies/{companyId}/agents?status=active
```

응답에 따라 세 가지 모드 중 하나를 선택한다. **모드는 매 고용마다 다시 평가한다** — 한 Epic 처리 도중에도 조직이 변할 수 있다.

| Mode | Trigger | 절차 |
|---|---|---|
| **Full** | CEO + 최소 1명의 active CHRO + 최소 1명의 active 도메인 C-Level | 아래 §2 의 **5 turns** |
| **CHRO-collapsed** | CEO + active 도메인 C-Level, **active CHRO 없음** | 아래 §3 의 **3 turns** (CEO가 CHRO 역할 대행) |
| **CEO-only** | active 도메인 C-Level 없음 (CEO만) | 아래 §4 의 **solo**. 핸드셰이크 없음. |

## 2. Mode A — Full (5 turns)

| Turn | From → To | Message Type | Body |
|---|---|---|---|
| 1 | `D` → CHRO | `request` | `role=R`, 요구 역량과 범위, 원인 `delegationId`. **시스템 프롬프트 초안을 포함하지 않는다** — CHRO가 백지에서 초안을 쓴다. |
| 2 | CHRO → critic | `request` | "초안 프롬프트: `<prompt>`. 검토 요청." critic = `D`가 in-domain이면 `D`, 그렇지 않으면 §5의 best-fit. |
| 3 | critic → CHRO | `report` | OK + 제안, 또는 사유와 함께 reject. |
| 4 | CHRO → CEO | `request` | "고용 결재. `role=R`, 최종 프롬프트, 요청자=`D`, critic=`<critic>`, 근거." |
| 5 | CEO → CHRO | `report` | OK, 또는 사유와 함께 hold. |

Turn 5 OK 후 CHRO가 `POST /api/companies/{companyId}/agent-hires`로 액추에이트한다. 에이전트가 생성되면 CHRO는 `D`에게 `direct` 메시지로 **새 `agentId`만** 전달한다. 실제 작업 위임은 `D`가 자신의 계획 맥락에서 직접 보낸다. CHRO는 이후 관여하지 않는다.

## 3. Mode B — CHRO-collapsed (3 turns)

**CEO substitutes for CHRO.** Turn 1~3은 Mode A와 동일하되 "CHRO"를 "CEO"로 읽는다. 즉 Turn 1: `D` → CEO (`request`), Turn 2: CEO → critic (`request`), Turn 3: critic → CEO (`report`). Critic 선정은 §5 best-fit 규칙을 그대로 적용하며 선정 주체가 CEO일 뿐이다. Turn 4~5는 CEO가 자기 자신에게 결재를 올리는 것과 같아 **collapse**된다. Turn 3 OK 직후 CEO가 바로 `POST /api/companies/{companyId}/agent-hires`를 수행하고 `D`에게 `agentId`를 `direct`로 전달한다.

## 4. Mode C — CEO-only (solo)

핸드셰이크 없음. CEO가:
1. 직접 프롬프트를 작성한다 (self-critic).
2. `POST /api/companies/{companyId}/agent-hires`로 액추에이트한다.
3. 새 에이전트를 자신의 직접 부하로 취급하고 바로 위임한다.

CEO-only는 부트스트랩 단계의 임시 상태로 간주한다. 조직이 성장하면 다음 고용부터 Mode A 또는 B로 복원된다.

## 5. Out-of-Domain Hire — Best-Fit Critic

`D`의 도메인이 `R`의 자연스러운 critic 도메인과 다르고, `R`의 자연 critic C-Level이 회사에 없을 때 적용한다. CHRO가 Turn 2에서 critic을 선택하는 규칙:

1. **정확 매칭**: `R`에 대응하는 C-Level (엔지니어 → CTO, 마케팅 콘텐츠 → CMO 등).
2. **인접 도메인 대체**: 정확 매칭 없으면 가장 가까운 도메인 (예: 디자이너인데 CDO 없음 → CMO, CMO도 없음 → CTO).
3. **최후**: 그럴듯한 C-Level이 없으면 CEO가 critic을 맡는다.

**요청자 `D`는 같은 역할의 자연 critic이 아니면 critic이 될 수 없다.** "필요한 사람이 검토하는" 구조는 critique의 목적을 무효화한다. CHRO는 critic 선정 사유를 Turn 2 메시지 본문에 남긴다.

## 6. Concurrent Same-Role Consolidation

CHRO 수신함에 같은 heartbeat 창에서 동일 `R`에 대한 `request`가 2개 이상 들어오면, 초안을 쓰기 전에 병합을 시도한다:

1. CHRO가 각 요청자 C-Level에게 `direct` 메시지 발송: "`R` 고용이 이미 `<다른 C-Level>`로부터 대기 중이며 범위는 `<요약>`. 한 명의 worker를 공유할 의향이 있는가?"
2. **모두 OK** → 범위를 모두 포용하는 단일 프롬프트로 1명만 고용.
3. **한 명이라도 거절** → 거절한 요청자는 별도 고용. CHRO는 순차 처리 (Turn 2의 혼란 방지).
4. **1 heartbeat 내 무응답** → 해당 요청자도 별도 고용 처리 (다른 요청자를 막지 않음).

## 7. Reject Loops Inside Hiring

- **Turn 3 critic reject**: CHRO가 재작성 후 Turn 2 재발송. **동일 고용에서 3 rejections 누적** 시 CHRO는 다음 Turn 2 `request`에 CEO를 CC하여 arbitration을 요청한다.
- **Turn 5 CEO hold**: CHRO가 `D`에게 `direct`로 hold 사유 전달. `D`는 범위를 줄이거나 다른 역할을 제안하여 Turn 1부터 재시작한다.

## 8. Budget Awareness

`ceo/HEARTBEAT.md`의 기존 규칙을 따른다: 회사 예산 사용률 80% 이상이면 critical한 고용만 진행한다. 이 문서는 Epic별 freeze 정책을 추가하지 않는다.

## 9. References

- Actuation 엔드포인트: `POST /api/companies/{companyId}/agent-hires` (기존).
- 조직 현황 조회: `GET /api/companies/{companyId}/agents?status=active`.
- Approval 타입: `hire_agent` (기존 — Board 승인 흐름 재사용).
- 설계 문서: `docs/llm/multi-agent-12-step-workflow.md`.
