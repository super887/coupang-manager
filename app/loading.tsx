// app/loading.tsx

export default function Loading() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50/80 backdrop-blur-sm">
      <div className="relative">
        {/* 뱅글뱅글 돌아가는 보라색 스피너 */}
        <div className="w-12 h-12 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
        {/* 가운데 작은 포인트 박스 (디자인 디테일) */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-purple-600 rounded-full animate-pulse"></div>
      </div>
      <h2 className="mt-6 text-lg font-extrabold text-gray-800 tracking-tight">
        데이터를 불러오고 있습니다
      </h2>
      <p className="mt-2 text-sm font-medium text-gray-500">
        잠시만 기다려주세요...
      </p>
    </div>
  );
}