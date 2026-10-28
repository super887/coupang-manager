# 아르곤 작업 지시서 — coupang-manager 정합성 / 보안 / 안정화

> 이 문서를 위에서부터 순서대로 수행하세요. 모든 결정 사항은 사용자와 이미 합의된 내용입니다.

## 0. 프로젝트 배경 (먼저 읽기)

- 스택: Next.js 16.4 (App Router), React 19, Prisma 5.19, PostgreSQL(Supabase **서울**), Tailwind 4, Vercel(**서울 icn1**) 배포.
- **[AGENTS.md](./AGENTS.md) 규칙 준수**: 이 Next.js는 학습 데이터와 다릅니다. 코드를 쓰기 전에 `node_modules/next/dist/docs/` 의 관련 문서를 읽으세요. (특히 `middleware.ts` 컨벤션이 16에서 바뀌었는지 — `proxy` 로 이름이 바뀌었을 수 있음 — 반드시 확인)
- 서비스 성격: 쿠팡 리뷰 체험 구매 내역 관리 + Gemini 리뷰 자동 생성. 사용자는 **본인 + 지인 몇 명(DB에 유저 7명)**. 실사용 데이터가 있습니다(purchase 1,000건 이상).
- DB/서버를 한국으로 이전하여 속도는 이미 개선됨. **성능 구조(서버 컴포넌트는 껍데기, 클라이언트 래퍼가 서버 액션으로 데이터 로드)는 유지**합니다.
- 보안 수준: "세션 위조 방지 + 다른 유저 데이터 접근 차단 + 관리자 최소 보안". 정식 SaaS 수준(결제, 이메일 인증 등)은 범위 밖.

## 1. 작업 규칙 (중요)

1. **한 번에 전부 수정하고, 커밋은 1개**로 끝냅니다. 커밋 메시지는 한글 가능. **push 는 하지 마세요**(사용자가 직접 push).
2. 기존 주석/문서 중 변경 코드와 무관한 것은 **보존**하세요. 새 코드에는 한글 주석을 적당히 추가.
3. **파일 인코딩: UTF-8 (BOM 없음), 기존 줄바꿈(CRLF) 유지.** PowerShell `Set-Content`/리다이렉션으로 한글이 포함된 파일을 쓰면 인코딩이 깨집니다(실제로 발생). 편집 도구나 UTF-8 안전한 방법만 사용하고, 수정 후 `git diff` 로 한글 깨짐이 없는지 확인하세요.
4. 마지막에 `npx tsc --noEmit`, `npm run lint`, `npm run build` 가 모두 통과해야 합니다.
5. 비밀값(DB 주소, 키, 비번)을 코드/로그/커밋에 넣지 마세요.
6. 기존 데이터(purchase, accountInfo, sellerInfo 등)는 **절대 삭제/변형 금지**. 스키마 변경은 추가(인덱스 등)만 허용하며, 실제 DB 반영은 사용자 확인 후 `prisma db push`.

---

## 2. 보안 (우선순위 순)

### 2-1. 세션을 서명된 JWT로 교체 (합의: 전원 한 번 재로그인 허용)
- 현재: `userId` 쿠키가 서명 없는 평문 uuid + `httpOnly` 아님 → 위조 가능.
- 변경: `jose`(이미 설치됨)로 JWT 발급/검증. 비밀키는 `SESSION_SECRET` 환경변수.
  - 쿠키 옵션: `httpOnly: true`, `secure: production`, `sameSite: 'lax'`, `path: '/'`, `maxAge: 7일`.
  - `lib/session.ts`: `createSession(userId)`, `verifySession()`(서명 검증, **매 요청 DB 조회 제거** — 단, 2-3 의 차단 유저 처리는 고려), `destroySession()`.
  - `auth.ts` 의 `signup`/`login`/`logout` 이 이를 사용. 기존 `userId` 평문 쿠키는 더 이상 읽지 말고 로그아웃 시 삭제만.
  - `middleware`(또는 proxy)도 JWT 서명을 검증해서 보호 라우트 판단. (jose 는 Edge 런타임 호환)
- `.env` 의 `SESSION_SECRET` 값은 현재 **예시용 문자열**입니다. 32바이트 이상 랜덤값으로 교체하도록 사용자에게 안내(Vercel 환경변수에도 설정 필요 — 배포 체크리스트에 기재).

