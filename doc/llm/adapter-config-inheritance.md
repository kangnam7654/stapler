# Adapter Config Inheritance (Company-level Defaults)

**Status**: Design approved, pending implementation plan
**Date**: 2026-04-17
**Scope**: V1

## Purpose

현재 Stapler에서 에이전트의 adapter 설정(특히 LMStudio/Ollama 같은 free-text model 필드)은 에이전트마다 개별 입력해야 한다. 회사에 에이전트 수십 개가 있을 때 모델을 바꾸려면 하나하나 수정이 필요하다.

이 설계는 **회사 단위 adapter defaults를 도입**하고, 에이전트가 필드별로 **상속(inherit)** 하거나 **개별 override(custom)** 할 수 있게 한다. 회사 default를 바꾸면 inherit 중인 에이전트들이 자동으로 따라오며, 명시적 일괄 적용(bulk apply) 모달로 기존 custom 에이전트를 강제 동기화하거나 provider 전체를 교체할 수도 있다.

## Goals

1. 회사 단위에서 adapter 설정의 default를 정의할 수 있다.
2. 에이전트는 필드별로 inherit 또는 override를 선택할 수 있다.
3. 회사 default 변경 시 inherit-mode 에이전트들은 DB write 없이 자동으로 반영된다.
4. 명시적 "일괄 적용" 모달로 기존 에이전트를 bulk update할 수 있다 (provider별 + cross-provider).
5. 기존 에이전트들은 feature 배포 후에도 행동 변화가 없어야 한다 (backward compatible).

## Non-goals (V1)

- 역할 기반 타겟팅 ("engineer role 에이전트만 적용")
- 스케줄된/단계적 롤아웃
- Adapter defaults 버전 히스토리 (general activity log로 충분)
- 필드별 잠금 ("이 필드는 agent가 override 불가")
- 에이전트 리스트 UI에 inherit/custom 상태 필터
- Bulk apply dry-run API (UI에서 계산된 diff로 충분)

## Prior art in codebase

- `CompanyAdapterDefaults`가 이미 존재 (`packages/shared/src/types/company.ts:8-11`) — 단 `{baseUrl, apiKey}`만 저장, `ollama_local`/`lm_studio_local`만 커버
- LMStudio adapter에 `baseUrlMode: 'inherit' | 'custom'` 패턴이 부분적으로 존재 (`ui/src/adapters/lm-studio-local/config-fields.tsx`) — 본 설계가 이를 일반화

## Architecture

### Data model

```ts
// packages/shared/src/types/company.ts
// 기존: 2개 provider, {baseUrl, apiKey}만
// 변경: 모든 provider, full Partial<AdapterConfig>
export type CompanyAdapterDefaults = {
  [providerId: string]: Partial<AdapterConfig>;
};
```

- `companies.adapterDefaults` (JSONB 컬럼, 기존): shape만 확장, 스키마 변경 없음
- `agents.adapterConfig` (JSONB 컬럼, 기존): 의미 변경 — 이제 **명시적으로 override된 필드만** 저장. unset 필드는 company defaults로 fallback
- `agents.adapterConfig.baseUrlMode`: **deprecated**. 읽기 시 무시, 쓰기 안 함. 후속 cleanup PR에서 존재하는 값들을 migration으로 제거 (이 설계 범위 밖, 별도 task).

### Config resolution

Resolve는 런타임(heartbeat / adapter invocation 시점)에 발생. DB에는 agent의 override만 저장.

```ts
// packages/shared/src/adapter-config.ts (new)
export function resolveAgentAdapterConfig(
  agent: { adapterType: string; adapterConfig: Partial<AdapterConfig> },
  company: { adapterDefaults: CompanyAdapterDefaults }
): AdapterConfig {
  const defaults = company.adapterDefaults[agent.adapterType] ?? {};
  return deepMerge(defaults, agent.adapterConfig);
}
```

**Deep merge rules**:
- `agent` 필드가 `undefined`인 경우: `company` default 사용
- `agent` 필드가 `null`인 경우: "inherit으로 되돌림" 의미 (API layer에서 실제로 필드 제거)
- `agent` 필드가 값이면: override 적용
- 중첩 object: recursive merge
- Array: agent 값이 있으면 전체 치환 (merge 안 함)

### Migration

**Destructive 변경 없음**. 기존 `agents.adapterConfig`의 모든 필드는 "explicit override"로 해석됨 → Day 1 행동 변화 0.

관리자가 회사 default를 설정한 후 bulk-apply 모달로 에이전트들을 inherit 모드로 전환시킬 때 비로소 동작 변화가 생긴다.

## UI

### Shared component: `<InheritableField>`

공통 래퍼 컴포넌트. 필드 하나마다 inherit/custom 상태를 독립적으로 관리.

