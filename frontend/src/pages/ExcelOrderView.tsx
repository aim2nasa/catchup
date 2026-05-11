import { useMemo, useState } from 'react'
import { DateFilter } from '@/features/sales-report/components/DateFilter'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { useReport } from '@/features/sales-report/hooks/useReport'
import type { Group } from '@/features/sales-report/types'
import { fmtCurrency, fmtNumber, defaultPeriod } from '@/shared/lib/format'
import '@/features/sales-report/SalesReportView.css'
import './ExcelOrderView.css'

// 엑셀 양식의 표시 대상 — 카테고리 24 하드왁스 내 4개 상품 (사용자 지정 순서)
const CATEGORY_NO = 24
const CATEGORY_NAME = '하드왁스'
const PRODUCT_CODES = [
  'P00000HT', 'P00000BV', 'P00000CB', 'P00000BX',
  'P00000XE', 'P0000BIF', 'P0000BLD', 'P0000BMJ', 'P0000BMI',
  'P00000ZB', 'P00000UH', 'P00000TI', 'P00000BY', 'P00000BZ',
  'P00000CH', 'P00000CG', 'P00000CA', 'P00000BW', 'P00000CI',
  'P00000CE', 'P00000KH', 'P00000CD', 'P00000CF',
]

export function ExcelOrderView() {
  const initial = defaultPeriod()
  const [start, setStart] = useState(initial.start)
  const [end, setEnd] = useState(initial.end)
  const { state, run } = useReport()

  function handleRun() {
    if (!start || !end) {
      alert('기간을 입력하세요')
      return
    }
    if (start > end) {
      alert('시작일이 종료일보다 늦습니다')
      return
    }
    run({ start, end, categories: String(CATEGORY_NO) })
  }

  const rows = useMemo<Group[]>(() => {
    const cat = state.data?.results.find((r) => r.category_no === CATEGORY_NO)
    if (!cat) return []
    const byCode = new Map(cat.groups.map((g) => [g.product_code, g]))
    return PRODUCT_CODES.map((code) => byCode.get(code)).filter(
      (g): g is Group => !!g,
    )
  }, [state.data])

  const totalQty = rows.reduce((s, g) => s + g.qty, 0)
  const totalRev = rows.reduce((s, g) => s + g.rev, 0)
  const currency = state.data?.grand.currency ?? 'KRW'
  const isRunning = state.status === 'running'
  const dataReady = !!state.data

  return (
    <div className="excel-container">
      <header className="excel-header">
        <a href="#" className="home-link">← 홈</a>
        <h1>엑셀 기준 판매 보기</h1>
      </header>

      <div className="filters card">
        <div className="filter-row">
          <DateFilter
            start={start}
            end={end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
          <div className="filter-spacer" />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? '조회 중…' : '조회'}
          </button>
        </div>
      </div>

      {state.status === 'error' && (
        <div className="error-box">{state.error}</div>
      )}

      {dataReady && (
        <div className="excel-section card">
          <div className="excel-cat-label">
            <span className="cat-no-pill">{CATEGORY_NO}</span>
            <span className="excel-cat-name">{CATEGORY_NAME}</span>
            <span className="excel-period">
              {state.data!.start} ~ {state.data!.end}
            </span>
          </div>
          {rows.length === 0 ? (
            <div className="excel-empty">
              해당 기간에 표시할 상품이 없습니다.
            </div>
          ) : (
            <table className="excel-table">
              <thead>
                <tr>
                  <th>코드</th>
                  <th>상품명</th>
                  <th className="num">단가</th>
                  <th className="num">판매수</th>
                  <th className="num">매출</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((g) => (
                  <tr key={g.product_code}>
                    <td className="code-cell">{g.product_code}</td>
                    <td className="name-cell">{g.product_name}</td>
                    <td className="num">{fmtCurrency(g.price, currency)}</td>
                    <td className="num">{fmtNumber(g.qty)}</td>
                    <td className="num">{fmtCurrency(g.rev, currency)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3}>합계</td>
                  <td className="num">{fmtNumber(totalQty)}</td>
                  <td className="num">{fmtCurrency(totalRev, currency)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      <VersionFooter />
    </div>
  )
}
