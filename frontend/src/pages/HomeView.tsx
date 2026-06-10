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
    key: 'hardwax',
    hash: '#hardwax',
    title: '하드왁스',
    desc: '엑셀 양식 순서대로 상품별 판매수/매출 확인',
    tag: '신규',
    tagKind: 'new',
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
  async function handleRestart() {
    const ok = window.confirm('catchup 서버를 재시작할까요?')
    if (!ok) return

    try {
      const res = await fetch(apiUrl('/api/admin/restart'), { method: 'POST' })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error((body as { error?: string }).error || `HTTP ${res.status}`)
      }
      alert((body as { message?: string }).message || '서버 재시작을 요청했습니다.')
    } catch (error) {
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
        <button type="button" className="home-menu-item home-menu-action" onClick={handleRestart}>
          <div className="home-menu-content">
            <div className="home-menu-title">
              서버 재시작
              <span className="home-menu-tag tag-danger">관리</span>
            </div>
            <div className="home-menu-desc">현재 실행 중인 catchup 서버를 다시 시작</div>
          </div>
          <div className="home-menu-arrow">↻</div>
        </button>
      </nav>
      <VersionFooter />
    </div>
  )
}
