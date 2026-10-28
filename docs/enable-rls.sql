-- Supabase PostgreSQL Row Level Security (RLS) 일괄 활성화 스크립트
-- 용도: PostgREST (Data API) 및 공개 anon 키를 통한 비인가 테이블 직접 조회/조작 전면 차단
-- 주의: Prisma는 postgres 슈퍼유저/서비스 롤을 통해 접속하므로 이 RLS 설정의 영향을 받지 않고 정상 동작합니다.

-- 1. User 테이블 RLS 활성화
ALTER TABLE IF EXISTS "User" ENABLE ROW LEVEL SECURITY;

-- 2. Purchase 테이블 RLS 활성화
ALTER TABLE IF EXISTS "Purchase" ENABLE ROW LEVEL SECURITY;

-- 3. AccountInfo 테이블 RLS 활성화
ALTER TABLE IF EXISTS "AccountInfo" ENABLE ROW LEVEL SECURITY;

-- 4. SellerInfo 테이블 RLS 활성화
ALTER TABLE IF EXISTS "SellerInfo" ENABLE ROW LEVEL SECURITY;

-- 5. 마이그레이션 메타데이터 테이블 (존재할 경우)
ALTER TABLE IF EXISTS "_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- 정책(Policy)을 추가하지 않았으므로, anon(공개 키) 및 authenticated 기본 롤의 직접적인 REST API 접근은 모두 차단(Deny All)됩니다.
