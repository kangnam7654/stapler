# Workspace Folder Configuration (Company → Project)

> Design doc — V1 산출물 폴더 명시적 지정 기능. 보드 사용자가 회사/프로젝트 단위로
> agent 산출물(코드, 파일) 저장 경로를 직접 지정하고 UI에서 OS 도구로 바로 접근.

## 1. Purpose

현재 Stapler는 agent가 작업한 산출물(예: 사용자가 만든 계산기 코드)이 자동 생성된 cwd
경로(`~/.paperclip/instances/...` 같은 숨겨진 위치)에 저장되어 사용자 입장에서:

- 어디 저장되는지 알기 어렵고
- 자동 경로가 마음에 들지 않으며
- UI에서 그 폴더로 바로 가는 동선이 없음

이 기능은 **보드 사용자가 회사 단위로 산출물 루트 폴더를 명시 지정**하고, 필요 시
**프로젝트 단위로 override**하며, **현재 사용 중인 절대 경로를 UI에 항상 표시**하고,
**Finder/IDE/클립보드 바로가기**를 제공한다.

## 2. Scope

### In scope (V1)

- `companies.workspace_root_path` (text, nullable) 컬럼 추가
- `projects.workspace_path_override` (text, nullable) 컬럼 추가
- 회사 → 프로젝트 → 시스템 default 순 fallback resolver
- 회사 설정 / 프로젝트 상세 페이지 UI
- 바로가기 액션: Finder 열기, 경로 복사, VS Code 열기
- Heartbeat에서 resolved cwd 주입 (adapter cwd 미지정 시)
- macOS / Linux 우선 지원

### Out of scope (V1 미포함)

- 이슈 단위 override (현재 사용 패턴상 불필요 — YAGNI)
- Windows 경로 정규화
- 폴더 권한/안전성 검증
- 폴더 이동/마이그레이션 도구
- IDE 사용자 선택 (V1은 VS Code 고정)
- 기존 `project_workspaces` / `execution_workspaces` 시스템과의 통합 (multi-workspace
  고급 기능은 별도 시스템으로 유지)

## 3. 사용자 시나리오

1. **회사 default 설정**: 보드가 새 회사 만들 때 "산출물 폴더"에 `~/work/acme` 입력
   → 그 회사의 모든 프로젝트가 `~/work/acme/<project-slug>` 하위에 생성
2. **프로젝트 override**: 보드가 외부 기존 repo (`~/dev/legacy-app`)를 한 프로젝트에
   연결하고 싶을 때 → 프로젝트 상세에서 override 입력
3. **빈 값 fallback**: 회사 폴더 비워두면 `~/Stapler/<company-slug>` 자동 사용,
   UI에는 항상 actual 절대 경로가 보임
4. **바로가기**: 회사 설정/프로젝트 상세에서 폴더 옆 아이콘 클릭 → Finder 열림 /
   경로 클립보드 복사 / VS Code에서 열기

## 4. 데이터 모델

### 4.1 Schema 변경

```diff
// packages/db/src/schema/companies.ts
companies {
  ...
+ workspaceRootPath: text("workspace_root_path"), // nullable
}

// packages/db/src/schema/projects.ts
projects {
  ...
+ workspacePathOverride: text("workspace_path_override"), // nullable
}
```

### 4.2 제약

- 두 컬럼 모두 nullable
- 빈 문자열은 NULL로 정규화 (validator에서 처리)
- 절대 경로만 허용: `/...` 또는 `~/...` (상대 경로는 422 에러)
- 길이 ≤ 1024
- 인덱스 추가 없음 (조회 쿼리 패턴 없음)

### 4.3 Migration

- `pnpm db:generate`로 신규 마이그레이션 1개 생성
- 기존 row는 NULL로 시작 → resolver fallback으로 system default 적용
- 기존 task 동작 변화 없음 (cwd가 명시되어 있던 task는 그대로)

## 5. Resolution

### 5.1 Resolver 시그니처

```ts
// packages/shared/src/workspace-path/resolve.ts
export interface ResolveProjectWorkspacePathInput {
  companySlug: string;
  projectSlug: string;
  companyRootPath: string | null;
  projectPathOverride: string | null;
  systemDefaultRoot: string;
}

export interface ResolvedProjectWorkspacePath {
  resolvedAbsolutePath: string;
  source: "project_override" | "company_root" | "system_default";
}

export function resolveProjectWorkspacePath(
  input: ResolveProjectWorkspacePathInput
): ResolvedProjectWorkspacePath;
```

### 5.2 Fallback chain

