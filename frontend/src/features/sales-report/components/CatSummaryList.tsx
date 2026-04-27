import { useMemo } from 'react'
import { fmtCurrency, fmtNumber } from '@/shared/lib/format'
import type { CategoryResult, SummarySort } from '@/features/sales-report/types'

interface Props {
  results: CategoryResult[]
  currency: string
  sort: SummarySort
  onSortChange: (s: SummarySort) => void
}

const OPTIONS: { value: SummarySort; label: string }[] = [
  { value: 'rev:-1', label: '매출 ↓' },
  { value: 'rev:1', label: '매출 ↑' },
  { value: 'qty:-1', label: '판매수 ↓' },
  { value: 'qty:1', label: '판매수 ↑' },
  { value: 'user', label: '사용자 지정 (드래그 순서)' },
]

export function CatSummaryList({ results, currency, sort, onSortChange }: Props) {
  const sorted = useMemo(() => {
    if (sort === 'user') return results
    const [by, dirStr] = sort.split(':') as [string, string]
    const d = parseInt(dirStr, 10)
    return [...results].sort((a, b) => {
      const va = by === 'rev' ? a.rev : a.qty
      const vb = by === 'rev' ? b.rev : b.qty
      return d === -1 ? vb - va : va - vb
    })
  }, [results, sort])

  return (
    <>
      <div className="pane-header">
        <span className="pane-title">결과 요약</span>
        <label className="summary-sort-label">
          정렬{' '}
          <select
            value={sort}
            onChange={(e) => onSortChange(e.target.value as SummarySort)}
          >
            {OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="cat-cards">
        {sorted.map((r) => (
          <div key={r.category_no} className="cat-card">
            <span className="cat-no-pill">{r.category_no}</span>
            <span className="cat-card-name">{r.category_name}</span>
            <span className="cat-card-stats">
              판매수<strong>{fmtNumber(r.qty)}</strong>· 매출
              <strong>{fmtCurrency(r.rev, currency)}</strong>
            </span>
          </div>
        ))}
      </div>
    </>
  )
}
