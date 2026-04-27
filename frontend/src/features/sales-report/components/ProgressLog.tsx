import { useEffect, useRef } from 'react'

interface Props {
  lines: string[]
  title: string
}

export function ProgressLog({ lines, title }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <>
      <div className="pane-header">
        <span className="pane-title">{title}</span>
      </div>
      <div className="progress-log" ref={ref}>
        {lines.length === 0 ? (
          <span className="progress-empty">조회 시 진행 상황이 여기 표시됩니다.</span>
        ) : (
          lines.join('\n')
        )}
      </div>
    </>
  )
}
