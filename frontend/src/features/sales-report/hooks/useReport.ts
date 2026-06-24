import { useCallback, useRef, useState } from 'react'
import { apiUrl, postJson } from '@/api/client'
import type { ReportData, SSEEvent } from '@/features/sales-report/types'

interface ProductReportRequestResponse {
  request_id: string
  expires_in_seconds: number
}

const BACKEND_UNAVAILABLE_MESSAGE =
  '백엔드 서버에 연결할 수 없습니다. 개발 서버를 다시 시작한 뒤 조회하세요. (필요 서버: 127.0.0.1:8000)'

const STREAM_DISCONNECTED_MESSAGE =
  '실시간 조회 연결이 중간에 끊겼습니다. 서버 로그와 네트워크 상태를 확인한 뒤 다시 조회하세요.'

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
  const runSeqRef = useRef(0)

  const cancel = useCallback(() => {
    runSeqRef.current += 1
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
      const runSeq = runSeqRef.current + 1
      runSeqRef.current = runSeq
      setState({
        status: 'running',
        progress: [],
        data: null,
        error: null,
        elapsedSeconds: null,
      })
      startedAtRef.current = Date.now()

      const fail = (message: string) => {
        if (runSeqRef.current !== runSeq) return
        setState((s) => ({
          ...s,
          status: 'error',
          error: message,
        }))
      }

      const ensureBackendReady = async () => {
        try {
          const res = await fetch(apiUrl('/api/version'), { cache: 'no-store' })
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`)
          }
        } catch (error) {
          const detail = error instanceof Error ? `\n\n상세: ${error.message}` : ''
          throw new Error(`${BACKEND_UNAVAILABLE_MESSAGE}${detail}`)
        }
      }

      const openStream = (url: string) => {
        if (runSeqRef.current !== runSeq) return

        const evt = new EventSource(url)
        evtRef.current = evt

        evt.onmessage = (e: MessageEvent) => {
          if (runSeqRef.current !== runSeq) return
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
          if (runSeqRef.current !== runSeq) {
            evt.close()
            return
          }
          setState((s) => ({
            ...s,
            status: 'error',
            error: STREAM_DISCONNECTED_MESSAGE,
          }))
          evt.close()
          evtRef.current = null
        }
      }

      if ('codes' in params) {
        void ensureBackendReady()
          .then(() => {
            const codes = params.codes
              .split(',')
              .map((code) => code.trim())
              .filter(Boolean)
            return postJson<ProductReportRequestResponse>('/api/products-report-requests', {
              start: params.start,
              end: params.end,
              codes,
            })
          })
          .then((request) => {
            openStream(apiUrl(`/api/products-report-stream/${encodeURIComponent(request.request_id)}`))
          })
          .catch((error: unknown) => {
            fail(
              error instanceof Error
                ? `상품코드 조회 요청을 시작하지 못했습니다.\n\n${error.message}`
                : '상품코드 조회 요청을 시작하지 못했습니다.',
            )
          })
        return
      }

      void ensureBackendReady()
        .then(() => {
          openStream(
            apiUrl(
              `/api/report?start=${encodeURIComponent(params.start)}&end=${encodeURIComponent(
                params.end,
              )}&categories=${encodeURIComponent(params.categories)}`,
            ),
          )
        })
        .catch((error: unknown) => {
          fail(error instanceof Error ? error.message : BACKEND_UNAVAILABLE_MESSAGE)
        })
    },
    [cancel],
  )

  return { state, run, cancel }
}
