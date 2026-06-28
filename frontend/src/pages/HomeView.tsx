import { useState } from 'react'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { apiUrl } from '@/api/client'
import '@/features/sales-report/SalesReportView.css'
import './HomeView.css'

type MenuItem = {
  key: string
  hash: string
  title: string
  desc: string
  tag?: string
  tagKind?: 'new' | 'ref'
}

const MENUS: MenuItem[] = [
  {
    key: 'product-codes',
    hash: '#product-codes',
    title: '상품코드',
    desc: '상품코드별 판매수와 매출을 엑셀 양식 순서로 확인',
    tag: '신규',
    tagKind: 'new',
  },
  {
    key: 'hardwax',
    hash: '#hardwax',
    title: '하드왁스',
    desc: '엑셀 양식 순서대로 상품별 판매수/매출 확인',
  },
  {
    key: 'sales',
    hash: '#sales',
    title: 'cafe24 판매 집계 (참고용)',
    desc: '카테고리별 자유 조회 — 모든 데이터를 자세히 살펴볼 때 사용',
    tag: '참고',
    tagKind: 'ref',
  },
]

export function HomeView() {
  const [restartStatus, setRestartStatus] = useState<string | null>(null)

  async function fetchVersion(): Promise<{ started_at?: string } | null> {
    try {
      const res = await fetch(apiUrl('/api/version'), { cache: 'no-store' })
      if (!res.ok) return null
      return (await res.json()) as { started_at?: string }
    } catch {
      return null
    }
  }

  async function waitForRestartReady(previousStartedAt?: string) {
    const deadline = Date.now() + 20_000
    while (Date.now() < deadline) {
      const version = await fetchVersion()
      if (version?.started_at && version.started_at !== previousStartedAt) return true
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
    return false
  }

  async function handleRestart() {
    const ok = window.confirm('catchup 서버를 재시작할까요?')
    if (!ok) return

    try {
      setRestartStatus('재시작 요청 전 상태를 확인하는 중...')
      const before = await fetchVersion()
      setRestartStatus('서버 재시작을 요청하는 중...')
      const res = await fetch(apiUrl('/api/admin/restart'), { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      }
      setRestartStatus('서버가 다시 준비될 때까지 확인하는 중...')
      const ready = await waitForRestartReady(before?.started_at)
      if (!ready) {
        throw new Error('재시작 완료를 확인하지 못했습니다. 개발 서버 상태를 확인하세요.')
      }
      setRestartStatus(null)
      alert('서버 재시작이 완료되었습니다.')
    } catch (error) {
      setRestartStatus(null)
      alert(error instanceof Error ? error.message : '서버 재시작 요청에 실패했습니다.')
    }
  }

  return (
    <div className="home-container">
      <header className="home-header">
        <h1>캐치업코리아 운영 도구</h1>
        <p className="home-tagline">메뉴를 선택하세요</p>
      </header>
      <nav className="home-menu">
        {MENUS.map((m) => (
          <a key={m.key} className="home-menu-item" href={m.hash}>
            <div className="home-menu-content">
              <div className="home-menu-title">
                {m.title}
                {m.tag && (
                  <span className={`home-menu-tag tag-${m.tagKind}`}>{m.tag}</span>
                )}
              </div>
              <div className="home-menu-desc">{m.desc}</div>
            </div>
            <div className="home-menu-arrow">→</div>
          </a>
        ))}
        <button
          type="button"
          className="home-menu-item home-menu-action"
          onClick={handleRestart}
          disabled={restartStatus !== null}
        >
          <div className="home-menu-content">
            <div className="home-menu-title">
              서버 재시작
              <span className="home-menu-tag tag-danger">관리</span>
            </div>
            <div className="home-menu-desc">
              {restartStatus || '현재 실행 중인 catchup 서버를 다시 시작'}
            </div>
          </div>
          <div className="home-menu-arrow">↻</div>
        </button>
      </nav>
      <VersionFooter />
    </div>
  )
}