| 우선순위 | 조건 | 결과 |
|---|---|---|
| 1 | `projectPathOverride` non-null | 그 값 (normalize: `~` 확장, trailing slash 제거) |
| 2 | `companyRootPath` non-null | `<companyRootPath>/<projectSlug>` |
| 3 | (위 둘 다 null) | `<systemDefaultRoot>/<companySlug>/<projectSlug>` |

### 5.3 `systemDefaultRoot`

- env `STAPLER_WORKSPACE_ROOT` 우선 사용
- 없으면 `~/Stapler` (`os.homedir() + "/Stapler"`)
- 숨겨진 경로 (`~/.paperclip/...`) 사용 안 함 — 사용자 발견성이 핵심 요구사항

### 5.4 Slug 변환

`packages/shared/src/workspace-path/slug.ts`:

```ts
export function toWorkspaceSlug(name: string): string;
```

- ASCII alphanumeric + `-`만 허용, kebab-case
- 소문자화, 공백 → `-`, 비ASCII 문자는 제거
- 결과가 빈 문자열이면 (예: 한국어 이름 "디자인팀") name의 short SHA-256 hash 8자리
  사용 (`company-a3f9c1b2`)
- 함수는 결정적 변환만 수행 — 같은 name은 항상 같은 slug 반환
- 슬러그 충돌(같은 회사 내 두 프로젝트 이름이 같은 slug로 매핑되는 경우)은 본 spec
  범위 밖. 회사 내 프로젝트명 uniqueness 제약은 기존 시스템 가정에 따름. 충돌 발생
  시 두 프로젝트가 같은 폴더를 가리키게 되며, 이는 별도 이슈로 트래킹

### 5.5 예시

| company.root | project.override | company name | project name | 결과 | source |
|---|---|---|---|---|---|
| `~/work/acme` | NULL | Acme Corp | Calculator | `~/work/acme/calculator` | company_root |
| `~/work/acme` | `~/dev/legacy-app` | Acme Corp | Legacy | `~/dev/legacy-app` | project_override |
| NULL | NULL | Acme Corp | Calculator | `~/Stapler/acme-corp/calculator` | system_default |
| NULL | NULL | 디자인팀 | 캘린더 | `~/Stapler/company-a3f9c1b2/project-7d2e4f8a` | system_default |

## 6. Heartbeat 통합

