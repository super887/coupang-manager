'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';

// ========== [계정 정보 액션] ==========
export async function getAccounts() {
  const session = await verifySession();
  if (!session?.userId) return [];
  return await prisma.accountInfo.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addAccount() {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.accountInfo.create({
    data: {
      userId: session.userId,
      platform: '쿠팡',
      accountHolder: '새 계정',
    }
  });
  revalidatePath('/accounts');
}

export async function updateAccount(id: string, data: any) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  const { id: _, userId, createdAt, updatedAt, ...updateFields } = data;
  await prisma.accountInfo.update({
    where: { id, userId: session.userId },
    data: updateFields,
  });
  revalidatePath('/accounts');
}

export async function deleteAccount(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.accountInfo.delete({
    where: { id, userId: session.userId },
  });
  revalidatePath('/accounts');
}

// ========== [판매자 정보 액션] ==========
export async function getSellers() {
  const session = await verifySession();
  if (!session?.userId) return [];
  return await prisma.sellerInfo.findMany({
    where: { userId: session.userId },
    orderBy: { createdAt: 'desc' },
  });
}

export async function addSeller() {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.sellerInfo.create({
    data: {
      userId: session.userId,
      companyName: '새 업체',
    }
  });
  revalidatePath('/accounts');
}

export async function updateSeller(id: string, data: any) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  const { id: _, userId, createdAt, updatedAt, ...updateFields } = data;
  await prisma.sellerInfo.update({
    where: { id, userId: session.userId },
    data: updateFields,
  });
  revalidatePath('/accounts');
}

export async function deleteSeller(id: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  await prisma.sellerInfo.delete({
    where: { id, userId: session.userId },
  });
  revalidatePath('/accounts');
}