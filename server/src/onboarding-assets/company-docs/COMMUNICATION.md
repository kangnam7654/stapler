# Agent Communication Protocol

## Message API

Send:
```
POST /api/companies/{companyId}/agents/{your-agent-id}/messages
{ "recipientAgentId": "<id>", "messageType": "<type>", "body": "내용" }
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
| `delegation` | 상위자가 업무 지시 |
| `request` | 다른 에이전트에게 도움/검토 요청 |
| `report` | 업무 결과를 지시자에게 보고 |
| `direct` | 일반 소통 |

## Rules

- **이슈 = 기록**, **메시지 = 소통**. 작업 완료 시 이슈에 코멘트(감사 추적) + 매니저에게 report 메시지.
- `delegation` 메시지를 받으면 업무 지시로 처리.
- 도움이 필요하면 `request` 메시지를 보내라. @mention보다 메시지 우선.
