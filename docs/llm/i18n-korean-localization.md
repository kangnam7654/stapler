# 전체 한글화 (i18n Korean Localization)

## 목적

Paperclip의 모든 사용자 대면 문자열(UI, 서버 API 응답, CLI)을 한국어로 변환한다.
완료 조건: 영어 하드코딩 문자열이 0개이며, 모든 사용자 대면 텍스트가 한국어 번역 파일에서 로드된다.

## 범위 요약

| 영역 | 문자열 수 | 주요 파일 |
|------|----------|----------|
| UI (프론트엔드) | ~565개 | `ui/src/pages/`, `ui/src/components/` |
| Server (API 응답) | ~200개 | `server/src/routes/`, `server/src/errors.ts` |
| CLI | ~170개 | `cli/src/prompts/`, `cli/src/checks/`, `cli/src/commands/` |
| Shared (상수) | ~20개 | `packages/shared/src/constants.ts` |
| **합계** | **~955개** | |

## 의사결정

**채택**: `i18next` 생태계 사용 (프론트엔드 `react-i18next`, 서버/CLI `i18next`). 하나의 라이브러리로 전 레이어 통일.
**기각**: `react-intl` — 서버/CLI에서 별도 라이브러리 필요. `FormatJS` — 오버엔지니어링.

**채택**: 한국어 단일 로케일 (`ko`). 기본 언어를 `ko`로 설정, 영어 fallback 없음.
**기각**: 다국어 구조 (`ko` + `en` 전환) — 이 프로젝트는 개인 Fork이므로 불필요한 복잡성.

## 파일 변경 목록

### 새로 생성하는 파일

| 파일 경로 | 내용 |
|----------|------|
| `ui/src/i18n/index.ts` | react-i18next 초기화 |
| `ui/src/i18n/ko.json` | 프론트엔드 한국어 번역 (~565 키) |
| `server/src/i18n/index.ts` | 서버 i18next 초기화 |
| `server/src/i18n/ko.json` | 서버 한국어 번역 (~200 키) |
| `cli/src/i18n/index.ts` | CLI i18next 초기화 |
| `cli/src/i18n/ko.json` | CLI 한국어 번역 (~170 키) |
| `packages/shared/src/i18n/ko.json` | 공유 상수 번역 (~20 키) |

### 수정하는 파일

| 파일 경로 | 변경 내용 |
|----------|----------|
| `ui/package.json` | `react-i18next`, `i18next` 의존성 추가 |
| `ui/src/main.tsx` | i18n 초기화 import 추가 |
| `ui/src/pages/*.tsx` (39파일) | 하드코딩 문자열 → `t('key')` 호출로 교체 |
| `ui/src/components/*.tsx` (주요 30파일) | 하드코딩 문자열 → `t('key')` 호출로 교체 |
| `ui/src/components/agent-config-primitives.tsx` | `help`, `adapterLabels`, `roleLabels` → `t()` |
| `ui/src/lib/status-colors.ts` | 상태 라벨 → `t()` |
| `server/package.json` | `i18next` 의존성 추가 |
| `server/src/errors.ts` | 에러 메시지 → `t()` |
| `server/src/routes/*.ts` | API 에러 문자열 → `t()` |
| `cli/package.json` | `i18next` 의존성 추가 |
| `cli/src/prompts/*.ts` | 프롬프트 문자열 → `t()` |
| `cli/src/checks/*.ts` | 진단 메시지 → `t()` |
| `cli/src/commands/*.ts` | 출력 메시지 → `t()` |
| `packages/shared/src/constants.ts` | `AGENT_ROLE_LABELS` 등 → i18n 키 참조 |

## 구현 순서

### Phase 1: i18n 인프라 설정

#### 1-1. 프론트엔드 i18n 설정
- **대상 파일**: `ui/package.json`, `ui/src/i18n/index.ts`, `ui/src/main.tsx`
- `pnpm --filter @paperclipai/ui add react-i18next i18next`
- `ui/src/i18n/index.ts`에서 `i18next.init({ lng: 'ko', resources })` 설정
- `ui/src/main.tsx`에서 `import './i18n'` 추가

#### 1-2. 서버 i18n 설정
- **대상 파일**: `server/package.json`, `server/src/i18n/index.ts`
- `pnpm --filter @paperclipai/server add i18next`
- 서버 부팅 시 `i18next.init({ lng: 'ko' })` 호출

#### 1-3. CLI i18n 설정
- **대상 파일**: `cli/package.json`, `cli/src/i18n/index.ts`
- `pnpm --filter @paperclipai/cli add i18next`
- CLI 엔트리포인트에서 초기화

### Phase 2: 번역 파일 작성 (핵심 UI)

#### 2-1. 공유 상수 번역
- **대상 파일**: `packages/shared/src/i18n/ko.json`
- `AGENT_ROLE_LABELS` → `{ "role.ceo": "대표", "role.cto": "기술이사", ... }`
- 어댑터 라벨, 상태 라벨 포함

