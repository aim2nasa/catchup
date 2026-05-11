import { Fragment, useMemo, useState } from 'react'
import { DateFilter } from '@/features/sales-report/components/DateFilter'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { useReport } from '@/features/sales-report/hooks/useReport'
import { useSettings } from '@/features/sales-report/hooks/useSettings'
import type { Variant } from '@/features/sales-report/types'
import { fmtCurrency, fmtNumber } from '@/shared/lib/format'
import '@/features/sales-report/SalesReportView.css'
import './ExcelOrderView.css'

interface Row {
  product_code: string
  product_name: string
  price: number
  qty: number
  rev: number
  missing: boolean
  is_multi: boolean
  variants: Variant[]
}

interface GroupRows {
  label: string
  rows: Row[]
  subtotalQty: number
  subtotalRev: number
}

// 엑셀 양식의 표시 대상 — 카테고리 24 하드왁스. 그룹별 소계 산출.
const CATEGORY_NO = 24
const CATEGORY_NAME = '하드왁스'
const GROUPS: { label: string; codes: string[] }[] = [
  {
    label: '500g 총합계',
    codes: [
      'P00000HT', 'P00000BV', 'P00000CB', 'P00000BX',
      'P00000XE', 'P0000BIF', 'P0000BLD', 'P0000BMJ', 'P0000BMI',
    ],
  },
  {
    label: '1kg 총합계',
    codes: [
      'P00000ZB', 'P00000UH', 'P00000TI', 'P00000BY', 'P00000BZ',
      'P00000CH', 'P00000CG', 'P00000CA', 'P00000BW', 'P00000CI',
      'P00000CE', 'P00000KH', 'P00000CD', 'P00000CF',
    ],
  },
]

export function ExcelOrderView() {
  const { settings, setStart, setEnd } = useSettings()
  const { start, end } = settings
  const { state, run } = useReport()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // 시작일 변경 시, 기존 종료일이 새 시작일보다 이전이면 종료일도 시작일로 보정.
  function handleStartChange(newStart: string) {
    setStart(newStart)
    if (newStart && end && end < newStart) {
      setEnd(newStart)
    }
  }

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

  function toggleGroup(code: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const groupRows = useMemo<GroupRows[]>(() => {
    const cat = state.data?.results.find((r) => r.category_no === CATEGORY_NO)
    const byCode = new Map((cat?.groups ?? []).map((g) => [g.product_code, g]))
    return GROUPS.map((group): GroupRows => {
      const rows: Row[] = group.codes.map((code): Row => {
        const g = byCode.get(code)
        if (g) {
          return {
            product_code: g.product_code,
            product_name: g.product_name,
            price: g.price,
            qty: g.qty,
            rev: g.rev,
            missing: false,
            is_multi: g.is_multi,
            variants: g.variants,
          }
        }
        return {
          product_code: code,
          product_name: '—',
          price: 0,
          qty: 0,
          rev: 0,
          missing: true,
          is_multi: false,
          variants: [],
        }
      })
      return {
        label: group.label,
        rows,
        subtotalQty: rows.reduce((s, r) => s + r.qty, 0),
        subtotalRev: rows.reduce((s, r) => s + r.rev, 0),
      }
    })
  }, [state.data])

  const totalQty = groupRows.reduce((s, g) => s + g.subtotalQty, 0)
  const totalRev = groupRows.reduce((s, g) => s + g.subtotalRev, 0)
  const currency = state.data?.grand.currency ?? 'KRW'
  const isRunning = state.status === 'running'
  const dataReady = !!state.data

  return (
    <div className="excel-container">
      <header className="excel-header">
        <a href="#" className="home-link">← 홈</a>
        <h1>하드왁스</h1>
      </header>

      <div className="filters card">
        <div className="filter-row">
          <DateFilter
            start={start}
            end={end}
            onStartChange={handleStartChange}
            onEndChange={setEnd}
            endMin={start}
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
              {groupRows.map((grp) => (
                <Fragment key={grp.label}>
                  {grp.rows.map((g) => {
                    const isCollapsed = collapsed.has(g.product_code)
                    const parentClass = [
                      g.missing ? 'row-missing' : null,
                      g.is_multi ? 'row-parent' : 'row-single',
                    ]
                      .filter(Boolean)
                      .join(' ')

                    // multi인데 옵션별 단가가 제각각이면 parent price=0 → "옵션별"
                    const showDashPrice =
                      g.is_multi && !g.missing && !g.price
                    const parentRow = (
                      <tr key={`p-${g.product_code}`} className={parentClass}>
                        <td className="code-cell">
                          {g.is_multi && (
                            <button
                              type="button"
                              className="toggle-btn"
                              onClick={() => toggleGroup(g.product_code)}
                              aria-label={isCollapsed ? '펼치기' : '접기'}
                            >
                              {isCollapsed ? '+' : '−'}
                            </button>
                          )}
                          {g.product_code}
                        </td>
                        <td className="name-cell">
                          {g.product_name}
                          {g.is_multi && (
                            <span className="multi-tag">
                              {g.variants.length}개 옵션
                            </span>
                          )}
                        </td>
                        <td className="num">
                          {g.missing
                            ? '—'
                            : showDashPrice
                              ? '옵션별'
                              : fmtCurrency(g.price, currency)}
                        </td>
                        <td className="num">
                          {g.missing ? '—' : fmtNumber(g.qty)}
                        </td>
                        <td className="num">
                          {g.missing ? '—' : fmtCurrency(g.rev, currency)}
                        </td>
                      </tr>
                    )

                    if (!g.is_multi) return parentRow

                    return (
                      <Fragment key={`pg-${g.product_code}`}>
                        {parentRow}
                        {g.variants.map((v) => {
                          const suffix = v.variant_code.startsWith(
                            g.product_code,
                          )
                            ? v.variant_code.slice(g.product_code.length)
                            : v.variant_code
                          // variant 단가 우선, 없으면 parent의 대표 단가 폴백
                          const unit = v.price || g.price
                          return (
                            <tr
                              key={`c-${g.product_code}-${v.variant_code}`}
                              className={`row-child${isCollapsed ? ' collapsed' : ''}`}
                            >
                              <td className="code-cell">{suffix}</td>
                              <td className="name-cell">
                                └ {v.option || v.variant_code}
                              </td>
                              <td className="num">
                                {unit ? fmtCurrency(unit, currency) : '—'}
                              </td>
                              <td className="num">{fmtNumber(v.qty)}</td>
                              <td className="num">
                                {fmtCurrency(v.rev, currency)}
                              </td>
                            </tr>
                          )
                        })}
                      </Fragment>
                    )
                  })}
                  <tr className="subtotal-row">
                    <td colSpan={3}>{grp.label}</td>
                    <td className="num">{fmtNumber(grp.subtotalQty)}</td>
                    <td className="num">
                      {fmtCurrency(grp.subtotalRev, currency)}
                    </td>
                  </tr>
                </Fragment>
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
        </div>
      )}

      <VersionFooter />
    </div>
  )
}
