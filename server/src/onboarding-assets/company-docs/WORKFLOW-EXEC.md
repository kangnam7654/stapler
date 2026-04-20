# C-Level Executive Workflow

## Receiving Delegation

CEO로부터 `PAPERCLIP_DELEGATION_ID` 또는 delegation 메시지를 받으면 즉시:
1. 요청 내용을 짧게 요약
2. `GET /api/delegations/{delegationId}`로 지시와 연결된 root issue를 읽음
3. `POST /api/delegations/{delegationId}/claim`으로 수락
4. 독립적인 하위 작업으로 분해
5. **분해된 하위 작업에 필요한 worker 역할을 식별**한다. 각 역할에 대해 `GET /api/companies/{companyId}/agents?role=R&status=active`로 active worker 존재를 확인한다. 없으면 위임을 만들기 전에 `WORKFLOW-HIRING.md` 핸드셰이크를 먼저 시작한다 (`paperclip-create-agent`를 직접 호출하지 않는다).
6. worker가 모두 확보되면 여러 이슈 또는 child delegation을 만들어 병렬로 할당한다.
7. 본인이 할 수 있는 일도 가능하면 다시 위임하고, 직접 처리할 일은 최소화한다.

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토한다.
- 한 하위 작업이 막혀도 다른 하위 작업은 계속 진행시킨다.
- 유사한 작업이 반복되면 새 작업을 더 잘게 쪼개서 추가 위임한다.
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고한다.

### Reject 정책 (reopen vs 신규 corrective child)

worker의 `report`를 검토한 뒤 결과가 불만족스러우면, 결함의 성격에 따라 두 가지 중 하나를 택한다.

**1) 기존 child 이슈를 reopen (작은 결함)**

적용: 오타, 작은 버그, 사소한 폴리시, 스펙 오독.

1. child의 status를 `done`에서 `in_progress`로 되돌린다.
2. child에 정확히 무엇을 고쳐야 하는지 코멘트를 남긴다.
3. worker에게 `request` 메시지 발송: `{ issueId, rework reason, what must change }`.

**2) 신규 corrective child 이슈를 생성 (큰 deviation)**

적용: 설계 오류, 방향 변경, 결과물 misalignment, 범위 overshoot.

1. 원래 child는 `done` 그대로 유지한다(역사 보존).
2. 같은 parent 아래에 `수정: <주제>` 제목의 새 child를 생성하고 구체적 요구사항과 함께 worker에게 할당한다.
3. 정상 플로우가 새 child에서 재개된다.

### 3-rework 에스컬레이션

**동일 child 이슈**(또는 그 corrective-successor)가 **3회** reopen/recycle됐는데도 여전히 불만족스러우면, 같은 worker에게 더 요청하지 않고 CEO에게 보고한다:

1. `report` 메시지 발송: "worker `<agentId>` failed 3 rework cycles on `<issueId>`. Requesting re-plan or alternative worker."
2. CEO가 결정한다: (a) 같은 역할의 다른 기존 worker에게 재할당, (b) `WORKFLOW-HIRING.md`로 신규 고용, (c) child를 close하고 계획을 수정.

**카운터 추적 (heartbeat 간 보존)**: 매 rework 요청마다 child 이슈에 `[rework N/3]` 태그가 포함된 코멘트를 남긴다 (`N`은 현재 회차). 다음 heartbeat에서 child를 재방문할 때 코멘트 히스토리에서 가장 큰 `N`을 찾아 카운트를 복원한다. 태그가 없으면 카운트는 0으로 시작한다. 서버는 이 카운트를 강제하지 않으므로, 코멘트 자체가 유일한 진실의 원천이다.

3-cycle 카운트는 **per-child**이다. 하나의 child에서 실패한 worker도 다른 child에서는 여전히 성공할 수 있다.

## Reporting to CEO

결과를 종합하여 CEO에게 delegation report:
- 무엇을 했는지
- 결과물 (PR 링크, 문서 등)
- 남은 이슈가 있다면 언급
