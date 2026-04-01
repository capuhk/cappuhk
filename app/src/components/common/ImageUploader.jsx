import { useState, useEffect, useRef } from 'react'
import { Camera, X, ImageOff, Loader2 } from 'lucide-react'
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
  // url: signed URL(기존) 또는 blob URL(신규 업로드)
  const [items, setItems] = useState([])

  // value(DB thumb_path 배열) 변경 시 signed URL 일괄 로드
  useEffect(() => {
    if (!value.length) {
      setItems([])
      return
    }

    // NULL(만료) 항목은 url=null로, 유효 항목은 signed URL 요청
    const validPaths = value.filter(Boolean)

    if (!validPaths.length) {
      // 전부 만료된 경우
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
        // signed URL 실패 시 만료 처리
        setItems(value.map((p) => ({ thumb_path: p, url: null, uploading: false })))
      })
  }, [JSON.stringify(value), type])

  // ── 파일 선택 핸들러 ──────────────────────────
  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files)
    if (!files.length) return

    // 추가 가능한 장수 계산
    const available = maxCount - items.length
    const toUpload  = files.slice(0, available)

    // 업로드 중 placeholder 추가
    const placeholders = toUpload.map(() => ({
      thumb_path: null,
      url:        null,
      uploading:  true,
    }))

    setItems((prev) => [...prev, ...placeholders])
    e.target.value = '' // 같은 파일 재선택 가능하도록 초기화

    // 각 파일 업로드 처리
    for (let i = 0; i < toUpload.length; i++) {
      const file      = toUpload[i]
      const blobUrl   = URL.createObjectURL(file)
      const idx       = items.length + i

      try {
        const path = await uploadImage(file, type)

        setItems((prev) => {
          const next = [...prev]
          next[idx] = { thumb_path: path, url: blobUrl, uploading: false }
          return next
        })

        // 부모에 업데이트된 path 배열 전달
        setItems((prev) => {
          const paths = prev
            .filter((it) => !it.uploading && it.thumb_path)
            .map((it) => it.thumb_path)
          onChange(paths)
          return prev
        })
      } catch {
        // 업로드 실패 시 placeholder 제거
        setItems((prev) => prev.filter((_, i2) => i2 !== idx))
      }
    }
  }

  // ── 이미지 삭제 ────────────────────────────────
  const handleDelete = async (index) => {
    const item = items[index]

    // blob URL 메모리 해제
    if (item.url?.startsWith('blob:')) {
      URL.revokeObjectURL(item.url)
    }

    // 이미 업로드된 파일은 Storage에서도 삭제
    if (item.thumb_path) {
      try { await deleteImage(item.thumb_path, type) } catch { /* 무시 */ }
    }

    const next  = items.filter((_, i) => i !== index)
    setItems(next)
    onChange(next.filter((it) => it.thumb_path).map((it) => it.thumb_path))
  }

  const canAdd = items.length < maxCount

  // ── 렌더 ──────────────────────────────────────
  return (
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
            // 이미지 표시
            <img
              src={item.url}
              alt=""
              className="w-full h-full object-cover"
            />
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
  )
}
