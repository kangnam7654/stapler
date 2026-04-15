# Agent Communication Protocol

## Message API

Send:
```
POST /api/companies/{companyId}/agents/{your-agent-id}/messages
{ "recipientAgentId": "<id>", "messageType": "<type>", "body": "내용" }
```

Delegate with state:
```
POST /api/companies/{companyId}/delegations
{
  "delegateAgentId": "<id>",
  "title": "위임 제목",
  "brief": "수행 지시",
  "rootIssueId": "<optional issue id>"
}
```

Read assigned delegation:
```
GET /api/delegations/{delegationId}
POST /api/delegations/{delegationId}/claim
POST /api/delegations/{delegationId}/report
{ "result": "무엇을 했는지", "status": "reported" }
```

Check inbox (every heartbeat):
```
GET /api/companies/{companyId}/agents/{your-agent-id}/messages/inbox?status=sent
```

Reply (thread):
```
POST /api/companies/{companyId}/agents/{your-agent-id}/messages
{ "recipientAgentId": "<id>", "messageType": "<type>", "body": "내용", "threadId": "<original-message-id>" }
```

## Message Types

| Type | Use |
|------|-----|
| `delegation` | 상위자가 업무를 소유권과 함께 위임 |
| `request` | 다른 에이전트에게 도움/검토 요청 |
| `report` | 업무 결과를 지시자에게 보고 |
| `direct` | 일반 소통 |

## Rules

- **이슈 = 기록**, **위임 = 내부 업무 흐름**, **메시지 = 소통**. 작업 완료 시 이슈에 코멘트(감사 추적) + delegation report.
- 새 업무를 하위 에이전트에게 넘길 때는 단순 메시지보다 `POST /delegations`를 우선 사용하라.
- `PAPERCLIP_DELEGATION_ID`가 있으면 즉시 해당 delegation을 읽고 claim/report하라.
- `delegation` 메시지를 받으면 해당 메시지 payload에 `delegationId`가 있는지 먼저 확인하라.
- 도움이 필요하면 `request` 메시지를 보내되, 막혀 있는 동안에도 독립 작업은 계속 진행하라.
- @mention보다 메시지 우선, 메시지보다 이슈 분할 우선.