### 2-2. 관리자(/admin) 보안 (합의: 환경변수 + 서명 토큰 + 액션마다 검증)
- 현재: `admin` / `194826` 하드코딩, 쿠키 `adminToken` 은 고정 문자열이며 middleware 는 **쿠키 존재 여부만** 확인, `getAdminDashboardData` / `updateUserRole` 서버 액션은 인증 없음.
- 변경:
  - 자격증명은 환경변수 `ADMIN_ID`, `ADMIN_PASSWORD` 로 이동. **사용자 결정: 비밀번호 값은 기존 `194826` 그대로 사용**(코드에서만 제거하고 값은 env 로). 이 비번은 이미 git 히스토리에 노출됐으므로 약하다는 점을 최종 보고에 한 줄 경고로 남기세요. 비교는 `crypto.timingSafeEqual` 사용.
  - 관리자 토큰도 JWT(`role: 'admin'` 클레임, 만료 24h)로 발급/검증.
  - `getAdminDashboardData`, `updateUserRole` **함수 맨 앞에서 관리자 토큰을 검증**하고 실패 시 throw. middleware 의 검사는 보조 수단일 뿐입니다.
  - 관리자 화면은 **`geminiApiKey` 를 조회하지 않도록** (`hasApiKey` 계산용으로만 select 하더라도 클라이언트로 내려가지 않게 현 구현 유지 확인).
  - `updateUserRole` 의 `newRole` 은 허용 값(예: `'user' | 'admin' | 'blocked'` — 현재 admin 페이지 UI 에서 쓰는 값을 확인해서 정리) 화이트리스트 검증.

### 2-3. 차단(블랙리스트) 유저 실제 적용
- 현재 `updateUserRole` 로 role 을 바꿔도 `login`/`verifySession` 이 role 을 **전혀 확인하지 않음** → 정지 기능이 동작하지 않을 가능성. 확인 후 수정:
  - 차단 role 유저는 로그인 거부.
  - JWT 만료 전 차단을 반영해야 한다면 `verifySession` 에서 role 조회를 하되 비용을 고려해 **짧은 TTL 메모리 캐시** 또는 JWT 짧은 만료 중 택1 (선택은 아르곤 판단, 최종 보고에 이유 한 줄).

### 2-4. 소유자 검증 / 입력 검증
- `duplicatePurchase(id)`: 세션 확인이 없고 소유자도 확인하지 않음 → **세션 필수 + `where: { id, userId }`** 로 조회. 현재 `try/catch` 가 원인을 삼키므로 에러 메시지 구분.
- `updatePurchase` / `updateAccount` / `updateSeller`: `data: any` 를 그대로 DB에 반영(mass assignment). **필드 화이트리스트**(스키마 필드 중 편집 가능한 것만)와 타입 변환(`price` 정수, boolean 등) 적용. 가능하면 zod 대신 가벼운 수동 검증(의존성 추가 최소화).
- `getPaginatedPurchases`: `searchField` 를 `where[searchField]` 로 그대로 사용 → **허용 필드 화이트리스트**(예: productName, chatRoomName, accountHolder, paybackName, contactOnBangpok, purchaseDate, price 등 UI 에 실제 존재하는 것). `pageSize`/`page` 상·하한 클램프.
- `deletePurchases(ids)`: ids 배열 길이 상한.

### 2-5. 로그인/가입 로직
- **레거시 "비밀번호 없는 계정은 첫 로그인 비번으로 영구 저장" 로직 삭제** (합의). 점검 결과 현재 DB 7명 모두 비밀번호가 설정돼 있어 안전하게 제거 가능. `password` 가 비어 있는 계정은 로그인 거부(에러 문구: 관리자에게 문의).
- 가입 시 비밀번호 최소 길이(8자 이상), 전화번호 형식 정규화(숫자만, 하이픈 제거 후 저장/조회 일관성). **기존 DB 의 phone 저장 형식을 먼저 확인**(하이픈 포함 여부)하고 호환되게 처리 — 기존 유저가 로그인 못 하게 되면 안 됩니다.
- 로그인 시도 제한: 간단한 인메모리 레이트리밋(IP+phone 기준, 예: 10분 5회)만. (서버리스라 완벽하지 않음을 주석으로 명시)
- 로그인 에러 메시지는 "가입되지 않은 전화번호" / "비밀번호 불일치" 를 구분하지 말고 통일(계정 존재 여부 노출 방지).

