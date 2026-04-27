/**
 * 백엔드 API 호출 헬퍼.
 * Vite dev 서버는 /api 를 backend (127.0.0.1:8000) 로 proxy.
 * Production build 시에는 backend가 동일 호스트에서 정적 파일 + API 함께 서빙.
 */

export async function getJson<T>(path: string, params?: Record<string, string | number>): Promise<T> {
  const url = new URL(path, window.location.origin)
  if (params) {
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)))
  }
  const res = await fetch(url.toString())
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    throw new Error((errBody as { error?: string }).error || `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export interface VersionInfo {
  version: string
  started_at: string
}

export interface Category {
  no: number
  name: string
  depth: number
  parent: number | null
}
