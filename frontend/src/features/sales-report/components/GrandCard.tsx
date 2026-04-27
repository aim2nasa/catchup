import { fmtCurrency, fmtNumber } from '@/shared/lib/format'
import type { GrandTotal } from '@/features/sales-report/types'

interface Props {
  grand: GrandTotal
  start: string
  end: string
  elapsedSeconds: number | null
}

export function GrandCard({ grand, start, end, elapsedSeconds }: Props) {
  const labelParts = [
    `총 합계 · ${start} ~ ${end}`,
    `주문 ${fmtNumber(grand.order_count)}건`,
  ]
  if (elapsedSeconds !== null) {
    labelParts.push(`처리 ${elapsedSeconds.toFixed(1)}초`)
  }

  return (
    <div className="grand-card">
      <div className="grand-label">{labelParts.join(' · ')}</div>
      <div className="grand-num">
        판매수 <em>{fmtNumber(grand.qty)}</em>개
        <span className="sep">·</span>
        매출 <em>{fmtCurrency(grand.rev, grand.currency)}</em>{' '}
        <span className="grand-currency">({grand.currency})</span>
      </div>
    </div>
  )
}
