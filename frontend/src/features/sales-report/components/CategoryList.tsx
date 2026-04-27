import { useEffect, useMemo, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getJson, type Category } from '@/api/client'

interface Props {
  catOrder: number[]
  catChecked: Record<string, boolean>
  onOrderChange: (order: number[]) => void
  onCheckedChange: (checked: Record<string, boolean>) => void
}

export function CategoryList({
  catOrder,
  catChecked,
  onOrderChange,
  onCheckedChange,
}: Props) {
  const { data, isLoading, error } = useQuery({
    queryKey: ['categories'],
    queryFn: () => getJson<Category[]>('/api/categories'),
  })

  const depth1 = useMemo(
    () => (data ? data.filter((c) => c.depth === 1) : []),
    [data],
  )

  // 처음 로드 시 catOrder가 비어있으면 서버 응답 순서로 초기화. 저장된 순서가
  // 있다면 그 순서 유지하고 새로 추가된 카테고리만 끝에 append, 없어진 것은 제외.
  useEffect(() => {
    if (!data) return
    const haveNos = new Set(depth1.map((c) => c.no))
    if (catOrder.length === 0) {
      onOrderChange(depth1.map((c) => c.no))
      return
    }
    const filtered = catOrder.filter((no) => haveNos.has(no))
    const newOnes = depth1.map((c) => c.no).filter((no) => !catOrder.includes(no))
    if (filtered.length !== catOrder.length || newOnes.length > 0) {
      onOrderChange(filtered.concat(newOnes))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<HTMLDivElement | null>(null)

  function handleDragStart(e: React.DragEvent<HTMLDivElement>) {
    const el = e.currentTarget
    el.classList.add('dragging')
    draggingRef.current = el
    e.dataTransfer.effectAllowed = 'move'
  }

  function handleDragEnd(e: React.DragEvent<HTMLDivElement>) {
    e.currentTarget.classList.remove('dragging')
    draggingRef.current = null
    if (!containerRef.current) return
    const next = Array.from(containerRef.current.children)
      .map((el) => parseInt((el as HTMLElement).dataset.no || '0', 10))
      .filter((n) => n > 0)
    onOrderChange(next)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const dragging = draggingRef.current
    const container = containerRef.current
    if (!dragging || !container) return
    const after = getDragAfterElement(container, e.clientY)
    if (after == null) {
      container.appendChild(dragging)
    } else {
      container.insertBefore(dragging, after)
    }
  }

  function setAll(state: boolean) {
    const next: Record<string, boolean> = { ...catChecked }
    depth1.forEach((c) => {
      next[String(c.no)] = state
    })
    onCheckedChange(next)
  }

  function toggle(no: number, checked: boolean) {
    onCheckedChange({ ...catChecked, [String(no)]: checked })
  }

  if (isLoading) return <div className="cat-list-empty">로딩...</div>
  if (error) {
    return (
      <div className="cat-list-empty error">
        카테고리 로딩 실패: {String(error)}
      </div>
    )
  }
  if (depth1.length === 0) return <div className="cat-list-empty">카테고리 없음</div>

  // catOrder를 우선 표시, depth1에 있지만 catOrder엔 아직 없는 항목은 끝에
  const haveNos = new Set(depth1.map((c) => c.no))
  const ordered = [
    ...catOrder.filter((no) => haveNos.has(no)),
    ...depth1.map((c) => c.no).filter((no) => !catOrder.includes(no)),
  ]

  return (
    <>
      <div className="pane-header">
        <span className="pane-title">카테고리 (드래그로 순서 변경)</span>
        <div className="pane-controls">
          <button type="button" onClick={() => setAll(true)}>
            전체
          </button>
          <button type="button" onClick={() => setAll(false)}>
            해제
          </button>
        </div>
      </div>
      <div className="cat-list" ref={containerRef} onDragOver={handleDragOver}>
        {ordered.map((no) => {
          const cat = depth1.find((c) => c.no === no)
          if (!cat) return null
          // 기본값: catChecked에 키 없으면 true (모두 체크 상태)
          const checked =
            String(no) in catChecked ? catChecked[String(no)] : true
          return (
            <div
              key={no}
              className="cat-item"
              draggable
              data-no={no}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <span className="drag-handle">⋮⋮</span>
              <input
                type="checkbox"
                className="cat-cb"
                checked={checked}
                onChange={(e) => toggle(no, e.target.checked)}
              />
              <span className="cat-no">[{no}]</span>
              <span className="cat-name">{cat.name}</span>
            </div>
          )
        })}
      </div>
    </>
  )
}

function getDragAfterElement(container: HTMLElement, y: number): HTMLElement | null {
  const items = Array.from(
    container.querySelectorAll<HTMLElement>('.cat-item:not(.dragging)'),
  )
  return items.reduce<{ offset: number; element: HTMLElement | null }>(
    (closest, child) => {
      const box = child.getBoundingClientRect()
      const offset = y - box.top - box.height / 2
      if (offset < 0 && offset > closest.offset) {
        return { offset, element: child }
      }
      return closest
    },
    { offset: Number.NEGATIVE_INFINITY, element: null },
  ).element
}
