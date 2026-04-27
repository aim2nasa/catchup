interface Props {
  onRun: () => void
  onDownload: () => void
  downloadDisabled: boolean
  running: boolean
}

export function ActionButtons({ onRun, onDownload, downloadDisabled, running }: Props) {
  return (
    <>
      <button type="button" className="btn btn-primary" onClick={onRun} disabled={running}>
        {running ? '조회 중...' : '조회'}
      </button>
      <button type="button" className="btn" onClick={onDownload} disabled={downloadDisabled}>
        Excel 다운로드
      </button>
    </>
  )
}
