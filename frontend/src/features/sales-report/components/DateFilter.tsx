interface Props {
  start: string
  end: string
  onStartChange: (v: string) => void
  onEndChange: (v: string) => void
}

export function DateFilter({ start, end, onStartChange, onEndChange }: Props) {
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
          onChange={(e) => onEndChange(e.target.value)}
        />
      </label>
    </>
  )
}
