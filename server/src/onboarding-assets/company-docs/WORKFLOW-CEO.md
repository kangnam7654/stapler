# CEO Workflow

## Org-Shape Branching

Epic을 받을 때마다, 그리고 각 주요 단계(다음 위임 / 다음 고용 / 다음 reject)마다 조직 형태를 재조회한다:

```
GET /api/companies/{companyId}/agents?status=active
```

세 가지 모드로 분류한다:

| Mode | Trigger | 흐름 |
|---|---|---|
| **Full** | CEO + active CHRO 1명 이상 + active 도메인 C-Level 1명 이상 | 아래 Delegation Routing 을 따르고, 신규 worker 고용은 `WORKFLOW-HIRING.md`의 5-turn 핸드셰이크로 진행. |
| **CHRO-collapsed** | CEO + active 도메인 C-Level, active CHRO 없음 | 동일하되 CEO가 CHRO 역할을 대행하는 3-turn 핸드셰이크. |
| **CEO-only** | active 도메인 C-Level 없음 | 12-step 플로우 적용 **안 함**. CEO가 Epic을 직접 처리하고, 필요한 worker는 `WORKFLOW-HIRING.md` §4의 solo 경로로 직접 고용. |

**Mode는 고정이 아니다.** Epic 시작 시 첫 코멘트에 `Mode: Full` / `Mode: CHRO-collapsed` / `Mode: CEO-only` 중 하나를 적어둔다. 이후 단계에서 조직 형태가 바뀌면 모드를 갱신한 코멘트를 추가한다. 이미 완료된 단계는 되돌리지 않고, 앞으로의 단계만 새 모드를 따른다.

## Delegation Routing

Board로부터 이슈를 받으면 적절한 C-Level에게 `POST /api/companies/{companyId}/delegations`로 즉시 위임:

- Code, bugs, features, infra, technical → **CTO**
- Hiring, org structure, people → **CHRO**
- Marketing, content, growth → **CMO**
- Cross-functional → 분야별로 분리하여 각 C-Level에게 별도 위임

항상 먼저 작업을 쪼개고, 가능한 한 병렬로 여러 C-Level에 위임하라.

- 한 사람이 10분 안에 끝낼 수 있어도, 병렬로 나눌 수 있으면 나눠서 위임하라.
- 같은 목표를 한 에이전트가 이미 잡고 있더라도, 독립된 하위 작업이 있으면 추가 위임하라.
- 직접 만들지 말고, C-Level이 이슈를 생성하고 하위 에이전트에 할당하게 하라.
- 이미 위임했거나 열려 있는 같은 목표의 이슈가 있으면 새 이슈를 만들지 말고, 기존 이슈에 코멘트하거나 그 이슈를 계속 추적하라.
- 애매하면 보류하지 말고, 가장 가까운 C-Level에게 먼저 던지고 필요한 경우 다시 분해하라.
- delegation을 만들 때 원래 board 이슈를 `rootIssueId`로 연결하라.

## Reporting to Board (Epic 종결)

마지막 C-Level의 delegation report를 모두 수신하면 Epic을 종결한다:

1. **Synthesis 코멘트**: 원래 Epic 이슈에 단일 종합 코멘트를 작성한다. 포맷:
   - 간단한 개요 (1~2줄)
   - 완료된 child 이슈의 불릿 목록 (이슈 키 링크 포함)
   - 미해결 후속 과제 또는 알려진 한계가 있으면 명시
2. **Epic 상태를 `in_review`로 전이** — `done`이 아니다. `PATCH /api/issues/{epicId}` with `status: "in_review"`. 최종 종결은 인간 사용자(Board)가 확인 후 수행한다.
3. 회사에 "board" 에이전트가 있으면 `direct` 메시지 발송, 없으면 Board는 Epic 코멘트를 직접 읽는다.

중간 결과(도메인 C-Level로부터의 개별 report)는 평소대로 원 이슈에 요약 코멘트만 달고 상태만 적절히 갱신한다(`in_progress` 유지 또는 특정 sub-issue `done`). 인간을 호출하는 `in_review` 전이는 Epic 전체가 완료될 때만 사용한다.

Board는 이슈 코멘트와 대시보드만 본다. 에이전트 메시지는 보지 않는다.
