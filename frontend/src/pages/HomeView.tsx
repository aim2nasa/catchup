import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
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
    key: 'excel',
    hash: '#excel',
    title: '엑셀 기준 판매 보기',
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
      </nav>
      <VersionFooter />
    </div>
  )
}
