import { useEffect, useState } from 'react'
import type {
  ReportData,
  SortDir,
  SortKey,
  ViewMode,
} from '@/features/sales-report/types'
import { CatSection } from './CatSection'
import { DetailTable } from './DetailTable'
import { FlatTable } from './FlatTable'
import { TabsBar } from './TabsBar'

interface Props {
  data: ReportData
  mode: ViewMode
}

export function DetailTables({ data, mode }: Props) {
  const [sortBy, setSortBy] = useState<SortKey>('rev')
  const [sortDir, setSortDir] = useState<SortDir>(-1)
  const [activeTab, setActiveTab] = useState(0)

  // mode 변경/데이터 갱신 시 활성 탭 보정
  useEffect(() => {
    if (mode === 'tabs') {
      if (activeTab >= data.results.length) setActiveTab(0)
    }
  }, [mode, data.results.length, activeTab])

  function onSortChange(by: SortKey, dir: SortDir) {
    setSortBy(by)
    setSortDir(dir)
  }

  if (mode === 'flat') {
    return (
      <FlatTable
        results={data.results}
        grand={data.grand}
        sortBy={sortBy}
        sortDir={sortDir}
        onSortChange={onSortChange}
      />
    )
  }

  if (mode === 'tabs') {
    if (data.results.length === 0) return null
    const safeIdx = Math.min(activeTab, data.results.length - 1)
    const r = data.results[safeIdx]
    return (
      <>
        <TabsBar
          results={data.results}
          activeIdx={safeIdx}
          onActivate={setActiveTab}
        />
        <div className="tab-content-tabs">
          <DetailTable
            groups={r.groups}
            totals={{ qty: r.qty, rev: r.rev }}
            currency={data.grand.currency}
            sortBy={sortBy}
            sortDir={sortDir}
            onSortChange={onSortChange}
          />
        </div>
      </>
    )
  }

  // single
  return (
    <>
      {data.results.map((r) => (
        <CatSection
          key={r.category_no}
          result={r}
          currency={data.grand.currency}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortChange={onSortChange}
        />
      ))}
    </>
  )
}
