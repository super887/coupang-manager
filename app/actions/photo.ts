'use server';

import prisma from '@/lib/prisma';
import { verifySession } from '@/lib/session';

// 쿠팡 리뷰 사진 첨부 한도 (쿠팡 최대 10장)
const MAX_PHOTOS_PER_PURCHASE = 10;
// 압축된 data URL 1장당 최대 길이 (~900KB, Server Action 기본 1MB 요청 한도 이내)
const MAX_DATA_URL_LENGTH = 900_000;
// 쿠팡은 JPG/PNG/GIF만 허용
const ALLOWED_DATA_URL_RE = /^data:image\/(jpeg|jpg|png|gif);base64,[A-Za-z0-9+/=]+$/;

export interface ReviewPhotoItem {
  id: string;
  purchaseId: string;
  dataUrl: string;
  sortOrder: number;
}

async function requireUserId() {
  const session = await verifySession();
  if (!session?.userId) throw new Error('로그인이 필요합니다.');
  return session.userId;
}

// 여러 구매 행의 첨부 사진 조회 (본인 소유 행만)
export async function getReviewPhotos(purchaseIds: string[]): Promise<ReviewPhotoItem[]> {
  const userId = await requireUserId();
  const safeIds = (Array.isArray(purchaseIds) ? purchaseIds : [])
    .map((id) => String(id || ''))
    .filter(Boolean)
    .slice(0, 50);
  if (safeIds.length === 0) return [];

  return prisma.reviewPhoto.findMany({
    where: { userId, purchaseId: { in: safeIds } },
    select: { id: true, purchaseId: true, dataUrl: true, sortOrder: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
}

// 사진 1장 추가 (브라우저에서 압축된 JPEG data URL)
export async function addReviewPhoto(
  purchaseId: string,
  dataUrl: string
): Promise<ReviewPhotoItem> {
  const userId = await requireUserId();

  const safeDataUrl = String(dataUrl || '');
  if (!ALLOWED_DATA_URL_RE.test(safeDataUrl)) {
    throw new Error('JPG/PNG/GIF 이미지 형식만 첨부할 수 있습니다.');
  }
  if (safeDataUrl.length > MAX_DATA_URL_LENGTH) {
    throw new Error('사진 용량이 너무 큽니다. 다른 사진으로 시도해주세요.');
  }

  const purchase = await prisma.purchase.findFirst({
    where: { id: purchaseId, userId },
    select: { id: true },
  });
  if (!purchase) throw new Error('항목을 찾을 수 없거나 접근 권한이 없습니다.');

  const existing = await prisma.reviewPhoto.findMany({
    where: { purchaseId, userId },
    select: { sortOrder: true },
  });
  if (existing.length >= MAX_PHOTOS_PER_PURCHASE) {
    throw new Error(`사진은 리뷰 1건당 최대 ${MAX_PHOTOS_PER_PURCHASE}장까지 첨부할 수 있습니다.`);
  }
  const nextOrder = existing.reduce((max, p) => Math.max(max, p.sortOrder), -1) + 1;

  return prisma.reviewPhoto.create({
    data: { userId, purchaseId, dataUrl: safeDataUrl, sortOrder: nextOrder },
    select: { id: true, purchaseId: true, dataUrl: true, sortOrder: true },
  });
}

// 사진 1장 삭제
export async function deleteReviewPhoto(photoId: string) {
  const userId = await requireUserId();
  await prisma.reviewPhoto.deleteMany({ where: { id: String(photoId || ''), userId } });
}

// 해당 구매 행의 사진 전체 삭제 (자동등록 성공 / [작성] 체크 시 즉시 호출)
export async function clearReviewPhotos(purchaseId: string) {
  const userId = await requireUserId();
  await prisma.reviewPhoto.deleteMany({ where: { purchaseId: String(purchaseId || ''), userId } });
}