```tsx
// ui/src/components/InheritableField.tsx (new)
<InheritableField
  label="Model"
  fieldKey="model"
  inheritedValue={companyDefaults.model}
  currentValue={agentConfig.model}
  onOverride={(val) => setField('model', val)}
  onReset={() => clearField('model')}
>
  {(props) => <RemoteModelDropdown {...props} />}
</InheritableField>
```

**3가지 UI 상태**:

1. **Inherit (자동)**: `agentConfig.<field>` 미설정 + `companyDefaults.<field>` 존재
   → 회색 read-only input, 회사값 표시, "🔗 Inherited from company" 배지, `[Override]` 버튼
2. **Custom**: `agentConfig.<field>` 명시적 설정됨
   → 편집 가능 input, `[Reset to company default]` 버튼 (회사값 있을 때만)
3. **Unset + no default**: 둘 다 없음
   → 편집 가능 빈 input, "⚠ No company default set" 안내

### Adapter config-fields 수정

12개 adapter의 `config-fields.tsx` 전부 수정:
- `ui/src/adapters/claude-local/config-fields.tsx`
- `ui/src/adapters/codex-local/config-fields.tsx`
- `ui/src/adapters/cursor/config-fields.tsx`
- `ui/src/adapters/gemini-local/config-fields.tsx`
- `ui/src/adapters/hermes-local/config-fields.tsx`
- `ui/src/adapters/http/config-fields.tsx`
- `ui/src/adapters/lm-studio-local/config-fields.tsx` (기존 `baseUrlMode` select 제거)
- `ui/src/adapters/ollama-local/config-fields.tsx`
- `ui/src/adapters/openclaw-gateway/config-fields.tsx`
- `ui/src/adapters/opencode-local/config-fields.tsx`
- `ui/src/adapters/pi-local/config-fields.tsx`
- `ui/src/adapters/process/config-fields.tsx`

모든 필드(model, baseUrl, apiKey, temperature, contextSize 등)를 `<InheritableField>`로 감싼다.

### 회사 설정 페이지

`ui/src/pages/CompanySettings.tsx` (기존)에 새 섹션 "Adapter Defaults" 추가:

- 각 provider별 카드 (12개, 접기/펼치기 가능)
- 카드 내부는 해당 adapter의 `config-fields.tsx`를 **재사용** (단, company defaults 편집 모드로)
- 각 카드에 `[에이전트에 일괄 적용]` 버튼 → Provider-scoped 모달 오픈
- 페이지 상단에 `[전체 일괄 적용]` 버튼 → Global cross-provider 모달 오픈

### Bulk apply modals

공통 컴포넌트 `<BulkApplyModal>` props로 scope 조절.

#### Provider-scoped modal

Company Settings의 provider 카드에서 트리거.

Flow:
1. 해당 provider의 에이전트 리스트 (이름, 현재 model, 상태 `inherit`/`custom`)
2. 체크박스 선택 ("전체 선택" / "custom 모드만 선택")
3. 액션 3종:
   - `[Inherit으로 전환]`: 선택된 필드들을 `adapterConfig`에서 clear
   - `[특정 model로 덮어쓰기]`: 모델명 입력 → 명시적 override
   - `[특정 필드만 inherit으로]`: 필드별 체크박스
4. 확인 단계: diff 표시 ("5 에이전트: `llama3.2` → `qwen2.5-coder`")
5. 실행 → `POST /bulk-apply`

#### Global modal (cross-provider)

페이지 상단 `[전체 일괄 적용]`에서 트리거.

4-step wizard:
1. **Provider 선택**: 필터링용
2. **변경 내용**: model + 선택적 baseUrl/apiKey. Advanced 체크박스 "Provider 자체 변경" → adapterType swap 모드 (⚠️ config 완전 교체 경고)
3. **대상 에이전트**: 체크박스 리스트
4. **Preview & Confirm**: diff 표시, 위험한 변경은 빨간 배지

### Edge cases
- Active task 중인 에이전트: 허용, 다음 heartbeat에서 새 config 반영, 경고 표시만
- 비활성/삭제된 에이전트: 모달 리스트에서 제외
- Transaction 실패: all-or-none rollback, 에러 토스트

## API

### Company adapter defaults (REST under `/api/companies/:companyId/adapter-defaults`)

```
GET    /adapter-defaults
       → { [providerId]: Partial<AdapterConfig> }

PUT    /adapter-defaults/:providerId
       body: Partial<AdapterConfig>
       → 해당 provider defaults 전체 교체 (body에 없는 필드는 제거됨)

PATCH  /adapter-defaults/:providerId
       body: Partial<AdapterConfig>
       → merge 업데이트. 값 시맨틱:
         - 키 없음 (undefined): 기존 값 유지
         - 값 있음: 덮어쓰기
         - null: 해당 필드를 defaults에서 제거

DELETE /adapter-defaults/:providerId
       → 해당 provider defaults 전체 제거
```