### 2-6. Gemini API 키 (합의: AES-256-GCM 암호화 저장)
- 환경변수 `ENCRYPTION_KEY`(32바이트, base64 또는 hex) 신규. `lib/crypto.ts` 에 `encrypt()`/`decrypt()` (IV 랜덤, authTag 포함, `iv:tag:cipher` 포맷).
- 저장 시 암호화(`updateApiSettings`, `updateGeminiKey`, `/api/user/settings`), 사용 시 복호화(`ai.ts`).
- **API 키 저장 경로가 3곳 중복**(`actions/user.ts#updateGeminiKey`, `actions/info.ts#updateApiSettings`, `api/user/settings/route.ts`) → 실제 사용처를 `ApiKeyForm` 등에서 확인하고 **하나만 남기고 나머지 삭제**.
- 기존 평문 키 일괄 암호화용 1회성 스크립트 `scripts/encrypt-existing-keys.mjs` 작성 (이미 암호화된 값은 건너뛰도록 포맷 판별, 재실행 안전). **실행은 하지 말고** 사용법만 최종 보고에 안내(사용자가 배포 직전에 실행).
- Gemini 호출 시 키를 URL 쿼리(`?key=`) 대신 `x-goog-api-key` 헤더로 전달.

### 2-7. Supabase / 인프라 노출 점검 (코드 외, 문서화만)
- 새/기존 Supabase 프로젝트에서 **Data API(PostgREST)가 켜져 있으면 publishable(anon) 키로 테이블 접근이 가능**합니다. Prisma 는 `postgres` 롤로 접속해 RLS 를 우회하므로, **모든 public 테이블에 RLS 활성화(정책 없음 = anon 접근 전면 차단)** 하는 SQL 을 `docs/enable-rls.sql` 로 작성해 사용자가 Supabase SQL Editor 에서 실행하게 하세요. (`User`, `Purchase`, `AccountInfo`, `SellerInfo`, `_prisma_migrations` 포함 여부 확인)
- 진단용 `app/api/check-health/route.ts`: 배포 확인용 임시 엔드포인트입니다. **삭제**하세요(DB 호스트/버전 노출).

---

## 3. 코드 정합성 / 버그

### 3-1. 날짜/시간대 (KST)
- `addPurchase` 는 이미 KST 로 수정됨(`Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' })`). 같은 문제가 남은 곳을 **전수 검색**(`toISOString`, `new Date()`, `toLocaleDateString`, 엑셀 다운로드/통계의 날짜 그룹핑, `admin.ts` 의 `createdAt.toISOString().split('T')[0]` 등)해서 KST 기준으로 통일. 공통 유틸 `lib/date.ts`(예: `todayKST()`, `formatKST()`) 로 모으세요.
- 서버(Vercel UTC) / 로컬 / 브라우저 어디서 실행돼도 같은 결과여야 합니다.

### 3-2. 라우트 보호 / 미들웨어
- `protectedRoutes` 가 `['/dashboard']` 뿐 → `/accounts`, `/stats` 누락(페이지 안에서 `redirect` 로 막고는 있으나 일관성 부족). 보호 대상을 일원화.
- 로그인한 유저가 `/`, `/login` 접근 시 `/dashboard` 로 보내는 로직 유지, 단 JWT 검증 기반으로.
- `middleware.ts` 한글 주석이 인코딩 깨져 있음(`?꾧뎄??` 등) → UTF-8 로 복구해서 다시 작성.
- Next 16 의 middleware/proxy 컨벤션을 문서로 확인하고 맞게 적용(파일명 변경 필요 시 수행).

### 3-3. next.config / 빌드 안전장치
- `typescript.ignoreBuildErrors: true`, `eslint.ignoreDuringBuilds: true` 로 오류를 숨기고 있고, `eslint` 키는 현재 `NextConfig` 타입에 **존재하지 않아 `tsc` 오류(TS2353)** 가 납니다. 주석도 인코딩이 깨져 있음. → 두 옵션 제거, 드러나는 타입/린트 오류를 **전부 수정**. 오류가 너무 많아 `any` 남발로 우회해야 하는 곳은 최소 범위로 `// TODO` 와 함께 허용하고 최종 보고에 목록화.
- `.eslint` 규칙 위반 중 실제 버그 가능성(react-hooks/exhaustive-deps 등)은 우선 수정.

### 3-4. AI 리뷰 생성 (`actions/ai.ts`)
- `data.candidates[0].content.parts[0].text` 방어 없이 접근 → 안전 필터/빈 응답 시 크래시. optional chaining + 명확한 에러 메시지.
- 사용 중인 모델명 `gemini-3.5-flash-lite` 가 유효한지 Google 공식 문서/모델 목록으로 **확인**하고, 모델명은 상수/환경변수로 분리. 유효하지 않으면 사용자에게 보고(임의로 바꾸지 말고 후보 제시).
- fetch 타임아웃(AbortController, 예: 30s), 429/쿼터 에러 메시지 한글화.
- `maxDuration` 설정이 필요한지 확인(서버 액션이 속한 페이지에 설정돼 있음).
- 일괄 생성(`PurchaseTable` 의 bulk)에서 동시성/취소/실패 처리 점검.
- 사용하지 않는 `revalidatePath` import 정리, 필요 없는 `revalidatePath('/')` 호출 제거(클라이언트 상태로 갱신 중이면).

