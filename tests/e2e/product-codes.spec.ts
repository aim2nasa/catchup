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

  test('상품코드 페이지 내용은 하드왁스 페이지와 동일한 집계표 흐름이다', async ({ page }) => {
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

    await expect(page.locator('.product-category-row .pc-excel-row-head')).toHaveText(/\d+/)
    await expect(page.locator('.product-segment-row')).toHaveCount(0)
  })

  test('카테고리 행은 엑셀 좌표에 포함되고 구간 표시 행은 만들지 않는다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#product-codes')

    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(PRODUCT_CODES_START)
    await page.locator('input[type="date"]').nth(1).fill(PRODUCT_CODES_END)
    await page.getByRole('button', { name: '조회' }).click()
    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })

    const categoryA1 = await page.locator('.product-category-row .product-group-band-cell').getAttribute('data-a1')
    const firstProductA1 = await page.locator('td[data-row-key^="parent:500g:P00000HT"]').first().getAttribute('data-a1')
    expect(categoryA1).toBe('A10')
    await expect(page.locator('.product-segment-row')).toHaveCount(0)
    expect(firstProductA1).toBe('A11')

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
  })

  test('수평 스크롤 중에도 매출 컬럼 폭이 유지된다', async ({ page }) => {
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
    expect(middle.revenueWidth).toBe(initial.revenueWidth)

    await setProductCodesScrollLeft(page, initial.maxLeft)
    const right = await readProductCodesScrollState(page)
    expect(right.revenueWidth).toBe(initial.revenueWidth)
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
    if (!(wrap instanceof HTMLElement) || !(revenue instanceof HTMLElement)) {
      throw new Error('Missing product-codes scroll or revenue cell')
    }
    return {
      maxLeft: wrap.scrollWidth - wrap.clientWidth,
      scrollLeft: wrap.scrollLeft,
      revenueWidth: Math.round(revenue.getBoundingClientRect().width),
    }
  })
}
