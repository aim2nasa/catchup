import type { CategoryResult } from '@/features/sales-report/types'

interface Props {
  results: CategoryResult[]
  activeIdx: number
  onActivate: (idx: number) => void
}

export function TabsBar({ results, activeIdx, onActivate }: Props) {
  return (
    <div className="tabs">
      {results.map((r, i) => (
        <button
          key={r.category_no}
          type="button"
          className={i === activeIdx ? 'active' : ''}
          onClick={() => onActivate(i)}
        >
          [{r.category_no}] {r.category_name} ({r.qty})
        </button>
      ))}
    </div>
  )
}
