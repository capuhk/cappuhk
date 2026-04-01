import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

// shadcn/ui 클래스명 병합 유틸
export function cn(...inputs) {
  return twMerge(clsx(inputs))
}
