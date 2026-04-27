import type { ViewMode } from '@/features/sales-report/types'

interface Props {
  value: ViewMode
  onChange: (v: ViewMode) => void
}

const OPTIONS: { value: ViewMode; label: string }[] = [
  { value: 'single', label: '한 화면 (카테고리별 그룹)' },
  { value: 'tabs', label: '카테고리별 탭 분리' },
  { value: 'flat', label: '통합 (카테고리 무관 한 표)' },
]

export function ViewToggle({ value, onChange }: Props) {
  return (
    <div className="view-toggle-wrap">
      <span className="view-label">표시</span>
      <div className="view-toggle">
        {OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={value === opt.value ? 'active' : ''}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
