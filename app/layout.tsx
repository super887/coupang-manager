import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Script from 'next/script'; // ✨ 이거 꼭 추가해주십쇼!

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '리뷰오토 - 쿠팡 리뷰 관리',
  description: 'AI 기반 쿠팡 리뷰 자동 생성 및 관리 솔루션',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <head>
        {/* ✨ 구글 애드센스 기본 스크립트 (모든 페이지에 자동 적용됨) */}
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-7658732199413840"
          crossOrigin="anonymous"
          strategy="lazyOnload" // 로딩 속도 저하 방지
        />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}