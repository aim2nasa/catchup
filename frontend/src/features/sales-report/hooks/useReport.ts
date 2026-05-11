import { useCallback, useRef, useState } from 'react'
import { apiUrl } from '@/api/client'
import type { ReportData, SSEEvent } from '@/features/sales-report/types'

export interface ReportState {
  status: 'idle' | 'running' | 'done' | 'error'
  progress: string[]
  data: ReportData | null
  error: string | null
  elapsedSeconds: number | null
}

export function useReport() {
  const [state, setState] = useState<ReportState>({
    status: 'idle',
    progress: [],
    data: null,
    error: null,
    elapsedSeconds: null,
  })
  const evtRef = useRef<EventSource | null>(null)
  const startedAtRef = useRef<number>(0)

  const cancel = useCallback(() => {
    if (evtRef.current) {
      evtRef.current.close()
      evtRef.current = null
    }
  }, [])

  const run = useCallback(
    (
      params:
        | { start: string; end: string; categories: string }
        | { start: string; end: string; codes: string },
    ) => {
      cancel()
      setState({
        status: 'running',
        progress: [],
        data: null,
        error: null,
        elapsedSeconds: null,
      })
      startedAtRef.current = Date.now()

      // codes 가 있으면 카테고리 무관 product 직접 조회 endpoint 사용
      const url =
        'codes' in params
          ? apiUrl(
              `/api/products-report?start=${encodeURIComponent(params.start)}&end=${encodeURIComponent(
                params.end,
              )}&codes=${encodeURIComponent(params.codes)}`,
            )
          : apiUrl(
              `/api/report?start=${encodeURIComponent(params.start)}&end=${encodeURIComponent(
                params.end,
              )}&categories=${encodeURIComponent(params.categories)}`,
            )
      const evt = new EventSource(url)
      evtRef.current = evt

      evt.onmessage = (e: MessageEvent) => {
        let m: SSEEvent
        try {
          m = JSON.parse(e.data) as SSEEvent
        } catch {
          return
        }
        if (m.type === 'progress' && m.msg) {
          setState((s) => ({ ...s, progress: [...s.progress, m.msg!] }))
        } else if (m.type === 'data' && m.results && m.grand && m.start && m.end) {
          const data: ReportData = {
            results: m.results,
            grand: m.grand,
            start: m.start,
            end: m.end,
          }
          setState((s) => ({ ...s, data }))
        } else if (m.type === 'done') {
          const elapsed = (Date.now() - startedAtRef.current) / 1000
          setState((s) => ({ ...s, status: 'done', elapsedSeconds: elapsed }))
          evt.close()
          evtRef.current = null
        } else if (m.type === 'error') {
          setState((s) => ({
            ...s,
            status: 'error',
            error: (m.msg || '') + (m.trace ? '\n\n' + m.trace : ''),
          }))
          evt.close()
          evtRef.current = null
        }
      }

      evt.onerror = () => {
        setState((s) => ({
          ...s,
          status: 'error',
          error: 'SSE 연결 오류 (네트워크/서버 확인)',
        }))
        evt.close()
        evtRef.current = null
      }
    },
    [cancel],
  )

  return { state, run, cancel }
}
