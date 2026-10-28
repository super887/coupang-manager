# 📦 쿠팡 매니저 (Coupang Manager)

쿠팡 체험단/리뷰 및 페이백 구매 내역을 효율적으로 관리하고, 최신 Gemini AI를 활용해 다채로운 리뷰를 자동 생성하는 웹 애플리케이션입니다.

---

## 🛠️ 기술 스택

- **Framework**: Next.js 16.4 (App Router)
- **Frontend**: React 19, Tailwind CSS 4
- **Database**: PostgreSQL (Supabase Seoul `ap-northeast-2`)
- **ORM**: Prisma 5.19
- **Deployment**: Vercel (Seoul `icn1`)
- **Security**: jose (JWT Cookie), AES-256-GCM (Gemini API Key 암호화)

---

## ⚙️ 환경변수 설정 (`.env`)

로컬 개발 환경 및 Vercel 배포 시 아래 환경변수들을 설정해야 합니다.

```ini
# Supabase Transaction Pooler (Port 6543, pgbouncer=true)
DATABASE_URL="postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres?pgbouncer=true"

# Supabase Session Pooler (Port 5432, prisma db push 및 마이그레이션 전용)
DIRECT_URL="postgresql://postgres.[PROJECT_ID]:[PASSWORD]@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"

# JWT 세션 서명 비밀키 (최소 32자 이상의 무작위 문자열)
SESSION_SECRET="your-super-secret-key-at-least-32-characters-long"

# Gemini API 키 AES-256-GCM 암호화 마스터 키 (32바이트 / 64글자 hex 문자열 권장)
ENCRYPTION_KEY="your-32-character-or-64-hex-master-encryption-key"

# 관리자 계정 자격증명 (/admin 로그인용)
ADMIN_ID="admin"
ADMIN_PASSWORD="your-secure-admin-password"

# Gemini AI 모델 (기본: gemini-2.5-flash)
GEMINI_MODEL="gemini-2.5-flash"
```

---

## 🚀 시작하기

### 1. 패키지 설치 및 Prisma 클라이언트 생성
```bash
npm install
npx prisma generate
```

### 2. 로컬 개발 서버 실행
```bash
npm run dev
```
브라우저에서 `http://localhost:3000` 접속

### 3. 데이터베이스 스키마 동기화 (필요 시)
```bash
npx prisma db push
```

### 4. 기존 평문 API 키 일괄 암호화 마이그레이션 (1회 실행)
```bash
node scripts/encrypt-existing-keys.mjs
```

---

## 🔒 보안 및 RLS 설정
Supabase PostgREST(Data API)로부터 테이블을 보호하기 위해, Supabase 대시보드의 **SQL Editor**에서 `docs/enable-rls.sql` 스크립트를 실행하여 모든 테이블의 Row Level Security를 활성화하세요.
