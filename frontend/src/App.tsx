import { useQuery } from '@tanstack/react-query'
import './App.css'
import { getJson, type Category, type VersionInfo } from '@/api/client'

function App() {
  const versionQ = useQuery({
    queryKey: ['version'],
    queryFn: () => getJson<VersionInfo>('/api/version'),
  })

  const catsQ = useQuery({
    queryKey: ['categories'],
    queryFn: () => getJson<Category[]>('/api/categories'),
  })

  return (
    <div className="app-shell">
      <h1>cafe24 판매 집계 — 캐치업코리아</h1>

      <div className="banner">
        <strong>신규 React + Vite + TS 프론트엔드 골격</strong>
        <p>
          UI 마이그레이션 진행 중. 현재 운영용 UI는{' '}
          <a href="http://127.0.0.1:8000/" target="_blank" rel="noreferrer">
            backend의 정적 페이지 (/)
          </a>
          를 그대로 사용.
        </p>
      </div>

      <section className="card">
        <h2>버전</h2>
        {versionQ.isLoading && <p>로딩...</p>}
        {versionQ.error && <p className="error">에러: {String(versionQ.error)}</p>}
        {versionQ.data && (
          <p>
            <code>{versionQ.data.version}</code> · started{' '}
            <code>{versionQ.data.started_at}</code>
          </p>
        )}
      </section>

      <section className="card">
        <h2>카테고리 (depth=1)</h2>
        {catsQ.isLoading && <p>로딩...</p>}
        {catsQ.error && <p className="error">에러: {String(catsQ.error)}</p>}
        {catsQ.data && (
          <ul>
            {catsQ.data
              .filter((c) => c.depth === 1)
              .map((c) => (
                <li key={c.no}>
                  <code>[{c.no}]</code> {c.name}
                </li>
              ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default App