응답에 `{ affectedAgentCount }` 포함: 변경으로 resolved config가 바뀌는 에이전트 수 (inherit-mode agents 중 변경된 필드를 가진 것들).

### Agent PATCH (기존 확장)

`PATCH /agents/:id` (기존):
- `adapterConfig.<field>`를 명시적으로 `null`로 설정 → "inherit으로 되돌림" (필드 제거)
- `replaceAdapterConfig: true` → 기존 로직 유지 (전체 교체)
- `replaceAdapterConfig: false` (default) → field-level merge, `null`은 필드 제거로 해석

### Bulk apply (신규)

```
POST /api/companies/:companyId/agents/bulk-apply
body: {
  agentIds: string[],
  mode: 'inherit' | 'override' | 'swap-adapter',
  fields?: string[],                    // mode='inherit': clear할 필드
  overrides?: Partial<AdapterConfig>,   // mode='override': 설정할 값
  newAdapterType?: string,              // mode='swap-adapter': 새 provider id
  newAdapterConfig?: AdapterConfig,     // mode='swap-adapter': 새 config
}
→ 200: { updated: AgentSummary[], diff: AgentDiff[] }
→ 400: validation errors
→ 409: agent not found or cross-company
```

**Mode 시맨틱**:
- `inherit`: `fields`에 지정된 필드들을 각 agent의 `adapterConfig`에서 제거
- `override`: `overrides` 값으로 각 agent의 필드 명시적 덮어쓰기
- `swap-adapter`: `adapterType` + `adapterConfig` 전체 교체 (cross-provider 모달 전용)

**Transactional**: 단일 DB transaction, all-or-none rollback.

**Validation**:
- 모든 `agentIds`가 해당 company 소속인지 확인 (cross-company 차단)
- `mode: 'swap-adapter'` 시 `newAdapterConfig`가 target adapter의 schema와 맞는지 검증

**Permissions**: Board operator만. Agent API key는 차단.

### Activity log

- `company.adapter_defaults.updated` — 회사 default 변경 1건 per PATCH/PUT/DELETE
- `agent.adapter_config.bulk_applied` — bulk 작업 1건 (`agentIds` 배열 포함)
- **개별 agent log는 생성하지 않음** (100개 update = 1+1=2건 log)
- metadata에 before/after diff 요약

## Resolution flow (runtime)

```
Heartbeat (packages/adapters/*/heartbeat.ts 또는 유사 진입점):
  agent = fetch agent from DB
  company = fetch agent.company from DB
  resolved = resolveAgentAdapterConfig(agent, company)
  → adapter invocation uses `resolved`
```

회사 default 변경 후 다음 heartbeat부터 inherit-mode 에이전트들이 새 값 반영.

## File changes

### New files
- `packages/shared/src/adapter-config.ts` — `resolveAgentAdapterConfig`, `deepMerge`
- `ui/src/components/InheritableField.tsx` — 공통 래퍼 컴포넌트
- `ui/src/hooks/useResolvedConfig.ts` — UI에서 resolved config 보여주기용 hook
- `ui/src/components/BulkApplyModal.tsx` — provider-scoped + global 공용
- `server/src/routes/adapter-defaults.ts` — `/adapter-defaults/:providerId` CRUD
- `server/src/routes/bulk-apply.ts` — `POST /agents/bulk-apply`
- `server/src/services/adapter-defaults.ts` — 비즈니스 로직
- `server/src/services/bulk-apply.ts` — 트랜잭션 로직

### Modified files
- `packages/shared/src/types/company.ts` — `CompanyAdapterDefaults` 타입 확장
- `packages/shared/src/types/agent.ts` — `adapterConfig`의 `null` 필드 시맨틱 문서화
- `packages/shared/src/constants/api.ts` — 새 API path 상수
- `packages/shared/src/validators/*.ts` — bulk-apply body validator
- `packages/db/src/schema/companies.ts` — 주석 업데이트 (JSONB shape 설명)
- `server/src/routes/companies.ts` — `/adapter-defaults` 라우트 마운트
- `server/src/routes/agents.ts` — `PATCH` 시 `null` 처리 로직, `/bulk-apply` 라우트 마운트
- `ui/src/pages/CompanySettings.tsx` — "Adapter Defaults" 섹션 추가
- `ui/src/pages/AgentDetail.tsx` + `ui/src/components/AgentConfigForm.tsx` — resolved config 표시
- `ui/src/adapters/*/config-fields.tsx` (12개) — `<InheritableField>` 적용
- `ui/src/adapters/lm-studio-local/config-fields.tsx` — 기존 `baseUrlMode` select 제거
- `ui/src/api/*.ts` — 새 API 클라이언트 함수

## Implementation order

