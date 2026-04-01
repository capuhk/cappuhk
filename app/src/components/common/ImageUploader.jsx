import { useState, useEffect, useRef } from 'react'
import { Camera, X, ImageOff, Loader2, ZoomIn } from 'lucide-react'
import { uploadImage, getSignedUrls, deleteImage } from '../../utils/imageUpload'

// 버킷 타입별 최대 업로드 장수
const MAX_COUNT = {
  inspections:    5,
  defects:        5,
  facilityOrders: 5,
  notices:        3,
}

// 공용 이미지 업로더 컴포넌트
// type     : 'inspections' | 'defects' | 'facilityOrders' | 'notices'
// value    : string[]  — DB에 저장된 thumb_path 배열
// onChange : (paths: string[]) => void  — 부모 폼에 전달
export default function ImageUploader({ type, value = [], onChange }) {
  const inputRef = useRef(null)
  const maxCount = MAX_COUNT[type]

  // 내부 상태: [{thumb_path, url, uploading}]
  const [items, setItems] = useState([])

  // 전체화면 뷰어 상태
  const [viewerIndex, setViewerIndex] = useState(null)

  // value(DB thumb_path 배열) 변경 시 signed URL 일괄 로드
  useEffect(() => {
    if (!value.length) {
      setItems([])
      return
    }

    const validPaths = value.filter(Boolean)

    if (!validPaths.length) {
      setItems(value.map((p) => ({ thumb_path: p, url: null, uploading: false })))
      return
    }

    getSignedUrls(validPaths, type)
      .then((signed) => {
        const urlMap = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]))
        setItems(
          value.map((p) => ({
            thumb_path: p,
            url:        p ? (urlMap[p] ?? null) : null,
            uploading:  false,
          })),
        )
      })
      .catch(() => {
        setItems(value.map((p) => ({ thumb_path: p, url: null, uploading: false })))
      })
  }, [JSON.stringify(value), type])

  // ── 파일 선택 핸들러 ──────────────────────────
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    const available = maxCount - items.length
    const toUpload  = files.slice(0, available)

    const placeholders = toUpload.map(() => ({
      thumb_path: null,
      url:        null,
      uploading:  true,
    }))

    setItems((prev) => [...prev, ...placeholders])
    e.target.value = ''

    for (let i = 0; i < toUpload.length; i++) {
      const file    = toUpload[i]
      const blobUrl = URL.createObjectURL(file)
      const idx     = items.length + i

      try {
        const path = await uploadImage(file, type)

        setItems((prev) => {
          const next = [...prev]
          next[idx] = { thumb_path: path, url: blobUrl, uploading: false }
          return next
        })

        setItems((prev) => {
          const paths = prev
            .filter((it) => !it.uploading && it.thumb_path)
            .map((it) => it.thumb_path)
          onChange(paths)
          return prev
        })
      } catch {
        setItems((prev) => prev.filter((_, i2) => i2 !== idx))
      }
    }
  }

  // ── 이미지 삭제 ────────────────────────────────
  const handleDelete = async (index) => {
    const item = items[index]

    if (item.url?.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }

    if (item.thumb_path) {
      try { await deleteImage(item.thumb_path, type) } catch { /* 무시 */ }
    }

    const next = items.filter((_, i) => i !== index)
    setItems(next)
    onChange(next.filter((it) => it.thumb_path).map((it) => it.thumb_path))
  }

  // ── 뷰어 키보드 닫기 ──────────────────────────
  useEffect(() => {
    if (viewerIndex === null) return
    const onKey = (e) => { if (e.key === 'Escape') setViewerIndex(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewerIndex])

  const canAdd = items.length < maxCount
  // 뷰어에서 표시할 URL 목록 (업로드 완료된 것만)
  const viewableItems = items.filter((it) => !it.uploading && it.url)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {/* 기존·업로드 중 이미지 썸네일 */}
        {items.map((item, idx) => (
          <div
            key={idx}
            className="relative w-20 h-20 rounded-xl overflow-hidden bg-white/10 shrink-0"
          >
            {item.uploading ? (
              // 업로드 중 스피너
              <div className="w-full h-full flex items-center justify-center">
                <Loader2 size={20} className="text-white/50 animate-spin" />
              </div>
            ) : item.url ? (
              // 이미지 표시 — 클릭 시 전체화면 뷰어
              <button
                type="button"
                onClick={() => {
                  const vi = viewableItems.findIndex((it) => it.url === item.url)
                  setViewerIndex(vi >= 0 ? vi : null)
                }}
                className="w-full h-full group"
              >
                <img src={item.url} alt="" className="w-full h-full object-cover" />
                {/* 호버 돋보기 오버레이 */}
                <span className="absolute inset-0 flex items-center justify-center
                  bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                  <ZoomIn size={18} className="text-white" />
                </span>
              </button>
            ) : (
              // 만료된 이미지
              <div className="w-full h-full flex flex-col items-center justify-center gap-1">
                <ImageOff size={16} className="text-white/30" />
                <span className="text-[10px] text-white/30 text-center leading-tight px-1">
                  이미지<br />만료
                </span>
              </div>
            )}

            {/* 삭제 버튼 — 만료 이미지에도 표시 */}
            {!item.uploading && (
              <button
                type="button"
                onClick={() => handleDelete(idx)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full
                  bg-black/70 flex items-center justify-center
                  hover:bg-red-500 transition-colors"
              >
                <X size={11} className="text-white" />
              </button>
            )}
          </div>
        ))}

        {/* 사진 추가 버튼 — 최대 장수 도달 시 숨김 */}
        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="w-20 h-20 rounded-xl bg-white/10 border-2 border-dashed border-white/20
              flex flex-col items-center justify-center gap-1
              hover:bg-white/15 hover:border-white/40 active:scale-95 transition-all shrink-0"
          >
            <Camera size={22} className="text-white/50" />
            <span className="text-[10px] text-white/40">
              {items.length}/{maxCount}
            </span>
          </button>
        )}

        {/* 파일 input — 카메라·갤러리 선택 모두 허용 */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 전체화면 이미지 뷰어 모달 */}
      {viewerIndex !== null && viewableItems.length > 0 && (
        <div
          className="fixed inset-0 z-[9999] bg-black/95 flex items-center justify-center"
          onClick={() => setViewerIndex(null)}
        >
          {/* 닫기 버튼 */}
          <button
            type="button"
            onClick={() => setViewerIndex(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10
              flex items-center justify-center hover:bg-white/20 transition-colors z-10"
          >
            <X size={20} className="text-white" />
          </button>

          {/* 이미지 카운터 */}
          {viewableItems.length > 1 && (
            <span className="absolute top-4 left-1/2 -translate-x-1/2
              text-sm text-white/60 bg-black/40 px-3 py-1 rounded-full z-10">
              {viewerIndex + 1} / {viewableItems.length}
            </span>
          )}

          {/* 이미지 본체 — 클릭 이벤트 전파 막기 */}
          <img
            src={viewableItems[viewerIndex].url}
            alt=""
            className="max-w-full max-h-full object-contain px-2"
            onClick={(e) => e.stopPropagation()}
          />

          {/* 이전/다음 버튼 (2장 이상일 때만) */}
          {viewableItems.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewerIndex((v) => (v - 1 + viewableItems.length) % viewableItems.length) }}
                className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                  bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white text-lg"
              >
                ‹
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setViewerIndex((v) => (v + 1) % viewableItems.length) }}
                className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full
                  bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors text-white text-lg"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  )
}