### 3-4b. 데이터 로딩 / 쿼리
- `getStatsData`: 사용자 전체 구매 내역을 **제한 없이** 로드. 현재 1,000건 규모에서 문제는 없으나, 통계/엑셀에 필요한 컬럼만 select, 필요 시 서버에서 집계. 엑셀 다운로드는 전체 필요 → 유지하되 select 최적화.
- `addPurchase`: `$transaction` 으로 create 5번 → `createManyAndReturn`(Prisma 5.14+) 한 번으로 축소해 왕복 감소(5행 추가 동작은 **유지**). 반환값(row.id 목록)을 `PurchaseTable.handleAddRow` 가 사용 중이므로 호환 확인.
- `duplicatePurchase` 의 `createdAt + 1000ms` 꼼수(정렬 위치 유지용) 의도를 주석으로 남기고 유지(동작 변경 금지).
- `getDashboardData` 의 쿼리 2번(user, accountInfo)은 `Promise.all` 병렬화.
- 인덱스 추가 제안: `Purchase @@index([userId, createdAt])` (목록 정렬/페이징), 필요 시 완료탭 필터용 복합 인덱스. `schema.prisma` 수정 후 **`prisma db push` 는 하지 말고** 사용자 확인 대기.
- `prisma.ts` 를 점검: 서버리스 + pgbouncer 환경에서 연결 수 관리(`connection_limit=1` 을 DATABASE_URL 가이드에 포함할지 검토). 현재 `DATABASE_URL` 은 Supabase **Transaction pooler(6543, `?pgbouncer=true`)**. 마이그레이션/`db push` 에는 Session pooler(5432) 필요 → `directUrl` (`DIRECT_URL`) 도입을 `schema.prisma` 에 반영하고 `.env.example` 에 설명.

### 3-5. 클라이언트 캐시(localStorage) 일관화 (합의: 구조 유지 + 공통 훅으로 통일)
- 현재 `DashboardClientWrapper`, `AccountsClientWrapper`, `StatsClientWrapper` 등이 각자 다르게 localStorage 캐시 + 서버 동기화를 구현(일부 페이지는 붙어 있고 일부는 없음).
- 공통 훅 예: `useCachedData(key, fetcher)` — "캐시 즉시 표시 → 서버 최신으로 갱신 → 캐시 저장" 패턴. 모든 래퍼가 이를 사용.
- **캐시 키에 userId(또는 세션 식별자)를 포함**하거나, **로그아웃/로그인 시 캐시 전체 삭제**. (공용 PC/계정 전환 시 다른 사람의 데이터가 보이는 문제 방지 — 현재 `optimistic_dashboard` 키는 사용자 구분이 없음)
- 낙관적 업데이트(체크박스, 셀 수정)는 실패 시 롤백 + 사용자 알림을 일관되게. `alert('추가 실패')` 같은 단발 처리는 공통 토스트/에러 처리로 통일(간단하게 구현).
- `PurchaseTable.tsx`(약 550줄, `any` 다수)에서 `useEffect` 의존성 누락(`fetchData`), `hideSpinner`/`isLoading` 상태 꼬임 가능성, race condition(빠르게 탭/페이지 전환 시 이전 응답이 나중에 도착) 점검 및 수정(요청 id/취소 토큰).
- 이 파일은 **기능 회귀 위험이 큼**: 대규모 리팩터링(분할)은 하지 말고, 버그 수정과 훅 적용 위주. 분할은 하더라도 UI/동작 변화 없이.

### 3-6. 정적 자산 / UI 잔정리
- `DashboardClientWrapper` 의 **base64 이미지 인라인**(쿠팡/네이버 아이콘) → `public/` 파일로 이동해 `next/image` 또는 `<img src="/...">` 사용(번들 크기 감소).
- 외부 이미지 URL(카카오 blog CDN **서명 URL — `expires` 로 만료됨**, namu.wiki)은 곧 깨짐 → 가능하면 `public/` 에 저장(라이선스 문제 있으면 이니셜/이모지 대체) 후 교체.
- `app/layout.tsx`: `lang="ko"`, metadata(title/description) 확인.
- 랜딩 페이지(`app/page.tsx`)의 "지금 무료로 시작하기" 등 SaaS 문구는 현재 서비스 성격과 맞는지 **그대로 두기**(범위 밖), 단 링크가 `/dashboard` 로 가는데 비로그인 시 middleware 가 `/login` 으로 보내므로 동작은 정상인지만 확인.
- `app/loading.tsx` 의 전역 오버레이 로딩과 각 페이지 자체 로딩 UI 가 겹쳐 깜빡이는지 확인(페이지 전환 체감 속도에 영향).

