interface Props {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
  /** 종료일 input의 min 속성 — 보통 시작일을 넘기면 더 이전 날짜 선택을 막음 */
  endMin?: string
}

export function DateFilter({
  start,
  end,
  onStartChange,
  onEndChange,
  endMin,
}: Props) {
  return (
    <>
      <label className="filter-label">
        시작일{' '}
        <input
          type="date"
          value={start}
          onChange={(e) => onStartChange(e.target.value)}
        />
      </label>
      <label className="filter-label">
        종료일{' '}
        <input
          type="date"
          value={end}
          min={endMin}
          onChange={(e) => onEndChange(e.target.value)}
        />
      </label>
    </>
  )
}
