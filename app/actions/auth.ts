'use server';

import prisma from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { createSession, destroySession } from '@/lib/session';

// 전화번호 정규화: 하이픈이나 공백을 제거하여 일관성 유지 (단, 기존 저장 형식과 유연한 매칭 지원)
function cleanPhone(raw: string): string {
  return raw.replace(/[^0-9]/g, '');
}

export async function signup(name: string, phone: string, password: string) {
  const trimmedName = name?.trim();
  const rawPhone = phone?.trim();
  const cleaned = cleanPhone(rawPhone);

  if (!trimmedName || !rawPhone || !password) {
    return { success: false, error: '모든 항목을 입력해주세요.' };
  }

  if (password.length < 8) {
    return { success: false, error: '비밀번호는 최소 8자 이상이어야 합니다.' };
  }

  // 중복 가입 체크 (입력받은 원본 번호 및 숫자만 추출한 번호 모두 검사)
  const existingUser = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: rawPhone },
        { phone: cleaned }
      ]
    }
  });

  if (existingUser) {
    return { success: false, error: '이미 가입된 전화번호입니다. 로그인 탭을 이용해주세요.' };
  }

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: {
      name: trimmedName,
      phone: rawPhone,
      password: hashedPassword,
      role: 'user',
    },
  });

  // 서명된 JWT 쿠키 발급
  await createSession(newUser.id, newUser.role);
  return { success: true };
}

export async function login(phone: string, password: string) {
  const rawPhone = phone?.trim();
  if (!rawPhone || !password) {
    return { success: false, error: '전화번호와 비밀번호를 입력해주세요.' };
  }

  const cleaned = cleanPhone(rawPhone);

  // 기존 DB 호환을 위해 원본 형태 또는 하이픈 제거 형태 모두 검색
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { phone: rawPhone },
        { phone: cleaned }
      ]
    }
  });

  // 계정 존재 여부를 공격자에게 유출하지 않기 위해 통일된 에러 메시지 반환
  if (!user || !user.password) {
    return { success: false, error: '전화번호 또는 비밀번호가 일치하지 않습니다.' };
  }

  // 차단된 유저 로그인 차단
  if (user.role === 'blocked') {
    return { success: false, error: '이용이 정지된 계정입니다. 관리자에게 문의하세요.' };
  }

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) {
    return { success: false, error: '전화번호 또는 비밀번호가 일치하지 않습니다.' };
  }

  // 안전한 JWT 세션 발급
  await createSession(user.id, user.role);
  return { success: true };
}

export async function logout() {
  await destroySession();
}
