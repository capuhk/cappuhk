import { Drawer } from 'vaul'

// 공용 Bottom Sheet — vaul(Drawer) 기반
// 네이티브 수준 스와이프 제스처 지원
// open    : boolean
// onClose : () => void
// title   : string (선택)
// children: ReactNode
export default function BottomSheet({ open, onClose, title, children }) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={(isOpen) => { if (!isOpen) onClose() }}
      // 아래로 당길수록 투명해지는 배경 효과
      shouldScaleBackground
    >
      <Drawer.Portal>
        {/* 백드롭 */}
        <Drawer.Overlay className="fixed inset-0 z-50 bg-black/60" />

        {/* 시트 본체 */}
        <Drawer.Content
          className="fixed bottom-0 left-0 right-0 z-50
            flex flex-col
            bg-zinc-900 rounded-t-2xl
            max-h-[70vh]
            outline-none"
        >
          {/* 드래그 핸들 */}
          <div className="flex-shrink-0 flex flex-col items-center pt-3 pb-2">
            <Drawer.Handle className="w-10 h-1 rounded-full bg-white/20" />
            {title && (
              <p className="mt-2 text-white/70 text-sm font-medium">{title}</p>
            )}
          </div>

          {/* 내부 스크롤 영역 */}
          <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
            {children}
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
