import type { AppSettings } from '@/features/sales-report/types'

const KEY = 'catchup-settings-v1'

export function loadSettings(): Partial<AppSettings> | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Partial<AppSettings>) : null
  } catch {
    return null
  }
}

export function saveSettings(s: AppSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* quota / disabled */
  }
}
