import ExcelJS from 'exceljs'
import { expect, test } from '@playwright/test'

type DomCell = {
  a1: string
  text: string
  value: number
  formula: string
  rowKey: string
  colKey: string
  className: string
}

const HARDWAX_START = '2026-04-01'
const HARDWAX_END = '2026-04-30'
const EXPECTED_CELL_COUNT = 2496
const EXPECTED_FORMULA_COUNT = 247

function parseExportValue(text: string): string | number {
  const trimmed = text.trim()
  if (!trimmed || trimmed === '—') return ''
  const numeric = trimmed.replace(/[₩,\s]/g, '')
  if (/^-?\d+(?:\.\d+)?$/.test(numeric)) return Number(numeric)
  return trimmed
}

function parseNumber(text: string): number {
  const parsed = parseExportValue(text)
  return typeof parsed === 'number' ? parsed : 0
}

function colToNumber(col: string): number {
  return col.split('').reduce((sum, ch) => sum * 26 + ch.charCodeAt(0) - 64, 0)
}

function numberToCol(num: number): string {
  let col = ''
  let n = num
  while (n > 0) {
    const rem = (n - 1) % 26
    col = String.fromCharCode(65 + rem) + col
    n = Math.floor((n - 1) / 26)
  }
  return col
}

function expandRange(range: string): string[] {
  const [start, end] = range.split(':')
  const startMatch = /^([A-Z]+)(\d+)$/.exec(start)
  const endMatch = /^([A-Z]+)(\d+)$/.exec(end)
  if (!startMatch || !endMatch) throw new Error(`Invalid range: ${range}`)

  const startCol = colToNumber(startMatch[1])
  const endCol = colToNumber(endMatch[1])
  const startRow = Number(startMatch[2])
  const endRow = Number(endMatch[2])
  const refs: string[] = []
  for (let row = startRow; row <= endRow; row += 1) {
    for (let col = startCol; col <= endCol; col += 1) {
      refs.push(`${numberToCol(col)}${row}`)
    }
  }
  return refs
}

function splitFormulaArgs(args: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of args) {
    if (ch === '(') depth += 1
    if (ch === ')') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(current.trim())
      current = ''
      continue
    }
    current += ch
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

function evaluateFormula(formula: string, values: Map<string, number>): number {
  let expr = formula.replace(/^=/, '')

  expr = expr.replace(/SUM\(([^()]*)\)/g, (_match, args: string) => {
    const total = splitFormulaArgs(args).reduce((sum, part) => {
      if (/^[A-Z]+\d+:[A-Z]+\d+$/.test(part)) {
        return sum + expandRange(part).reduce((rangeSum, ref) => rangeSum + (values.get(ref) ?? 0), 0)
      }
      if (/^[A-Z]+\d+$/.test(part)) return sum + (values.get(part) ?? 0)
      const literal = Number(part)
      if (Number.isFinite(literal)) return sum + literal
      throw new Error(`Unsupported SUM argument: ${part}`)
    }, 0)
    return String(total)
  })

  expr = expr.replace(/\b([A-Z]+\d+)\b/g, (_match, ref: string) => String(values.get(ref) ?? 0))
  if (!/^[\d+\-*/().\s]+$/.test(expr)) throw new Error(`Unsupported formula: ${formula}`)

  // The formula grammar is reduced to numbers and arithmetic operators above.
  // eslint-disable-next-line no-new-func
  const result = Function(`"use strict"; return (${expr})`)()
  if (typeof result !== 'number' || !Number.isFinite(result)) {
    throw new Error(`Invalid formula result: ${formula}`)
  }
  return result
}

function fillArgb(cell: ExcelJS.Cell): string | null {
  const fill = cell.fill
  if (!fill || fill.type !== 'pattern') return null
  return fill.fgColor?.argb ?? null
}

