import { useEffect, useState } from 'react'
import { loadSettings, saveSettings } from '@/shared/lib/storage'
import { defaultPeriod } from '@/shared/lib/format'
import type { AppSettings, SummarySort, ViewMode } from '@/features/sales-report/types'

const FALLBACK: AppSettings = (() => {
  const { start, end } = defaultPeriod()
  return {
    start,
    end,
    mode: 'single',
    summarySort: 'rev:-1',
    catOrder: [],
    catChecked: {},
  }
})()

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(() => {
    const saved = loadSettings()
    return { ...FALLBACK, ...(saved || {}) } as AppSettings
  })

  useEffect(() => {
    saveSettings(settings)
  }, [settings])

  return {
    settings,
    setStart: (start: string) => setSettings((s) => ({ ...s, start })),
    setEnd: (end: string) => setSettings((s) => ({ ...s, end })),
    setMode: (mode: ViewMode) => setSettings((s) => ({ ...s, mode })),
    setSummarySort: (summarySort: SummarySort) => setSettings((s) => ({ ...s, summarySort })),
    setCatOrder: (catOrder: number[]) => setSettings((s) => ({ ...s, catOrder })),
    setCatChecked: (catChecked: Record<string, boolean>) =>
      setSettings((s) => ({ ...s, catChecked })),
  }
}
