import { fmtCurrency, fmtNumber } from '@/shared/lib/format'
import type { CategoryResult, SortDir, SortKey } from '@/features/sales-report/types'
import { DetailTable } from './DetailTable'

interface Props {
  result: CategoryResult
  currency: string
  sortBy: SortKey
  sortDir: SortDir
  onSortChange: (by: SortKey, dir: SortDir) => void
}

export function CatSection({ result, currency, sortBy, sortDir, onSortChange }: Props) {
  return (
    <section className="cat-section">
      <header className="cat-bar">
        <span className="cat-num">{result.category_no}</span>
        <span className="cat-name">{result.category_name}</span>
        <span className="cat-stat">
          판매수<strong>{fmtNumber(result.qty)}</strong>
        </span>
        <span className="cat-stat">
          매출<strong>{fmtCurrency(result.rev, currency)}</strong>
        </span>
      </header>
      <DetailTable
        groups={result.groups}
        totals={{ qty: result.qty, rev: result.rev }}
        currency={currency}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />
    </section>
  )
}
