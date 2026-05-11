import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import '@/features/sales-report/SalesReportView.css'
import './ExcelOrderView.css'

export function ExcelOrderView() {
  return (
    <div className="excel-container">
      <header className="excel-header">
        <a href="#" className="home-link">← 홈</a>
        <h1>엑셀 기준 판매 보기</h1>
      </header>
      <div className="excel-placeholder card">
        <p className="excel-placeholder-title">준비 중</p>
        <p className="excel-placeholder-desc">
          엑셀 양식(상품코드_월별 시트)의 상품 순서대로 판매수/매출을 보여줄 페이지입니다.
        </p>
      </div>
      <VersionFooter />
    </div>
  )
}
