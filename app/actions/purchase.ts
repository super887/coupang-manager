'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

export async function getPurchases() {
  const session = await verifySession();
  if (!session?.userId) return [];
  return await prisma.purchase.findMany({
    where: { userId: session.userId },
    orderBy: [
      { createdAt: 'desc' }, 
      { id: 'desc' }
    ],
  });
}

// ✨ 디폴트 계정주(defaultAccount)를 파라미터로 받도록 수정
export async function addPurchase(defaultAccount: string = '') {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const defaultData = {
    userId: session.userId,
    purchaseDate: new Date().toISOString().split('T')[0],
    accountHolder: defaultAccount, // ✨ 디폴트 계정주 적용
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

  revalidatePath('/');
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
  revalidatePath('/');
}

export async function deletePurchase(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.purchase.delete({
    where: { id, userId: session.userId },
  });
  revalidatePath('/');
}

export async function deletePurchases(ids: string[]) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.purchase.deleteMany({
    where: { id: { in: ids }, userId: session.userId },
  });
  revalidatePath('/');
}

export async function duplicatePurchase(id: string) {
  try {
    // 1. 복제할 원본 데이터 가져오기
    const existing = await prisma.purchase.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new Error('항목을 찾을 수 없습니다.');
    }

    // 2. 기존 항목에서 고유 ID와 시간 관련 필드를 제외하고 내용물만 쏙 빼기
    const { id: _, createdAt, updatedAt, ...dataToDuplicate } = existing;

    // ✨ 마법의 코드: 원래 행의 생성 시간(createdAt)에서 딱 '1초(1000ms)'만 더 미래로 조작!
    // 이렇게 하면 무조건 원래 행의 '바로 위'에 붙박이처럼 영구 고정됩니다.
    const fakeCreatedAt = new Date(createdAt.getTime() + 1000);

    // 3. 조작된 시간을 넣어서 DB에 생성
    const newPurchase = await prisma.purchase.create({
      data: {
        ...dataToDuplicate,
        createdAt: fakeCreatedAt, // 👈 여기가 핵심입니다!
      },
    });

    return newPurchase;
  } catch (error) {
    console.error('Failed to duplicate purchase:', error);
    throw new Error('항목 복제에 실패했습니다.');
  }
}

// app/actions/purchase.ts 맨 아래에 추가

// ✨ 프론트엔드 대신 서버 내부에서 5개를 빛의 속도로 생성하는 함수
export async function addFivePurchases() {
  const results = [];
  // 서버가 DB랑 직접 통신하므로 5번을 반복해도 1초도 안 걸립니다.
  for (let i = 0; i < 5; i++) {
    const row = await addPurchase();
    results.push(row);
  }
  return results;
}