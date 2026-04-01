import { useEffect, useRef, useState } from 'react'

// 모바일 pull-to-refresh 훅
// onRefresh: 새로고침 콜백 (Promise 반환 권장)
// threshold: 당기는 거리 기준 (px)
export function usePullToRefresh(onRefresh, threshold = 70) {
  const [pullDistance, setPullDistance] = useState(0)
  const [refreshing, setRefreshing]     = useState(false)
  const startY   = useRef(null)
  const pulling  = useRef(false)

  useEffect(() => {
    const onTouchStart = (e) => {
      // 최상단에 있을 때만 pull 활성화
      if (window.scrollY === 0) {
        startY.current = e.touches[0].clientY
        pulling.current = true
      }
    }

    const onTouchMove = (e) => {
      if (!pulling.current || startY.current === null) return
      const delta = e.touches[0].clientY - startY.current
      if (delta > 0 && window.scrollY === 0) {
        // 기본 스크롤 방지 (당기는 중)
        e.preventDefault()
        // 저항감 적용 — 많이 당길수록 점점 더 힘들게
        setPullDistance(Math.min(delta * 0.5, threshold * 1.5))
      }
    }

    const onTouchEnd = async () => {
      if (!pulling.current) return
      pulling.current = false

      if (pullDistance >= threshold && !refreshing) {
        setRefreshing(true)
        setPullDistance(0)
        try {
          await onRefresh()
        } finally {
          setRefreshing(false)
        }
      } else {
        setPullDistance(0)
      }
      startY.current = null
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: false })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })

    return () => {
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
    }
  }, [onRefresh, pullDistance, refreshing, threshold])

  return { pullDistance, refreshing }
}