### 3-7. 기타 정리
- `@prisma/client` 가 `devDependencies` 에 있음 → `dependencies` 로 이동(`package.json`, lock 갱신).
- 불필요/미사용 의존성 점검: `@tailwindcss/turbopack`(존재하지 않는 패키지일 가능성), `tailwindcss-animate`(Tailwind 4 와 호환/실사용 여부).
- `app/actions/*.ts` 의 미사용 import/함수, 죽은 코드(예: `revalidatePath('/')`) 정리. **동작 불변** 원칙.
- `scripts/migrate-db.mjs`, `.env.migrate`, `.env.bak-old`: DB 이전용 임시 파일. **삭제**(단 `.env*` 는 gitignore 대상이라 커밋엔 영향 없음, `scripts/` 는 커밋 대상이므로 `migrate-db.mjs` 는 삭제). `.env.migrate`/`.env.bak-old` 는 사용자 로컬 파일이므로 삭제 후 보고.
- `README.md` 를 실제 프로젝트 설명으로 교체: 개요, 환경변수 목록(`DATABASE_URL`, `DIRECT_URL`, `SESSION_SECRET`, `ENCRYPTION_KEY`, `ADMIN_ID`, `ADMIN_PASSWORD`), 개발/빌드/배포(Vercel 서울 리전, Supabase 서울) 방법.
- `.env.example` 신규 작성(값은 비워둠).

---

## 4. 사용자가 직접 해야 하는 배포 체크리스트 (최종 보고에 포함)

1. **Supabase 새 DB 비밀번호 재설정**(이전 대화에서 채팅에 노출됨) → Vercel/로컬 `.env` 의 `DATABASE_URL`, `DIRECT_URL` 갱신.
2. Vercel 환경변수 추가/교체: `SESSION_SECRET`(32바이트+ 랜덤), `ENCRYPTION_KEY`, `ADMIN_ID`, `ADMIN_PASSWORD`, `DATABASE_URL`, `DIRECT_URL`.
3. 배포 **직전** `node scripts/encrypt-existing-keys.mjs` 실행(기존 Gemini 키 암호화) — 코드 배포와 순서가 어긋나면 AI 기능이 실패하므로 **스크립트가 평문/암호문을 모두 읽을 수 있도록** `decrypt()` 에 평문 폴백을 두는 것을 권장(포맷 판별).
4. Supabase SQL Editor 에서 `docs/enable-rls.sql` 실행.
5. 인덱스 변경이 있으면 `npx prisma db push` (Session pooler 주소 사용).
6. push → 자동 배포 → 전원 재로그인 필요함을 지인들에게 안내.
7. 며칠 정상 확인 후 **기존 인도 리전 Supabase 프로젝트(`coupang-manager`) 삭제**.

## 5. 검증 체크리스트 (아르곤이 완료 전 확인)

- [ ] `npx tsc --noEmit` 오류 0, `npm run lint` 오류 0, `npm run build` 성공
- [ ] 다른 유저 id 로 `duplicatePurchase`/`updatePurchase`/`deletePurchase` 시도 시 실패(코드 리뷰로 확인)
- [ ] 쿠키 위조(임의 uuid)로 접근 불가, 관리자 쿠키 임의 값으로 `/admin` 접근 불가, 관리자 서버 액션 직접 호출 시 거부
- [ ] 기존 유저 로그인 가능(phone 형식 호환), 차단 role 은 로그인 불가
- [ ] 구매 내역 5행 추가, 복제, 검색(각 필드), 페이징, 완료 탭, AI 생성, 통계/엑셀이 이전과 동일하게 동작
- [ ] 새 행의 구매일이 KST 오늘 날짜
- [ ] 로그아웃 후 localStorage 캐시 제거
- [ ] 커밋 1개, push 안 함, 한글 인코딩 깨짐 없음(`git diff` 확인)

## 6. 최종 보고 형식

변경 파일 목록 / 결정이 필요했던 부분과 선택 이유 / 못 한 것·위험한 것 / 4번 체크리스트를 간결하게 정리해서 보고하세요.
