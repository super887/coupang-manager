'use client';

import { useState, useEffect, useCallback } from 'react';

interface UseCachedDataOptions<T> {
  key: string;
  fetcher: () => Promise<T>;
  initialData: T;
}

/**
 * 공통 캐시 & 비동기 동기화 훅
 * 1. 로컬 캐시가 있으면 0.001초 만에 초기 데이터로 렌더링
 * 2. 백그라운드에서 최신 데이터를 서버에서 가져와 갱신
 * 3. 캐시 저장 시 최신 데이터로 동기화
 */
export function useCachedData<T>({ key, fetcher, initialData }: UseCachedDataOptions<T>) {
  const [data, setData] = useState<T>(initialData);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // 캐시 로드
  useEffect(() => {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        setData(JSON.parse(cached));
      }
    } catch (e) {
      console.warn(`캐시 읽기 실패 (${key}):`, e);
    }
    setIsLoaded(true);

    let isMounted = true;
    setIsSyncing(true);

    fetcher()
      .then((latest) => {
        if (!isMounted || !latest) return;
        setData(latest);
        try {
          localStorage.setItem(key, JSON.stringify(latest));
        } catch (e) {
          console.warn(`캐시 저장 실패 (${key}):`, e);
        }
      })
      .catch((err) => {
        console.error(`데이터 동기화 실패 (${key}):`, err);
      })
      .finally(() => {
        if (isMounted) setIsSyncing(false);
      });

    return () => {
      isMounted = false;
    };
  }, [key]);

  // 수동 즉시 새로고침
  const refresh = useCallback(async () => {
    setIsSyncing(true);
    try {
      const latest = await fetcher();
      if (latest) {
        setData(latest);
        localStorage.setItem(key, JSON.stringify(latest));
      }
      return latest;
    } catch (error) {
      console.error(`수동 갱신 실패 (${key}):`, error);
      throw error;
    } finally {
      setIsSyncing(false);
    }
  }, [key, fetcher]);

  // 로컬 상태 직접 업데이트 (낙관적 UI 반영용)
  const updateLocal = useCallback(
    (updater: (prev: T) => T) => {
      setData((prev) => {
        const next = updater(prev);
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch (e) {
          console.warn(`로컬 캐시 업데이트 실패 (${key}):`, e);
        }
        return next;
      });
    },
    [key]
  );

  return { data, isLoaded, isSyncing, refresh, updateLocal };
}

/**
 * 로그아웃 시 로컬에 저장된 모든 사용자 캐시를 안전하게 삭제
 */
export function clearAllUserCaches() {
  try {
    const keysToRemove = [
      'optimistic_dashboard',
      'optimistic_accounts',
      'optimistic_sellers',
      'optimistic_stats',
    ];
    keysToRemove.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    console.error('캐시 삭제 중 오류:', e);
  }
}
