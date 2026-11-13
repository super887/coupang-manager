/**
 * 브라우저에서 리뷰 첨부용 사진을 초경량 JPEG(data URL)로 압축하는 유틸리티
 *
 * - 쿠팡은 JPG/PNG/GIF만 허용하므로 WebP가 아닌 JPEG로 변환합니다.
 * - 긴 변 최대 1280px, 품질을 단계적으로 낮춰 1장당 약 100~300KB 수준으로 맞춥니다.
 * - Server Action 기본 요청 한도(1MB) 안에 들어가도록 data URL 길이를 제한합니다.
 */

const TARGET_MAX_DATA_URL_LENGTH = 600_000; // 약 450KB (base64 포함)
const HARD_MAX_DATA_URL_LENGTH = 880_000;

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('이미지를 불러올 수 없습니다.'));
    img.src = src;
  });
}

async function fileToDrawable(
  file: File
): Promise<{ source: CanvasImageSource; width: number; height: number; cleanup: () => void }> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        cleanup: () => bitmap.close(),
      };
    } catch {
      // 폴백: <img> 로드
    }
  }
  const objectUrl = URL.createObjectURL(file);
  const img = await loadImageElement(objectUrl);
  return {
    source: img,
    width: img.naturalWidth || img.width,
    height: img.naturalHeight || img.height,
    cleanup: () => URL.revokeObjectURL(objectUrl),
  };
}

export async function compressImageFileToJpegDataUrl(
  file: File,
  maxDimension: number = 1280
): Promise<string> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('이미지 파일만 첨부할 수 있습니다.');
  }

  const { source, width, height, cleanup } = await fileToDrawable(file);
  try {
    if (!width || !height) throw new Error('이미지 크기를 확인할 수 없습니다.');

    let dim = maxDimension;
    for (let pass = 0; pass < 4; pass++) {
      const scale = Math.min(1, dim / Math.max(width, height));
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('이미지 압축을 지원하지 않는 브라우저입니다.');
      // 투명 PNG가 검게 변하지 않도록 흰 배경
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(source, 0, 0, w, h);

      for (const quality of [0.85, 0.75, 0.65, 0.55]) {
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        if (dataUrl.length <= TARGET_MAX_DATA_URL_LENGTH) return dataUrl;
        if (quality === 0.55 && dataUrl.length <= HARD_MAX_DATA_URL_LENGTH && pass >= 1) {
          return dataUrl;
        }
      }
      dim = Math.round(dim * 0.75);
    }
    throw new Error('사진 용량을 충분히 줄이지 못했습니다. 다른 사진으로 시도해주세요.');
  } finally {
    cleanup();
  }
}
