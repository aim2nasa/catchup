import { useCallback } from 'react'
import { apiUrl } from '@/api/client'
import type { SortDir, SortKey, ViewMode } from '@/features/sales-report/types'

export function useDownloadExcel() {
  return useCallback(
    (params: {
      start: string
      end: string
      categories: string
      mode: ViewMode
      sortBy: SortKey
      sortDir: SortDir
    }) => {
      const url = apiUrl(
        `/api/excel?start=${encodeURIComponent(params.start)}&end=${encodeURIComponent(
          params.end,
        )}&categories=${encodeURIComponent(params.categories)}&mode=${encodeURIComponent(
          params.mode,
        )}&sort_by=${encodeURIComponent(params.sortBy)}&sort_dir=${encodeURIComponent(
          String(params.sortDir),
        )}`,
      )
      window.location.href = url
    },
    [],
  )
}
