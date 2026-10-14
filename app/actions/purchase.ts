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

// ✨ [핵심 기능] 행 복제 기능 추가!
export async function duplicatePurchase(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const original = await prisma.purchase.findUnique({
    where: { id, userId: session.userId }
  });

  if (!original) throw new Error('원본 데이터가 없습니다.');

  const { id: _, createdAt, updatedAt, ...data } = original;

  // ✨ 정렬 조건(내림차순)을 역이용! 
  // 원본보다 생성 시간을 '1밀리초' 미래로 설정하면 무조건 원본 바로 윗줄에 삽입됩니다.
  const newCreatedAt = new Date(createdAt.getTime() + 1);

  const duplicated = await prisma.purchase.create({
    data: {
      ...data,
      createdAt: newCreatedAt,
    }
  });

  revalidatePath('/');
  return duplicated;
}