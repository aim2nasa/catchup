/**
 * 백엔드 API 호출 헬퍼.
 * Vite의 base(import.meta.env.BASE_URL)에 따라 prefix 자동 부여.
 *  - 운영(reverse proxy): BASE_URL = "/catchup/" → "/catchup/api/foo"
 *  - dev: 동일하나 vite proxy가 /catchup/api → backend로 rewrite
 */

export function apiUrl(path: string): string {
  const base = import.meta.env.BASE_URL || '/'
  const clean = path.replace(/^\//, '')
  return base + clean
}

export async function getJson<T>(
  path: string,
  params?: Record<string, string | number>,
): Promise<T> {
  const url = new URL(apiUrl(path), window.location.origin)
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

export async function postJson<T>(
  path: string,
  body: unknown,
): Promise<T> {
  const res = await fetch(apiUrl(path), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}))
    const message =
      (errBody as { detail?: string; error?: string }).detail ||
      (errBody as { detail?: string; error?: string }).error ||
      `HTTP ${res.status}`
    throw new Error(message)
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