`server/src/services/heartbeat.ts`의 workspace policy 적용 단계
([SPEC-implementation.md:1013](../SPEC-implementation.md#L1013)):

- adapter config의 `cwd`가 비어있을 때 `resolveProjectWorkspacePath` 결과 주입
- `cwd`가 명시되어 있으면 그대로 (개별 issue/adapter override 우선)
- Resolver 호출은 secrets 해석 *전*에 수행 (현재 순서 유지)
- Task 시작 직전 폴더 부재 시 `mkdir -p` 자동 실행. 권한 에러는 task error로 표면화

## 7. API 변경

### 7.1 기존 엔드포인트 확장

| Method | Path | 변경 |
|---|---|---|
| POST | `/api/companies` | body에 `workspaceRootPath?: string \| null` |
| PATCH | `/api/companies/:id` | body에 `workspaceRootPath?: string \| null` |
| POST | `/api/companies/:companyId/projects` | body에 `workspacePathOverride?: string \| null` |
| PATCH | `/api/projects/:id` | body에 `workspacePathOverride?: string \| null` |
| GET | `/api/companies/:id` | response에 `workspaceRootPath` 포함 |
| GET | `/api/projects/:id` | response에 `workspacePathOverride` 포함 |

### 7.2 신규 엔드포인트

```
GET /api/projects/:id/workspace-path
→ 200 { resolvedAbsolutePath: string, source: "..." }
→ 404 (project not found / 회사 권한 밖)
```

UI에서 readonly로 표시할 actual 절대 경로 조회용. 서버에서 resolver 호출 결과 그대로
반환 (mkdir 안 함, 폴더 존재 여부 검사도 안 함 — 표시 전용).

### 7.3 Validator (zod)

`packages/shared/src/validators/index.ts`:

```ts
export const workspacePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .regex(/^(\/|~\/)/, "절대 경로(/... 또는 ~/...) 만 허용")
  .nullable()
  .transform((v) => (v?.trim() === "" ? null : v));
```

422로 거부 케이스: 상대 경로, 길이 초과, 빈 문자열 후 정규화 결과도 빈값.

## 8. UI

### 8.1 `ui/src/pages/CompanySettings.tsx`

기존 페이지에 새 카드 섹션 추가:

```
┌─ 산출물 폴더 (회사 default) ─────────────┐
│ [경로 입력 한 줄]                          │
│ 비워두면 ~/Stapler/<회사-slug> 사용       │
│ 현재 default: <resolvedAbsolutePath>      │
│ [📁 Finder] [📋 복사] [▶️ VS Code]        │
└──────────────────────────────────────────┘
```

- 입력 변경 시 debounce 후 PATCH
- 저장 성공 시 toast
- 422 응답 시 입력 아래 inline error
- "현재 default"는 `GET /companies/:id`의 `workspaceRootPath` 또는 비어있을 때 fallback
  계산 결과 (서버에서 함께 내려도 되고, UI에서 동일 resolver 호출도 가능 — 후자가 단순)

### 8.2 `ui/src/pages/ProjectDetail.tsx`

새 카드 섹션:

```
┌─ 산출물 폴더 (override) ─────────────────┐
│ [경로 입력 한 줄]                          │
│ 비워두면 회사 default 사용                 │
│ 현재 사용 경로: <resolvedAbsolutePath>    │
│ source: company_root | project_override   │
│ [📁 Finder] [📋 복사] [▶️ VS Code]        │
└──────────────────────────────────────────┘
```

- "현재 사용 경로"는 `GET /projects/:id/workspace-path` 호출 결과
- override 입력 변경 후 저장하면 위 readonly 라인 갱신

### 8.3 `ui/src/components/WorkspacePathActions.tsx` (신규)

재사용 컴포넌트:

```tsx
<WorkspacePathActions
  absolutePath={resolvedAbsolutePath}
  isDesktop={runtimeContext.isDesktop}
/>
```

- 아이콘 3개 가로 배치
- 웹 모드(`!isDesktop`): Finder/IDE 비활성 (tooltip "Desktop 앱에서만 동작"), 복사만 활성
- Desktop 모드: Tauri `invoke()` 호출

`isDesktop` 판정: 신규 파일 `ui/src/runtime/desktop.ts`:
```ts
export const isDesktop = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
```

### 8.4 DesignGuide 등록

신규 컴포넌트 `WorkspacePathActions`는 `ui/src/pages/DesignGuide.tsx`에 변형(desktop/web,
빈 경로/긴 경로) 케이스로 등록 (project CLAUDE.md §12.3 요구사항).

## 9. Desktop Integration (Tauri v2)

Stapler desktop은 **Tauri v2 (Rust)** 기반 (Electron 아님).

`desktop/src/workspace_commands.rs` (신규):

```rust
use std::path::PathBuf;
use std::process::Command;
use tauri::command;

fn expand_tilde(p: &str) -> PathBuf {
    if let Some(stripped) = p.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(p)
}

fn ensure_dir(p: &PathBuf) -> Result<(), String> {
    std::fs::create_dir_all(p).map_err(|e| e.to_string())
}

#[command]
pub fn workspace_open_finder(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    let cmd = if cfg!(target_os = "macos") { "open" }
              else if cfg!(target_os = "windows") { "explorer" }
              else { "xdg-open" };
    Command::new(cmd).arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[command]
pub fn workspace_open_ide(abs_path: String) -> Result<(), String> {
    let path = expand_tilde(&abs_path);
    ensure_dir(&path)?;
    Command::new("code").arg(&path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}
```

`desktop/src/lib.rs`의 `tauri::generate_handler![...]`에 두 command 등록.

Frontend 호출:
```ts
import { invoke } from "@tauri-apps/api/core";
await invoke("workspace_open_finder", { absPath: "/path" });
```

복사 액션은 양쪽 모드 동일하게 `navigator.clipboard.writeText` 직접 호출 — Tauri command 불필요.

`Cargo.toml`에 `dirs = "5"` 의존성 추가 필요.

## 10. 폴더 자동 생성 정책

- 사용자가 회사/프로젝트 폴더 path 저장 시: 검증만, mkdir 안 함
- Heartbeat에서 task 시작 직전 (cwd 사용 직전): `mkdir -p` 자동 실행
- 바로가기 액션 (Finder/IDE) 호출 시: `mkdir -p` 자동 실행 (열려는데 없으면 만들어줌)
- mkdir 실패는 task error 또는 toast로 표면화

## 11. 테스트

### Unit (`packages/shared`)
- `resolveProjectWorkspacePath` — 모든 fallback 케이스 (override / company / system / 한국어 이름)
- `toWorkspaceSlug` — ASCII / 한국어 / 빈 결과 / 충돌 (충돌은 호출자 책임이지만 결정성 검증)
- `workspacePathSchema` — 절대/상대/빈문자/길이초과

### Integration (`server/`, PGlite 실제 DB)
- PATCH `/companies/:id` — `workspaceRootPath` 저장/조회
- PATCH `/projects/:id` — `workspacePathOverride` 저장/조회
- 422 케이스 (상대 경로, 길이 초과)
- GET `/projects/:id/workspace-path` — 3가지 source별 응답
- Heartbeat resolver 통합 — adapter cwd 미지정 시 주입 확인

### UI (vitest + @testing-library)
- `WorkspacePathActions` — 웹/Desktop 모드별 버튼 활성 상태
- CompanySettings / ProjectDetail 입력 → save → resolved path 갱신

### E2E (Playwright)
- 회사 생성 → 산출물 폴더 입력 → 저장 → 프로젝트 생성 → 프로젝트 상세에서 resolved path가 `<회사 폴더>/<프로젝트 slug>` 인지 확인
- 프로젝트 override 입력 → resolved path가 override 값으로 변경되는지 확인
- 바로가기 복사 버튼 클릭 → 클립보드 검증

## 12. File Changes 요약

| 파일 | 변경 |
|---|---|
| `packages/db/src/schema/companies.ts` | `workspaceRootPath` 컬럼 추가 |
| `packages/db/src/schema/projects.ts` | `workspacePathOverride` 컬럼 추가 |
| `packages/db/src/migrations/00XX_*.sql` | 신규 마이그레이션 (drizzle generate) |
| `packages/shared/src/workspace-path/resolve.ts` | resolver 신규 |
| `packages/shared/src/workspace-path/slug.ts` | slug 변환 신규 |
| `packages/shared/src/workspace-path/index.ts` | 배럴 export |
| `packages/shared/src/types/index.ts` | type re-export |
| `packages/shared/src/validators/index.ts` | `workspacePathSchema` 추가 |
| `server/src/routes/companies.ts` | POST/PATCH body 확장 |
| `server/src/routes/projects.ts` | POST/PATCH body 확장, GET workspace-path 신규 |
| `server/src/services/heartbeat.ts` | resolver 통합 (cwd 미지정 시 주입) |
| `ui/src/api/companies.ts` | API 클라이언트에 새 필드 |
| `ui/src/api/projects.ts` | API 클라이언트에 새 필드 + workspace-path 호출 |
| `ui/src/pages/CompanySettings.tsx` | 폴더 섹션 추가 |
| `ui/src/pages/ProjectDetail.tsx` | 폴더 섹션 추가 |
| `ui/src/components/WorkspacePathActions.tsx` | 신규 |
| `ui/src/pages/DesignGuide.tsx` | 새 컴포넌트 등록 |
| `desktop/src/workspace_commands.rs` | Tauri commands (open_finder, open_ide) |
| `desktop/src/lib.rs` | invoke_handler에 새 commands 등록 |
| `desktop/Cargo.toml` | `dirs` crate 의존성 추가 |
| `ui/src/runtime/desktop.ts` | `isDesktop()` helper 신규 |
| `doc/SPEC-implementation.md` | §6.2/§7.5에 컬럼 추가 + §10에 신규 endpoint 명시 |

## 13. Implementation Order

1. **DB layer** — 스키마 컬럼 추가, migration 생성, typecheck
2. **Shared layer** — resolver, slug, validator, types, unit test
3. **Server layer** — API 확장, GET workspace-path, integration test
4. **Heartbeat 통합** — cwd 주입, integration test
5. **Desktop Tauri commands** — `workspace_commands.rs` + `lib.rs` 등록 + `isDesktop()` helper
6. **UI** — `WorkspacePathActions` 컴포넌트, CompanySettings/ProjectDetail 섹션, DesignGuide 등록
7. **E2E** — Playwright 시나리오
8. **SPEC-implementation.md** 업데이트

## 14. Decision Log

| # | 결정 | 사유 |
|---|---|---|
| D1 | 상속 모델: 회사 → 프로젝트 (이슈 미포함) | 사용자 워크플로우상 이슈마다 다른 폴더 사용 패턴이 없음 (YAGNI) |
| D2 | 프로젝트 path는 회사 base 외부도 허용 | 외부 기존 repo 연결 시나리오 |
| D3 | 회사 path는 선택 입력, default `~/Stapler/<company-slug>` | 발견성 있는 사용자 폴더 사용, 숨겨진 경로 회피 |
| D4 | 바로가기 3종 (Finder/Copy/IDE) | 사용자 명시 요구 |
| D5 | 새 컬럼 추가 (Approach 1) | 사용자 멘탈 모델과 1:1 매핑, jsonb 숨김 회피 |
| D6 | IDE는 V1에서 VS Code 고정 | 사용자 선택 옵션은 V2로 미룸 (YAGNI) |
| D7 | `project_workspaces` 통합 안 함 | 별개 multi-workspace 고급 기능, 이번 단순 UX와 컨셉 다름 |
| D8 | mkdir은 task 시작 직전 + 바로가기 시점에만 | 저장 시 부수효과 회피 |