#### 2-2. UI 핵심 번역 파일 작성
- **대상 파일**: `ui/src/i18n/ko.json`
- 네임스페이스 구조:
```json
{
  "common": {
    "save": "저장",
    "cancel": "취소",
    "delete": "삭제",
    "edit": "수정",
    "add": "추가",
    "close": "닫기",
    "saving": "저장 중…",
    "deleting": "삭제 중…",
    "loading": "불러오는 중…",
    "search": "검색",
    "filter": "필터",
    "confirm": "확인"
  },
  "nav": {
    "dashboard": "대시보드",
    "agents": "에이전트",
    "issues": "이슈",
    "projects": "프로젝트",
    "goals": "목표",
    "routines": "루틴",
    "inbox": "받은함",
    "skills": "스킬",
    "costs": "비용",
    "activity": "활동",
    "org": "조직도",
    "settings": "설정",
    "approvals": "승인"
  },
  "status": { ... },
  "agent": { ... },
  "issue": { ... },
  "project": { ... },
  "goal": { ... },
  "toast": { ... },
  "empty": { ... },
  "dialog": { ... },
  "form": { ... }
}
```

### Phase 3: UI 컴포넌트 문자열 교체

#### 3-1. 공통 컴포넌트 (집중도 높음)
- **대상 파일**:
  - `ui/src/components/agent-config-primitives.tsx` — `help` 객체 (58개 항목), `adapterLabels`, `roleLabels`
  - `ui/src/lib/status-colors.ts` — 상태 라벨 (40개)
  - `ui/src/components/StatusBadge.tsx`, `StatusIcon.tsx`
- 패턴: `const label = "Save"` → `const label = t('common.save')`

#### 3-2. 페이지 컴포넌트 (39개 파일)
- **대상 파일**: `ui/src/pages/*.tsx`
- 각 페이지에서 `useTranslation()` 훅 사용
- 브레드크럼, 제목, 버튼, 빈 상태, 토스트 메시지 교체
- 우선순위: Dashboard → Agents → Issues → Projects → Goals → 나머지

#### 3-3. 다이얼로그 / 폼 컴포넌트 (30개 파일)
- **대상 파일**: `ui/src/components/New*Dialog.tsx`, `*Form.tsx`, `*Properties.tsx`
- 폼 라벨, placeholder, 유효성 메시지, 다이얼로그 제목 교체

### Phase 4: 서버 문자열 교체

#### 4-1. 에러 응답
- **대상 파일**: `server/src/errors.ts`, `server/src/routes/*.ts`
- `res.status(404).json({ error: "Not found" })` → `res.status(404).json({ error: t('error.notFound') })`

#### 4-2. 서비스 메시지
- **대상 파일**: `server/src/services/*.ts`
- 사용자에게 노출되는 에러 메시지만 교체

### Phase 5: CLI 문자열 교체

#### 5-1. 프롬프트
- **대상 파일**: `cli/src/prompts/*.ts` (database, server, secrets, storage, llm)

#### 5-2. 진단 / 명령어 출력
- **대상 파일**: `cli/src/checks/*.ts`, `cli/src/commands/*.ts`

## 함수/API 시그니처

### 새로 추가하는 함수

```typescript
// ui/src/i18n/index.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ko from './ko.json';

i18n.use(initReactI18next).init({
  resources: { ko: { translation: ko } },
  lng: 'ko',
  interpolation: { escapeValue: false },
}): void;

export default i18n;
```

```typescript
// server/src/i18n/index.ts
import i18n from 'i18next';
import ko from './ko.json';

i18n.init({
  resources: { ko: { translation: ko } },
  lng: 'ko',
  interpolation: { escapeValue: false },
}): void;

export function t(key: string, options?: Record<string, unknown>): string;
export default i18n;
```

### 변경하는 패턴

```typescript
// Before (ui/src/pages/Dashboard.tsx)
setBreadcrumbs([{ label: "Dashboard" }]);

// After
const { t } = useTranslation();
setBreadcrumbs([{ label: t('nav.dashboard') }]);
```

```typescript
// Before (server/src/routes/agents.ts)
res.status(404).json({ error: "Agent not found" });

// After
import { t } from '../i18n/index.js';
res.status(404).json({ error: t('error.agentNotFound') });
```

## 제약 조건

1. **번역 키 네이밍**: `영역.대상.동작` 형태 (예: `agent.config.save`, `error.notFound`)
2. **기존 타입 유지**: 문자열 반환 타입이 바뀌지 않도록 `t()` 반환값은 `string`
3. **플러그인 문자열 제외**: 플러그인이 제공하는 문자열은 플러그인 자체 번역 책임. 호스트 앱만 한글화
4. **테스트**: 기존 테스트가 영어 문자열을 assert하는 경우 한국어로 업데이트
5. **upstream 호환성 포기**: 직접 수정이므로 upstream rebase 시 충돌 발생. 이는 의도된 트레이드오프
6. **번역 일관성**: 같은 개념에 같은 번역어 사용 (예: "issue" → 항상 "이슈", "agent" → 항상 "에이전트")

### 용어 사전 (주요 번역어)

| 영어 | 한국어 | 비고 |
|------|--------|------|
| Agent | 에이전트 | |
| Issue | 이슈 | |
| Project | 프로젝트 | |
| Goal | 목표 | |
| Routine | 루틴 | |
| Skill | 스킬 | |
| Dashboard | 대시보드 | |
| Inbox | 받은함 | |
| Approval | 승인 | |
| Org Chart | 조직도 | |
| Budget | 예산 | |
| Heartbeat | 하트비트 | 도메인 용어 유지 |
| Adapter | 어댑터 | |
| Run | 실행 | |
| Board | 이사회 | 사용자(인간)를 지칭 |
| Company | 회사 | |
| Workspace | 워크스페이스 | |
| Plugin | 플러그인 | |
| Secret | 시크릿 | |
| Governance | 거버넌스 | |
