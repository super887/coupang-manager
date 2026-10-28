'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

// ✨ 페이징 + 검색 + 완료탭 필터링을 한 방에 처리하는 만능 함수 (가격 검색 완벽 대응!)
export async function getPaginatedPurchases({
  page = 1,
  pageSize = 100, // 한 페이지 100개
  searchField = 'productName',
  searchKeyword = '',
  isCompleted = false
}) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const where: any = { userId: session.userId };

  // 탭 필터링 로직: 3개 모두 체크되면 '완료', 하나라도 안 되면 '진행 중'
  if (isCompleted) {
    where.isReviewWritten = true;
    where.isProductPayback = true;
    where.isReviewPayback = true;
  } else {
    where.OR = [
      { isReviewWritten: false },
      { isProductPayback: false },
      { isReviewPayback: false }
    ];
  }

  // 검색 필터링 로직
  if (searchKeyword.trim() !== '') {
    if (searchField === 'price') {
      // ✨ 가격 검색일 경우: 콤마(,)나 문자('원' 등)를 제거하고 순수 숫자만 추출해서 정수로 변환
      const numericString = searchKeyword.replace(/[^0-9]/g, '');
      const numericPrice = parseInt(numericString, 10);
      
      if (!isNaN(numericPrice)) {
        where.price = numericPrice; // 정확히 일치하는 가격 검색
      } else {
        where.price = -1; // 숫자가 아니면 검색 결과가 안 나오도록 방어
      }
    } else {
      // 그 외 일반 텍스트 필드 검색
      where[searchField] = { contains: searchKeyword };
    }
  }

  // DB에서 개수와 데이터를 동시에 뽑아옴 (Promise.all로 속도 극대화)
  const [items, totalCount] = await Promise.all([
    prisma.purchase.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.purchase.count({ where })
  ]);

  return { 
    items, 
    totalCount, 
    totalPages: Math.ceil(totalCount / pageSize) 
  };
}

export async function addPurchase(defaultAccount: string = '') {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  // 한국 표준시(KST, UTC+9) 기준 오늘 날짜 (YYYY-MM-DD)
  const now = new Date();
  const kstDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now);

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

  const newRows = await prisma.$transaction(
    Array.from({ length: 5 }).map(() => prisma.purchase.create({ data: defaultData }))
  );

  return newRows;
}

export async function updatePurchase(id: string, data: any) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  const { id: _, userId, createdAt, updatedAt, ...updateFields } = data;
  await prisma.purchase.update({
    where: { id, userId: session.userId },
    data: updateFields,
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
  await prisma.purchase.deleteMany({
    where: { id: { in: ids }, userId: session.userId },
  });
}

export async function duplicatePurchase(id: string) {
  try {
    const existing = await prisma.purchase.findUnique({ where: { id } });
    if (!existing) throw new Error('항목을 찾을 수 없습니다.');
    const { id: _, createdAt, updatedAt, ...dataToDuplicate } = existing;
    const fakeCreatedAt = new Date(createdAt.getTime() + 1000);
    const newPurchase = await prisma.purchase.create({
      data: { ...dataToDuplicate, createdAt: fakeCreatedAt },
    });
    return newPurchase;
  } catch (error) {
    throw new Error('항목 복제에 실패했습니다.');
  }
}