import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2, ChevronUp, ChevronDown } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invalidateCache, CACHE_KEYS } from '../../utils/masterCache'
import { STATUS_COLOR_MAP, COLOR_OPTIONS } from '../../utils/statusColors'

// ─────────────────────────────────────────────
// StatusSortableEditor — 인스펙션 객실상태 관리
// 추가 / 삭제 / 색상 선택 / 순서 변경(↑↓)
// ─────────────────────────────────────────────
export default function StatusSortableEditor() {
  const [items, setItems]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [inputName, setInputName] = useState('')
  const [inputColor, setInputColor] = useState('zinc')
  const [saving, setSaving]       = useState(false)
  const [deletingId, setDeletingId] = useState(null)
  const [movingId, setMovingId]   = useState(null)

  // ── 데이터 로드 ───────────────────────────────
  const fetchItems = async () => {
    const { data } = await supabase
      .from('inspection_statuses')
      .select('id, name, color, sort_order')
      .eq('is_active', true)
      .order('sort_order')
    setItems(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchItems() }, [])

  // ── 순서 변경 (↑ / ↓) ────────────────────────
  const handleMove = async (index, dir) => {
    const swapIndex = index + dir
    if (swapIndex < 0 || swapIndex >= items.length) return

    const a = items[index]
    const b = items[swapIndex]
    setMovingId(a.id)

    // 두 항목의 sort_order 교환
    await Promise.all([
      supabase.from('inspection_statuses').update({ sort_order: b.sort_order }).eq('id', a.id),
      supabase.from('inspection_statuses').update({ sort_order: a.sort_order }).eq('id', b.id),
    ])

    // 로컬 상태 즉시 교환
    setItems((prev) => {
      const next = [...prev]
      next[index]     = { ...a, sort_order: b.sort_order }
      next[swapIndex] = { ...b, sort_order: a.sort_order }
      return next.sort((x, y) => x.sort_order - y.sort_order)
    })
    await invalidateCache(CACHE_KEYS.inspectionStatuses)
    setMovingId(null)
  }

  // ── 항목 추가 ─────────────────────────────────
  const handleAdd = async () => {
    const name = inputName.trim()
    if (!name) return
    if (items.some((i) => i.name === name)) {
      alert('이미 존재하는 상태명입니다.')
      return
    }

    setSaving(true)
    const maxOrder = items.length > 0
      ? Math.max(...items.map((i) => i.sort_order ?? 0))
      : -1

    const { data, error } = await supabase
      .from('inspection_statuses')
      .insert({ name, color: inputColor, sort_order: maxOrder + 1 })
      .select('id, name, color, sort_order')
      .single()

    if (error) {
      alert('추가 실패: ' + error.message)
    } else {
      setItems((prev) => [...prev, data])
      setInputName('')
      setInputColor('zinc')
      await invalidateCache(CACHE_KEYS.inspectionStatuses)
    }
    setSaving(false)
  }

  // ── 항목 삭제 (소프트) ────────────────────────
  const handleDelete = async (item) => {
    if (items.length <= 1) { alert('최소 1개 이상의 상태가 필요합니다.'); return }
    if (!window.confirm(`"${item.name}" 상태를 삭제하시겠습니까?`)) return

    setDeletingId(item.id)
    const { error } = await supabase
      .from('inspection_statuses')
      .update({ is_active: false })
      .eq('id', item.id)

    if (error) {
      alert('삭제 실패: ' + error.message)
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      await invalidateCache(CACHE_KEYS.inspectionStatuses)
    }
    setDeletingId(null)
  }

  // ── 렌더 ─────────────────────────────────────
  return (
    <section>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
        인스펙션 객실상태 관리
      </h2>

      <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-3">
        {/* 항목 목록 */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="text-white/30 animate-spin" />
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, idx) => (
              <div key={item.id}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-white/8">
                {/* 색상 스왓치 */}
                <div className={`w-3 h-3 rounded-full shrink-0 ${STATUS_COLOR_MAP[item.color]?.swatch ?? 'bg-zinc-500'}`} />

                {/* 상태명 */}
                <span className="flex-1 text-sm text-white/80">{item.name}</span>

                {/* 순서 이동 버튼 */}
                <div className="flex items-center gap-0.5">
                  <button
                    onClick={() => handleMove(idx, -1)}
                    disabled={idx === 0 || movingId === item.id}
                    className="w-6 h-6 flex items-center justify-center rounded
                      text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors"
                  >
                    <ChevronUp size={13} />
                  </button>
                  <button
                    onClick={() => handleMove(idx, 1)}
                    disabled={idx === items.length - 1 || movingId === item.id}
                    className="w-6 h-6 flex items-center justify-center rounded
                      text-white/30 hover:text-white/60 disabled:opacity-20 transition-colors"
                  >
                    <ChevronDown size={13} />
                  </button>
                </div>

                {/* 삭제 버튼 */}
                <button
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  className="w-6 h-6 flex items-center justify-center rounded
                    text-white/20 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deletingId === item.id
                    ? <Loader2 size={11} className="animate-spin" />
                    : <Trash2 size={11} />
                  }
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 추가 입력 */}
        <div className="space-y-2 pt-1 border-t border-white/8">
          {/* 색상 선택 스왓치 */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-white/35 w-10 shrink-0">색상</span>
            <div className="flex gap-1.5">
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c}
                  onClick={() => setInputColor(c)}
                  className={`w-5 h-5 rounded-full transition-all
                    ${STATUS_COLOR_MAP[c].swatch}
                    ${inputColor === c ? 'ring-2 ring-white/60 ring-offset-1 ring-offset-zinc-900 scale-110' : 'opacity-50 hover:opacity-80'}`}
                />
              ))}
            </div>
          </div>

          {/* 이름 입력 + 추가 버튼 */}
          <div className="flex gap-2">
            <input
              type="text"
              value={inputName}
              onChange={(e) => setInputName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder="새 상태명 (예: 점검중)"
              className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/15
                text-white text-sm outline-none focus:border-white/35 transition-colors
                placeholder:text-white/25"
            />
            <button
              onClick={handleAdd}
              disabled={saving || !inputName.trim()}
              className="px-3 py-2 rounded-xl bg-blue-600/30 text-blue-400 text-sm
                hover:bg-blue-600/50 transition-colors disabled:opacity-40
                flex items-center gap-1"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              추가
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