1. **Foundation** (shared + db 주석):
   - `packages/shared/src/types/company.ts` 타입 확장
   - `packages/shared/src/adapter-config.ts` — `deepMerge`, `resolveAgentAdapterConfig` + unit tests
2. **Server — company defaults CRUD**:
   - 라우트, 서비스, validators, activity log
   - Integration tests (PGlite)
3. **Server — agent PATCH `null` semantics**:
   - 기존 라우트 수정 + tests
4. **Server — bulk-apply endpoint**:
   - 3 modes, transaction, cross-company check, activity log
   - Integration tests
5. **Adapter runtime resolution**:
   - heartbeat / adapter invocation 경로에서 `resolveAgentAdapterConfig` 사용
   - Integration test: company default 변경 → 다음 heartbeat에서 반영
6. **UI — shared components**:
   - `<InheritableField>`, `useResolvedConfig` hook
7. **UI — adapter config-fields 일괄 수정** (12개):
   - 한 adapter씩 `<InheritableField>`로 치환
   - LMStudio의 기존 `baseUrlMode` 제거
8. **UI — Company Settings Adapter Defaults 섹션**
9. **UI — Bulk Apply modals** (provider-scoped + global)
10. **E2E tests** (Playwright)

## Testing strategy

### Unit tests (`packages/shared`)
- `deepMerge(defaults, overrides)`: 중첩 object, `undefined`/`null` 처리, array 치환
- `resolveAgentAdapterConfig(agent, company)`: inherit/custom/unset 3 상태 × 여러 필드

### Integration tests (`server/`, real PGlite, **mock 금지**)
- `PATCH /adapter-defaults/:providerId` → 해당 provider inherit-mode 에이전트 resolved config 변경 확인
- `POST /agents/bulk-apply` 3 모드 각각:
  - `inherit`: 지정 필드가 `adapterConfig`에서 제거됨
  - `override`: 지정 필드 명시적 설정됨
  - `swap-adapter`: adapterType + adapterConfig 완전 교체
- Transaction 실패 시 rollback (invalid config 섞어서 검증)
- Cross-company 차단: A사 admin이 B사 agent id 끼워넣으면 409
- Activity log entry 1건씩만 생성되는지 확인

### E2E tests (Playwright, `ui/`)
- Company Settings → LMStudio default model 변경 → Agent Detail에 inherit 배지 + 새 model 표시
- Agent Detail에서 `[Override]` → custom model 입력 → 저장 → 재로드 시 custom 유지
- Provider-scoped 모달: 3 agent 선택 → inherit 전환 → 각 agent 확인
- Global 모달: swap-adapter로 Claude → Ollama 전환 → config form 완전 교체 확인

## Constraints

- **Backward compatibility**: 기존 `agents.adapterConfig`, `companies.adapterDefaults` 값 해석이 바뀌지 않아야 함 (Day 1 행동 변화 0)
- **Company scoping**: bulk-apply는 항상 company 경계 검증 (cross-company 차단)
- **Activity log**: 개별 agent가 아닌 bulk 단건으로 기록 (100 agent update = 2건)
- **Transactional**: bulk-apply는 all-or-none
- **No schema migration**: JSONB shape만 변경, Drizzle migration 불필요 (주석/타입만 업데이트)

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inheritance scope | 모든 adapter (A/B/C 중 B) | 일관된 UX, Claude/Codex도 modelId 선택 가능 |
| Auto-propagation | 회사 default 변경 시 inherit-mode agent 자동 반영 (A) | 반복 수정 시 편리 |
| Inheritable fields | adapterConfig 전체 일반화 (C) | 극도의 일관성, `undefined = inherit` 단일 시맨틱 |
| Modal scope | Provider-scoped + Global 둘 다 (C) | 일반 사용 + cross-provider migration 지원 |
| `null` in PATCH | "inherit으로 되돌림" | 값을 실제로 제거하려면 empty string 등 다른 방식 |
| Activity log 단위 | Bulk 1건 | Log 폭발 방지 |
| Schema migration | 불필요 | JSONB shape 확장 only, backward compatible |

## Definition of Done

1. `pnpm -r typecheck && pnpm test:run && pnpm build` 통과
2. 4-layer contract 동기화: `packages/db` → `packages/shared` → `server/` → `ui/`
3. 12개 adapter의 `config-fields.tsx` 전부 `<InheritableField>` 적용 완료
4. LMStudio `baseUrlMode` select 제거 완료 (backward-compat 주석 포함)
5. `doc/SPEC-implementation.md`에 adapter config inheritance 섹션 추가
6. Activity log 2종 (`company.adapter_defaults.updated`, `agent.adapter_config.bulk_applied`) 기록 확인
7. E2E test 3종 (provider-scoped bulk, global swap-adapter, inherit propagation) 통과
