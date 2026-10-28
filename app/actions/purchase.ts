'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { todayKST } from '@/lib/date';
import { Prisma } from '@prisma/client';

// 허용된 검색 필드 화이트리스트
const ALLOWED_SEARCH_FIELDS = new Set([
  'productName',
  'chatRoomName',
  'accountHolder',
  'platform',
  'reviewType',
  'paybackName',
  'contactOnBangpok',
  'purchaseDate',
  'price',
]);

// 허용된 수정 가능 필드 화이트리스트
const ALLOWED_UPDATE_FIELDS = new Set([
  'purchaseDate',
  'accountHolder',
  'productName',
  'chatRoomName',
  'platform',
  'price',
  'reviewType',
  'paybackName',
  'contactOnBangpok',
  'isReviewWritten',
  'isProductPayback',
  'isReviewPayback',
  'generatedReview',
]);

// ✨ 페이징 + 검색 + 완료탭 필터링을 한 방에 처리하는 만능 함수
export async function getPaginatedPurchases({
  page = 1,
  pageSize = 100,
  searchField = 'productName',
  searchKeyword = '',
  isCompleted = false,
}: {
  page?: number;
  pageSize?: number;
  searchField?: string;
  searchKeyword?: string;
  isCompleted?: boolean;
}) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 페이지 및 크기 안전 범위 제한
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.min(200, Math.max(10, Number(pageSize) || 100));

  const where: Prisma.PurchaseWhereInput = { userId: session.userId };

  // 탭 필터링 로직: 3개 모두 체크되면 '완료', 하나라도 안 되면 '진행 중'
  if (isCompleted) {
    where.isReviewWritten = true;
    where.isProductPayback = true;
    where.isReviewPayback = true;
  } else {
    where.OR = [
      { isReviewWritten: false },
      { isProductPayback: false },
      { isReviewPayback: false },
    ];
  }

  // 검색 필터링 로직 (화이트리스트 검증)
  const trimmedKeyword = searchKeyword.trim();
  if (trimmedKeyword !== '' && ALLOWED_SEARCH_FIELDS.has(searchField)) {
    if (searchField === 'price') {
      const numericString = trimmedKeyword.replace(/[^0-9]/g, '');
      const numericPrice = parseInt(numericString, 10);
      where.price = !isNaN(numericPrice) ? numericPrice : -1;
    } else {
      // 텍스트 필드 검색
      (where as Record<string, any>)[searchField] = { contains: trimmedKeyword };
    }
  }

  // DB에서 개수와 데이터를 동시에 조회
  const [items, totalCount] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    }),
    prisma.purchase.count({ where }),
  ]);

  return {
    items,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / safePageSize)),
  };
}

export async function addPurchase(defaultAccount: string = '') {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 한국 표준시(KST) 오늘 날짜 사용
  const kstDate = todayKST();

  const defaultData = {
    userId: session.userId,
    purchaseDate: kstDate,
    accountHolder: defaultAccount,
    productName: '',
    chatRoomName: '',
    platform: '쿠팡',
    price: 0,
    reviewType: '(빈)텍스트',
    paybackName: '',
    contactOnBangpok: '',
  };

  // 5행을 순차 생성 대신 createManyAndReturn 으로 1번의 쿼리로 생성하여 속도 극대화
  const newRows = await prisma.purchase.createManyAndReturn({
    data: Array.from({ length: 5 }, () => defaultData),
  });

  return newRows;
}

export async function updatePurchase(id: string, data: Record<string, any>) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 화이트리스트 필터링 및 타입 안전 변환
  const cleanData: Record<string, any> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (ALLOWED_UPDATE_FIELDS.has(key)) {
      if (key === 'price') {
        cleanData[key] = Math.max(0, parseInt(String(value), 10) || 0);
      } else if (key.startsWith('is')) {
        cleanData[key] = Boolean(value);
      } else {
        cleanData[key] = String(value ?? '');
      }
    }
  }

  if (Object.keys(cleanData).length === 0) return;

  await prisma.purchase.update({
    where: { id, userId: session.userId },
    data: cleanData,
  });
}

export async function deletePurchase(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  await prisma.purchase.delete({
    where: { id, userId: session.userId },
  });
}

export async function deletePurchases(ids: string[]) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 최대 500개로 일괄 삭제 수량 제한
  const safeIds = (ids || []).slice(0, 500);
  if (safeIds.length === 0) return;

  await prisma.purchase.deleteMany({
    where: { id: { in: safeIds }, userId: session.userId },
  });
}

export async function duplicatePurchase(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 세션 소유자 일치 여부 확인
  const existing = await prisma.purchase.findFirst({
    where: { id, userId: session.userId },
  });

  if (!existing) {
    throw new Error('항목을 찾을 수 없거나 접근 권한이 없습니다.');
  }

  // 복제 생성 시 상단 정렬 배치를 위해 1초 후 시각 부여 (기존 UX 유지)
  const fakeCreatedAt = new Date(existing.createdAt.getTime() + 1000);

  const newPurchase = await prisma.purchase.create({
    data: {
      userId: session.userId,
      purchaseDate: existing.purchaseDate,
      accountHolder: existing.accountHolder,
      productName: existing.productName,
      chatRoomName: existing.chatRoomName,
      platform: existing.platform,
      price: existing.price,
      reviewType: existing.reviewType,
      paybackName: existing.paybackName,
      contactOnBangpok: existing.contactOnBangpok,
      isReviewWritten: existing.isReviewWritten,
      isProductPayback: existing.isProductPayback,
      isReviewPayback: existing.isReviewPayback,
      generatedReview: existing.generatedReview,
      createdAt: fakeCreatedAt,
    },
  });

  return newPurchase;
}
