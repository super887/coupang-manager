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

// ✨ 수정됨: redirect를 빼서 라우터 충돌 및 쿠키 삭제 무시 버그를 원천 차단!
export async function logout() {
  cookies().delete('session'); 
}