'use server';

import prisma from '@/lib/prisma';
import { createSession } from '@/lib/session';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function loginAction(prevState: any, formData: FormData) {
  // ... (기존 loginAction 코드는 그대로 두시면 됩니다!) ...
  const name = formData.get('name')?.toString().trim();
  const rawPhone = formData.get('phone')?.toString().trim();

  if (!name || !rawPhone) {
    return { error: '이름과 핸드폰 번호를 모두 입력해주세요.' };
  }

  const phone = rawPhone.replace(/[^0-9]/g, '');

  try {
    let user = await prisma.user.findUnique({ where: { phone } });
    if (user) {
      if (user.name !== name) return { error: '등록된 전화번호의 이름과 일치하지 않습니다.' };
    } else {
      user = await prisma.user.create({ data: { name, phone } });
    }
    await createSession(user.id);
  } catch (error) {
    console.error('Login Error:', error);
    return { error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.' };
  }
  redirect('/');
}

// ✨ 수정된 로그아웃 함수 (redirect 제거!)
export async function logout() {
  // 여기서 에러를 뿜지 않게 순수하게 쿠키만 날려줍니다.
  cookies().delete('session'); 
  cookies().delete('token');   // 혹시 몰라서 방어
  cookies().delete('jwt');     // 혹시 몰라서 방어 2
}