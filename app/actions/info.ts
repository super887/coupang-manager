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

// ✨ 프론트엔드가 즉시 화면에 그릴 수 있도록 생성된 데이터(newAccount)를 반환!
export async function addAccount() {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  
  const newAccount = await prisma.accountInfo.create({
    data: {
      userId: session.userId,
      platform: '쿠팡',
      accountHolder: '새 계정',
    }
  });
  
  revalidatePath('/accounts');
  return newAccount; // 👈 반환값 추가
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

// ✨ 판매자 추가도 동일하게 데이터 반환 추가
export async function addSeller() {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  
  const newSeller = await prisma.sellerInfo.create({
    data: {
      userId: session.userId,
      companyName: '새 업체',
    }
  });
  
  revalidatePath('/accounts');
  return newSeller; // 👈 반환값 추가
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

// app/actions/info.ts 맨 아래에 추가

export async function getDashboardData() {
  const session = await verifySession();
  if (!session?.userId) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { geminiApiKey: true, customPrompt: true },
  });

  const accounts = await prisma.accountInfo.findMany({
    where: { userId: session.userId },
    select: { accountHolder: true },
    orderBy: { createdAt: 'asc' },
  });

  return {
    hasApiKey: !!user?.geminiApiKey,
    customPrompt: user?.customPrompt || '',
    accounts: accounts || [],
  };
}