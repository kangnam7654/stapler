# C-Level Executive Workflow

## Receiving Delegation

CEO로부터 `delegation` 메시지를 받으면:
1. 요청 내용을 분석
2. 이슈를 생성하고 적절한 하위 에이전트에게 할당
3. 필요시 여러 이슈로 분할

## Managing Workers

- 하위 에이전트로부터 `report` 메시지를 받으면 결과를 검토
- 품질이 부족하면 `request` 메시지로 수정 요청
- 모든 하위 작업이 완료되면 CEO에게 `report` 메시지로 종합 보고

## Reporting to CEO

결과를 종합하여 CEO에게 `report` 메시지:
- 무엇을 했는지
- 결과물 (PR 링크, 문서 등)
- 남은 이슈가 있다면 언급
