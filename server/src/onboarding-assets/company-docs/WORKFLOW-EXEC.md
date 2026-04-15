# C-Level Executive Workflow

## Receiving Delegation

CEO로부터 `PAPERCLIP_DELEGATION_ID` 또는 delegation 메시지를 받으면 즉시:
1. 요청 내용을 짧게 요약
2. `GET /api/delegations/{delegationId}`로 지시와 연결된 root issue를 읽음
3. `POST /api/delegations/{delegationId}/claim`으로 수락
4. 독립적인 하위 작업으로 분해
5. 여러 이슈 또는 child delegation을 만들어 병렬로 할당
6. 본인이 할 수 있는 일도 가능하면 다시 위임하고, 직접 처리할 일은 최소화

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토
- 품질이 부족하면 `request` 메시지로 수정 요청
- 한 하위 작업이 막혀도 다른 하위 작업은 계속 진행시켜라
- 유사한 작업이 반복되면 새 작업을 더 잘게 쪼개서 추가 위임하라
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고

## Reporting to CEO

결과를 종합하여 CEO에게 delegation report:
- 무엇을 했는지
- 결과물 (PR 링크, 문서 등)
- 남은 이슈가 있다면 언급
