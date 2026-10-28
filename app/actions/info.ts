'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';
import { revalidatePath } from 'next/cache';
import { encryptText } from '@/lib/crypto';

// ========== [계정 정보 액션] ==========
const ALLOWED_ACCOUNT_FIELDS = new Set([
  'platform',
  'accountHolder',
  'recipient1',
  'recipient2',
  'recipient3',
  'loginId',
  'phoneNumber',
  'address1',
  'address2',
  'address3',
  'paybackAccount1',
  'paybackAccount2',
]);

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

  const newAccount = await prisma.accountInfo.create({
    data: {
      userId: session.userId,
      platform: '쿠팡',
      accountHolder: '새 계정',
    },
  });

  revalidatePath('/accounts');
  return newAccount;
}

export async function updateAccount(id: string, data: Record<string, any>) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const cleanData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (ALLOWED_ACCOUNT_FIELDS.has(key)) {
      cleanData[key] = String(value ?? '');
    }
  }

  if (Object.keys(cleanData).length === 0) return;

  await prisma.accountInfo.update({
    where: { id, userId: session.userId },
    data: cleanData,
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
const ALLOWED_SELLER_FIELDS = new Set(['companyName', 'submissionForm']);

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

  const newSeller = await prisma.sellerInfo.create({
    data: {
      userId: session.userId,
      companyName: '새 업체',
    },
  });

  revalidatePath('/accounts');
  return newSeller;
}

export async function updateSeller(id: string, data: Record<string, any>) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');

  const cleanData: Record<string, string> = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (ALLOWED_SELLER_FIELDS.has(key)) {
      cleanData[key] = String(value ?? '');
    }
  }

  if (Object.keys(cleanData).length === 0) return;

  await prisma.sellerInfo.update({
    where: { id, userId: session.userId },
    data: cleanData,
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

// ========== [대시보드 메인 설정 및 데이터] ==========
export async function getDashboardData() {
  const session = await verifySession();
  if (!session?.userId) return null;

  // Promise.all 병렬 조회로 속도 극대화
  const [user, accounts] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.userId },
      select: { geminiApiKey: true, customPrompt: true },
    }),
    prisma.accountInfo.findMany({
      where: { userId: session.userId },
      select: { accountHolder: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  return {
    hasApiKey: !!user?.geminiApiKey,
    customPrompt: user?.customPrompt || '',
    accounts: accounts || [],
  };
}

// 단일 일원화된 API 키 및 프롬프트 업데이트 함수 (AES-256-GCM 암호화 적용)
export async function updateApiSettings(apiKey: string, customPrompt: string) {
  const session = await verifySession();
  if (!session?.userId) throw new Error('권한이 없습니다.');

  const dataToUpdate: { customPrompt?: string; geminiApiKey?: string } = {
    customPrompt: customPrompt ?? '',
  };

  const trimmedKey = (apiKey || '').trim();
  if (trimmedKey !== '') {
    // API 키 암호화하여 DB 저장
    dataToUpdate.geminiApiKey = encryptText(trimmedKey);
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: dataToUpdate,
  });

  return true;
}
