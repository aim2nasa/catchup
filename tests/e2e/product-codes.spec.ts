import { expect, test } from '@playwright/test'

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
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 15000 })
    await expect(page.locator('.pc-excel-table')).toBeVisible()
    await expect(page.locator('.pc-excel-table tbody')).toContainText('500g 총합계', { timeout: 15000 })
    await expect(page.locator('.pc-excel-table tbody')).toContainText('P00000ZB')
    await expect(page.locator('.pc-excel-table tbody')).toContainText('1kg 총합계')
    await expect(page.getByText('라이코젯아이브로우')).toBeVisible()
  })
})
