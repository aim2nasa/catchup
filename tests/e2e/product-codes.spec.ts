import { expect, test } from '@playwright/test'
import ExcelJS from 'exceljs'

const PRODUCT_CODES_START = '2026-04-01'
const PRODUCT_CODES_END = '2026-04-30'

test.describe('상품코드 페이지', () => {
  test('홈 메뉴에서 하드왁스 아래 독립 상품코드 페이지로 진입할 수 있다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/')

    const hardwaxMenu = page.locator('a[href="#hardwax"]')
    const productCodesMenu = page.locator('a[href="#product-codes"]')

    await expect(hardwaxMenu).toBeVisible()
    await expect(productCodesMenu).toBeVisible()

    const order = await page.locator('.home-menu-item').evaluateAll((items) =>
      items.map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
    )
    expect(order[0]).toContain('하드왁스')
    expect(order[1]).toContain('상품코드')

    await productCodesMenu.click()
    await expect(page).toHaveURL(/#product-codes$/)
    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await expect(page.getByRole('link', { name: '집계표' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: '상품코드' })).toHaveCount(0)
  })

  test('상품코드 페이지는 하드왁스 뒤에 L상품 카테고리를 이어서 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('.pc-excel-table')).toBeVisible()
    await expect(page.locator('.pc-excel-table tbody')).toContainText('하드왁스', { timeout: 15000 })
    await expect(page.locator('.pc-excel-table tbody')).toContainText('500g 합계')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000ZB')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('1kg 합계')
    await expect(page.getByText('라이코젯아이브로우')).toBeVisible()
    await expect(page.locator('.pc-excel-table tbody')).toContainText('스트립왁스')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000CM')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('워머기&컵')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000VK')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('소모품')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000TX')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000DG')

    await expect(page.locator('.product-category-row .pc-excel-row-head').first()).toHaveText(/\d+/)
    await expect(page.locator('.product-category-row')).toHaveCount(9)
    await expect(page.locator('.product-segment-row')).toHaveCount(0)
  })

  test('카테고리 행은 엑셀 좌표에 포함되고 구간 표시 행은 만들지 않는다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const categoryA1 = await page
      .locator('td[data-row-key="category:하드왁스"]')
      .getAttribute('data-a1')
    const firstProductA1 = await page.locator('td[data-row-key^="parent:500g:P00000HT"]').first().getAttribute('data-a1')
    const firstAddedCategoryA1 = await page
      .locator('td[data-row-key="category:스트립왁스"]')
      .getAttribute('data-a1')
    const firstAddedProductA1 = await page
      .locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:상품코드"]')
      .getAttribute('data-a1')
    expect(categoryA1).toBe('A10')
    await expect(page.locator('.product-segment-row')).toHaveCount(0)
    expect(firstProductA1).toBe('A11')
    expect(firstAddedCategoryA1).toBe('A48')
    expect(firstAddedProductA1).toBe('A49')

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel 다운로드' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath!)
    const worksheet = workbook.getWorksheet('상품코드')
    expect(worksheet?.getCell('A10').value).toBe('카테고리 하드왁스')
    expect(worksheet?.getCell('A11').value).toBe('P00000HT')
    expect(worksheet?.getCell('A48').value).toBe('카테고리 스트립왁스')
    expect(worksheet?.getCell('A49').value).toBe('P00000CM')
  })

  test('상품코드 L상품은 스크린샷 기준 옵션까지 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    await expect(page.locator('td[data-row-key="parent:워머기&컵:P00000VK"][data-col-key="A:코드"]')).toHaveText('C')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:코드"]')).toHaveText('D')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000M"][data-col-key="A:코드"]')).toHaveText('M')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000N"][data-col-key="A:코드"]')).toHaveText('N')

    await expect(page.locator('td[data-row-key="parent:소모품:P00000TX"][data-col-key="A:코드"]')).toHaveText('B')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000C"][data-col-key="A:코드"]')).toHaveText('C')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000D"][data-col-key="A:코드"]')).toHaveText('D')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000F"][data-col-key="A:코드"]')).toHaveText('F')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000G"][data-col-key="A:코드"]')).toHaveText('G')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000H"][data-col-key="A:코드"]')).toHaveText('H')

    await expect(page.locator('td[data-row-key="parent:슈거스크럽:P00000OG"][data-col-key="A:코드"]')).toHaveText('H')
    await expect(page.locator('td[data-row-key="variant:P00000OG:P00000OG000I"][data-col-key="A:코드"]')).toHaveText('I')
    await expect(page.locator('td[data-row-key="variant:P00000OG:P00000OG000K"][data-col-key="A:코드"]')).toHaveText('K')
    await expect(page.locator('td[data-row-key="variant:P00000OG:P00000OG000J"][data-col-key="A:코드"]')).toHaveCount(0)
  })

  test('조회 데이터가 비어도 기준표에 존재하는 L상품 옵션은 기간 판매 0으로 표시한다', async ({ page }) => {
    const requestedUrls: string[] = []
    page.on('request', (request) => {
      requestedUrls.push(request.url())
    })
    await page.route('**/api/products-report-requests', async (route) => {
      expect(route.request().method()).toBe('POST')
      const body = route.request().postDataJSON() as { codes: string[] }
      expect(body.codes.length).toBeGreaterThan(40)
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ request_id: 'mock-empty-products', expires_in_seconds: 600 }),
      })
    })
    await page.route('**/api/products-report-stream/mock-empty-products', async (route) => {
      const payloads = [
        { type: 'progress', msg: 'mock empty result' },
        {
          type: 'data',
          results: [],
          grand: { qty: 0, rev: 0, currency: 'KRW', order_count: 0 },
          start: PRODUCT_CODES_START,
          end: PRODUCT_CODES_END,
        },
        { type: 'done' },
      ]
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body: payloads.map((payload) => `data: ${JSON.stringify(payload)}\n\n`).join(''),
      })
    })

    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')
    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })
    expect(requestedUrls.some((url) => url.includes('/api/products-report?'))).toBe(false)

    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:상품명"]')).toHaveText(
      '라이코플렉스 바닐라 스트립(Lycoflex Vanilla Strip Wax) 800ml',
    )
    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:코드"]')).toHaveText('A')
    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:옵션명"]')).toHaveText('-')
    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:단가"]')).toHaveText('₩34,700')
    const zeroDirect = page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="A:직접판매"]')
    await expect(zeroDirect).toHaveText('0')
    await expect(zeroDirect).not.toHaveAttribute('data-read-status', 'missing')
    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="C:총판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="parent:스트립왁스:P00000CM"][data-col-key="C:매출"]')).toHaveText('₩0')

    await expect(page.locator('td[data-row-key="parent:워머기&컵:P00000VK"][data-col-key="A:상품명"]')).toHaveText(
      '라이콘워머기 2구 / 자디니 베이비 히터기 220g',
    )
    await expect(page.locator('td[data-row-key="parent:워머기&컵:P00000VK"][data-col-key="A:코드"]')).toHaveText('C')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:옵션명"]')).toHaveText(
      '자디니 베이비 히터(220g)',
    )
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="parent:소모품:P00000TX"][data-col-key="A:코드"]')).toHaveText('B')
    await expect(page.locator('td[data-row-key="parent:소모품:P00000TX"][data-col-key="A:직접판매"]')).toHaveText('0')
  })

  test('백엔드 헬스체크 실패 시 SSE를 열지 않고 명확한 서버 오류를 표시한다', async ({ page }) => {
    const requestedUrls: string[] = []
    page.on('request', (request) => {
      requestedUrls.push(request.url())
    })
    await page.route('**/api/version', async (route) => {
      await route.abort('connectionrefused')
    })

    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')
    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('.error-box')).toContainText('백엔드 서버에 연결할 수 없습니다')
    expect(requestedUrls.some((url) => url.includes('/api/products-report-stream/'))).toBe(false)
    expect(requestedUrls.some((url) => url.includes('/api/products-report?'))).toBe(false)
  })

  test('존재 확인된 옵션의 기간 응답 누락은 화면과 엑셀에서 0으로 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    await expect(page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="A:옵션명"]')).toHaveText('-')
    await expect(page.locator('td[data-row-key="parent:워머기&컵:P00000VK"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000M"][data-col-key="A:직접판매"]')).toHaveText('28')
    await expect(page.locator('td[data-row-key="variant:P00000VK:P00000VK000N"][data-col-key="A:직접판매"]')).toHaveText('9')

    await expect(page.locator('td[data-row-key="parent:소모품:P00000TX"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000C"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000D"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000F"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000G"][data-col-key="A:직접판매"]')).toHaveText('0')
    await expect(page.locator('td[data-row-key="variant:P00000TX:P00000TX000H"][data-col-key="A:직접판매"]')).toHaveText('0')

    const knownNoSalesA1 = await page
      .locator('td[data-row-key="parent:워머기&컵:P00000VK"][data-col-key="A:직접판매"]')
      .getAttribute('data-a1')
    const loadedZeroA1 = await page
      .locator('td[data-row-key="variant:P00000TX:P00000TX000F"][data-col-key="A:직접판매"]')
      .getAttribute('data-a1')
    expect(knownNoSalesA1).toBeTruthy()
    expect(loadedZeroA1).toBeTruthy()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel 다운로드' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath!)
    const worksheet = workbook.getWorksheet('상품코드')
    expect(worksheet?.getCell(knownNoSalesA1!).value).toBe(0)
    expect(String(worksheet?.getCell(knownNoSalesA1!).note ?? '')).not.toContain('확인불가')
    expect(worksheet?.getCell(loadedZeroA1!).value).toBe(0)
    expect(worksheet?.getColumn(1).values).toContain('조회값 상태 범례')
    expect(worksheet?.getColumn(2).values).toContain('확인불가 항목 제외 합계')
  })

  test('수식 제외 빈 교차셀은 일반 빈 교차셀과 같은 배경으로 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const cellBackgrounds = await page.locator('.pc-excel-table').evaluate((table) => {
      const excludedSet = table.querySelector('td.map-cell--excluded.u-col-set')
      const unmappedSet = table.querySelector('td.map-cell--unmapped.u-col-set')
      const conversionCell = table.querySelector('td.map-cell--unmapped.u-col-conversion')
      return {
        excludedSet: excludedSet ? getComputedStyle(excludedSet).backgroundColor : null,
        unmappedSet: unmappedSet ? getComputedStyle(unmappedSet).backgroundColor : null,
        conversion: conversionCell ? getComputedStyle(conversionCell).backgroundColor : null,
      }
    })
    expect(cellBackgrounds.excludedSet).toBeNull()
    expect(cellBackgrounds.unmappedSet).toBeTruthy()
    expect(cellBackgrounds.conversion).not.toBe(cellBackgrounds.unmappedSet)

    const optionHeaderColors = await page.locator('.pc-excel-table').evaluate((table) => {
      const conversionOption = table.querySelector('thead tr:nth-child(3) th.matrix-variant.u-col-conversion')
      const setOption = table.querySelector('thead tr:nth-child(3) th.matrix-variant.u-col-set')
      const leftHeader = table.querySelector('thead th.sticky-code')
      return {
        conversion: conversionOption ? getComputedStyle(conversionOption).backgroundColor : null,
        set: setOption ? getComputedStyle(setOption).backgroundColor : null,
        left: leftHeader ? getComputedStyle(leftHeader).backgroundColor : null,
      }
    })
    expect(optionHeaderColors.set).not.toBe(optionHeaderColors.conversion)
    expect(optionHeaderColors.left).not.toBe(optionHeaderColors.conversion)
    expect(optionHeaderColors.left).not.toBe(optionHeaderColors.set)
  })

  test('세트상품 구성 교차셀은 세트 판매량에 구성 수량을 곱해 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const cases = [
      { colKey: 'B:P00000YZ-D', rowKey: 'parent:500g:P00000ZB', componentQty: 1 },
      { colKey: 'B:P00000YZ-D', rowKey: 'parent:제모미인제품:P00000ZA', componentQty: 1 },
      { colKey: 'B:P00000YS-A', rowKey: 'parent:500g:P00000HT', componentQty: 1 },
      { colKey: 'B:P00000YS-A', rowKey: 'parent:제모미인제품:P00000XW', componentQty: 5 },
      { colKey: 'B:P00000YU-B', rowKey: 'variant:P00000VK:P00000VK000M', componentQty: 1 },
      { colKey: 'B:P00000VP-B', rowKey: 'parent:슈거스크럽:P00000OG', componentQty: 4 },
      { colKey: 'B:P00000VA-A', rowKey: 'parent:파우치:P00000UK', componentQty: 50 },
    ]

    for (const testCase of cases) {
      const directQty = await readProductCodesNumericCell(page, 'product-codes-u-direct', testCase.colKey)
      const mappedCell = page.locator(`td[data-row-key="${testCase.rowKey}"][data-col-key="${testCase.colKey}"]`)
      await expect(mappedCell).toHaveText(String(directQty * testCase.componentQty))
      await expect(mappedCell).toHaveClass(/map-cell--mapped/)
      await expect(mappedCell).toHaveCSS('text-align', 'right')
    }

    const oldDirectSetCell = page.locator('td[data-row-key="parent:500g:P00000ZB"][data-col-key="B:P00000YS-A"]')
    await expect(oldDirectSetCell).toHaveText('')
    await expect(oldDirectSetCell).not.toHaveClass(/map-cell--mapped/)
  })

  test('매출 수식은 세트 구성 단가와 전환 단가를 추적 가능한 참조로 표시하고 엑셀에 내보낸다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const revenueCell = page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="C:매출"]')
    await revenueCell.click()
    const formulaValue = page.locator('.selection-formula-value')
    await expect(formulaValue).toContainText('세트 구성 단가[P00000YS/A->P00000HT/A]')
    await expect(formulaValue).not.toContainText('*21040')
    await expect(formulaValue.locator('.selection-formula-set-price')).toHaveText(
      '세트 구성 단가[P00000YS/A->P00000HT/A]',
    )
    await expect(revenueCell).toHaveAttribute(
      'data-formula',
      /BG11\*세트 구성 단가\[P00000YS\/A->P00000HT\/A\]/,
    )
    await expect(revenueCell).toHaveAttribute(
      'data-excel-formula',
      /BG11\*SET_P00000YS_A_P00000HT_A_PRICE/,
    )
    const mappedRevenueCell = page.locator('td[data-row-key="parent:500g:P00000BV"][data-col-key="C:매출"]')
    await mappedRevenueCell.click()
    await expect(formulaValue).toContainText('전환 단가[P00000QE/G->P00000BV/A]')
    await expect(formulaValue).not.toContainText('*19200')
    await expect(mappedRevenueCell).toHaveAttribute(
      'data-formula',
      /G12\*전환 단가\[P00000QE\/G->P00000BV\/A\]/,
    )
    await expect(mappedRevenueCell).toHaveAttribute(
      'data-excel-formula',
      /G12\*CONVERSION_P00000QE_G_P00000BV_A_PRICE/,
    )
    const revenueA1 = await revenueCell.getAttribute('data-a1')
    const mappedRevenueA1 = await mappedRevenueCell.getAttribute('data-a1')
    expect(revenueA1).toBeTruthy()
    expect(mappedRevenueA1).toBeTruthy()

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel 다운로드' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath!)
    const worksheet = workbook.getWorksheet('상품코드')
    const supportSheet = workbook.getWorksheet('매출단가참조')
    expect(worksheet).toBeTruthy()
    expect(supportSheet).toBeTruthy()
    const exportedFormula = worksheet?.getCell(revenueA1!).value
    expect(exportedFormula).toMatchObject({
      formula: expect.stringContaining('BG11*SET_P00000YS_A_P00000HT_A_PRICE'),
    })
    expect(String((exportedFormula as { formula?: string }).formula ?? '')).not.toContain('*21040')
    const mappedExportedFormula = worksheet?.getCell(mappedRevenueA1!).value
    expect(mappedExportedFormula).toMatchObject({
      formula: expect.stringContaining('G12*CONVERSION_P00000QE_G_P00000BV_A_PRICE'),
    })
    expect(String((mappedExportedFormula as { formula?: string }).formula ?? '')).not.toContain('*19200')

    const definedRanges = workbook.definedNames.getRanges('SET_P00000YS_A_P00000HT_A_PRICE').ranges
    expect(definedRanges).toHaveLength(1)
    expect(definedRanges[0]).toMatch(/'매출단가참조'!\$L\$\d+/)
    const refRow = supportSheet!.getColumn(1).values.findIndex(
      (value) => value === 'SET_P00000YS_A_P00000HT_A_PRICE',
    )
    expect(refRow).toBeGreaterThan(1)
    expect(supportSheet!.getCell(refRow, 2).value).toBe('세트 구성 단가')
    expect(supportSheet!.getCell(refRow, 3).value).toBe('P00000YS')
    expect(supportSheet!.getCell(refRow, 5).value).toBe('A')
    expect(supportSheet!.getCell(refRow, 7).value).toBe('P00000HT')
    expect(supportSheet!.getCell(refRow, 9).value).toBe('A')
    expect(supportSheet!.getCell(refRow, 11).value).toBe(1)
    expect(supportSheet!.getCell(refRow, 12).value).toBe(21040)

    const mappedDefinedRanges = workbook.definedNames.getRanges('CONVERSION_P00000QE_G_P00000BV_A_PRICE').ranges
    expect(mappedDefinedRanges).toHaveLength(1)
    expect(mappedDefinedRanges[0]).toMatch(/'매출단가참조'!\$L\$\d+/)
    const mappedRefRow = supportSheet!.getColumn(1).values.findIndex(
      (value) => value === 'CONVERSION_P00000QE_G_P00000BV_A_PRICE',
    )
    expect(mappedRefRow).toBeGreaterThan(1)
    expect(supportSheet!.getCell(mappedRefRow, 2).value).toBe('전환 단가')
    expect(supportSheet!.getCell(mappedRefRow, 3).value).toBe('P00000QE')
    expect(supportSheet!.getCell(mappedRefRow, 5).value).toBe('G')
    expect(supportSheet!.getCell(mappedRefRow, 7).value).toBe('P00000BV')
    expect(supportSheet!.getCell(mappedRefRow, 9).value).toBe('A')
    expect(supportSheet!.getCell(mappedRefRow, 12).value).toBe(19200)
  })

  test('상품코드 화면과 엑셀 다운로드는 셀 값, 수식, 매출단가참조를 동적으로 일치시킨다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const screenCells = await page.locator('.pc-excel-table td[data-a1][data-col-key]').evaluateAll((cells) =>
      cells.map((cell) => {
        const el = cell as HTMLElement
        return {
          a1: el.dataset.a1 ?? '',
          rowKey: el.dataset.rowKey ?? '',
          colKey: el.dataset.colKey ?? '',
          text: el.textContent?.trim() ?? '',
          exportValue: el.dataset.exportValue ?? '',
          formula: el.dataset.formula ?? '',
          excelFormula: el.dataset.excelFormula ?? '',
        }
      }),
    )
    expect(screenCells.length).toBeGreaterThan(4000)
    expect(screenCells.filter((cell) => cell.excelFormula || cell.formula).length).toBeGreaterThan(700)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel 다운로드' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath!)
    const worksheet = workbook.getWorksheet('상품코드')
    const supportSheet = workbook.getWorksheet('매출단가참조')
    expect(worksheet).toBeTruthy()
    expect(supportSheet).toBeTruthy()

    const valueMismatches: unknown[] = []
    const formulaMismatches: unknown[] = []
    const referencedNames = new Set<string>()
    const refNamePattern = /\b(?:SET|CONVERSION)_[A-Z0-9_]+_PRICE\b/g

    for (const screenCell of screenCells) {
      if (!screenCell.a1) continue
      const excelCell = worksheet!.getCell(screenCell.a1)
      const expectedFormula = screenCell.excelFormula || screenCell.formula

      if (expectedFormula && !expectedFormula.includes('단가미확인')) {
        const actualFormula = productCodesExcelCellFormula(excelCell)
        const normalizedExpectedFormula = expectedFormula.startsWith('=') ? expectedFormula.slice(1) : expectedFormula
        if (actualFormula !== normalizedExpectedFormula) {
          formulaMismatches.push({
            a1: screenCell.a1,
            rowKey: screenCell.rowKey,
            colKey: screenCell.colKey,
            expected: normalizedExpectedFormula,
            actual: actualFormula,
          })
        }
        for (const match of normalizedExpectedFormula.matchAll(refNamePattern)) {
          referencedNames.add(match[0])
        }
      }

      const expectedValue = parseProductCodesExportValue(screenCell.exportValue || screenCell.text)
      const actualValue = productCodesExcelCellResult(excelCell)
      if (!productCodesExcelValuesEqual(actualValue, expectedValue)) {
        valueMismatches.push({
          a1: screenCell.a1,
          rowKey: screenCell.rowKey,
          colKey: screenCell.colKey,
          expected: expectedValue,
          actual: actualValue,
        })
      }
    }

    expect(formulaMismatches.slice(0, 10), JSON.stringify(formulaMismatches.slice(0, 10), null, 2)).toHaveLength(0)
    expect(valueMismatches.slice(0, 10), JSON.stringify(valueMismatches.slice(0, 10), null, 2)).toHaveLength(0)
    expect(referencedNames.size).toBeGreaterThan(80)

    const supportRows = new Map<string, { row: number; type: unknown }>()
    supportSheet!.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return
      const name = row.getCell(1).value
      if (typeof name === 'string' && name.endsWith('_PRICE')) {
        supportRows.set(name, { row: rowNumber, type: row.getCell(2).value })
      }
    })
    const supportTypes = new Set([...supportRows.values()].map((row) => row.type))
    expect([...supportTypes].sort()).toEqual(['세트 구성 단가', '전환 단가'])

    const missingRefRows: unknown[] = []
    const missingDefinedNames: unknown[] = []
    const wrongRefTypes: unknown[] = []
    for (const refName of referencedNames) {
      const supportRow = supportRows.get(refName)
      if (!supportRow) {
        missingRefRows.push(refName)
        continue
      }
      const ranges = workbook.definedNames.getRanges(refName).ranges
      if (ranges.length !== 1 || !ranges[0].includes(`$L$${supportRow.row}`)) {
        missingDefinedNames.push({ refName, expectedRow: supportRow.row, ranges })
      }
      const expectedType = refName.startsWith('SET_') ? '세트 구성 단가' : '전환 단가'
      if (supportRow.type !== expectedType) {
        wrongRefTypes.push({ refName, expectedType, actualType: supportRow.type })
      }
    }
    expect(missingRefRows, JSON.stringify(missingRefRows, null, 2)).toHaveLength(0)
    expect(missingDefinedNames, JSON.stringify(missingDefinedNames, null, 2)).toHaveLength(0)
    expect(wrongRefTypes, JSON.stringify(wrongRefTypes, null, 2)).toHaveLength(0)
  })

  test('교차셀 클릭 기준선은 hover 하이라이트와 구분되어 남고 삭제할 수 있다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const firstPinnedCell = page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="B:P00000YS-A"]')
    await firstPinnedCell.click()
    await expect(firstPinnedCell).toHaveClass(/pc-excel-pinned-cell/)
    await expect(firstPinnedCell).toHaveClass(/pc-excel-pin-0/)
    await expect(page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="A:직접판매"]')).toHaveClass(/pc-excel-pinned-row/)
    await expect(page.locator('td[data-row-key="parent:500g:P00000BV"][data-col-key="B:P00000YS-A"]')).toHaveClass(/pc-excel-pinned-col/)
    await expect(page.getByRole('button', { name: '고정선 1개 지우기' })).toBeVisible()

    const hoverCell = page.locator('td[data-row-key="parent:500g:P00000CB"][data-col-key="B:P00000YU-B"]')
    await hoverCell.hover()
    await expect(hoverCell).toHaveClass(/pc-excel-hover-cell/)
    await expect(firstPinnedCell).toHaveClass(/pc-excel-pinned-cell/)
    await expect(firstPinnedCell).not.toHaveClass(/pc-excel-hover-cell/)

    await hoverCell.click()
    await expect(hoverCell).toHaveClass(/pc-excel-pinned-cell/)
    await expect(hoverCell).toHaveClass(/pc-excel-pin-1/)
    await expect(page.getByRole('button', { name: '고정선 2개 지우기' })).toBeVisible()

    const secondPinnedRowProbe = page.locator('td[data-row-key="parent:500g:P00000CB"][data-col-key="A:직접판매"]')
    const secondPinnedColProbe = page.locator('td[data-row-key="parent:500g:P00000BV"][data-col-key="B:P00000YU-B"]')
    await page.keyboard.press('Escape')
    await expect(hoverCell).not.toHaveClass(/pc-excel-pinned-cell/)
    await expect(hoverCell).not.toHaveClass(/pc-excel-cell-selected/)
    await expect(hoverCell).not.toHaveClass(/pc-excel-hover-cell/)
    await expect(secondPinnedRowProbe).not.toHaveClass(/pc-excel-pinned-row/)
    await expect(secondPinnedRowProbe).not.toHaveClass(/pc-excel-row-selected/)
    await expect(secondPinnedColProbe).not.toHaveClass(/pc-excel-pinned-col/)
    await expect(secondPinnedColProbe).not.toHaveClass(/pc-excel-col-selected/)
    await expect(firstPinnedCell).toHaveClass(/pc-excel-pinned-cell/)
    await expect(page.getByRole('button', { name: '고정선 1개 지우기' })).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(firstPinnedCell).not.toHaveClass(/pc-excel-pinned-cell/)
    await expect(page.getByRole('button', { name: /고정선 .* 지우기/ })).toHaveCount(0)
    await expect(page.locator('.pc-excel-pinned-row, .pc-excel-pinned-col, .pc-excel-pinned-cell')).toHaveCount(0)
    await expect(page.locator('.pc-excel-row-selected, .pc-excel-col-selected, .pc-excel-cell-selected')).toHaveCount(0)
    await expect(page.locator('.pc-excel-hover-row, .pc-excel-hover-col, .pc-excel-hover-cell')).toHaveCount(0)

    await firstPinnedCell.click()
    await expect(page.getByRole('button', { name: '고정선 1개 지우기' })).toBeVisible()
    await firstPinnedCell.click()
    await expect(firstPinnedCell).not.toHaveClass(/pc-excel-pinned-cell/)
    await expect(page.getByRole('button', { name: /고정선 .* 지우기/ })).toHaveCount(0)

    await firstPinnedCell.click()
    await hoverCell.click()
    await expect(page.getByRole('button', { name: '고정선 2개 지우기' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(hoverCell).not.toHaveClass(/pc-excel-pinned-cell/)
    await expect(page.getByRole('button', { name: '고정선 1개 지우기' })).toBeVisible()

    await page.getByRole('button', { name: '고정선 1개 지우기' }).click()
    await expect(firstPinnedCell).not.toHaveClass(/pc-excel-pinned-cell/)
    await expect(page.getByRole('button', { name: /고정선 .* 지우기/ })).toHaveCount(0)
    await expect(page.locator('.pc-excel-pinned-row, .pc-excel-pinned-col, .pc-excel-pinned-cell')).toHaveCount(0)
    await expect(page.locator('.pc-excel-row-selected, .pc-excel-col-selected, .pc-excel-cell-selected')).toHaveCount(0)
    await expect(page.locator('.pc-excel-hover-row, .pc-excel-hover-col, .pc-excel-hover-cell')).toHaveCount(0)
  })

  test('수평 스크롤 중에도 왼쪽 컬럼 압축과 행 높이 기준이 안정적으로 유지된다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const initial = await readProductCodesScrollState(page)
    expect(initial.revenueWidth).toBeGreaterThanOrEqual(140)
    expect(initial.revenueWidth).toBeLessThanOrEqual(145)

    await setProductCodesScrollLeft(page, Math.floor(initial.maxLeft / 2))
    const middle = await readProductCodesScrollState(page)
    expect(middle.isLeftCompact).toBe(true)
    expect(middle.revenueWidth).toBe(initial.revenueWidth)
    expect(middle.firstDataRowHeight).toBe(initial.firstDataRowHeight)
    expect(middle.longProductRowHeight).toBe(initial.longProductRowHeight)
    expect(middle.lastVisibleRowNumber).toBe(initial.lastVisibleRowNumber)
    expect(middle.categoryLeft).toBe(initial.categoryLeft)

    await setProductCodesScrollLeft(page, initial.maxLeft)
    const right = await readProductCodesScrollState(page)
    expect(right.isLeftCompact).toBe(true)
    expect(right.revenueWidth).toBe(initial.revenueWidth)
    expect(right.firstDataRowHeight).toBe(initial.firstDataRowHeight)
    expect(right.longProductRowHeight).toBe(initial.longProductRowHeight)
    expect(right.lastVisibleRowNumber).toBe(initial.lastVisibleRowNumber)
    expect(right.categoryLeft).toBe(initial.categoryLeft)
  })

  test('보기 모드로 좁은 화면에서 오른쪽 숫자 영역을 더 넓게 볼 수 있다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const detail = await readProductCodesViewModeState(page)
    await expect(page.getByRole('button', { name: '기본' })).toHaveAttribute('aria-pressed', 'true')
    expect(detail.nameWidth).toBeGreaterThan(300)
    expect(detail.priceWidth).toBeGreaterThan(60)

    await page.getByRole('button', { name: '넓게', exact: true }).click()
    const wide = await readProductCodesViewModeState(page)
    expect(wide.uStartLeft).toBeLessThan(detail.uStartLeft)
    expect(wide.priceWidth).toBe(0)
    expect(wide.nameWidth).toBeGreaterThan(0)
    expect(wide.optionNameWidth).toBeGreaterThan(0)

    await page.getByRole('button', { name: '더 넓게' }).click()
    const focus = await readProductCodesViewModeState(page)
    expect(focus.uStartLeft).toBeLessThan(wide.uStartLeft)
    expect(focus.nameWidth).toBe(0)
    expect(focus.optionNameWidth).toBe(0)
    expect(focus.priceWidth).toBe(0)

    await page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="A:직접판매"]').click()
    await expect(page.getByLabel('왼쪽 상품')).toContainText('P00000HT')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('라이코젯아이브로우')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('옵션')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('-')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('가격')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('₩26,300')
    const leftCardColor = await page.getByLabel('왼쪽 상품').evaluate((card) => ({
      background: getComputedStyle(card).backgroundColor,
      borderLeft: getComputedStyle(card).borderLeftColor,
    }))
    expect(leftCardColor.background).toBe('rgb(224, 231, 255)')
    expect(leftCardColor.borderLeft).toBe('rgb(165, 180, 252)')
    const hiddenContextTitle = await page
      .locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:직접판매"]')
      .getAttribute('title')
    expect(hiddenContextTitle).toContain('상품명: 라이콘워머기 2구 / 자디니 베이비 히터기 220g')
    expect(hiddenContextTitle).toContain('옵션명: 자디니 베이비 히터(220g)')
    await page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key="A:직접판매"]').click()
    await expect(page.getByLabel('왼쪽 상품')).toContainText('라이콘워머기 2구 / 자디니 베이비 히터기 220g')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('D')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('자디니 베이비 히터(220g)')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('₩44,000')
    await page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key^="B:"]').first().click()
    await expect(page.getByLabel('왼쪽 상품')).toContainText('라이코젯아이브로우')
    await expect(page.getByLabel('위쪽 상품')).not.toContainText('-')
    await expect(page.getByLabel('위쪽 상품')).toContainText('전환상품')
    await expect(page.getByLabel('위쪽 상품')).toContainText('상품')
    await expect(page.getByLabel('위쪽 상품')).toContainText('옵션')
    await expect(page.getByLabel('위쪽 상품')).toContainText('가격')
    await expect(page.locator('.selection-product-panel-top')).toHaveClass(/is-conversion/)
    const conversionCardColor = await page.locator('.selection-product-panel-top').evaluate((card) => ({
      borderTop: getComputedStyle(card).borderTopColor,
      borderLeft: getComputedStyle(card).borderLeftColor,
      badgeBackground: getComputedStyle(card.querySelector('.selection-panel-type')!).backgroundColor,
    }))
    expect(conversionCardColor.borderTop).toBe('rgb(37, 99, 235)')
    expect(conversionCardColor.borderLeft).toBe('rgb(184, 196, 210)')

    const setColumnDirectQtyText = await page
      .locator('td[data-row-key="product-codes-u-direct"][data-col-key="B:P00000YS-A"]')
      .textContent()
    const setColumnDirectQty = Number((setColumnDirectQtyText ?? '').replace(/,/g, '').trim())
    expect(setColumnDirectQty).toBeGreaterThan(0)

    const setProductCrossCell = page.locator('td[data-row-key="parent:500g:P00000HT"][data-col-key="B:P00000YS-A"]')
    await expect(setProductCrossCell).toHaveText(String(setColumnDirectQty))
    await expect(setProductCrossCell).toHaveClass(/map-cell--mapped/)
    const setMaskComponentCell = page.locator('td[data-row-key="parent:제모미인제품:P00000XW"][data-col-key="B:P00000YS-A"]')
    await expect(setMaskComponentCell).toHaveText(String(setColumnDirectQty * 5))
    await expect(setMaskComponentCell).toHaveClass(/map-cell--mapped/)
    const setMaskComponentA1 = await setMaskComponentCell.getAttribute('data-a1')
    expect(setMaskComponentA1).toBeTruthy()
    await setProductCrossCell.evaluate((cell) => (cell as HTMLElement).click())
    await page.mouse.move(5, 5)
    await expect(page.getByLabel('위쪽 상품')).toContainText('세트 상품')
    await expect(page.locator('.selection-product-panel-top')).toHaveClass(/is-set/)
    const setCardColor = await page.locator('.selection-product-panel-top').evaluate((card) => ({
      borderTop: getComputedStyle(card).borderTopColor,
      borderLeft: getComputedStyle(card).borderLeftColor,
      badgeBackground: getComputedStyle(card.querySelector('.selection-panel-type')!).backgroundColor,
    }))
    expect(setCardColor.borderTop).toBe('rgb(22, 163, 74)')
    expect(setCardColor.borderLeft).toBe('rgb(184, 196, 210)')
    expect(setCardColor.badgeBackground).not.toBe(conversionCardColor.badgeBackground)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Excel 다운로드' }).click()
    const download = await downloadPromise
    const filePath = await download.path()
    expect(filePath).toBeTruthy()
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(filePath!)
    const worksheet = workbook.getWorksheet('상품코드')
    expect(worksheet?.getCell(setMaskComponentA1!).value).toBe(setColumnDirectQty * 5)

    await page.locator('td[data-row-key="variant:P00000VK:P00000VK000D"][data-col-key^="B:"]').first().hover()
    await expect(page.getByLabel('왼쪽 상품')).toContainText('라이콘워머기 2구 / 자디니 베이비 히터기 220g')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('D')
    await expect(page.getByLabel('왼쪽 상품')).toContainText('자디니 베이비 히터(220g)')
    await expect(page.getByLabel('위쪽 상품')).not.toContainText('-')

    await page.reload()
    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await expect(page.getByRole('button', { name: '더 넓게' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('세트상품 헤더에서 구성 편집 모달을 열고 왼쪽상품을 교체/추가/삭제할 수 있다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    await setProductCodesScrollLeft(page, 1500)
    await page.getByRole('button', { name: 'P00000YZ 세트상품 구성 편집' }).click()
    const modal = page.getByRole('dialog', { name: '라이콘 컵 왁스 비즈 110g 세트' })
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('공통 구성')
    await expect(modal).toContainText('선택 옵션 구성')
    await expect(modal).toContainText('구성 합계 ₩44,380')
    await expect(page.getByLabel('세트상품 선택')).toHaveCount(0)

    await expect(modal).toContainText('P00000ZA')
    await expect(modal).toContainText('P00000VK')
    await expect(modal).toContainText('P00000ZB')

    await page.getByLabel('P00000YZ-common-P00000ZA-A 수량', { exact: true }).fill('2')
    await expect(modal).toContainText('구성 합계 ₩49,000')
    await expect(modal).toContainText('화면 초안')

    await page.getByLabel('P00000YZ-common-P00000ZA-A 왼쪽상품', { exact: true }).selectOption('P00000HT')
    await expect(modal).toContainText('라이코젯아이브로우(Lycojet Eyebrow Hot Wax) 500g')
    await expect(page.getByLabel('P00000YZ-common-P00000ZA-A 왼쪽상품 옵션', { exact: true })).toHaveValue('A')

    await modal.getByRole('button', { name: '왼쪽상품 추가' }).first().click()
    await expect(modal.locator('select[aria-label$="왼쪽상품"]')).toHaveCount(5)

    await modal.getByRole('button', { name: '삭제' }).first().click()
    await expect(modal.getByRole('button', { name: '복구' })).toBeVisible()

    await page.getByRole('button', { name: '초기값' }).click()
    await expect(modal).toContainText('구성 합계 ₩44,380')
    await expect(modal).not.toContainText('화면 초안')

    await page.getByRole('button', { name: '취소' }).click()
    await expect(modal).toBeHidden()

    await setProductCodesScrollLeft(page, 2600)
    await page.getByRole('button', { name: 'P00000YU 세트상품 구성 편집' }).click()
    const yuModal = page.getByRole('dialog', { name: '라이콘 바디왁싱 스타터 키트20%할인' })
    await expect(yuModal).toContainText('P00000TX')
    await expect(yuModal).toContainText('P00000DG')
    await expect(yuModal).toContainText('구성 합계 ₩304,080')
  })

  test('세트상품 편집 모달은 위치/크기를 바꿀 수 있고 공통구성이 없으면 공간을 숨긴다', async ({ page }) => {
    await page.setViewportSize({ width: 1800, height: 980 })
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    await setProductCodesScrollLeft(page, 2900)
    await page.getByRole('button', { name: 'P00000VP 세트상품 구성 편집' }).click()

    const modal = page.getByRole('dialog', { name: '[도매묶음20%] 미니스크럽 10종 세트' })
    await expect(modal).toBeVisible()
    await expect(modal.locator('.set-editor-option').first()).toHaveAttribute('title', /선택\(향\).*₩67,200/s)
    await expect(modal.locator('.set-editor-price-input').first()).toHaveAttribute('title', /₩6,720/)
    await expect(modal.locator('.set-editor-price-input input').first()).toHaveValue('₩6,720')
    await expect(modal.locator('[data-set-editor-section="common"]')).toHaveCount(0)
    await expect(modal.locator('[data-set-editor-section="option"]')).toBeVisible()
    await expect(modal.getByRole('button', { name: '공통구성 추가' })).toBeVisible()

    const beforeCommonAddBox = await modal.boundingBox()
    expect(beforeCommonAddBox).not.toBeNull()
    await modal.getByRole('button', { name: '공통구성 추가' }).click()
    await expect(modal.locator('[data-set-editor-section="common"]')).toBeVisible()
    await expect(modal.locator('select[aria-label$="왼쪽상품"]')).toHaveCount(4)
    const commonProductSelect = modal.locator('[data-set-editor-section="common"] select[aria-label$="왼쪽상품"]').first()
    await expect(commonProductSelect).toHaveValue('')
    await expect(commonProductSelect.locator('option').first()).toHaveText('왼쪽상품 선택')
    await expect(modal.locator('[data-set-editor-section="common"] select[aria-label$="왼쪽상품 옵션"]').first()).toBeDisabled()
    const afterCommonAddBox = await modal.boundingBox()
    expect(afterCommonAddBox).not.toBeNull()
    expect(afterCommonAddBox!.height).toBeGreaterThan(beforeCommonAddBox!.height + 120)

    const optionTableWrap = modal.locator('[data-set-editor-section="option"] .set-editor-table-wrap')
    const initialOptionWrapBox = await optionTableWrap.boundingBox()
    expect(initialOptionWrapBox).not.toBeNull()

    const initialBox = await modal.boundingBox()
    const dragHandleBox = await modal.locator('.set-editor-drag-handle').boundingBox()
    expect(initialBox).not.toBeNull()
    expect(dragHandleBox).not.toBeNull()
    await page.mouse.move(dragHandleBox!.x + 60, dragHandleBox!.y + 22)
    await page.mouse.down()
    await page.mouse.move(dragHandleBox!.x + 150, dragHandleBox!.y - 36)
    await page.mouse.up()
    const movedBox = await modal.boundingBox()
    expect(movedBox).not.toBeNull()
    expect(movedBox!.x).toBeGreaterThan(initialBox!.x + 15)
    expect(movedBox!.y).toBeLessThan(initialBox!.y - 20)

    const resizeHandleBox = await modal.locator('.set-editor-resize-handle').boundingBox()
    expect(resizeHandleBox).not.toBeNull()
    await page.mouse.move(resizeHandleBox!.x + 8, resizeHandleBox!.y + 8)
    await page.mouse.down()
    await page.mouse.move(resizeHandleBox!.x + 118, resizeHandleBox!.y + 92)
    await page.mouse.up()
    const enlargedBox = await modal.boundingBox()
    const enlargedOptionWrapBox = await optionTableWrap.boundingBox()
    expect(enlargedBox).not.toBeNull()
    expect(enlargedOptionWrapBox).not.toBeNull()
    expect(enlargedBox!.height).toBeGreaterThan(movedBox!.height + 40)
    expect(enlargedOptionWrapBox!.height).toBeGreaterThan(initialOptionWrapBox!.height + 20)

    const shrinkHandleBox = await modal.locator('.set-editor-resize-handle').boundingBox()
    expect(shrinkHandleBox).not.toBeNull()
    await page.mouse.move(shrinkHandleBox!.x + 8, shrinkHandleBox!.y + 8)
    await page.mouse.down()
    await page.mouse.move(shrinkHandleBox!.x - 112, shrinkHandleBox!.y - 52)
    await page.mouse.up()
    const resizedBox = await modal.boundingBox()
    expect(resizedBox).not.toBeNull()
    expect(resizedBox!.width).toBeLessThan(enlargedBox!.width - 60)
    expect(resizedBox!.height).toBeLessThan(enlargedBox!.height - 20)
  })

  test('세트상품 편집 모달 취소는 적용 전 변경을 버린다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    await setProductCodesScrollLeft(page, 1500)
    await page.getByRole('button', { name: 'P00000YZ 세트상품 구성 편집' }).click()

    const modal = page.locator('.set-editor-modal')
    await expect(modal).toBeVisible()
    await expect(modal).toContainText('P00000YZ')
    const firstQty = modal.locator('input[aria-label$="수량"]').first()
    await firstQty.fill('7')
    await expect(modal).toContainText('화면 초안')

    await page.getByRole('button', { name: '취소' }).click()
    await expect(modal).toBeHidden()

    await page.getByRole('button', { name: 'P00000YZ 세트상품 구성 편집' }).click()
    const reopenedModal = page.locator('.set-editor-modal')
    await expect(reopenedModal).toBeVisible()
    await expect(reopenedModal).toContainText('P00000YZ')
    await expect(reopenedModal).not.toContainText('화면 초안')
    await expect(reopenedModal.locator('input[aria-label$="수량"]').first()).toHaveValue('1')
  })
})

