import { expect, test } from '@playwright/test'

const APP_URL = 'http://127.0.0.1:5173/catchup/'

async function readStartedAt(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const res = await fetch('/catchup/api/version', { cache: 'no-store' })
    if (!res.ok) throw new Error(`version health failed: ${res.status}`)
    const body = await res.json()
    return body.started_at as string
  })
}

test.describe('개발 서버 재시작 회귀', () => {
  test('홈 재시작은 프론트와 백엔드 서비스를 함께 정상 상태로 유지한다', async ({ page }) => {
    const dialogs: string[] = []
    page.on('dialog', async (dialog) => {
      dialogs.push(dialog.message())
      await dialog.accept()
    })

    await page.goto(APP_URL)
    await expect(page.getByRole('heading', { name: '캐치업코리아 운영 도구' })).toBeVisible()

    const beforeStartedAt = await readStartedAt(page)
    await page.getByRole('button', { name: /서버 재시작/ }).click()

    await page.waitForFunction(
      async (before) => {
        const res = await fetch(`/catchup/api/version?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return false
        const body = await res.json()
        return Boolean(body.started_at && body.started_at !== before)
      },
      beforeStartedAt,
      { timeout: 30_000 },
    )

    await expect(page.getByRole('button', { name: /서버 재시작/ })).toBeEnabled({ timeout: 10_000 })
    expect(dialogs.some((message) => message.includes('서버를 재시작할까요'))).toBe(true)
    expect(dialogs.some((message) => message.includes('서버 재시작이 완료되었습니다'))).toBe(true)

    await page.goto(`${APP_URL}#product-codes`)
    await expect(page.getByRole('heading', { name: '상품코드' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill('2026-04-01')
    await page.locator('input[type="date"]').nth(1).fill('2026-04-30')
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('.pc-excel-table-wrap')).toBeVisible({ timeout: 60_000 })
    await expect(page.getByText('상품코드 조회 요청을 시작하지 못했습니다')).toHaveCount(0)
  })
})
