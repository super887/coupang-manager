'use server';

import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

export async function signup(name: string, phone: string, password: string) {
  if (!name || !phone || !password) return { success: false, error: '모든 항목을 입력해주세요.' };
  
  const existingUser = await prisma.user.findUnique({ where: { phone: phone } });
  if (existingUser) return { success: false, error: '이미 가입된 전화번호입니다. 로그인 탭을 이용해주세요.' };

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: { name, phone: phone, password: hashedPassword },
  });

  const cookieStore = await cookies();
  // ✨ 보안 옵션 완화: 어떤 환경(로컬, 실서버)에서도 쿠키가 잘 구워지도록 단순화
  cookieStore.set('userId', newUser.id, { maxAge: 60 * 60 * 24 * 7, path: '/' });
  
  return { success: true };
}

export async function login(phone: string, password: string) {
  if (!phone || !password) return { success: false, error: '전화번호와 비밀번호를 입력해주세요.' };

  const user = await prisma.user.findUnique({ where: { phone: phone } });
  if (!user) return { success: false, error: '가입되지 않은 전화번호입니다.' };
  
  // 구 계정 마이그레이션 (비번 없는 계정은 첫 로그인 비번으로 영구 저장)
  if (!user.password) {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.update({
      where: { phone: phone },
      data: { password: hashedPassword }
    });
    
    const cookieStore = await cookies();
    cookieStore.set('userId', user.id, { maxAge: 60 * 60 * 24 * 7, path: '/' });
    
    return { success: true };
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return { success: false, error: '비밀번호가 일치하지 않습니다.' };

  const cookieStore = await cookies();
  cookieStore.set('userId', user.id, { maxAge: 60 * 60 * 24 * 7, path: '/' });
  
  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('userId');
}