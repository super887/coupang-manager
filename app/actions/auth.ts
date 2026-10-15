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

// app/actions/auth.ts 파일의 맨 아래 로그아웃 함수 부분만 교체

export async function logout() {
  // .delete() 함수 대신, 유효기간을 과거로 돌려서 쿠키를 완벽하게 폭파시킵니다.
  cookies().set('session', '', { 
    expires: new Date(0), // 1970년으로 돌려서 즉시 폐기
    path: '/',            // 전체 경로에서 삭제
  }); 
}