import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Loader2, ChevronRight, ChevronDown, ChevronUp,
  UserX, UserCheck, Unlock, KeyRound,
  Bell, BellOff, Plus, Trash2, Zap, Camera,
} from 'lucide-react'
import { supabase } from '../lib/supabase'
import useAuthStore from '../store/useAuthStore'
import { getPushStatus, subscribePush, unsubscribePush } from '../utils/pushSubscription'
import { clearAllCache, invalidateCache, CACHE_KEYS } from '../utils/masterCache'
import { uploadAvatar } from '../utils/imageUpload'
import useToastStore from '../store/useToastStore'
import MasterDataEditor from '../components/common/MasterDataEditor'
import StatusSortableEditor from '../components/common/StatusSortableEditor'
import AppPolicyEditor from '../components/common/AppPolicyEditor'

const ROLE_LABEL = {
  admin: '관리자', manager: '소장', supervisor: '주임',
  maid: '메이드', facility: '시설',
}
const ROLE_COLOR = {
  admin: 'bg-red-500/20 text-red-400',
  manager: 'bg-purple-500/20 text-purple-400',
  supervisor: 'bg-blue-500/20 text-blue-400',
  maid: 'bg-zinc-500/20 text-zinc-400',
  facility: 'bg-emerald-500/20 text-emerald-400',
}
const ROLE_ORDER = { admin: 0, manager: 1, supervisor: 2, maid: 3, facility: 4 }

