import { supabase } from '../lib/supabase'

// ─────────────────────────────────────────────
// 버킷 상수
// ─────────────────────────────────────────────
export const BUCKETS = {
  inspections:    'thumb-inspections',
  defects:        'thumb-defects',
  facilityOrders: 'thumb-facility-orders',
  notices:        'thumb-notices',
  avatars:        'avatars',
}

// ─────────────────────────────────────────────
// 버킷별 리사이징 설정
// ─────────────────────────────────────────────
const RESIZE_CONFIG = {
  inspections:    { maxWidth: 1600, quality: 0.75 },
  defects:        { maxWidth: 800,  quality: 0.70 },
  facilityOrders: { maxWidth: 300,  quality: 0.70 },
  notices:        { maxWidth: 300,  quality: 0.70 },
  avatars:        { maxWidth: 300,  quality: 0.80 },
}

// ─────────────────────────────────────────────
// Canvas API로 이미지 리사이징 → Blob 반환
// maxWidth 이하면 원본 크기 유지
// ─────────────────────────────────────────────
const resizeImage = (file, maxWidth, quality) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    const url = URL.createObjectURL(file)

    img.onload = () => {
      const scale = img.width > maxWidth ? maxWidth / img.width : 1
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(img.width  * scale)
      canvas.height = Math.round(img.height * scale)
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
      URL.revokeObjectURL(url)
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('canvas.toBlob 실패')),
        'image/jpeg',
        quality,
      )
    }

    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('이미지 로드 실패'))
    }

    img.src = url
  })

// ─────────────────────────────────────────────
// 이미지 업로드
// 리사이징 → 해당 버킷에 저장 → thumb_path 반환
// ─────────────────────────────────────────────
export const uploadImage = async (file, type) => {
  const { maxWidth, quality } = RESIZE_CONFIG[type]
  const blob   = await resizeImage(file, maxWidth, quality)
  const path   = `${Date.now()}_${crypto.randomUUID()}.jpg`
  const bucket = BUCKETS[type]

  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: 'image/jpeg',
  })
  if (error) throw error

  return path
}

// ─────────────────────────────────────────────
// Signed URL 생성 — Private 버킷, 24시간 유효
// ─────────────────────────────────────────────
export const getSignedUrl = async (path, type) => {
  const { data, error } = await supabase.storage
    .from(BUCKETS[type])
    .createSignedUrl(path, 86400)
  if (error) throw error
  return data.signedUrl
}

// ─────────────────────────────────────────────
// 여러 path 일괄 Signed URL 생성
// 반환: [{ path, signedUrl }]
// ─────────────────────────────────────────────
export const getSignedUrls = async (paths, type) => {
  if (!paths.length) return []
  const { data, error } = await supabase.storage
    .from(BUCKETS[type])
    .createSignedUrls(paths, 86400)
  if (error) throw error
  return data
}

// ─────────────────────────────────────────────
// 이미지 삭제
// ─────────────────────────────────────────────
export const deleteImage = async (path, type) => {
  const { error } = await supabase.storage
    .from(BUCKETS[type])
    .remove([path])
  if (error) throw error
}

// ─────────────────────────────────────────────
// 아바타 업로드 (Public 버킷 전용)
// 경로: {userId}/avatar.jpg — 덮어쓰기로 과거 파일 자동 교체
// 반환: Public URL 문자열
// ─────────────────────────────────────────────
export const uploadAvatar = async (file, userId) => {
  const { maxWidth, quality } = RESIZE_CONFIG.avatars
  const blob = await resizeImage(file, maxWidth, quality)
  const path = `${userId}/avatar.jpg`

  const { error } = await supabase.storage
    .from(BUCKETS.avatars)
    .upload(path, blob, {
      contentType: 'image/jpeg',
      upsert: true, // 기존 파일 덮어쓰기
    })
  if (error) throw error

  // Public 버킷이므로 Signed URL 없이 공개 URL 반환
  const { data } = supabase.storage.from(BUCKETS.avatars).getPublicUrl(path)
  // 캐시 무효화를 위해 타임스탬프 쿼리 추가
  return `${data.publicUrl}?t=${Date.now()}`
}

// ─────────────────────────────────────────────
// 아바타 Public URL 조회 (업로드 없이 URL만 필요할 때)
// ─────────────────────────────────────────────
export const getAvatarUrl = (userId) => {
  const { data } = supabase.storage
    .from(BUCKETS.avatars)
    .getPublicUrl(`${userId}/avatar.jpg`)
  return data.publicUrl
}
