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
    await page.route('**/api/products-report?**', async (route) => {
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

  test('존재 확인된 옵션의 기간 응답 누락은 화면과 엑셀에서 0으로 표시한다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

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

    await setProductCodesScrollLeft(page, initial.maxLeft)
    const right = await readProductCodesScrollState(page)
    expect(right.isLeftCompact).toBe(true)
    expect(right.revenueWidth).toBe(initial.revenueWidth)
    expect(right.firstDataRowHeight).toBe(initial.firstDataRowHeight)
    expect(right.longProductRowHeight).toBe(initial.longProductRowHeight)
    expect(right.lastVisibleRowNumber).toBe(initial.lastVisibleRowNumber)
  })
})

async function setProductCodesScrollLeft(page: import('@playwright/test').Page, left: number) {
  await page.locator('.pc-excel-table-wrap').evaluate((el, nextLeft) => {
    el.scrollLeft = nextLeft
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  }, left)
  await page.waitForTimeout(100)
}

async function readProductCodesScrollState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const wrap = document.querySelector('.pc-excel-table-wrap')
    const revenue = document.querySelector('tbody td.sticky-rev')
    const firstDataRow = document.querySelector('tbody tr:not(.category-scope-row)')
    const longProductRowHead = Array.from(document.querySelectorAll('tbody tr .pc-excel-row-head'))
      .find((cell) => cell.textContent?.trim() === '29')
    const longProductRow = longProductRowHead?.closest('tr')
    if (
      !(wrap instanceof HTMLElement) ||
      !(revenue instanceof HTMLElement) ||
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
      firstDataRowHeight: Math.round(firstDataRow.getBoundingClientRect().height),
      longProductRowHeight: Math.round(longProductRow.getBoundingClientRect().height),
      lastVisibleRowNumber: visibleRowNumbers.at(-1) ?? 0,
    }
  })
}
