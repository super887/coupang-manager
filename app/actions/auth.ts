'use server';

import prisma from '@/lib/prisma';
import { createSession } from '@/lib/session';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';

export async function loginAction(prevState: any, formData: FormData) {
  const name = formData.get('name')?.toString().trim();
  const rawPhone = formData.get('phone')?.toString().trim();

  if (!name || !rawPhone) {
    return { error: '이름과 핸드폰 번호를 모두 입력해주세요.' };
  }

  const phone = rawPhone.replace(/[^0-9]/g, '');

  try {
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    if (user) {
      if (user.name !== name) {
        return { error: '등록된 전화번호의 이름과 일치하지 않습니다.' };
      }
    } else {
      user = await prisma.user.create({
        data: { name, phone },
      });
    }

    await createSession(user.id);
    
  } catch (error) {
    console.error('Login Error:', error);
    return { error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.' };
  }

  redirect('/');
}

// app/actions/auth.ts 맨 아래 로그아웃 함수를 이렇게 바꿔주십쇼!

export async function logout() {
  // ✨ 핵심: await를 반드시 붙여야 합니다!
  const cookieStore = await cookies();
  cookieStore.delete('session'); 
}