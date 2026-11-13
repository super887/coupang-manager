'use client';

import { useRef, useState } from 'react';

export interface PickerPhoto {
  id: string;
  dataUrl: string;
}

/**
 * 리뷰 첨부 사진 선택/미리보기 컴포넌트
 * - [📸 포토첨부] 버튼(다중 선택), 드래그&드롭, Ctrl+V 붙여넣기 지원
 * - 썸네일 우측 상단 ✕ 로 개별 삭제
 */
export default function ReviewPhotoPicker({
  photos,
  onAddFiles,
  onDelete,
  uploading = false,
  disabled = false,
  maxCount = 10,
  label = '📸 포토첨부',
  compact = false,
}: {
  photos: PickerPhoto[];
  onAddFiles: (files: File[]) => void | Promise<void>;
  onDelete: (photoId: string) => void | Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
  maxCount?: number;
  label?: string;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const remaining = Math.max(0, maxCount - photos.length);
  const isBlocked = disabled || uploading || remaining === 0;

  const pickImages = (fileList: FileList | File[] | null | undefined) => {
    if (!fileList || isBlocked) return;
    const images = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (images.length === 0) return;
    onAddFiles(images.slice(0, remaining));
  };

  const thumbSize = compact ? 'w-12 h-12' : 'w-16 h-16';

  return (
    <div
      tabIndex={0}
      onPaste={(e) => {
        const files = Array.from(e.clipboardData?.files || []);
        if (files.length > 0) {
          e.preventDefault();
          pickImages(files);
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        if (!isBlocked) setIsDragOver(true);
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setIsDragOver(false);
        pickImages(e.dataTransfer?.files);
      }}
      className={`rounded-lg border border-dashed p-2 outline-none transition-colors focus:ring-2 focus:ring-pink-300 ${
        isDragOver ? 'border-pink-500 bg-pink-50' : 'border-gray-300 bg-gray-50/60'
      }`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          disabled={isBlocked}
          onClick={() => inputRef.current?.click()}
          className="px-2.5 py-1 bg-pink-50 hover:bg-pink-100 disabled:opacity-50 disabled:cursor-not-allowed text-pink-700 border border-pink-200 rounded text-xs font-bold transition-colors"
        >
          {uploading ? '⏳ 압축·업로드 중...' : label}
        </button>
        <span className="text-[11px] text-gray-500">
          {photos.length}/{maxCount}장 · 클릭/드래그/Ctrl+V 붙여넣기
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            pickImages(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      {photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {photos.map((p, idx) => (
            <div key={p.id} className={`relative ${thumbSize} rounded overflow-hidden border border-gray-200 bg-white`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.dataUrl} alt={`첨부 사진 ${idx + 1}`} className="w-full h-full object-cover" />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(p.id)}
                title="사진 삭제"
                className="absolute top-0 right-0 bg-black/60 hover:bg-red-600 text-white text-[10px] leading-none w-4 h-4 flex items-center justify-center rounded-bl"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
