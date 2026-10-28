import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
import crypto from 'node:crypto';

// 1회성 마이그레이션: 기존 DB의 평문 Gemini API 키를 AES-256-GCM 으로 일괄 암호화
// 실행 방법: node scripts/encrypt-existing-keys.mjs

function getMasterKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) return Buffer.from(envKey, 'hex');
    if (envKey.length === 32) return Buffer.from(envKey, 'utf8');
    return crypto.createHash('sha256').update(envKey).digest();
  }
  const secret = process.env.SESSION_SECRET || 'coupang-manager-default-secret-fallback-32b';
  return crypto.scryptSync(secret, 'salt-gemini-encryption', 32);
}

function encryptText(plainText: string): string {
  if (!plainText) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

async function run() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: {
        geminiApiKey: { not: null },
      },
      select: { id: true, name: true, geminiApiKey: true },
    });

    console.log(`[암호화 검사] API 키를 보유한 유저: 총 ${users.length}명`);

    let updatedCount = 0;
    for (const user of users) {
      const currentKey = user.geminiApiKey || '';
      // 이미 암호화된 경우 건너뜀 (enc: 로 시작)
      if (currentKey.startsWith('enc:')) {
        console.log(`- ${user.name}: 이미 암호화됨 (스킵)`);
        continue;
      }

      const encrypted = encryptText(currentKey);
      await prisma.user.update({
        where: { id: user.id },
        data: { geminiApiKey: encrypted },
      });
      console.log(`- ${user.name}: 평문 -> 암호화 완료`);
      updatedCount++;
    }

    console.log(`\n🎉 완료: 총 ${updatedCount}개의 API 키가 안전하게 암호화되었습니다.`);
  } finally {
    await prisma.$disconnect();
  }
}

run().catch((err) => {
  console.error('암호화 실패:', err);
  process.exit(1);
});