test.describe('하드왁스 Excel 동일성 회귀', () => {
  test('웹 표와 다운로드 XLSX의 내용, 수식, 표시 구조가 동일하다', async ({ page }) => {
    test.setTimeout(120_000)

    await page.goto('http://127.0.0.1:5173/catchup/#hardwax')
    await expect(page.getByRole('heading', { name: '하드왁스' })).toBeVisible()
    await page.locator('input[type="date"]').first().fill(HARDWAX_START)
    await page.locator('input[type="date"]').nth(1).fill(HARDWAX_END)
    await page.getByRole('button', { name: '조회' }).click()

    await expect(page.locator('.excel-table-wrap')).toBeVisible({ timeout: 60_000 })
    await expect(page.locator('td[data-a1="BL47"]')).toBeAttached({ timeout: 60_000 })
    await expect(page.getByRole('button', { name: 'Excel 다운로드' })).toBeEnabled()

    const dom = await page.evaluate(() => {
      const readCell = (el: Element): DomCell => ({
        a1: el.getAttribute('data-a1') || '',
        text: (el.textContent || '').trim(),
        value: parseNumberForTest(el.textContent || ''),
        formula: el.getAttribute('data-formula') || '',
        rowKey: el.getAttribute('data-row-key') || '',
        colKey: el.getAttribute('data-col-key') || '',
        className: el.getAttribute('class') || '',
      })

      function parseNumberForTest(text: string): number {
        const t = text.trim()
        if (!t || t === '—') return 0
        const n = Number(t.replace(/[₩,\s]/g, ''))
        return Number.isFinite(n) ? n : 0
      }

      return {
        cells: Array.from(document.querySelectorAll('td[data-a1][data-col-key]'))
          .map(readCell)
          .filter((cell) => cell.a1),
        columnLetters: Array.from(document.querySelectorAll('thead .excel-column-letter'))
          .map((el) => (el.textContent || '').trim()),
        rowHeads: Array.from(document.querySelectorAll('tbody .excel-row-head, tfoot .excel-row-head'))
          .map((el) => (el.textContent || '').trim()),
        setHeaders: Array.from(document.querySelectorAll('th.u-header'))
          .map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim())
          .filter((text) => text.includes('세트 상품')),
      }
    })

    expect(dom.cells).toHaveLength(EXPECTED_CELL_COUNT)
    expect(dom.cells.filter((cell) => cell.formula)).toHaveLength(EXPECTED_FORMULA_COUNT)
    expect(dom.columnLetters.slice(0, 6)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
    expect(dom.columnLetters.at(-2)).toBe('BK')
    expect(dom.columnLetters.at(-1)).toBe('BL')
    expect(dom.rowHeads).toContain('47')
    expect(dom.setHeaders).toHaveLength(5)
    expect(dom.setHeaders.join('\n')).toContain('P00000YZ')
    expect(dom.setHeaders.join('\n')).toContain('P00000YS')
    expect(dom.setHeaders.join('\n')).toContain('P00000YU')
    expect(dom.setHeaders.join('\n')).toContain('P00000VP')
    expect(dom.setHeaders.join('\n')).toContain('P00000VA')

    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 60_000 }),
      page.getByRole('button', { name: 'Excel 다운로드' }).click(),
    ])
    const workbookPath = test.info().outputPath('hardwax.xlsx')
    await download.saveAs(workbookPath)

    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(workbookPath)
    const worksheet = workbook.getWorksheet('하드왁스')
    expect(worksheet, '하드왁스 worksheet').toBeTruthy()
    if (!worksheet) throw new Error('Missing 하드왁스 worksheet')

    const domValues = new Map(dom.cells.map((cell) => [cell.a1, cell.value]))
    const mismatches: string[] = []

    for (const domCell of dom.cells) {
      const excelCell = worksheet.getCell(domCell.a1)
      const expectedValue = parseExportValue(domCell.text)
      const actualValue = excelCell.value

      if (domCell.formula) {
        if (!actualValue || typeof actualValue !== 'object' || !('formula' in actualValue)) {
          mismatches.push(`${domCell.a1}: missing formula`)
          continue
        }
        if (actualValue.formula !== domCell.formula.slice(1)) {
          mismatches.push(`${domCell.a1}: formula ${actualValue.formula} !== ${domCell.formula.slice(1)}`)
        }
        const evaluated = evaluateFormula(domCell.formula, domValues)
        if (Math.abs(evaluated - domCell.value) > 0.0001) {
          mismatches.push(`${domCell.a1}: evaluated ${evaluated} !== ${domCell.value}`)
        }
        if (typeof actualValue.result === 'number' && Math.abs(actualValue.result - domCell.value) > 0.0001) {
          mismatches.push(`${domCell.a1}: cached result ${actualValue.result} !== ${domCell.value}`)
        }
        continue
      }

      const normalizedActual = actualValue === null ? '' : actualValue
      if (normalizedActual !== expectedValue) {
        mismatches.push(`${domCell.a1}: value ${String(normalizedActual)} !== ${String(expectedValue)}`)
      }
    }

    expect(mismatches.slice(0, 20)).toEqual([])

    const formulaCells = dom.cells.filter((cell) => cell.formula)
    expect(formulaCells.map((cell) => cell.a1)).toContain('BL13')
    expect(formulaCells.find((cell) => cell.a1 === 'BL13')?.formula).toBe('=F13*E13+J13*19200')
    expect(formulaCells.find((cell) => cell.a1 === 'F47')?.formula).toBe('=SUM(F28,F46)')
    expect(formulaCells.find((cell) => cell.a1 === 'BK47')?.formula).toBe('=SUM(BK28,BK46)')
    expect(formulaCells.find((cell) => cell.a1 === 'BL47')?.formula).toBe('=SUM(BL28,BL46)')

    const merges = worksheet.model.merges ?? []
    expect(merges).toEqual(expect.arrayContaining([
      'A6:A8',
      'B6:B8',
      'C6:C8',
      'D6:D8',
      'E6:E8',
      'F6:F8',
      'BK6:BK8',
      'BL6:BL8',
      'BC6:BF7',
      'BG6:BG7',
      'BH6:BH7',
      'BI6:BI7',
      'BJ6:BJ7',
    ]))

    expect(fillArgb(worksheet.getCell('A6'))).toBe('FF334155')
    expect(fillArgb(worksheet.getCell('G6'))).toBe('FF334155')
    expect(fillArgb(worksheet.getCell('BC6'))).toBe('FF14532D')
    expect(fillArgb(worksheet.getCell('BG6'))).toBe('FF14532D')
    expect(fillArgb(worksheet.getCell('BJ6'))).toBe('FF14532D')
    expect(fillArgb(worksheet.getCell('BC10'))).toBe('FFDCFCE7')
    expect(fillArgb(worksheet.getCell('BJ10'))).toBe('FFDCFCE7')
    expect(fillArgb(worksheet.getCell('BK6'))).toBe('FFFEF3C7')
    expect(fillArgb(worksheet.getCell('BL6'))).toBe('FFFEF3C7')

    expect(worksheet.getColumn(1).width).toBe(14)
    expect(worksheet.getColumn(2).width).toBe(52)
    expect(worksheet.getColumn(4).width).toBe(37)
    expect(worksheet.getColumn(63).width).toBe(11)
    expect(worksheet.getColumn(64).width).toBe(20)
    expect(worksheet.getRow(6).height).toBe(38)
    expect(worksheet.getRow(7).height).toBe(38)
    expect(worksheet.getRow(8).height).toBe(18)
    expect(worksheet.views[0]).toMatchObject({ state: 'frozen', xSplit: 6, ySplit: 8 })
  })
})