function parseProductCodesExportValue(value: string): string | number | null {
  const trimmed = value.trim()
  if (!trimmed || trimmed === '미' || trimmed === '확인불가') return null
  const numericText = trimmed.replace(/[₩,#,\s]/g, '')
  if (/^-?\d+(?:\.\d+)?$/.test(numericText)) return Number(numericText)
  return trimmed
}

function productCodesExcelCellFormula(cell: ExcelJS.Cell): string | null {
  if (typeof cell.formula === 'string') return cell.formula
  const value = cell.value
  if (value && typeof value === 'object' && 'formula' in value) {
    const formula = (value as { formula?: unknown }).formula
    return typeof formula === 'string' ? formula : null
  }
  return null
}

function productCodesExcelCellResult(cell: ExcelJS.Cell): string | number | null {
  if (cell.result !== undefined) return productCodesExcelPrimitiveValue(cell.result as ExcelJS.CellValue)
  const value = cell.value
  if (value && typeof value === 'object' && 'result' in value) {
    return productCodesExcelPrimitiveValue((value as { result?: ExcelJS.CellValue }).result ?? null)
  }
  return productCodesExcelPrimitiveValue(value)
}

function productCodesExcelPrimitiveValue(value: ExcelJS.CellValue): string | number | null {
  if (value == null) return null
  if (typeof value === 'number' || typeof value === 'string') return parseProductCodesExportValue(String(value))
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object' && 'richText' in value) {
    return (value as { richText?: Array<{ text?: string }> }).richText?.map((part) => part.text ?? '').join('') ?? null
  }
  return String(value)
}

function productCodesExcelValuesEqual(actual: string | number | null, expected: string | number | null) {
  if (typeof actual === 'number' && typeof expected === 'number') {
    return Math.abs(actual - expected) < 0.0001
  }
  return actual === expected
}

async function setProductCodesScrollLeft(page: import('@playwright/test').Page, left: number) {
  await page.locator('.pc-excel-table-wrap').evaluate((el, nextLeft) => {
    el.scrollLeft = nextLeft
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  }, left)
  await page.waitForTimeout(100)
}

async function readProductCodesNumericCell(
  page: import('@playwright/test').Page,
  rowKey: string,
  colKey: string,
) {
  const text = await page.locator(`td[data-row-key="${rowKey}"][data-col-key="${colKey}"]`).textContent()
  const value = Number((text ?? '').replace(/[^\d.-]/g, ''))
  expect(Number.isFinite(value)).toBe(true)
  return value
}

async function readProductCodesScrollState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.pc-excel-table-wrap')
    const revenue = document.querySelector('tbody td.sticky-rev')
    const categoryCell = document.querySelector('td[data-row-key="category:하드왁스"]')
    const firstDataRow = document.querySelector('tbody tr:not(.category-scope-row)')
    const longProductRowHead = Array.from(document.querySelectorAll('tbody tr .pc-excel-row-head'))
      .find((cell) => cell.textContent?.trim() === '29')
    const longProductRow = longProductRowHead?.closest('tr')
    if (
      !(wrap instanceof HTMLElement) ||
      !(revenue instanceof HTMLElement) ||
      !(categoryCell instanceof HTMLElement) ||
      !(firstDataRow instanceof HTMLElement) ||
      !(longProductRow instanceof HTMLElement)
    ) {
      throw new Error('Missing product-codes scroll, revenue cell, or measured data row')
    }
    const wrapRect = wrap.getBoundingClientRect()
    const visibleRowNumbers = Array.from(wrap.querySelectorAll('tbody tr .pc-excel-row-head'))
      .filter((cell): cell is HTMLElement => cell instanceof HTMLElement)
      .filter((cell) => {
        const rect = cell.getBoundingClientRect()
        return rect.top < wrapRect.bottom && rect.bottom > wrapRect.top
      })
      .map((cell) => Number(cell.textContent?.trim() ?? 0))
      .filter((rowNumber) => Number.isFinite(rowNumber) && rowNumber > 0)
    return {
      maxLeft: wrap.scrollWidth - wrap.clientWidth,
      scrollLeft: wrap.scrollLeft,
      isLeftCompact: wrap.classList.contains('is-left-compact'),
      revenueWidth: Math.round(revenue.getBoundingClientRect().width),
      categoryLeft: Math.round(categoryCell.getBoundingClientRect().left),
      firstDataRowHeight: Math.round(firstDataRow.getBoundingClientRect().height),
      longProductRowHeight: Math.round(longProductRow.getBoundingClientRect().height),
      lastVisibleRowNumber: visibleRowNumbers.at(-1) ?? 0,
    }
  })
}

async function readProductCodesViewModeState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const name = document.querySelector('tbody td.sticky-name')
    const optionName = document.querySelector('tbody td.sticky-option-name')
    const price = document.querySelector('tbody td.sticky-price')
    const firstMatrix = document.querySelector('tbody tr.category-scope-row td[data-col-key]:not(.sticky)')
    if (
      !(name instanceof HTMLElement) ||
      !(optionName instanceof HTMLElement) ||
      !(price instanceof HTMLElement) ||
      !(firstMatrix instanceof HTMLElement)
    ) {
      throw new Error('Missing product-codes view mode measurement cells')
    }
    return {
      nameWidth: Math.round(name.getBoundingClientRect().width),
      optionNameWidth: Math.round(optionName.getBoundingClientRect().width),
      priceWidth: Math.round(price.getBoundingClientRect().width),
      uStartLeft: Math.round(firstMatrix.getBoundingClientRect().left),
    }
  })
}
