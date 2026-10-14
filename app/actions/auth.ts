'use server';

import prisma from '@/lib/prisma';
import { createSession } from '@/lib/session';
import { redirect } from 'next/navigation';

// [확장성 포인트]: 폼 검증 로직을 별도로 분리하여 나중에 Zod 같은 라이브러리를 붙이기 쉽게 구조화
export async function loginAction(prevState: any, formData: FormData) {
  const name = formData.get('name')?.toString().trim();
  const rawPhone = formData.get('phone')?.toString().trim();

  if (!name || !rawPhone) {
    return { error: '이름과 핸드폰 번호를 모두 입력해주세요.' };
  }

  // 전화번호에서 하이픈 및 공백 제거 (데이터 정규화)
  const phone = rawPhone.replace(/[^0-9]/g, '');

  try {
    // 1. 기존 유저 조회
    let user = await prisma.user.findUnique({
      where: { phone },
    });

    if (user) {
      // 2. 유저가 존재하면 이름이 일치하는지 확인 (간이 보안)
      if (user.name !== name) {
        return { error: '등록된 전화번호의 이름과 일치하지 않습니다.' };
      }
    } else {
      // 3. 유저가 없으면 신규 가입 처리 (Seamless Login)
      user = await prisma.user.create({
        data: { name, phone },
      });
    }

    // 4. JWT 세션 생성
    await createSession(user.id);
    
  } catch (error) {
    console.error('Login Error:', error);
    return { error: '로그인 처리 중 오류가 발생했습니다. 다시 시도해주세요.' };
  }

  // 성공 시 메인 대시보드로 이동 (try-catch 밖에서 실행해야 Next.js redirect가 정상 작동함)
  redirect('/');
}