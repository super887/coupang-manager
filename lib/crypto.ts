import crypto from 'node:crypto';

// AES-256-GCM 암호화/복호화 모듈
// 암호화 키: ENCRYPTION_KEY 환경변수 (32바이트 필요, 미설정 시 SESSION_SECRET 파생 키 사용)

function getMasterKey(): Buffer {
  const envKey = process.env.ENCRYPTION_KEY;
  if (envKey) {
    if (envKey.length === 64) {
      // 64글자 hex string
      return Buffer.from(envKey, 'hex');
    }
    if (envKey.length === 32) {
      return Buffer.from(envKey, 'utf8');
    }
    // 길이가 다르면 SHA-256 해시로 32바이트 균일 파생
    return crypto.createHash('sha256').update(envKey).digest();
  }

  // 폴백: SESSION_SECRET 으로부터 고정 salt 로 32바이트 파생
  const secret = process.env.SESSION_SECRET || 'coupang-manager-default-secret-fallback-32b';
  return crypto.scryptSync(secret, 'salt-gemini-encryption', 32);
}

/**
 * 평문 텍스트를 AES-256-GCM 으로 암호화
 * 반환 포맷: enc:iv_hex:tag_hex:cipher_hex
 */
export function encryptText(plainText: string): string {
  if (!plainText) return '';
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // GCM 표준 12바이트 IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  let encrypted = cipher.update(plainText, 'utf8', 'hex');
  encrypted += cipher.final('hex');

  const tag = cipher.getAuthTag();
  return `enc:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted}`;
}

/**
 * 암호화된 텍스트를 복호화.
 * 만약 포맷이 일치하지 않는 기존 평문일 경우 안전하게 원본을 그대로 반환 (하위 호환성 유지)
 */
export function decryptText(cipherText: string | null | undefined): string {
  if (!cipherText) return '';

  // 암호화된 포맷인지 검사
  if (!cipherText.startsWith('enc:')) {
    // 기존에 저장되어 있던 평문 API 키 폴백
    return cipherText;
  }

  const parts = cipherText.split(':');
  if (parts.length !== 4) {
    return cipherText;
  }

  const [, ivHex, tagHex, encryptedHex] = parts;

  try {
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('API 키 복호화 실패:', error);
    return '';
  }
}
