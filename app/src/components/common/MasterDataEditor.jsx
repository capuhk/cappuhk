import { useState, useEffect } from 'react'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { invalidateCache, CACHE_KEYS } from '../../utils/masterCache'

// 테이블명 → 캐시 키 매핑
const TABLE_CACHE_MAP = {
  facility_types:    CACHE_KEYS.facilityTypes,
  defect_divisions:  CACHE_KEYS.defectDivisions,
  defect_locations:  CACHE_KEYS.defectLocations,
  defect_categories: CACHE_KEYS.defectCategories,
}

// ─────────────────────────────────────────────
// MasterDataEditor — 마스터 데이터 범용 편집기
//
// Props:
//   title       — 섹션 제목
//   tableName   — Supabase 테이블명 ('facility_types' 등)
//   parentTable — 부모 테이블명 (defect_locations 전용)
//   parentField — 부모 FK 필드명 (defect_locations → 'division_id')
// ─────────────────────────────────────────────
export default function MasterDataEditor({
  title,
  tableName,
  parentTable = null,
  parentField = null,
}) {
  const [items, setItems]           = useState([])
  const [parents, setParents]       = useState([])  // parentTable 항목 (탭용)
  const [selectedParent, setSelectedParent] = useState(null)
  const [loading, setLoading]       = useState(true)
  const [inputVal, setInputVal]     = useState('')
  const [saving, setSaving]         = useState(false)
  const [deletingId, setDeletingId] = useState(null)

  // ── 부모 목록 로드 (defect_locations 전용) ────
  useEffect(() => {
    if (!parentTable) return
    const fetchParents = async () => {
      const { data } = await supabase
        .from(parentTable)
        .select('id, name')
        .eq('is_active', true)
        .order('sort_order')
      setParents(data || [])
      if (data?.length > 0) setSelectedParent(data[0].id)
    }
    fetchParents()
  }, [parentTable])

  // ── 항목 로드 ─────────────────────────────────
  useEffect(() => {
    // parentTable이 있는 경우 selectedParent 확정 후 로드
    if (parentTable && !selectedParent) return

    const fetchItems = async () => {
      setLoading(true)
      let query = supabase
        .from(tableName)
        .select('id, name, sort_order')
        .eq('is_active', true)
        .order('sort_order')

      // 부모 FK 필터 (위치 목록 등)
      if (parentField && selectedParent) {
        query = query.eq(parentField, selectedParent)
      }

      const { data } = await query
      setItems(data || [])
      setLoading(false)
    }

    fetchItems()
  }, [tableName, parentTable, parentField, selectedParent])

  // ── 항목 추가 ─────────────────────────────────
  const handleAdd = async () => {
    const name = inputVal.trim()
    if (!name) return
    if (items.some((i) => i.name === name)) {
      alert('이미 존재하는 항목입니다.')
      return
    }

    setSaving(true)
    const maxOrder = items.length > 0
      ? Math.max(...items.map((i) => i.sort_order ?? 0))
      : -1

    const payload = {
      name,
      sort_order: maxOrder + 1,
      ...(parentField && selectedParent ? { [parentField]: selectedParent } : {}),
    }

    const { data, error } = await supabase
      .from(tableName)
      .insert(payload)
      .select('id, name, sort_order')
      .single()

    if (error) {
      alert('추가 실패: ' + error.message)
    } else {
      setItems((prev) => [...prev, data])
      setInputVal('')
      invalidateCache(TABLE_CACHE_MAP[tableName])
    }
    setSaving(false)
  }

  // ── 항목 삭제 (소프트) ────────────────────────
  const handleDelete = async (item) => {
    if (!window.confirm(`"${item.name}"을(를) 삭제하시겠습니까?`)) return

    setDeletingId(item.id)
    const { error } = await supabase
      .from(tableName)
      .update({ is_active: false })
      .eq('id', item.id)

    if (error) {
      alert('삭제 실패: ' + error.message)
    } else {
      setItems((prev) => prev.filter((i) => i.id !== item.id))
      invalidateCache(TABLE_CACHE_MAP[tableName])
    }
    setDeletingId(null)
  }

  // ── 렌더 ─────────────────────────────────────
  return (
    <section>
      <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">
        {title}
      </h2>

      <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-3">

        {/* 부모 탭 (defect_locations 전용) */}
        {parentTable && parents.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2 border-b border-white/8">
            {parents.map((p) => (
              <button
                key={p.id}
                onClick={() => { setSelectedParent(p.id); setInputVal('') }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all
                  ${selectedParent === p.id
                    ? 'bg-blue-500 text-white'
                    : 'bg-white/10 text-white/50 hover:bg-white/15'
                  }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}

        {/* 항목 목록 */}
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 size={18} className="text-white/30 animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-xs text-white/25 text-center py-3">항목이 없습니다.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl
                  bg-white/10 text-sm text-white/80"
              >
                <span>{item.name}</span>
                <button
                  onClick={() => handleDelete(item)}
                  disabled={deletingId === item.id}
                  className="text-white/25 hover:text-red-400 transition-colors disabled:opacity-40"
                >
                  {deletingId === item.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <Trash2 size={10} />
                  }
                </button>
              </div>
            ))}
          </div>
        )}

        {/* 추가 입력 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={inputVal}
            onChange={(e) => setInputVal(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            placeholder="새 항목 이름"
            className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/15
              text-white text-sm outline-none focus:border-white/35 transition-colors
              placeholder:text-white/25"
          />
          <button
            onClick={handleAdd}
            disabled={saving || !inputVal.trim()}
            className="px-3 py-2 rounded-xl bg-blue-600/30 text-blue-400 text-sm
              hover:bg-blue-600/50 transition-colors disabled:opacity-40
              flex items-center gap-1"
          >
            {saving
              ? <Loader2 size={13} className="animate-spin" />
              : <Plus size={13} />
            }
            추가
          </button>
        </div>
      </div>
    </section>
  )
}
