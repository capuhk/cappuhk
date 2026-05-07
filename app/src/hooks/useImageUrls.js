import { useState, useEffect } from 'react'
import { getSignedUrls } from '../utils/imageUpload'

// images : [{ thumb_path, sort_order, ... }] — 이미지 메타 배열
// bucket : 'inspections' | 'defects' | 'facilityOrders' — Storage 버킷 식별자
// 반환   : [{ thumb_path, url }] — signed URL 목록 (만료된 이미지는 url: null)
export function useImageUrls(images, bucket) {
  const [imgUrls, setImgUrls] = useState([])

  useEffect(() => {
    if (!images || images.length === 0) {
      setImgUrls([])
      return
    }

    const sorted = [...images].sort((a, b) => a.sort_order - b.sort_order)
    const paths  = sorted.map((img) => img.thumb_path).filter(Boolean)

    if (paths.length === 0) {
      setImgUrls(sorted.map((img) => ({ thumb_path: img.thumb_path, url: null })))
      return
    }

    getSignedUrls(paths, bucket)
      .then((signed) => {
        const urlMap = Object.fromEntries(signed.map((s) => [s.path, s.signedUrl]))
        setImgUrls(
          sorted.map((img) => ({
            thumb_path: img.thumb_path,
            url:        img.thumb_path ? (urlMap[img.thumb_path] ?? null) : null,
          })),
        )
      })
      .catch(() => {
        setImgUrls(sorted.map((img) => ({ thumb_path: img.thumb_path, url: null })))
      })
  }, [images, bucket]) // eslint-disable-line react-hooks/exhaustive-deps

  return imgUrls
}
