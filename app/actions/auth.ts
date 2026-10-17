'use server';

import prisma from '@/lib/prisma';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';

// ✨ 회원가입 로직
export async function signup(name: string, phone: string, password: string) {
  if (!name || !phone || !password) return { success: false, error: '모든 항목을 입력해주세요.' };
  
  // 💡 수정된 부분: phoneNumber 대신 phone 으로 DB에서 찾습니다!
  const existingUser = await prisma.user.findUnique({ where: { phone: phone } });
  if (existingUser) return { success: false, error: '이미 가입된 전화번호입니다. 로그인 탭을 이용해주세요.' };

  const hashedPassword = await bcrypt.hash(password, 10);

  const newUser = await prisma.user.create({
    data: { 
      name, 
      phone: phone, // 💡 수정된 부분: phone 칸에 저장
      password: hashedPassword 
    },
  });

  const cookieStore = await cookies();
  cookieStore.set('userId', newUser.id, { 
    httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7, path: '/' 
  });
  
  return { success: true };
}

// ✨ 로그인 로직
export async function login(phone: string, password: string) {
  if (!phone || !password) return { success: false, error: '전화번호와 비밀번호를 입력해주세요.' };

  // 💡 수정된 부분: phoneNumber 대신 phone 으로 DB에서 찾습니다!
  const user = await prisma.user.findUnique({ where: { phone: phone } });
  if (!user) return { success: false, error: '가입되지 않은 전화번호입니다.' };
  
  if (!user.password) return { success: false, error: '초기 가입자입니다. 소통·문의 채널로 문의해주세요.' };

  const isValid = await bcrypt.compare(password, user.password);
  if (!isValid) return { success: false, error: '비밀번호가 일치하지 않습니다.' };

  const cookieStore = await cookies();
  cookieStore.set('userId', user.id, { 
    httpOnly: true, secure: process.env.NODE_ENV === 'production', maxAge: 60 * 60 * 24 * 7, path: '/' 
  });
  
  return { success: true };
}

export async function logout() {
  const cookieStore = await cookies();
  cookieStore.delete('userId');
}