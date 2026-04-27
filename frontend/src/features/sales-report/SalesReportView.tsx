import { useMemo } from 'react'
import { ActionButtons } from './components/ActionButtons'
import { CategoryList } from './components/CategoryList'
import { CatSummaryList } from './components/CatSummaryList'
import { DateFilter } from './components/DateFilter'
import { DetailTables } from './components/DetailTables'
import { ErrorBox } from './components/ErrorBox'
import { GrandCard } from './components/GrandCard'
import { ProgressLog } from './components/ProgressLog'
import { VersionFooter } from './components/VersionFooter'
import { ViewToggle } from './components/ViewToggle'
import { useDownloadExcel } from './hooks/useDownloadExcel'
import { useReport } from './hooks/useReport'
import { useSettings } from './hooks/useSettings'
import './SalesReportView.css'

export function SalesReportView() {
  const { settings, setStart, setEnd, setMode, setSummarySort, setCatOrder, setCatChecked } =
    useSettings()
  const { state: reportState, run } = useReport()
  const downloadExcel = useDownloadExcel()

  const selectedCategoriesParam = useMemo(() => {
    const checkedNos = settings.catOrder.filter((no) => {
      const v = settings.catChecked[String(no)]
      return v === undefined ? true : v
    })
    return checkedNos.join(',')
  }, [settings.catOrder, settings.catChecked])

  function handleRun() {
    if (!settings.start || !settings.end) {
      alert('기간을 입력하세요')
      return
    }
    if (settings.start > settings.end) {
      alert('시작일이 종료일보다 늦습니다')
      return
    }
    if (!selectedCategoriesParam) {
      alert('카테고리를 1개 이상 선택하세요')
      return
    }
    run({
      start: settings.start,
      end: settings.end,
      categories: selectedCategoriesParam,
    })
  }

  function handleDownload() {
    if (!reportState.data) return
    downloadExcel({
      start: settings.start,
      end: settings.end,
      categories: selectedCategoriesParam,
      mode: settings.mode,
      sortBy: 'rev',
      sortDir: -1,
    })
  }

  const isRunning = reportState.status === 'running'
  const dataReady = !!reportState.data

  return (
    <div className="sr-container">
      <h1>cafe24 판매 집계 — 캐치업코리아</h1>

      <div className="filters card">
        <div className="filter-row">
          <DateFilter
            start={settings.start}
            end={settings.end}
            onStartChange={setStart}
            onEndChange={setEnd}
          />
          <div className="filter-spacer" />
          <ActionButtons
            onRun={handleRun}
            onDownload={handleDownload}
            downloadDisabled={!dataReady}
            running={isRunning}
          />
        </div>
      </div>

      <div className="split-panel">
        <div className="left-pane card">
          <CategoryList
            catOrder={settings.catOrder}
            catChecked={settings.catChecked}
            onOrderChange={setCatOrder}
            onCheckedChange={setCatChecked}
          />
        </div>
        <div className="right-pane card">
          <ProgressLog
            lines={reportState.progress}
            title={
              reportState.status === 'done'
                ? '처리 로그 (완료)'
                : reportState.status === 'error'
                  ? '처리 로그 (오류)'
                  : '진행 상황'
            }
          />
          <ErrorBox message={reportState.error} />
        </div>
      </div>

      {dataReady && reportState.data && (
        <>
          <div className="summary-section card">
            <CatSummaryList
              results={reportState.data.results}
              currency={reportState.data.grand.currency}
              sort={settings.summarySort}
              onSortChange={setSummarySort}
            />
            <GrandCard
              grand={reportState.data.grand}
              start={reportState.data.start}
              end={reportState.data.end}
              elapsedSeconds={reportState.elapsedSeconds}
            />
          </div>

          <div className="grand-wrap">
            <ViewToggle value={settings.mode} onChange={setMode} />
            <DetailTables data={reportState.data} mode={settings.mode} />
          </div>
        </>
      )}

      <VersionFooter />
    </div>
  )
}