// 상단 탭 정의
const TABS = [
  { id: 'me',     label: '내 정보' },
  { id: 'hotel',  label: '호텔/객실' },
  { id: 'staff',  label: '직원 관리' },
  { id: 'master', label: '마스터 코드' },
  { id: 'policy', label: '운영 정책' },
]

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, isManager, refreshProfile } = useAuthStore()
  const toast = useToastStore((s) => s.show)

  // ── 탭 상태 ──────────────────────────────────
  const [activeTab, setActiveTab] = useState('me')

  // ── 내 정보 ───────────────────────────────────
  const [myName, setMyName]         = useState(user?.name || '')
  const [savingName, setSavingName] = useState(false)
  const [nameMsg, setNameMsg]       = useState(null)
  const [avatarUrl, setAvatarUrl]   = useState(user?.avatar_url || null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [newPin, setNewPin]         = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [savingPin, setSavingPin]   = useState(false)
  const [pinMsg, setPinMsg]         = useState(null)
  const [pushStatus, setPushStatus]   = useState('unsubscribed')
  const [pushLoading, setPushLoading] = useState(false)

  // ── 호텔/객실 ─────────────────────────────────
  const [rooms, setRooms]               = useState([])
  const [loadingRooms, setLoadingRooms] = useState(false)
  const [expandedFloors, setExpandedFloors] = useState(new Set()) // 펼쳐진 층
  const [newRoomInputs, setNewRoomInputs]   = useState({})
  const [savingRoom, setSavingRoom]         = useState(false)
  // 일괄 생성
  const [bulkOpen, setBulkOpen]     = useState(true)
  const [bulkFloorFrom, setBulkFloorFrom] = useState('')
  const [bulkFloorTo, setBulkFloorTo]     = useState('')
  const [bulkRoomFrom, setBulkRoomFrom]   = useState('')
  const [bulkRoomTo, setBulkRoomTo]       = useState('')
  const [bulkLoading, setBulkLoading]     = useState(false)
  // 일괄 삭제
  const [delBulkOpen, setDelBulkOpen]       = useState(false)
  const [delFloorFrom, setDelFloorFrom]     = useState('')
  const [delFloorTo, setDelFloorTo]         = useState('')
  const [delRoomFrom, setDelRoomFrom]       = useState('')
  const [delRoomTo, setDelRoomTo]           = useState('')
  const [delBulkLoading, setDelBulkLoading] = useState(false)

  // ── 직원 관리 ─────────────────────────────────
  const [staffList, setStaffList]     = useState([])
  const [loadingList, setLoadingList] = useState(false)
  const [togglingId, setTogglingId]   = useState(null)

  // ── 초기화 ────────────────────────────────────
  useEffect(() => {
    if (user?.name) setMyName(user.name)
    if (user?.avatar_url) setAvatarUrl(user.avatar_url)
    getPushStatus().then(setPushStatus)
  }, [user?.name, user?.avatar_url])

  useEffect(() => {
    if (!isManager()) return
    fetchRooms()
    fetchStaff()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const fetchRooms = async () => {
    setLoadingRooms(true)
    const { data } = await supabase
      .from('room_master')
      .select('id, floor, room_no, sort_order')
      .eq('is_active', true)
      .order('floor').order('sort_order')
    setRooms(data || [])
    setLoadingRooms(false)
  }

  const fetchStaff = async () => {
    setLoadingList(true)
    const { data } = await supabase
      .from('users')
      .select('id, name, role, is_active, is_locked, avatar_url')
      .order('name')
    const sorted = (data || []).sort((a, b) => {
      const d = (ROLE_ORDER[a.role] ?? 99) - (ROLE_ORDER[b.role] ?? 99)
      return d !== 0 ? d : a.name.localeCompare(b.name, 'ko')
    })
    setStaffList(sorted)
    setLoadingList(false)
  }

  // ── 아바타 업로드 ─────────────────────────────
  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingAvatar(true)
    try {
      // 300px 리사이징 후 업로드 → Public URL 반환
      const publicUrl = await uploadAvatar(file, user.id)
      // users 테이블 avatar_url 업데이트
      await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', user.id)
      setAvatarUrl(publicUrl)
      await refreshProfile()
    } catch (err) {
      toast('사진 업로드 실패: ' + err.message, 'error')
    } finally {
      setUploadingAvatar(false)
      // input 초기화 (같은 파일 재선택 가능하도록)
      e.target.value = ''
    }
  }

  // ── 내 정보 핸들러 ────────────────────────────
  const handleSaveName = async () => {
    if (!myName.trim() || myName.trim() === user?.name) return
    setSavingName(true); setNameMsg(null)
    const { error } = await supabase.from('users').update({ name: myName.trim() }).eq('id', user.id)
    if (error) setNameMsg({ type: 'err', text: '저장 실패: ' + error.message })
    else { await refreshProfile(); setNameMsg({ type: 'ok', text: '이름이 변경되었습니다.' }) }
    setSavingName(false)
  }

  const handleChangePin = async () => {
    setPinMsg(null)
    if (newPin.length < 6) { setPinMsg({ type: 'err', text: 'PIN은 6자리 이상이어야 합니다.' }); return }
    if (newPin !== confirmPin) { setPinMsg({ type: 'err', text: 'PIN이 일치하지 않습니다.' }); return }
    setSavingPin(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPin })
      if (error) setPinMsg({ type: 'err', text: '변경 실패: ' + error.message })
      else { setNewPin(''); setConfirmPin(''); setPinMsg({ type: 'ok', text: 'PIN이 변경되었습니다.' }) }
    } catch (err) {
      setPinMsg({ type: 'err', text: '오류가 발생했습니다. 다시 시도해주세요.' })
      console.error('PIN 변경 오류:', err)
    } finally {
      setSavingPin(false)
    }
  }

  const handleTogglePush = async () => {
    setPushLoading(true)
    try {
      if (pushStatus === 'subscribed') { await unsubscribePush(user.id); setPushStatus('unsubscribed') }
      else { await subscribePush(user.id); setPushStatus('subscribed') }
    } catch (err) { toast(err.message, 'error') }
    finally { setPushLoading(false) }
  }

  // ── 층 토글 (아코디언) ────────────────────────
  const toggleFloor = (floor) => {
    setExpandedFloors((prev) => {
      const next = new Set(prev)
      next.has(floor) ? next.delete(floor) : next.add(floor)
      return next
    })
  }

  // ── 객실 추가 ─────────────────────────────────
  const handleAddRoom = async (floor) => {
    const roomNo = (newRoomInputs[floor] || '').trim()
    if (!roomNo) return
    if (rooms.some((r) => r.room_no === roomNo)) { toast(`${roomNo}호는 이미 존재합니다.`, 'error'); return }
    setSavingRoom(true)
    const floorRooms = rooms.filter((r) => r.floor === floor)
    const maxOrder   = floorRooms.length > 0 ? Math.max(...floorRooms.map((r) => r.sort_order || 0)) : -1
    const { data, error } = await supabase
      .from('room_master').insert({ floor, room_no: roomNo, sort_order: maxOrder + 1 })
      .select('id, floor, room_no, sort_order').single()
    if (error) toast('객실 추가 실패: ' + error.message, 'error')
    else {
      setRooms((prev) => [...prev, data].sort((a, b) => a.floor - b.floor || (a.sort_order ?? 0) - (b.sort_order ?? 0)))
      setNewRoomInputs((prev) => ({ ...prev, [floor]: '' }))
      invalidateCache(CACHE_KEYS.rooms)
    }
    setSavingRoom(false)
  }

  // ── 객실 삭제 (소프트) ────────────────────────
  const handleDeleteRoom = async (room) => {
    if (!window.confirm(`${room.room_no}호를 삭제하시겠습니까?`)) return
    const { error } = await supabase.from('room_master').update({ is_active: false }).eq('id', room.id)
    if (error) toast('삭제 실패: ' + error.message, 'error')
    else { setRooms((prev) => prev.filter((r) => r.id !== room.id)); invalidateCache(CACHE_KEYS.rooms) }
  }

  // ── 일괄 생성 ─────────────────────────────────
  const handleBulkCreate = async () => {
    const fFrom = parseInt(bulkFloorFrom, 10)
    const fTo   = parseInt(bulkFloorTo, 10)
    const rFrom = parseInt(bulkRoomFrom, 10)
    const rTo   = parseInt(bulkRoomTo, 10)

    if (!fFrom || !fTo || !rFrom || !rTo) { toast('층 범위와 호수 범위를 모두 입력해주세요.', 'error'); return }
    if (fFrom > fTo || rFrom > rTo) { toast('시작값이 끝값보다 클 수 없습니다.', 'error'); return }

    const total = (fTo - fFrom + 1) * (rTo - rFrom + 1)
    if (!window.confirm(`${fFrom}층~${fTo}층, ${rFrom}호~${rTo}호\n총 ${total}개 객실을 생성합니다.`)) return

    setBulkLoading(true)
    // 이미 존재하는 room_no 목록
    const existingNos = new Set(rooms.map((r) => r.room_no))

    const inserts = []
    for (let f = fFrom; f <= fTo; f++) {
      for (let r = rFrom; r <= rTo; r++) {
        const roomNo = String(f * 100 + r)
        if (!existingNos.has(roomNo)) {
          inserts.push({ floor: f, room_no: roomNo, sort_order: f * 100 + r })
        }
      }
    }

    if (inserts.length === 0) { toast('생성할 새 객실이 없습니다 (이미 모두 존재).', 'error'); setBulkLoading(false); return }

    // 50개씩 나눠서 삽입 (Supabase 요청 크기 제한 대비)
    const chunks = []
    for (let i = 0; i < inserts.length; i += 50) chunks.push(inserts.slice(i, i + 50))

    for (const chunk of chunks) {
      const { error } = await supabase.from('room_master').insert(chunk)
      if (error) { toast('일괄 생성 실패: ' + error.message, 'error'); setBulkLoading(false); return }
    }

    await fetchRooms()
    await invalidateCache(CACHE_KEYS.rooms)
    toast(`${inserts.length}개 객실이 생성되었습니다.`, 'success')
    setBulkFloorFrom(''); setBulkFloorTo(''); setBulkRoomFrom(''); setBulkRoomTo('')
    setBulkLoading(false)
  }

  // ── 일괄 삭제 ─────────────────────────────────
  const handleBulkDelete = async () => {
    const fFrom = parseInt(delFloorFrom, 10)
    const fTo   = parseInt(delFloorTo, 10)
    const rFrom = parseInt(delRoomFrom, 10)
    const rTo   = parseInt(delRoomTo, 10)

    if (!fFrom || !fTo || !rFrom || !rTo) { toast('층 범위와 호수 범위를 모두 입력해주세요.', 'error'); return }
    if (fFrom > fTo || rFrom > rTo) { toast('시작값이 끝값보다 클 수 없습니다.', 'error'); return }

    // 삭제 대상 room_no 목록 생성
    const targetNos = new Set()
    for (let f = fFrom; f <= fTo; f++) {
      for (let r = rFrom; r <= rTo; r++) {
        targetNos.add(String(f * 100 + r))
      }
    }
    const targets = rooms.filter((r) => targetNos.has(r.room_no))

    if (targets.length === 0) { toast('삭제할 객실이 없습니다.', 'error'); return }
    if (!window.confirm(`${fFrom}층~${fTo}층, ${rFrom}호~${rTo}호 범위\n총 ${targets.length}개 객실을 삭제합니다.`)) return

    setDelBulkLoading(true)
    const ids = targets.map((r) => r.id)

    // 50개씩 나눠서 삭제
    const chunks = []
    for (let i = 0; i < ids.length; i += 50) chunks.push(ids.slice(i, i + 50))

    for (const chunk of chunks) {
      const { error } = await supabase.from('room_master').update({ is_active: false }).in('id', chunk)
      if (error) { toast('일괄 삭제 실패: ' + error.message, 'error'); setDelBulkLoading(false); return }
    }

    setRooms((prev) => prev.filter((r) => !targetNos.has(r.room_no)))
    await invalidateCache(CACHE_KEYS.rooms)
    toast(`${targets.length}개 객실이 삭제되었습니다.`, 'success')
    setDelFloorFrom(''); setDelFloorTo(''); setDelRoomFrom(''); setDelRoomTo('')
    setDelBulkLoading(false)
  }

  // ── 직원 관리 핸들러 ──────────────────────────
  const handleResetPin = async (staff) => {
    const pin = window.prompt(`[${staff.name}] 새 PIN을 입력하세요 (6자리 숫자)`, '000000')
    if (pin === null) return
    if (!/^\d{6}$/.test(pin)) { toast('PIN은 6자리 숫자만 입력 가능합니다.', 'error'); return }
    setTogglingId(staff.id)
    const { data: { session } } = await supabase.auth.getSession()
    const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reset-user-pin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ userId: staff.id, pin }),
    })
    if (res.ok) {
      setStaffList((prev) => prev.map((s) => s.id === staff.id ? { ...s, is_locked: false } : s))
      invalidateCache(CACHE_KEYS.users)
      toast(`[${staff.name}] PIN이 초기화되었습니다.`, 'success')
    } else {
      const r = await res.json(); toast('PIN 초기화 실패: ' + (r.error || '오류'), 'error')
    }
    setTogglingId(null)
  }

  const handleUnlock = async (staffId) => {
    setTogglingId(staffId)
    await supabase.from('users').update({ is_locked: false, pin_failed: 0 }).eq('id', staffId)
    setStaffList((prev) => prev.map((s) => s.id === staffId ? { ...s, is_locked: false } : s))
    invalidateCache(CACHE_KEYS.users)
    setTogglingId(null)
  }

  const handleToggleActive = async (staff) => {
    const next = !staff.is_active
    if (!window.confirm(`${staff.name} 직원을 ${next ? '활성화' : '비활성화'}하시겠습니까?`)) return
    setTogglingId(staff.id)
    await supabase.from('users').update({ is_active: next }).eq('id', staff.id)
    setStaffList((prev) => prev.map((s) => s.id === staff.id ? { ...s, is_active: next } : s))
    await invalidateCache(CACHE_KEYS.users)
    setTogglingId(null)
  }

  // ── 층별 그룹 계산 ────────────────────────────
  const floors = [...new Set(rooms.map((r) => r.floor))].sort((a, b) => a - b)

  // ── 렌더 ─────────────────────────────────────
  return (
    <div className="pb-20">

      {/* ── 상단 탭 바 ──────────────────────────── */}
      <div className="sticky top-0 z-10 bg-zinc-950/95 backdrop-blur border-b border-white/8">
        <div className="flex max-w-xl mx-auto px-4">
          {TABS.filter((t) => {
            // 직원 관리·마스터 코드·운영 정책은 관리자만
            if ((t.id === 'staff' || t.id === 'master' || t.id === 'hotel' || t.id === 'policy') && !isManager()) return false
            return true
          }).map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 py-3 text-xs font-medium transition-all border-b-2
                ${activeTab === tab.id
                  ? 'text-white border-blue-500'
                  : 'text-white/40 border-transparent hover:text-white/60'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 pt-6 max-w-xl mx-auto space-y-6">

        {/* ════════════════════════════════════════
            탭 1 — 내 정보
        ════════════════════════════════════════ */}
        {activeTab === 'me' && (
          <div className="space-y-6">

            {/* 프로필 사진 */}
            <section>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">프로필 사진</h2>
              <div className="bg-white/5 rounded-2xl px-4 py-4 flex items-center gap-4">
                {/* 아바타 원형 */}
                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-white/10 flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="프로필" className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-2xl font-bold text-white/40">
                        {(user?.name || '?')[0]}
                      </span>
                    )}
                  </div>
                  {/* 카메라 아이콘 오버레이 */}
                  {uploadingAvatar && (
                    <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center">
                      <Loader2 size={20} className="text-white animate-spin" />
                    </div>
                  )}
                </div>

                <div className="flex-1">
                  <p className="text-sm text-white/70 mb-1">{user?.name}</p>
                  <p className="text-xs text-white/35 mb-3">300px · JPG/PNG/WebP · 최대 1MB</p>
                  {/* 숨겨진 파일 인풋 */}
                  <label className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl
                    bg-white/10 text-white/60 text-xs font-medium cursor-pointer
                    hover:bg-white/15 transition-colors
                    ${uploadingAvatar ? 'opacity-40 pointer-events-none' : ''}`}
                  >
                    <Camera size={13} />
                    사진 변경
                    <input
                      type="file" accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={handleAvatarChange}
                      disabled={uploadingAvatar}
                    />
                  </label>
                </div>
              </div>
            </section>

            {/* 이름 수정 */}
            <section>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">이름</h2>
              <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text" value={myName}
                    onChange={(e) => setMyName(e.target.value)}
                    className="flex-1 px-3 py-2.5 bg-white/10 rounded-xl border border-white/15
                      text-white text-sm outline-none focus:border-white/35 transition-colors"
                  />
                  <button
                    onClick={handleSaveName}
                    disabled={savingName || !myName.trim() || myName.trim() === user?.name}
                    className="px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium
                      hover:bg-blue-500 active:scale-95 transition-all disabled:opacity-40 flex items-center gap-1.5"
                  >
                    {savingName && <Loader2 size={13} className="animate-spin" />}
                    저장
                  </button>
                </div>
                {nameMsg && (
                  <p className={`text-xs ${nameMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {nameMsg.text}
                  </p>
                )}
              </div>
            </section>

            {/* PIN 변경 */}
            <section>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">PIN 변경</h2>
              <div className="bg-white/5 rounded-2xl px-4 py-4 space-y-2">
                <input
                  type="password" value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="새 PIN (6자리 숫자)" inputMode="numeric"
                  className="w-full px-3 py-2.5 bg-white/10 rounded-xl border border-white/15
                    text-white text-sm outline-none focus:border-white/35 transition-colors placeholder:text-white/25"
                />
                <input
                  type="password" value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="PIN 확인" inputMode="numeric"
                  className="w-full px-3 py-2.5 bg-white/10 rounded-xl border border-white/15
                    text-white text-sm outline-none focus:border-white/35 transition-colors placeholder:text-white/25"
                />
                <button
                  onClick={handleChangePin}
                  disabled={savingPin || newPin.length < 6 || newPin !== confirmPin}
                  className="w-full py-2.5 rounded-xl bg-white/10 text-white/70 text-sm font-medium
                    hover:bg-white/15 active:scale-[0.98] transition-all disabled:opacity-40
                    flex items-center justify-center gap-1.5"
                >
                  {savingPin && <Loader2 size={13} className="animate-spin" />}
                  PIN 변경
                </button>
                {pinMsg && (
                  <p className={`text-xs ${pinMsg.type === 'ok' ? 'text-emerald-400' : 'text-red-400'}`}>
                    {pinMsg.text}
                  </p>
                )}
              </div>
            </section>

            {/* 푸시 알림 */}
            <section>
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">알림</h2>
              <div className="bg-white/5 rounded-2xl px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white/80">푸시 알림</p>
                  <p className="text-xs text-white/35 mt-0.5">
                    {pushStatus === 'unsupported' && '이 기기는 푸시 알림을 지원하지 않습니다.'}
                    {pushStatus === 'denied'       && '브라우저 설정에서 알림을 허용해 주세요.'}
                    {pushStatus === 'subscribed'   && '알림 수신 중'}
                    {pushStatus === 'unsubscribed' && '알림을 받으려면 켜세요.'}
                  </p>
                </div>
                <button
                  onClick={handleTogglePush}
                  disabled={pushLoading || pushStatus === 'unsupported' || pushStatus === 'denied'}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium
                    transition-all disabled:opacity-40
                    ${pushStatus === 'subscribed'
                      ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                      : 'bg-white/10 text-white/50 hover:bg-white/15'
                    }`}
                >
                  {pushLoading
                    ? <Loader2 size={14} className="animate-spin" />
                    : pushStatus === 'subscribed'
                      ? <><Bell size={14} /> 켜짐</>
                      : <><BellOff size={14} /> 꺼짐</>
                  }
                </button>
              </div>
            </section>
          </div>
        )}

        {/* ════════════════════════════════════════
            탭 2 — 호텔/객실 관리
        ════════════════════════════════════════ */}
        {activeTab === 'hotel' && (
          <div className="space-y-4">

            {/* 층별 아코디언 목록 */}
            {loadingRooms ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="text-white/30 animate-spin" />
              </div>
            ) : floors.length === 0 ? (
              <p className="text-sm text-white/25 text-center py-8">
                위 일괄 생성으로 객실을 추가하세요.
              </p>
            ) : (
              <div className="space-y-2">
                {floors.map((floor) => {
                  const floorRooms = rooms.filter((r) => r.floor === floor)
                  const isOpen     = expandedFloors.has(floor)
                  return (
                    <div key={floor} className="bg-white/5 rounded-2xl overflow-hidden">
                      {/* 층 헤더 (아코디언 토글) */}
                      <button
                        onClick={() => toggleFloor(floor)}
                        className="w-full flex items-center justify-between px-4 py-3.5
                          hover:bg-white/5 transition-colors"
                      >
                        <span className="text-sm font-medium text-white/80">
                          {floor}층
                          <span className="ml-2 text-xs text-white/30">
                            ({floorRooms.length}개)
                          </span>
                        </span>
                        {isOpen
                          ? <ChevronUp size={15} className="text-white/30" />
                          : <ChevronDown size={15} className="text-white/30" />
                        }
                      </button>

                      {/* 펼쳐진 내용 */}
                      {isOpen && (
                        <div className="px-4 pb-4 space-y-3 border-t border-white/8">
                          {/* 객실 타일 */}
                          {floorRooms.length > 0 ? (
                            <div className="flex flex-wrap gap-2 pt-3">
                              {floorRooms.map((room) => (
                                <div key={room.id}
                                  className="flex items-center gap-1 px-3 py-1.5 rounded-xl
                                    bg-white/10 text-sm text-white/80"
                                >
                                  <span>{room.room_no}</span>
                                  <button
                                    onClick={() => handleDeleteRoom(room)}
                                    className="ml-1 text-white/25 hover:text-red-400 transition-colors"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-white/25 pt-3">객실을 추가하세요.</p>
                          )}

                          {/* 개별 객실 추가 */}
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={newRoomInputs[floor] || ''}
                              onChange={(e) => setNewRoomInputs((prev) => ({ ...prev, [floor]: e.target.value }))}
                              onKeyDown={(e) => e.key === 'Enter' && handleAddRoom(floor)}
                              placeholder={`${floor}층 객실번호 (예: ${floor}01)`}
                              className="flex-1 px-3 py-2 bg-white/10 rounded-xl border border-white/15
                                text-white text-sm outline-none focus:border-white/35 transition-colors
                                placeholder:text-white/25"
                            />
                            <button
                              onClick={() => handleAddRoom(floor)}
                              disabled={savingRoom || !newRoomInputs[floor]?.trim()}
                              className="px-3 py-2 rounded-xl bg-blue-600/30 text-blue-400 text-sm
                                hover:bg-blue-600/50 transition-colors disabled:opacity-40 flex items-center gap-1"
                            >
                              {savingRoom ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
                              추가
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* ⚡ 일괄 생성 아코디언 */}
            <div className="bg-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setBulkOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5
                  text-sm font-semibold text-yellow-400 hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Zap size={15} />
                  전 층 객실 일괄 생성
                </span>
                {bulkOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {bulkOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/8">
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    {/* 층 범위 */}
                    <div>
                      <p className="text-xs text-white/40 mb-1.5">층 범위</p>
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={bulkFloorFrom}
                          onChange={(e) => setBulkFloorFrom(e.target.value)}
                          placeholder="시작" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                        <span className="text-white/30 text-xs shrink-0">~</span>
                        <input type="number" value={bulkFloorTo}
                          onChange={(e) => setBulkFloorTo(e.target.value)}
                          placeholder="끝" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                      </div>
                    </div>
                    {/* 호수 범위 */}
                    <div>
                      <p className="text-xs text-white/40 mb-1.5">호수 범위</p>
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={bulkRoomFrom}
                          onChange={(e) => setBulkRoomFrom(e.target.value)}
                          placeholder="시작" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                        <span className="text-white/30 text-xs shrink-0">~</span>
                        <input type="number" value={bulkRoomTo}
                          onChange={(e) => setBulkRoomTo(e.target.value)}
                          placeholder="끝" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 미리보기 */}
                  {bulkFloorFrom && bulkFloorTo && bulkRoomFrom && bulkRoomTo && (
                    <p className="text-xs text-yellow-400/70 text-center">
                      {bulkFloorFrom}층~{bulkFloorTo}층 × {bulkRoomFrom}호~{bulkRoomTo}호
                      = 최대 {(parseInt(bulkFloorTo) - parseInt(bulkFloorFrom) + 1) * (parseInt(bulkRoomTo) - parseInt(bulkRoomFrom) + 1)}개
                    </p>
                  )}

                  <button
                    onClick={handleBulkCreate}
                    disabled={bulkLoading || !bulkFloorFrom || !bulkFloorTo || !bulkRoomFrom || !bulkRoomTo}
                    className="w-full py-2.5 rounded-xl bg-yellow-500/20 text-yellow-400 text-sm font-medium
                      hover:bg-yellow-500/30 active:scale-[0.98] transition-all disabled:opacity-40
                      flex items-center justify-center gap-2"
                  >
                    {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                    건물 전체 한 번에 세팅
                  </button>
                </div>
              )}
            </div>

            {/* 🗑️ 일괄 삭제 아코디언 */}
            <div className="bg-white/5 rounded-2xl overflow-hidden">
              <button
                onClick={() => setDelBulkOpen((v) => !v)}
                className="w-full flex items-center justify-between px-4 py-3.5
                  text-sm font-semibold text-red-400/70 hover:bg-white/5 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <Trash2 size={15} />
                  범위 일괄 삭제
                </span>
                {delBulkOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
              </button>

              {delBulkOpen && (
                <div className="px-4 pb-4 space-y-3 border-t border-white/8">
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <p className="text-xs text-white/40 mb-1.5">층 범위</p>
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={delFloorFrom}
                          onChange={(e) => setDelFloorFrom(e.target.value)}
                          placeholder="시작" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                        <span className="text-white/30 text-xs shrink-0">~</span>
                        <input type="number" value={delFloorTo}
                          onChange={(e) => setDelFloorTo(e.target.value)}
                          placeholder="끝" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                      </div>
                    </div>
                    <div>
                      <p className="text-xs text-white/40 mb-1.5">호수 범위</p>
                      <div className="flex items-center gap-1.5">
                        <input type="number" value={delRoomFrom}
                          onChange={(e) => setDelRoomFrom(e.target.value)}
                          placeholder="시작" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                        <span className="text-white/30 text-xs shrink-0">~</span>
                        <input type="number" value={delRoomTo}
                          onChange={(e) => setDelRoomTo(e.target.value)}
                          placeholder="끝" min="1"
                          className="w-full px-2.5 py-2 bg-white/10 rounded-xl border border-white/15
                            text-white text-sm outline-none focus:border-white/35 text-center"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleBulkDelete}
                    disabled={delBulkLoading || !delFloorFrom || !delFloorTo || !delRoomFrom || !delRoomTo}
                    className="w-full py-2.5 rounded-xl bg-red-500/15 text-red-400 text-sm font-medium
                      hover:bg-red-500/25 active:scale-[0.98] transition-all disabled:opacity-40
                      flex items-center justify-center gap-2"
                  >
                    {delBulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    범위 내 객실 일괄 삭제
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ════════════════════════════════════════
            탭 3 — 직원 관리
        ════════════════════════════════════════ */}
        {activeTab === 'staff' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider">
                직원 목록
              </h2>
              <button
                onClick={() => navigate('/settings/users/new')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600/20
                  text-blue-400 text-xs font-medium hover:bg-blue-600/30 transition-colors"
              >
                + 직원 등록
              </button>
            </div>

            {loadingList ? (
              <div className="flex justify-center py-8">
                <Loader2 size={22} className="text-white/30 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {staffList.map((staff) => (
                  <div key={staff.id}
                    className={`flex items-center gap-3 px-4 py-3.5 rounded-2xl
                      ${staff.is_active ? 'bg-white/5' : 'bg-white/[0.02] opacity-60'}`}
                  >
                    {/* 아바타 */}
                    <div className="w-9 h-9 rounded-full overflow-hidden bg-white/10
                      flex items-center justify-center shrink-0">
                      {staff.avatar_url ? (
                        <img src={staff.avatar_url} alt={staff.name}
                          className="w-full h-full object-cover" />
                      ) : (
                        <span className="text-sm font-bold text-white/40">
                          {(staff.name || '?')[0]}
                        </span>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-white">{staff.name}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLOR[staff.role] || ''}`}>
                          {ROLE_LABEL[staff.role] || staff.role}
                        </span>
                        {staff.is_locked && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">잠금</span>
                        )}
                        {!staff.is_active && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-zinc-600/30 text-zinc-500">비활성</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {staff.id !== user?.id && (
                        <button onClick={() => handleResetPin(staff)} disabled={togglingId === staff.id}
                          className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center
                            text-violet-400 hover:bg-violet-500/30 transition-colors disabled:opacity-40"
                          title="PIN 초기화"
                        >
                          {togglingId === staff.id ? <Loader2 size={13} className="animate-spin" /> : <KeyRound size={13} />}
                        </button>
                      )}
                      {staff.is_locked && (
                        <button onClick={() => handleUnlock(staff.id)} disabled={togglingId === staff.id}
                          className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center
                            text-amber-400 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
                          title="잠금 해제"
                        >
                          {togglingId === staff.id ? <Loader2 size={13} className="animate-spin" /> : <Unlock size={13} />}
                        </button>
                      )}
                      <button onClick={() => handleToggleActive(staff)}
                        disabled={togglingId === staff.id || staff.id === user?.id}
                        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors disabled:opacity-30
                          ${staff.is_active
                            ? 'bg-white/10 text-white/40 hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30'
                          }`}
                        title={staff.is_active ? '비활성화' : '활성화'}
                      >
                        {togglingId === staff.id ? <Loader2 size={13} className="animate-spin" />
                          : staff.is_active ? <UserX size={13} /> : <UserCheck size={13} />}
                      </button>
                      <button onClick={() => navigate(`/settings/users/${staff.id}/edit`)}
                        className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center
                          text-white/40 hover:bg-white/15 hover:text-white transition-colors"
                        title="수정"
                      >
                        <ChevronRight size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ════════════════════════════════════════
            탭 4 — 마스터 코드
            hidden으로 숨김 처리 → 탭 전환 시 재마운트/재조회 없음
        ════════════════════════════════════════ */}
        <div className={activeTab !== 'master' ? 'hidden' : 'space-y-6'}>
          <StatusSortableEditor />
          <MasterDataEditor title="시설 종류 관리" tableName="facility_types" />
          <MasterDataEditor title="객실하자 구분 관리" tableName="defect_divisions" />
          <MasterDataEditor
            title="객실하자 위치 관리"
            tableName="defect_locations"
            parentTable="defect_divisions"
            parentField="division_id"
          />
          <MasterDataEditor title="객실하자 분류 관리" tableName="defect_categories" />
        </div>

        {/* ════════════════════════════════════════
            탭 5 — 운영 정책
            hidden으로 숨김 처리 → 탭 전환 시 재마운트/재조회 없음
        ════════════════════════════════════════ */}
        <div className={activeTab !== 'policy' ? 'hidden' : ''}>
          <AppPolicyEditor />
        </div>

      </div>
    </div>
  )
}
