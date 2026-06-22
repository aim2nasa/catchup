import { expect, test } from '@playwright/test'

const HARDWAX_START = '2026-04-01'
const HARDWAX_END = '2026-04-30'

test.describe('하드왁스 수평 스크롤 UX', () => {
  test('좌측 컬럼 축소 후에도 수평 스크롤 위치와 폭이 유지된다', async ({ page }) => {
    await page.goto('http://127.0.0.1:5173/catchup/#hardwax')
    await expect(page.getByRole('heading', { name: '하드왁스' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(HARDWAX_START)
    await page.locator('input[type="date"]').nth(1).fill(HARDWAX_END)
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('td[data-a1="BL47"]')).toBeAttached({ timeout: 60_000 })

    const initial = await readScrollState(page)
    expect(initial.compact).toBe(false)
    expect(initial.nameWidth).toBeGreaterThan(300)
    expect(initial.optionWidth).toBeGreaterThan(220)

    const middleTarget = Math.floor(initial.bottomMax / 2)
    await setTopScrollLeft(page, middleTarget)
    const middle = await readScrollState(page)
    expect(middle.compact).toBe(true)
    expect(middle.bottomScrollWidth).toBe(initial.bottomScrollWidth)
    expect(middle.topScrollWidth).toBe(initial.topScrollWidth)
    expect(middle.bottomLeft).toBe(middleTarget)
    expect(middle.topLeft).toBe(middleTarget)
    expect(middle.nameWidth).toBeLessThan(initial.nameWidth)
    expect(middle.optionWidth).toBeLessThan(initial.optionWidth)

    await setBottomScrollLeft(page, middle.bottomMax)
    const right = await readScrollState(page)
    expect(right.bottomScrollWidth).toBe(initial.bottomScrollWidth)
    expect(right.topScrollWidth).toBe(initial.topScrollWidth)
    expect(right.bottomLeft).toBe(right.bottomMax)
    expect(right.topLeft).toBe(right.topMax)
  })
})

async function setTopScrollLeft(page: import('@playwright/test').Page, left: number) {
  await page.locator('.excel-horizontal-scrollbar-top').evaluate((el, nextLeft) => {
    el.scrollLeft = nextLeft
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  }, left)
  await page.waitForTimeout(100)
}

async function setBottomScrollLeft(page: import('@playwright/test').Page, left: number) {
  await page.locator('.excel-table-wrap').evaluate((el, nextLeft) => {
    el.scrollLeft = nextLeft
    el.dispatchEvent(new Event('scroll', { bubbles: true }))
  }, left)
  await page.waitForTimeout(100)
}

async function readScrollState(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const bottom = document.querySelector('.excel-table-wrap')
    const top = document.querySelector('.excel-horizontal-scrollbar-top')
    const name = document.querySelector('tbody td.sticky-name')
    const option = document.querySelector('tbody td.sticky-option-name')
    if (!(bottom instanceof HTMLElement) || !(top instanceof HTMLElement)) {
      throw new Error('Missing hardwax scroll containers')
    }
    if (!(name instanceof HTMLElement) || !(option instanceof HTMLElement)) {
      throw new Error('Missing sticky cells')
    }
    return {
      bottomLeft: bottom.scrollLeft,
      bottomMax: bottom.scrollWidth - bottom.clientWidth,
      bottomScrollWidth: bottom.scrollWidth,
      topLeft: top.scrollLeft,
      topMax: top.scrollWidth - top.clientWidth,
      topScrollWidth: top.scrollWidth,
      compact: bottom.classList.contains('is-left-compact'),
      nameWidth: name.getBoundingClientRect().width,
      optionWidth: option.getBoundingClientRect().width,
    }
  })
}
