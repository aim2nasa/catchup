import { expect, test } from '@playwright/test'

const SALES_REPORT_URL = 'http://127.0.0.1:5173/catchup/#sales'

test.describe('catchup sales report — UI baseline', () => {
  test('페이지 로드: 제목, 카테고리, 버전 footer', async ({ page }) => {
    await page.goto(SALES_REPORT_URL)

    // 제목 검증 (텍스트 값 일치)
    const h1 = page.locator('h1')
    await expect(h1).toBeVisible()
    await expect(h1).toHaveText(/cafe24 판매 집계.+캐치업코리아/)

    // 필터 영역: 시작일/종료일/조회/엑셀 버튼 존재 + 텍스트 검증
    await expect(page.getByRole('button', { name: '조회' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Excel 다운로드' })).toBeVisible()
    await expect(page.locator('input[type="date"]').first()).toBeVisible()

    // Excel 다운로드는 데이터 로드 전이라 disabled 상태인지 확인
    await expect(page.getByRole('button', { name: 'Excel 다운로드' })).toBeDisabled()

    // 카테고리 리스트가 채워졌는지 (cafe24 호출 결과)
    const firstCat = page.locator('.cat-item').first()
    await expect(firstCat).toBeVisible({ timeout: 10_000 })
    // 카테고리 항목에 번호 + 이름 포함 검증
    await expect(firstCat.locator('.cat-no')).toContainText(/^\[\d+\]$/)
    await expect(firstCat.locator('.cat-name')).not.toBeEmpty()

    // 진행 상황 영역
    await expect(page.locator('.progress-log')).toBeVisible()

    // 버전 footer 패턴
    const versionCode = page.locator('.version-footer code')
    await expect(versionCode).toBeVisible()
    await expect(versionCode).toHaveText(/^v\d+\.\d+\.\d+/)
  })

  test('카테고리 전체 해제 후 조회 시 alert', async ({ page }) => {
    await page.goto(SALES_REPORT_URL)
    await expect(page.locator('.cat-item').first()).toBeVisible({ timeout: 10_000 })

    // 전체 해제 버튼 클릭
    await page.getByRole('button', { name: '해제' }).click()

    // 모든 체크박스가 해제되었는지 (시각/상태 검증)
    const checkedCount = await page.locator('.cat-cb:checked').count()
    expect(checkedCount).toBe(0)

    // 조회 → alert
    page.once('dialog', async (dialog) => {
      expect(dialog.message()).toContain('카테고리')
      await dialog.dismiss()
    })
    await page.getByRole('button', { name: '조회' }).click()
  })

  test('짧은 기간 조회 → 진행 로그 → 결과 요약 표시 (실 cafe24)', async ({ page }) => {
    test.setTimeout(60_000)
    await page.goto(SALES_REPORT_URL)
    await expect(page.locator('.cat-item').first()).toBeVisible({ timeout: 10_000 })

    // 어제 하루로 짧게 잡기 (orders 적게 → 빠른 처리)
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const iso = (d: Date) => d.toISOString().slice(0, 10)
    await page.locator('input[type="date"]').first().fill(iso(yesterday))
    await page.locator('input[type="date"]').nth(1).fill(iso(yesterday))

    // 조회
    await page.getByRole('button', { name: '조회' }).click()

    // 진행 로그에 "조회" 단계 텍스트가 들어옴
    await expect(page.locator('.progress-log')).toContainText('카테고리 목록 조회', {
      timeout: 30_000,
    })

    // 결과 요약 카드 등장 (총 합계)
    const grand = page.locator('.grand-card')
    await expect(grand).toBeVisible({ timeout: 60_000 })
    await expect(grand).toContainText('총 합계')
    await expect(grand.locator('.grand-num')).toContainText('판매수')
    await expect(grand.locator('.grand-num')).toContainText('매출')

    // 처리 X.X초 표시
    await expect(grand.locator('.grand-label')).toContainText(/처리 \d+\.\d초/)

    // 표시 토글 (한 화면 / 탭 / 통합) 존재
    const toggleButtons = page.locator('.view-toggle button')
    await expect(toggleButtons).toHaveCount(3)
    await expect(toggleButtons.nth(0)).toContainText('한 화면')
    await expect(toggleButtons.nth(1)).toContainText('탭')
    await expect(toggleButtons.nth(2)).toContainText('통합')

    // Excel 다운로드 버튼이 활성화됨
    await expect(page.getByRole('button', { name: 'Excel 다운로드' })).toBeEnabled()

    // 통합 모드 클릭 → flat-wrap 등장
    await toggleButtons.nth(2).click()
    await expect(page.locator('.flat-wrap')).toBeVisible({ timeout: 5_000 })
  })
})
