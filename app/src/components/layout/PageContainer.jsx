// 페이지 내부 공통 패딩 컨테이너
// 모바일: p-4 / 태블릿·PC: p-6
export default function PageContainer({ children, className = '' }) {
  return (
    <div className={`px-4 py-4 md:px-6 md:py-6 ${className}`}>
      {children}
    </div>
  )
}
