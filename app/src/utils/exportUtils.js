import * as XLSX from 'xlsx'
import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { getSignedUrls } from './imageUpload'
import { getPolicy } from './masterCache'

// ─────────────────────────────────────────────
// Excel 파일 다운로드
// headers: 컬럼 헤더 배열, rows: 2차원 배열
// ─────────────────────────────────────────────
export const downloadExcel = (headers, rows, filename) => {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows])
  // 컬럼 너비 자동 조정 (헤더 기준)
  ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length * 2, 12) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '데이터')
  XLSX.writeFile(wb, `${filename}.xlsx`)
}

// ─────────────────────────────────────────────
// 브라우저 인쇄 창으로 PDF 내보내기
// dataRows: 각 셀이 문자열 또는 { type: 'image', url } 객체인 2차원 배열
// ─────────────────────────────────────────────
export const openPrintWindow = (title, headerRow, dataRows, dateRange) => {
  const headerCells = headerRow.map((h) => `<th>${h}</th>`).join('')
  const bodyRows = dataRows.map((row) => {
    const cells = row.map((cell) => {
      if (cell && typeof cell === 'object' && cell.type === 'image') {
        return cell.url
          ? `<td><img src="${cell.url}" loading="lazy" style="max-width:72px;max-height:72px;object-fit:cover;border-radius:4px;"></td>`
          : `<td style="color:#aaa;font-size:10px;">만료됨</td>`
      }
      return `<td>${cell ?? ''}</td>`
    }).join('')
    return `<tr>${cells}</tr>`
  }).join('')

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, sans-serif; font-size: 11px; margin: 16px; color: #111; }
    h2 { font-size: 15px; margin: 0 0 4px; }
    .meta { font-size: 10px; color: #666; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: middle; }
    th { background: #f0f0f0; font-weight: bold; text-align: center; white-space: nowrap; }
    td { text-align: left; word-break: break-all; }
    img { display: block; margin: auto; }
    .print-btn { margin-bottom: 12px; padding: 6px 16px; cursor: pointer; font-size: 13px; }
    @media print { .print-btn { display: none; } }
  </style>
</head>
<body>
  <h2>${title}</h2>
  <div class="meta">기간: ${dateRange} &nbsp;|&nbsp; 출력일: ${dayjs().format('YYYY-MM-DD')}</div>
  <button class="print-btn" onclick="window.print()">🖨️ 인쇄 / PDF 저장</button>
  <table>
    <thead><tr>${headerCells}</tr></thead>
    <tbody>${bodyRows}</tbody>
  </table>
</body>
</html>`

  const win = window.open('', '_blank')
  if (!win) { alert('팝업이 차단되었습니다. 팝업을 허용해 주세요.'); return }
  win.document.write(html)
  win.document.close()
  // 이미지 로드 완료 후 인쇄 다이얼로그 자동 오픈
  win.onload = () => win.print()
}

// ─────────────────────────────────────────────
// 객실하자 내보내기 데이터 준비
// 반환: { excelRows, printRows }
// ─────────────────────────────────────────────
export const prepareDefectExport = async (records) => {
  if (records.length === 0) return { excelRows: [], printRows: [] }

  // 모든 하자 ID의 첫 번째 이미지 조회
  const ids = records.map((r) => r.id)
  const { data: imgData } = await supabase
    .from('defect_images')
    .select('defect_id, thumb_path')
    .in('defect_id', ids)
    .order('sort_order')

  // defect_id → 첫 번째 thumb_path
  const imgMap = {}
  for (const img of imgData || []) {
    if (!imgMap[img.defect_id]) imgMap[img.defect_id] = img.thumb_path
  }

  // Signed URL 일괄 조회
  const paths = Object.values(imgMap).filter(Boolean)
  const signedMap = {}
  if (paths.length > 0) {
    try {
      const signed = await getSignedUrls(paths, 'defects')
      signed.forEach((s) => { signedMap[s.path] = s.signedUrl })
    } catch { /* URL 실패 시 이미지 없이 진행 */ }
  }

  const excelHeaders = ['상태', '객실번호', '구분', '위치', '하자분류', '메모', '이미지URL', '작성자', '작성일']
  const excelRows = records.map((r) => {
    const path = imgMap[r.id]
    const url  = path ? (signedMap[path] ?? '') : ''
    return [
      r.status,
      r.room_no,
      r.division,
      r.location,
      r.category || '',
      r.memo || '',
      url,
      r.users?.name || '',
      dayjs(r.created_at).format('YYYY-MM-DD'),
    ]
  })

  // PDF용 — 이미지 셀을 객체로
  const printHeaders = ['상태', '객실번호', '구분', '위치', '하자분류', '메모', '이미지', '작성자', '작성일']
  const printRows = records.map((r) => {
    const path = imgMap[r.id]
    const url  = path ? (signedMap[path] ?? null) : null
    return [
      r.status,
      r.room_no,
      r.division,
      r.location,
      r.category || '',
      r.memo || '',
      { type: 'image', url },
      r.users?.name || '',
      dayjs(r.created_at).format('YYYY-MM-DD'),
    ]
  })

  return { excelHeaders, excelRows, printHeaders, printRows }
}

// ─────────────────────────────────────────────
// 시설오더 내보내기 데이터 준비
// 보유기간 초과 이미지는 PDF에서 '만료됨' 표시, 엑셀에서 URL 없음
// ─────────────────────────────────────────────
export const prepareFacilityExport = async (records, policies) => {
  if (records.length === 0) return { excelRows: [], printRows: [] }

  const retentionDays = parseInt(getPolicy(policies, 'image_retention_days', '60'), 10)

  // 보유기간 이내 레코드만 이미지 조회
  const validIds = records
    .filter((r) => dayjs().diff(dayjs(r.created_at), 'day') <= retentionDays)
    .map((r) => r.id)

  const imgMap = {}  // facility_order_id → thumb_path

  if (validIds.length > 0) {
    const { data: imgData } = await supabase
      .from('facility_order_images')
      .select('facility_order_id, thumb_path')
      .in('facility_order_id', validIds)
      .order('sort_order')

    for (const img of imgData || []) {
      if (!imgMap[img.facility_order_id]) imgMap[img.facility_order_id] = img.thumb_path
    }
  }

  const paths = Object.values(imgMap).filter(Boolean)
  const signedMap = {}
  if (paths.length > 0) {
    try {
      const signed = await getSignedUrls(paths, 'facilityOrders')
      signed.forEach((s) => { signedMap[s.path] = s.signedUrl })
    } catch { /* URL 실패 시 이미지 없이 진행 */ }
  }

  const excelHeaders = ['객실번호', '시설종류', '특이사항', '이미지URL', '상태', '작성자', '날짜']
  const excelRows = records.map((r) => {
    const path = imgMap[r.id]
    const url  = path ? (signedMap[path] ?? '') : ''
    return [
      r.room_no,
      r.facility_type_name,
      r.note || '',
      url,
      r.status,
      r.users?.name || '',
      r.work_date,
    ]
  })

  const printHeaders = ['객실번호', '시설종류', '특이사항', '이미지', '상태', '작성자', '날짜']
  const printRows = records.map((r) => {
    const path = imgMap[r.id]
    const url  = path ? (signedMap[path] ?? null) : null
    return [
      r.room_no,
      r.facility_type_name,
      r.note || '',
      { type: 'image', url },
      r.status,
      r.users?.name || '',
      r.work_date,
    ]
  })

  return { excelHeaders, excelRows, printHeaders, printRows }
}
