import { Fragment, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DateFilter } from '@/features/sales-report/components/DateFilter'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { useReport } from '@/features/sales-report/hooks/useReport'
import { useSettings } from '@/features/sales-report/hooks/useSettings'
import type { Variant } from '@/features/sales-report/types'
import { fmtCurrency, fmtNumber, fmtParentPrice, fmtVariantPrice } from '@/shared/lib/format'
import '@/features/sales-report/SalesReportView.css'
import './ExcelOrderView.css'

type CellState = 'mapped' | 'unmapped' | 'excluded'

type LuRuleOverride = {
  action: 'add' | 'remove'
  uProduct: string
  uVariant: string
  lProduct: string
  lVariant?: string
}

type LuToggleTarget = {
  uProduct: string
  uVariant: string
  lProduct: string
  lVariant: string | null
  lVariantIndex: number | null
  hasLVariants: boolean
}

type PendingLuAction = LuToggleTarget & {
  title: string
  description: string
  confirmLabel: string
  actionTone: 'primary' | 'danger'
  uLabel: string
  uProductName: string
  lLabel: string
  lProductName: string
  lPriceLabel: string
  qty: number
  price: number
  revenueImpact: number
}

type RevenueFormulaTerm = {
  uColOffset: number
  unitPrice: number
  priceMissing?: boolean
}
type RevenueFormulaBuildResult = {
  terms: RevenueFormulaTerm[]
  warnings: string[]
}

interface Row {
  product_code: string
  product_name: string
  price: number
  directUnitPrice: number
  is_multi: boolean
  qty: number
  rev: number
  directQtyForSummary: number
  subtotalQtyForSummary: number
  subtotalRevForSummary: number
  missing: boolean
  directQty: number
  mappingQtyByColumn: number[]
  mappingRevByColumn: number[]
  mappingPriceByColumn: number[]
  mappingPriceIsFoundByColumn: boolean[]
  mappingStateByColumn: CellState[]
  mappingHasRuleByColumn: boolean[]
  variantMappingQtyByColumn: number[][]
  variantMappingRevByColumn: number[][]
  variantMappingPriceByColumn: number[][]
  variantMappingPriceIsFoundByColumn: boolean[][]
  variantMappingStateByColumn: CellState[][]
  variantMappingHasRuleByColumn: boolean[][]
  variants: Variant[]
}

interface GroupRows {
  label: string
  withSubtotal: boolean
  rows: Row[]
  subtotalQty: number
  subtotalRev: number
  subtotalDirectQty: number
  subtotalMappingQtyByColumn: number[]
  subtotalMappingRevByColumn: number[]
}

type CellSelectionMeta = {
  rowKey: string
  rowLabel: string
  colKey: string
  colLabel: string
  formula?: string
  formulaWarnings?: string[]
  screenRow?: number
  screenCol?: number
  excelRow?: number
  excelCol?: number
}

type FormulaDisplayPart = {
  text: string
  kind: 'plain' | 'price'
}

type RowType = 'uDirect' | 'product' | 'variant' | 'subtotal' | 'total'
type RowFormulaMeta = {
  key: string
  rowType: RowType
  groupLabel: string
  product_code?: string
  variant_code?: string
  screenRow: number
  excelRow: number
  revenueDirectQty?: number
  revenueMappedTerms?: RevenueFormulaTerm[]
  revenueMappedPriceWarnings?: string[]
  contributorRowKeys?: string[]
}

type ColFormulaMeta = {
  key: string
  screenCol: number
  excelCol: number
}

type LGroup = {
  label: string
  codes: string[]
  withSubtotal?: boolean
}

interface UBlock {
  productCode: string
  productLabel: string
  variants: string[]
  group: 'conversion' | 'set'
}

interface MappingRule {
  uProduct: string
  uVariant: string
  lProduct: string
  lVariant?: string
  ratio: number
}

function makeUCellKey(uProduct: string, uVariant: string) {
  return `${normalizeProductCode(uProduct)}${COLUMN_KEY_DELIM}${normalizeVariantCode(uVariant)}`
}

function makeLuCellKey(rule: Pick<MappingRule, 'uProduct' | 'uVariant' | 'lProduct' | 'lVariant'>) {
  return [
    normalizeProductCode(rule.uProduct),
    normalizeVariantCode(rule.uVariant),
    normalizeProductCode(rule.lProduct),
    normalizeVariantCode(rule.lVariant ?? ''),
  ].join(COLUMN_KEY_DELIM)
}

const L_GROUPS: LGroup[] = [
  {
    label: '500g 총합계',
    codes: [
      'P00000HT', 'P00000BV', 'P00000CB', 'P00000BX',
      'P00000XE', 'P0000BIF', 'P0000BLD', 'P0000BMJ', 'P0000BMI',
    ],
  },
  {
    label: '컵비즈',
    codes: ['P00000ZB'],
    withSubtotal: false,
  },
  {
    label: '1kg 총합계',
    codes: [
      'P00000UH', 'P00000TI', 'P00000BY', 'P00000BZ',
      'P00000CH', 'P00000CG', 'P00000CA', 'P00000BW', 'P00000CI',
      'P00000CE', 'P00000KH', 'P00000CD', 'P00000CF',
    ],
  },
]

const QUERY_CODES = [
  ...new Set([
    ...L_GROUPS.flatMap((g) => g.codes),
    'P00000QE', 'P00000QD', 'P0000BLR', 'P0000BLA',
    'P00000ZC', 'P00000YZ', 'P00000VM', 'P00000YS', 'P00000YU',
    'P00000VP', 'P00000VA',
  ]),
]

const U_BLOCKS: UBlock[] = [
  {
    productCode: 'P00000QE',
    productLabel: '하드왁스500g 24개',
    variants: ['G', 'H', 'I', 'J', 'K'],
    group: 'conversion',
  },
  {
    productCode: 'P00000QD',
    productLabel: '하드왁스15개',
    variants: ['CI', 'CJ', 'CK', 'CL', 'CM', 'CN', 'CO', 'CP', 'CQ', 'CR', 'CS', 'CT', 'CU'],
    group: 'conversion',
  },
  {
    productCode: 'P0000BLR',
    productLabel: '비즈 왁스 4종',
    variants: ['Q', 'R', 'S', 'T', 'U', 'V', 'W'],
    group: 'conversion',
  },
  {
    productCode: 'P0000BLA',
    productLabel: '비즈 왁스 4종',
    variants: ['J', 'K', 'L', 'M', 'N', 'O', 'P'],
    group: 'conversion',
  },
  {
    productCode: 'P00000ZC',
    productLabel: '컵비즈 110g 5개 이상 10%',
    variants: ['A', 'B', 'C', 'D'],
    group: 'conversion',
  },
  {
    productCode: 'P00000VM',
    productLabel: '[묶음할인15%] 하드왁스1kg 5개이상',
    variants: ['CW', 'CX', 'CY', 'CZ', 'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH'],
    group: 'conversion',
  },
  {
    productCode: 'P00000YZ',
    productLabel: '컵비즈 비즈 세트',
    variants: ['D', 'E', 'H', 'I'],
    group: 'set',
  },
  { productCode: 'P00000YS', productLabel: '제모미인 스타터키트20%', variants: ['A'], group: 'set' },
  {
    productCode: 'P00000YU',
    productLabel: '라이콘 바디왁싱 스타터 키트20%할인',
    variants: ['B'],
    group: 'set',
  },
  {
    productCode: 'P00000VP',
    productLabel: '[도매묶음20%] 미니스크럽 10종 세트',
    variants: ['B'],
    group: 'set',
  },
  {
    productCode: 'P00000VA',
    productLabel: '화이트닝 키트 20% 할인',
    variants: ['A'],
    group: 'set',
  },
]

const U_COLUMNS = U_BLOCKS.flatMap((block) =>
  block.variants.map((variant) => ({
    uProduct: block.productCode,
    uVariant: variant,
    blockLabel: block.productLabel,
    blockCode: block.productCode,
    group: block.group,
  })),
)

const COLUMN_KEY_DELIM = '|'

const RULES: MappingRule[] = [
  { uProduct: 'P00000QE', uVariant: 'G', lProduct: 'P00000BV', ratio: 1 },
  { uProduct: 'P00000QE', uVariant: 'I', lProduct: 'P00000CB', ratio: 1 },
  { uProduct: 'P00000QE', uVariant: 'J', lProduct: 'P00000BX', ratio: 1 },
  { uProduct: 'P00000QE', uVariant: 'K', lProduct: 'P00000XE', ratio: 1 },

  { uProduct: 'P00000QD', uVariant: 'CI', lProduct: 'P00000CF', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CJ', lProduct: 'P00000CE', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CK', lProduct: 'P00000KH', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CL', lProduct: 'P00000CA', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CM', lProduct: 'P00000CG', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CN', lProduct: 'P00000BW', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CO', lProduct: 'P00000CD', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CP', lProduct: 'P00000CH', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CQ', lProduct: 'P00000CI', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CR', lProduct: 'P00000BY', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CS', lProduct: 'P00000BZ', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CT', lProduct: 'P00000TI', ratio: 1 },
  { uProduct: 'P00000QD', uVariant: 'CU', lProduct: 'P00000UH', ratio: 1 },

  { uProduct: 'P0000BLR', uVariant: 'Q', lProduct: 'P0000BIF', lVariant: 'CI', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'R', lProduct: 'P0000BIF', lVariant: 'CJ', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'S', lProduct: 'P0000BIF', lVariant: 'CN', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'T', lProduct: 'P0000BIF', lVariant: 'CL', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'U', lProduct: 'P0000BIF', lVariant: 'CM', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'V', lProduct: 'P0000BIF', lVariant: 'CK', ratio: 1 },
  { uProduct: 'P0000BLR', uVariant: 'W', lProduct: 'P0000BIF', lVariant: 'CO', ratio: 1 },

  { uProduct: 'P0000BLA', uVariant: 'J', lProduct: 'P0000BIF', lVariant: 'CI', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'K', lProduct: 'P0000BIF', lVariant: 'CJ', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'L', lProduct: 'P0000BIF', lVariant: 'CK', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'M', lProduct: 'P0000BIF', lVariant: 'CN', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'N', lProduct: 'P0000BIF', lVariant: 'CL', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'O', lProduct: 'P0000BIF', lVariant: 'CM', ratio: 1 },
  { uProduct: 'P0000BLA', uVariant: 'P', lProduct: 'P0000BIF', lVariant: 'CO', ratio: 1 },

  { uProduct: 'P00000ZC', uVariant: 'A', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000ZC', uVariant: 'B', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000ZC', uVariant: 'C', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000ZC', uVariant: 'D', lProduct: 'P00000ZB', ratio: 1 },

  { uProduct: 'P00000YZ', uVariant: 'D', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000YZ', uVariant: 'E', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000YZ', uVariant: 'H', lProduct: 'P00000ZB', ratio: 1 },
  { uProduct: 'P00000YZ', uVariant: 'I', lProduct: 'P00000ZB', ratio: 1 },

  { uProduct: 'P00000VM', uVariant: 'CW', lProduct: 'P00000TI', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'CX', lProduct: 'P00000CD', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'CY', lProduct: 'P00000CA', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'CZ', lProduct: 'P00000CE', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DA', lProduct: 'P00000CF', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DB', lProduct: 'P00000BY', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DC', lProduct: 'P00000BW', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DD', lProduct: 'P00000BZ', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DE', lProduct: 'P00000CI', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DF', lProduct: 'P00000CG', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DG', lProduct: 'P00000CH', ratio: 1 },
  { uProduct: 'P00000VM', uVariant: 'DH', lProduct: 'P00000UH', ratio: 1 },

  { uProduct: 'P00000YS', uVariant: 'A', lProduct: 'P00000HT', ratio: 1 },
]

const EXCLUDED_U_PRODUCTS = new Set(['P00000YU'])
const RULE_BY_KEY = new Map<string, MappingRule[]>()
const U_VARIANT_INDEX_BY_KEY = new Map<string, number>()

const uVariantIndexes = new Map<string, number>()
for (const rule of RULES) {
  const key = makeUCellKey(rule.uProduct, rule.uVariant)
  const existing = RULE_BY_KEY.get(key)
  if (existing) {
    existing.push(rule)
    continue
  }
  RULE_BY_KEY.set(key, [rule])
}
for (const col of U_COLUMNS) {
  const key = makeUCellKey(col.uProduct, col.uVariant)
  const nextIndex = (uVariantIndexes.get(col.uProduct) ?? 0) + 1
  U_VARIANT_INDEX_BY_KEY.set(key, nextIndex - 1)
  uVariantIndexes.set(col.uProduct, nextIndex)
}
const BLOCK_BY_CODE = new Map(U_BLOCKS.map((b) => [b.productCode, b.productLabel]))
const U_GROUP_LABEL_BY_GROUP: Record<UBlock['group'], string> = {
  conversion: '전환상품',
  set: '세트 상품',
}
function uBlockClass(block: UBlock) {
  return [
    block.group === 'set' ? 'u-header-set' : 'u-header-conversion',
    block.group !== (U_BLOCKS[U_BLOCKS.indexOf(block) - 1]?.group ?? block.group) ? 'u-group-start' : '',
  ].filter(Boolean).join(' ')
}

function uColumnClass(index: number) {
  const col = U_COLUMNS[index]
  if (!col) return ''
  const previous = U_COLUMNS[index - 1]
  return [
    col.group === 'set' ? 'u-col-set' : 'u-col-conversion',
    col.group !== (previous?.group ?? col.group) ? 'u-group-start' : '',
  ].filter(Boolean).join(' ')
}

const DIRECT_CELL_SCREEN_KEY = 'A:직접판매'
const TOTAL_SCREEN_KEY = 'C:총판매'
const REVENUE_SCREEN_KEY = 'C:매출'
const SCREEN_COL_OFFSET = 8
const U_START_EXCEL_COL = 7
const DIRECT_EXCEL_COLUMN = 4
const PRICE_EXCEL_COLUMN = 6

function normalizeVariantCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeProductCode(code: string) {
  return code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function normalizeVariantSuffix(productCode: string, variantCode: string) {
  if (!variantCode) return ''
  const normalizedProductCode = normalizeProductCode(productCode)
  const normalizedVariantCode = variantCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  const raw = normalizedVariantCode.startsWith(normalizedProductCode)
    ? normalizedVariantCode.slice(normalizedProductCode.length)
    : normalizedVariantCode
  return raw.replace(/^0+/, '') || raw
}

function findUVariantData(group: { variants: Variant[]; price: number } | undefined, uProduct: string, uVariant: string) {
  if (!group || !Array.isArray(group.variants)) return null
  const target = normalizeVariantSuffix(uProduct, uVariant)
  if (!target) return null

  const normalizedProductCode = normalizeProductCode(uProduct)
  const directMatch = group.variants.find((variant) => normalizeVariantSuffix(normalizedProductCode, variant.variant_code) === target)
  if (directMatch) return directMatch
  return group.variants.find((variant) => {
    const normalized = normalizeVariantSuffix(normalizedProductCode, variant.variant_code)
    if (normalized === target) return true

    const normalizedVariantOnly = variant.variant_code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    return normalizedVariantOnly === target
      || normalizedVariantOnly === `${normalizedProductCode}${target}`
      || normalizedVariantOnly === `${normalizedProductCode}0${target}`
      || normalizedVariantOnly === `${normalizedProductCode}00${target}`
  }) ?? null
}

function toExcelCol(col: number) {
  if (col <= 0) return ''
  let result = ''
  let n = col
  while (n > 0) {
    const remain = (n - 1) % 26
    result = String.fromCharCode(65 + remain) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

function a1(row: number, col: number) {
  return `${toExcelCol(col)}${row}`
}

function rangeA1(r1: number, c1: number, r2: number, c2: number) {
  if (!Number.isFinite(r1) || !Number.isFinite(r2) || !Number.isFinite(c1) || !Number.isFinite(c2)) return ''
  return `${a1(Math.min(r1, r2), Math.min(c1, c2))}:${a1(Math.max(r1, r2), Math.max(c1, c2))}`
}

function sumFormula(r1: number, c1: number, r2: number, c2: number) {
  const range = rangeA1(r1, c1, r2, c2)
  if (!range) return ''
  return `=SUM(${range})`
}

function columnCellState(uProduct: string, hasRule: boolean, qty: number): CellState {
  if (EXCLUDED_U_PRODUCTS.has(uProduct)) return 'excluded'
  if (hasRule) return 'mapped'
  if (!Number.isFinite(qty) || qty <= 0) return 'unmapped'
  return 'mapped'
}

function columnCellClass(state: CellState) {
  if (state === 'mapped') return 'map-cell map-cell--mapped'
  if (state === 'unmapped') return 'map-cell map-cell--unmapped'
  return 'map-cell map-cell--excluded'
}

function displayOptionName(option?: string) {
  return option ? option.replaceAll('=', ' : ') : '—'
}

function formatFormulaPrice(value: number) {
  if (!Number.isFinite(value)) return '0'
  const normalized = Number.isInteger(value) ? value : value
  return String(normalized)
}

function splitFormulaForDisplay(text: string): FormulaDisplayPart[] {
  const parts: FormulaDisplayPart[] = []
  const pricePattern = /\b[A-Z]{1,3}\d+\*(\d+(?:\.\d+)?)(?=$|[+\-*/)\s])/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pricePattern.exec(text)) !== null) {
    const priceStart = match.index + match[0].lastIndexOf('*') + 1
    const priceEnd = priceStart + match[1].length
    if (priceStart > cursor) {
      parts.push({ text: text.slice(cursor, priceStart), kind: 'plain' })
    }
    parts.push({ text: text.slice(priceStart, priceEnd), kind: 'price' })
    cursor = priceEnd
  }

  if (cursor < text.length) {
    parts.push({ text: text.slice(cursor), kind: 'plain' })
  }

  return parts.length ? parts : [{ text, kind: 'plain' }]
}

function buildRevenueMappedTerms(
  qtyByColumn: number[],
  priceByColumn: number[],
  hasRuleByColumn: boolean[] | undefined,
  priceIsFoundByColumn: boolean[] | undefined,
  uStartCol: number,
  rowKey: string,
): RevenueFormulaBuildResult {
  const terms: RevenueFormulaTerm[] = []
  const warnings: string[] = []
  qtyByColumn.forEach((qty, idx) => {
    const hasRule = hasRuleByColumn?.[idx] ?? false
    if (!hasRule) return
    if (!Number.isFinite(qty)) return
    const price = priceByColumn[idx]
    if (!Number.isFinite(price)) return
    const priceFound = priceIsFoundByColumn?.[idx] ?? false
    if (!priceFound) {
      const mappedUColumn = U_COLUMNS[idx]
      const uProduct = mappedUColumn?.uProduct ?? ''
      const uVariant = mappedUColumn?.uVariant ?? ''
      warnings.push(`${rowKey}: LU 매핑 단가 미확인 (${uProduct}-${uVariant}, 인덱스 ${idx + 1})`)
    }
    const uColOffset = uStartCol + idx
    terms.push({
      uColOffset,
      unitPrice: price,
      priceMissing: !priceIsFoundByColumn?.[idx],
    })
  })
  return { terms, warnings }
}

function hasRuleMatch(
  candidates: MappingRule[] | undefined,
  targetLProduct: string,
  targetLVariant: string | null,
  targetLVariantIndex: number | null,
  ruleUVariantIndex: number | null,
  hasLVariants: boolean,
) {
  if (!candidates || candidates.length === 0) return false

  return candidates.some((rule) => {
    if (rule.lProduct !== targetLProduct) return false

    if (rule.lVariant) {
      if (!targetLVariant) return false
      return rule.lVariant === targetLVariant
    }

    if (!targetLVariant) {
      return !hasLVariants
    }

    return hasLVariants
      && targetLVariantIndex != null
      && ruleUVariantIndex === targetLVariantIndex
  })
}

function getRuleMatchQty(
  candidates: MappingRule[] | undefined,
  targetLProduct: string,
  targetLVariant: string | null,
  targetLVariantIndex: number | null,
  ruleUVariantIndex: number | null,
  qty: number,
  price: number,
  hasLVariants: boolean,
) {
  if (!candidates || candidates.length === 0) return { qty: 0, rev: 0 }

  let totalQty = 0
  let totalRev = 0
  candidates.forEach((rule) => {
    if (rule.lProduct !== targetLProduct) return
    if (rule.lVariant) {
      if (!targetLVariant || rule.lVariant !== targetLVariant) return
      totalQty += qty * rule.ratio
      totalRev += qty * price * rule.ratio
      return
    }
    if (!targetLVariant) {
      if (!hasLVariants) {
        totalQty += qty * rule.ratio
        totalRev += qty * price * rule.ratio
      }
      return
    }
  if (hasLVariants && targetLVariantIndex != null && targetLVariantIndex >= 0 && ruleUVariantIndex === targetLVariantIndex) {
      totalQty += qty * rule.ratio
      totalRev += qty * price * rule.ratio
    }
  })

  return { qty: totalQty, rev: totalRev }
}

function makeOverrideRule(override: LuRuleOverride): MappingRule {
  return {
    uProduct: normalizeProductCode(override.uProduct),
    uVariant: normalizeVariantCode(override.uVariant),
    lProduct: normalizeProductCode(override.lProduct),
    lVariant: override.lVariant ? normalizeVariantCode(override.lVariant) : undefined,
    ratio: 1,
  }
}

function makeEffectiveRuleMap(overrides: LuRuleOverride[]) {
  if (overrides.length === 0) return RULE_BY_KEY

  const addByUKey = new Map<string, MappingRule>()
  const removedCells = new Set<string>()

  overrides.forEach((override) => {
    if (override.action === 'add') {
      const rule = makeOverrideRule(override)
      addByUKey.set(makeUCellKey(rule.uProduct, rule.uVariant), rule)
      return
    }
    removedCells.add(makeLuCellKey(override))
  })

  const result = new Map<string, MappingRule[]>()
  RULE_BY_KEY.forEach((rules, uKey) => {
    const addRule = addByUKey.get(uKey)
    if (addRule) {
      result.set(uKey, [addRule])
      return
    }
    const activeRules = rules.filter((rule) => !removedCells.has(makeLuCellKey(rule)))
    if (activeRules.length > 0) result.set(uKey, activeRules)
  })
  addByUKey.forEach((rule, uKey) => {
    if (!result.has(uKey)) result.set(uKey, [rule])
  })
  return result
}

function buildCellFormula(
  rowMeta: RowFormulaMeta,
  colMeta: ColFormulaMeta,
  rowMetaByKey: Map<string, RowFormulaMeta>,
  fixed: {
    directCol: number
    totalCol: number
    revenueCol: number
    priceCol: number
    uStartCol: number
    uEndCol: number
  },
) {
  const {
    directCol,
    totalCol,
    revenueCol,
    priceCol,
    uStartCol,
    uEndCol,
  } = fixed
  const sourceRows = rowMeta.contributorRowKeys ?? []

  const resolveColValue = (col: number) => {
    if (col < 1) return ''
    return toExcelCol(col)
  }

  const rowNums = sourceRows
    .map((key) => rowMetaByKey.get(key)?.excelRow)
    .filter((row): row is number => row != null)
    .sort((a, b) => a - b)

  const sumByRows = (col: number) => {
    if (rowNums.length === 0) return ''
    if (rowNums.length === 1) return `=${resolveColValue(col)}${rowNums[0]}`
    return `=SUM(${rowNums.map((r) => `${resolveColValue(col)}${r}`).join(',')})`
  }

  if (colMeta.excelCol === directCol) {
    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      if (rowNums.length === 0) return ''
      if (rowNums.length === 1) return `=${resolveColValue(directCol)}${rowNums[0]}`
      return sumFormula(rowNums[0], directCol, rowNums[rowNums.length - 1], directCol)
    }
    return ''
  }

  if (colMeta.excelCol >= uStartCol && colMeta.excelCol <= uEndCol) {
    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      if (rowNums.length === 0) return ''
      if (rowNums.length === 1) return `=${resolveColValue(colMeta.excelCol)}${rowNums[0]}`
      return sumFormula(rowNums[0], colMeta.excelCol, rowNums[rowNums.length - 1], colMeta.excelCol)
    }
    return ''
  }

  if (colMeta.excelCol === totalCol) {
    if (rowMeta.rowType === 'product' || rowMeta.rowType === 'variant') {
      const directPart = `=${resolveColValue(directCol)}${rowMeta.excelRow}`
      if (uStartCol <= uEndCol) {
        return `${directPart}+SUM(${resolveColValue(uStartCol)}${rowMeta.excelRow}:${resolveColValue(uEndCol)}${rowMeta.excelRow})`
      }
      return directPart
    }

    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRows(totalCol)
    }

    return ''
  }

  if (colMeta.excelCol === revenueCol) {
    if (rowMeta.rowType === 'product' || rowMeta.rowType === 'variant') {
      const directQtyRef = `${resolveColValue(directCol)}${rowMeta.excelRow}`
      const directPriceRef = `${resolveColValue(priceCol)}${rowMeta.excelRow}`
      const mappedTerms = (rowMeta.revenueMappedTerms ?? []).map((term) => {
        const col = resolveColValue(term.uColOffset)
        if (term.priceMissing) {
          return `${col}${rowMeta.excelRow}*단가미확인`
        }
        return `${col}${rowMeta.excelRow}*${formatFormulaPrice(term.unitPrice)}`
      })
      const directPart = `=${directQtyRef}*${directPriceRef}`
      if (mappedTerms.length === 0) return directPart
      return `${directPart}+${mappedTerms.join('+')}`
    }

    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRows(revenueCol)
    }
  }

  return ''
}

export function ExcelOrderView() {
  const { settings, setStart, setEnd } = useSettings()
  const { start, end } = settings
  const { state, run } = useReport()
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const topScrollbarRef = useRef<HTMLDivElement>(null)
  const bottomSyncRef = useRef(false)
  const [topScrollbarWidth, setTopScrollbarWidth] = useState(0)
  const [selectedCell, setSelectedCell] = useState<CellSelectionMeta | null>(null)
  const [hoveredCell, setHoveredCell] = useState<Pick<CellSelectionMeta, 'rowKey' | 'colKey'> | null>(null)
  const [luOverrides, setLuOverrides] = useState<LuRuleOverride[]>([])
  const [pendingLuAction, setPendingLuAction] = useState<PendingLuAction | null>(null)
  const [luDialogPosition, setLuDialogPosition] = useState<{ x: number; y: number } | null>(null)
  const luDialogDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const effectiveRuleMap = useMemo(() => makeEffectiveRuleMap(luOverrides), [luOverrides])

  const handleCellSelect = (meta: CellSelectionMeta) => {
    setSelectedCell((prev) => {
      if (prev && prev.rowKey === meta.rowKey && prev.colKey === meta.colKey) return null

      const rowMeta = rowMetaByKey.get(meta.rowKey)
      const colMeta = colMetaByKey.get(meta.colKey)
      const formula = rowMeta && colMeta ? rowFormulaByKey.get(`${meta.rowKey}|${meta.colKey}`) ?? '' : ''
      const formulaWarnings = meta.colKey === REVENUE_SCREEN_KEY
        ? rowMeta?.revenueMappedPriceWarnings
        : undefined

      return {
        ...meta,
        formula,
        formulaWarnings,
        screenRow: rowMeta?.screenRow ?? 0,
        screenCol: colMeta?.screenCol ?? 0,
        excelRow: rowMeta?.excelRow ?? 0,
        excelCol: colMeta?.excelCol ?? 0,
      }
    })
  }

  const clearSelection = () => setSelectedCell(null)

  const toggleLuCell = ({
    uProduct,
    uVariant,
    lProduct,
    lVariant,
    lVariantIndex,
    hasLVariants,
  }: LuToggleTarget) => {
    if (EXCLUDED_U_PRODUCTS.has(uProduct)) return
    const targetRule = makeOverrideRule({
      action: 'add',
      uProduct,
      uVariant,
      lProduct,
      lVariant: lVariant ?? undefined,
    })
    const uKey = makeUCellKey(targetRule.uProduct, targetRule.uVariant)
    const ruleUVariantIndex = U_VARIANT_INDEX_BY_KEY.get(uKey) ?? null
    const currentRules = effectiveRuleMap.get(uKey) ?? []
    const isCurrentTarget = hasRuleMatch(
      currentRules,
      targetRule.lProduct,
      targetRule.lVariant ?? null,
      lVariantIndex,
      ruleUVariantIndex,
      hasLVariants,
    )
    const baseRules = RULE_BY_KEY.get(uKey) ?? []
    const matchingBaseRules = baseRules.filter((rule) => hasRuleMatch(
      [rule],
      targetRule.lProduct,
      targetRule.lVariant ?? null,
      lVariantIndex,
      ruleUVariantIndex,
      hasLVariants,
    ))

    setLuOverrides((prev) => {
      const withoutUCellOverrides = prev.filter((override) =>
        makeUCellKey(override.uProduct, override.uVariant) !== uKey
      )

      if (isCurrentTarget) {
        if (matchingBaseRules.length === 0) return withoutUCellOverrides
        return [
          ...withoutUCellOverrides,
          ...matchingBaseRules.map((rule): LuRuleOverride => ({
            action: 'remove',
            uProduct: rule.uProduct,
            uVariant: rule.uVariant,
            lProduct: rule.lProduct,
            lVariant: rule.lVariant,
          })),
        ]
      }

      const removals = baseRules.map((rule): LuRuleOverride => ({
        action: 'remove',
        uProduct: rule.uProduct,
        uVariant: rule.uVariant,
        lProduct: rule.lProduct,
        lVariant: rule.lVariant,
      }))

      return [
        ...withoutUCellOverrides,
        ...removals,
        {
          action: 'add',
          uProduct: targetRule.uProduct,
          uVariant: targetRule.uVariant,
          lProduct: targetRule.lProduct,
          lVariant: targetRule.lVariant,
        },
      ]
    })
  }

  const requestLuCellToggle = (
    target: LuToggleTarget,
    context: {
      uLabel: string
      uProductName: string
      lLabel: string
      lProductName: string
      lPriceLabel: string
      qty: number
      price: number
    },
  ) => {
    if (EXCLUDED_U_PRODUCTS.has(target.uProduct)) return

    const targetRule = makeOverrideRule({
      action: 'add',
      uProduct: target.uProduct,
      uVariant: target.uVariant,
      lProduct: target.lProduct,
      lVariant: target.lVariant ?? undefined,
    })
    const uKey = makeUCellKey(targetRule.uProduct, targetRule.uVariant)
    const ruleUVariantIndex = U_VARIANT_INDEX_BY_KEY.get(uKey) ?? null
    const currentRules = effectiveRuleMap.get(uKey) ?? []
    const isCurrentTarget = hasRuleMatch(
      currentRules,
      targetRule.lProduct,
      targetRule.lVariant ?? null,
      target.lVariantIndex,
      ruleUVariantIndex,
      target.hasLVariants,
    )
    const baseRules = RULE_BY_KEY.get(uKey) ?? []
    const matchingBaseRules = baseRules.filter((rule) => hasRuleMatch(
      [rule],
      targetRule.lProduct,
      targetRule.lVariant ?? null,
      target.lVariantIndex,
      ruleUVariantIndex,
      target.hasLVariants,
    ))
    const isManualMapped = isCurrentTarget && matchingBaseRules.length === 0
    const isBaseMapped = isCurrentTarget && matchingBaseRules.length > 0
    const existingRule = currentRules[0]
    const isChangingTarget = !isCurrentTarget && !!existingRule
    const qty = Number.isFinite(context.qty) ? context.qty : 0
    const price = Number.isFinite(context.price) ? context.price : 0

    let title = '이 교차셀을 매핑셀로 지정할까요?'
    let description = qty > 0
      ? '지정하면 이 U상품 판매가 선택한 L상품의 총판매, 매출, 수식에 포함됩니다.'
      : '지정하면 수량 0인 매핑셀로 표시되고, 수량이 0이어도 총판매/매출 수식 항에 포함됩니다.'
    let confirmLabel = '매핑셀로 지정'
    let actionTone: PendingLuAction['actionTone'] = 'primary'

    if (isBaseMapped) {
      title = '기본 매핑셀을 해제할까요?'
      description = '기본 규칙을 삭제하지 않고 사용자 변경사항으로만 비활성화합니다. 해제하면 이 U항은 총판매/매출/수식에서 제외됩니다.'
      confirmLabel = '매핑셀 해제'
      actionTone = 'danger'
    } else if (isManualMapped) {
      title = '사용자 지정 매핑셀을 취소할까요?'
      description = '이 셀은 미지정 상태로 돌아가며, 총판매/매출/수식에서 제외됩니다.'
      confirmLabel = '지정 취소'
      actionTone = 'danger'
    } else if (isChangingTarget) {
      title = '이 U상품의 매핑 대상을 변경할까요?'
      description = `현재 매핑 대상(${existingRule.lProduct}${existingRule.lVariant ? `/${existingRule.lVariant}` : ''})은 해제되고, 선택한 셀만 매핑셀로 지정됩니다.`
      confirmLabel = '변경'
    }

    setPendingLuAction({
      ...target,
      title,
      description,
      confirmLabel,
      actionTone,
      uLabel: context.uLabel,
      uProductName: context.uProductName,
      lLabel: context.lLabel,
      lProductName: context.lProductName,
      lPriceLabel: context.lPriceLabel,
      qty,
      price,
      revenueImpact: qty * price,
    })
  }

  const confirmPendingLuAction = () => {
    if (!pendingLuAction) return
    toggleLuCell(pendingLuAction)
    setPendingLuAction(null)
  }

  useEffect(() => {
    if (!pendingLuAction) {
      setLuDialogPosition(null)
      luDialogDragRef.current = null
    }
  }, [pendingLuAction])

  const startLuDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return
    const origin = luDialogPosition ?? { x: 0, y: 0 }
    luDialogDragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveLuDialog = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = luDialogDragRef.current
    if (!drag) return
    setLuDialogPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    })
  }

  const stopLuDialogDrag = (event: ReactPointerEvent<HTMLElement>) => {
    luDialogDragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const getCellSelectionClass = (rowKey: string, colKey: string) => {
    const classes: string[] = []
    if (selectedCell?.rowKey === rowKey && selectedCell.colKey === colKey) {
      classes.push('excel-cell-selected')
    }
    if (hoveredCell?.rowKey === rowKey) classes.push('excel-hover-row')
    if (hoveredCell?.colKey === colKey) classes.push('excel-hover-col')
    if (hoveredCell?.rowKey === rowKey && hoveredCell.colKey === colKey) {
      classes.push('excel-hover-cell')
    }
    return classes.join(' ')
  }

  const handleTableMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    const cell = target?.closest('td[data-row-key][data-col-key]')
    if (!(cell instanceof HTMLTableCellElement)) return
    if (!tableWrapRef.current?.contains(cell)) return
    const rowKey = cell.dataset.rowKey
    const colKey = cell.dataset.colKey
    if (!rowKey || !colKey) return
    setHoveredCell((prev) => {
      if (prev?.rowKey === rowKey && prev.colKey === colKey) return prev
      return { rowKey, colKey }
    })
  }

  const clearHoveredCell = () => setHoveredCell(null)

  const rowHeaderLabelByCode = (code: string, name: string) => `${code} / ${name}`

  function handleStartChange(newStart: string) {
    setStart(newStart)
    if (newStart && end && end < newStart) {
      setEnd(newStart)
    }
  }

  function handleRun() {
    if (!start || !end) {
      alert('기간을 입력하세요')
      return
    }
    if (start > end) {
      alert('시작일이 종료일보다 늦습니다')
      return
    }
    run({ start, end, codes: QUERY_CODES.join(',') })
  }

  const allGroups = useMemo(
    () => state.data?.results.flatMap((r) => r.groups) ?? [],
    [state.data],
  )

  const uDirectQtyByColumn = useMemo<{ qty: number; excluded: boolean }[]>(() => {
    const byCode = new Map(allGroups.map((g) => [normalizeProductCode(g.product_code), g]))

    return U_COLUMNS.map((col) => {
      const uGroup = byCode.get(normalizeProductCode(col.uProduct))
      if (!uGroup) return { qty: 0, excluded: false }

      const variant = findUVariantData(uGroup, col.uProduct, col.uVariant)

      return { qty: variant?.qty ?? 0, excluded: false }
    })
  }, [allGroups])

  const groupRows = useMemo<GroupRows[]>(() => {
    const byCode = new Map(allGroups.map((g) => [normalizeProductCode(g.product_code), g]))
    const buildRow = (code: string): Row => {
      const normalizedCode = normalizeProductCode(code)
      const g = byCode.get(normalizedCode)
      const variants = g?.variants ?? []
      const hasLVariants = g ? !!g.is_multi || variants.length > 1 : variants.length > 1
      const hasVariantRows = variants.length > 0
      const firstVariant = hasVariantRows ? variants[0] : null
      const directQty = hasVariantRows ? (firstVariant?.qty ?? 0) : g?.qty ?? 0
      const directUnitPrice = (hasVariantRows ? (firstVariant?.price ?? 0) : g?.price ?? 0) || 0
      const mappingQtyByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingHasRuleByColumn = Array(U_COLUMNS.length).fill(false)
      const mappingRevByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingPriceByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingPriceIsFoundByColumn = Array(U_COLUMNS.length).fill(false)
      const mappingStateByColumn = Array(U_COLUMNS.length).fill('unmapped' as CellState)
      const variantMappingQtyByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingRevByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingPriceByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingPriceIsFoundByColumn = variants.map(() => Array(U_COLUMNS.length).fill(false))
      const variantMappingStateByColumn = variants.map(() =>
        Array(U_COLUMNS.length).fill('unmapped' as CellState),
      )
      const variantMappingHasRuleByColumn = variants.map(() => Array(U_COLUMNS.length).fill(false))

      U_COLUMNS.forEach((col, idx) => {
        const key = makeUCellKey(col.uProduct, col.uVariant)
        const rule = effectiveRuleMap.get(key)
        const ruleUVariantIndex = U_VARIANT_INDEX_BY_KEY.get(key) ?? null

        const uGroup = byCode.get(normalizeProductCode(col.uProduct))
        let uQty = 0
        let uPrice = 0
        let uPriceFound = false
        if (uGroup && !EXCLUDED_U_PRODUCTS.has(col.uProduct)) {
          const targetVariant = findUVariantData(uGroup, col.uProduct, col.uVariant)
          uQty = targetVariant?.qty ?? 0
          const rawVariantPrice = targetVariant?.price ?? Number.NaN
          const rawGroupPrice = uGroup.price
          if (Number.isFinite(rawVariantPrice) && rawVariantPrice > 0) {
            uPrice = rawVariantPrice
            uPriceFound = true
          } else if (Number.isFinite(rawGroupPrice) && rawGroupPrice > 0) {
            uPrice = rawGroupPrice
            uPriceFound = true
          } else {
            uPriceFound = false
          }
        }
        mappingPriceByColumn[idx] = uPrice
        mappingPriceIsFoundByColumn[idx] = uPriceFound

        mappingHasRuleByColumn[idx] = hasRuleMatch(
          rule,
          normalizedCode,
          null,
          null,
          ruleUVariantIndex,
          hasLVariants,
        )

        const { qty, rev } = rule
          ? getRuleMatchQty(
              rule,
              normalizedCode,
              null,
              null,
              ruleUVariantIndex,
              uQty,
              uPrice,
              hasLVariants,
          )
          : { qty: 0, rev: 0 }
        mappingQtyByColumn[idx] = qty
        mappingRevByColumn[idx] = rev
        mappingStateByColumn[idx] = columnCellState(
          col.uProduct,
          mappingHasRuleByColumn[idx] ?? false,
          qty,
        )

        variants.forEach((v, vIdx) => {
          const targetLVariant = normalizeVariantSuffix(normalizedCode, v.variant_code).toUpperCase()
          const targetLVariantIndex = vIdx
          variantMappingHasRuleByColumn[vIdx][idx] = hasRuleMatch(
            rule,
            normalizedCode,
            targetLVariant,
            targetLVariantIndex,
            ruleUVariantIndex,
            hasLVariants,
          )
          const { qty: variantQty, rev: variantRev } = rule
            ? getRuleMatchQty(
                rule,
                normalizedCode,
                targetLVariant,
                targetLVariantIndex,
                ruleUVariantIndex,
                uQty,
                uPrice,
                hasLVariants,
              )
            : { qty: 0, rev: 0 }
          variantMappingQtyByColumn[vIdx][idx] = variantQty
          variantMappingRevByColumn[vIdx][idx] = variantRev
          variantMappingPriceByColumn[vIdx][idx] = uPrice
          variantMappingPriceIsFoundByColumn[vIdx][idx] = mappingPriceIsFoundByColumn[idx]
          variantMappingStateByColumn[vIdx][idx] = columnCellState(
            col.uProduct,
            variantMappingHasRuleByColumn[vIdx][idx] ?? false,
            variantQty,
          )
        })
      })

      const firstVariantMappedQty = variantMappingQtyByColumn[0]?.reduce((s, v) => s + v, 0) ?? 0
      const firstVariantMappedRev = variantMappingRevByColumn[0]?.reduce((s, v) => s + v, 0) ?? 0
      const remainingVariantQty = variants.slice(1).reduce((variantSum, variant, remainingIdx) => {
        const variantIdx = remainingIdx + 1
        const directQty = variant.qty ?? 0
        const mappedQty = variantMappingQtyByColumn[variantIdx]?.reduce((s, q) => s + q, 0) ?? 0
        return variantSum + directQty + mappedQty
      }, 0)
      const remainingVariantRev = variants.slice(1).reduce((variantSum, variant, remainingIdx) => {
        const variantIdx = remainingIdx + 1
        const directRev = (variant.qty ?? 0) * (variant.price || g?.price || 0)
        const mappedRev = variantMappingRevByColumn[variantIdx]?.reduce((s, q) => s + q, 0) ?? 0
        return variantSum + directRev + mappedRev
      }, 0)
      const directQtyForSummary = variants.reduce((sum, variant) => sum + (variant.qty ?? 0), 0)
      const directQtyFallback = g ? (hasVariantRows ? directQtyForSummary : (g.qty ?? 0)) : 0
      // 부모행은 부모 직접판매 + 부모 매핑/대표옵션 매핑 값만 반영한다.
      const subtotalQty = directQty + mappingQtyByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedQty
      const subtotalRev =
        directQty * directUnitPrice + mappingRevByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedRev
      const summaryQty = subtotalQty + remainingVariantQty
      const summaryRev = subtotalRev + remainingVariantRev

      if (g) {
        return {
          product_code: g.product_code,
          product_name: g.product_name,
          price: g.price,
          is_multi: g.is_multi,
          qty: subtotalQty,
          rev: subtotalRev,
          directQtyForSummary: directQtyFallback,
          subtotalQtyForSummary: summaryQty,
          subtotalRevForSummary: summaryRev,
          missing: false,
          directQty,
          directUnitPrice,
          mappingPriceByColumn,
          mappingPriceIsFoundByColumn,
          mappingQtyByColumn,
          mappingHasRuleByColumn,
          mappingRevByColumn,
          mappingStateByColumn,
          variantMappingQtyByColumn,
          variantMappingPriceByColumn,
          variantMappingPriceIsFoundByColumn,
          variantMappingRevByColumn,
          variantMappingStateByColumn,
          variantMappingHasRuleByColumn,
          variants,
        }
      }

      return {
        product_code: code,
        product_name: '—',
        price: 0,
        is_multi: false,
        qty: subtotalQty,
        rev: subtotalRev,
        directQtyForSummary: directQtyFallback,
        subtotalQtyForSummary: summaryQty,
        subtotalRevForSummary: summaryRev,
        missing: true,
        directQty,
        directUnitPrice,
        mappingPriceByColumn,
        mappingPriceIsFoundByColumn,
        mappingQtyByColumn,
        mappingHasRuleByColumn,
        mappingRevByColumn,
        mappingStateByColumn,
        variantMappingQtyByColumn: [],
        variantMappingPriceByColumn: [],
        variantMappingPriceIsFoundByColumn: [],
        variantMappingRevByColumn: [],
        variantMappingHasRuleByColumn: [],
        variantMappingStateByColumn: [],
        variants: [],
      }
    }

    const lRowsByCode = new Map<string, Row>()
    L_GROUPS.flatMap((g) => g.codes).forEach((code) => {
      lRowsByCode.set(code, buildRow(code))
    })
    const cupbizGroup = L_GROUPS.find((g) => g.label === '컵비즈')
    const cupbizSubtotalRows = (cupbizGroup?.codes ?? [])
      .map((code) => lRowsByCode.get(code))
      .filter((row): row is Row => !!row)

    return L_GROUPS.map((group) => {
      const rows: Row[] = group.codes.map((code) => lRowsByCode.get(code) ?? buildRow(code))
      const subtotalSourceRows =
        group.label === '1kg 총합계'
          ? [...rows, ...cupbizSubtotalRows]
          : rows

      return {
        label: group.label,
        withSubtotal: group.withSubtotal !== false,
        rows,
        subtotalQty: subtotalSourceRows.reduce((s, r) => s + r.subtotalQtyForSummary, 0),
        subtotalRev: subtotalSourceRows.reduce((s, r) => s + r.subtotalRevForSummary, 0),
        subtotalDirectQty: subtotalSourceRows.reduce((s, r) => s + r.directQtyForSummary, 0),
        subtotalMappingQtyByColumn: Array.from({ length: U_COLUMNS.length }, (_, idx) =>
          subtotalSourceRows.reduce((s, r) => {
            const parentQty = r.mappingQtyByColumn[idx] ?? 0
            const childQty = r.variantMappingQtyByColumn.reduce(
              (vs, byVariant) => vs + (byVariant[idx] ?? 0),
              0,
            )
            return s + parentQty + childQty
          }, 0),
        ),
        subtotalMappingRevByColumn: Array.from({ length: U_COLUMNS.length }, (_, idx) =>
          subtotalSourceRows.reduce((s, r) => {
            const parentRev = r.mappingRevByColumn[idx] ?? 0
            const childRev = r.variantMappingRevByColumn.reduce(
              (vs, byVariant) => vs + (byVariant[idx] ?? 0),
              0,
            )
            return s + parentRev + childRev
          }, 0),
        ),
      }
    })
  }, [allGroups, effectiveRuleMap])

  const totalQty = groupRows.reduce(
    (s, g) => s + (g.withSubtotal === false ? 0 : g.subtotalQty),
    0,
  )
  const totalRev = groupRows.reduce(
    (s, g) => s + (g.withSubtotal === false ? 0 : g.subtotalRev),
    0,
  )
  const totalDirectQty = groupRows.reduce(
    (s, g) => s + (g.withSubtotal === false ? 0 : g.subtotalDirectQty),
    0,
  )
  const totalColumnCount = 6 + U_COLUMNS.length + 2
  const totalExcelColumn = U_START_EXCEL_COL + U_COLUMNS.length
  const revenueExcelColumn = totalExcelColumn + 1
  const totalMappingQtyByColumn = Array.from({ length: U_COLUMNS.length }, (_, idx) =>
    groupRows.reduce(
      (s, g) => s + (g.withSubtotal === false ? 0 : (g.subtotalMappingQtyByColumn[idx] ?? 0)),
      0,
    ),
  )

  const colMetaByKey = useMemo(() => {
    const map = new Map<string, ColFormulaMeta>()
    let screenCol = 1
    const fixed: [string, number][] = [
      ['A:상품코드', 1],
      ['A:상품명', 2],
      ['A:코드', 3],
      ['A:옵션명', 5],
      ['A:단가', PRICE_EXCEL_COLUMN],
      [DIRECT_CELL_SCREEN_KEY, DIRECT_EXCEL_COLUMN],
    ]
    fixed.forEach(([key, excelCol]) => {
      map.set(key, { key, screenCol: screenCol++, excelCol })
    })
    U_COLUMNS.forEach((col, idx) => {
      const key = `B:${col.uProduct}-${col.uVariant}`
      map.set(key, {
        key,
        screenCol: screenCol++,
        excelCol: U_START_EXCEL_COL + idx,
      })
    })
    map.set(TOTAL_SCREEN_KEY, {
      key: TOTAL_SCREEN_KEY,
      screenCol: screenCol++,
      excelCol: totalExcelColumn,
    })
    map.set(REVENUE_SCREEN_KEY, {
      key: REVENUE_SCREEN_KEY,
      screenCol: screenCol++,
      excelCol: revenueExcelColumn,
    })
    return map
  }, [totalExcelColumn, revenueExcelColumn])

  const rowMetaByKey = useMemo(() => {
    const map = new Map<string, RowFormulaMeta>()
    let rowIndex = 1

    const addRow = (meta: Omit<RowFormulaMeta, 'screenRow' | 'excelRow'>) => {
      const screenRow = rowIndex++
      map.set(meta.key, {
        ...meta,
        screenRow,
        excelRow: screenRow + SCREEN_COL_OFFSET,
      })
    }

    addRow({
      key: 'hardwax-u-direct',
      rowType: 'uDirect',
      groupLabel: 'U상품 판매수',
    })

    const cupbizRowKeys: string[] = []

    groupRows.forEach((grp) => {
      const sourceRowKeys: string[] = []
      grp.rows.forEach((row) => {
        const parentKey = `parent:${grp.label}:${row.product_code}`
        const parentTotalMappedQty = row.mappingQtyByColumn.map(
          (qty, idx) => {
            const variantQty = row.variantMappingQtyByColumn[0]?.[idx] ?? 0
            return qty + variantQty
          },
        )
        const parentHasRuleByColumn = row.mappingHasRuleByColumn.map((hasParentRule, idx) => {
          const hasFirstVariantRule = row.variantMappingHasRuleByColumn[0]?.[idx] ?? false
          return hasParentRule || hasFirstVariantRule
        })
        const parentTotalMappedPrice = row.mappingPriceByColumn.map((price, idx) => {
          if (row.mappingHasRuleByColumn[idx]) return price
          return row.variantMappingPriceByColumn[0]?.[idx] ?? 0
        })
        const parentPriceFoundByColumn = row.mappingPriceIsFoundByColumn.map((priceIsFound, idx) => {
          if (priceIsFound) return true
          return row.variantMappingPriceIsFoundByColumn[0]?.[idx] ?? false
        })
        const parentMapped = buildRevenueMappedTerms(
          parentTotalMappedQty,
          parentTotalMappedPrice,
          parentHasRuleByColumn,
          parentPriceFoundByColumn,
          U_START_EXCEL_COL,
          parentKey,
        )
        addRow({
          key: parentKey,
          rowType: 'product',
          groupLabel: grp.label,
          product_code: row.product_code,
          revenueDirectQty: row.directQty,
          revenueMappedTerms: parentMapped.terms,
          revenueMappedPriceWarnings: parentMapped.warnings,
        })
        sourceRowKeys.push(parentKey)

        if (row.variants.length > 1) {
          row.variants.slice(1).forEach((variant, idx) => {
            const variantKey = `variant:${row.product_code}:${variant.variant_code}`
            const variantIdx = idx + 1
            const variantQtyByColumn = row.variantMappingQtyByColumn[variantIdx] ?? []
            const variantPriceByColumn = row.variantMappingPriceByColumn[variantIdx] ?? []
            const variantHasRuleByColumn = row.variantMappingHasRuleByColumn[variantIdx] ?? []
            const variantMapped = buildRevenueMappedTerms(
              variantQtyByColumn,
              variantPriceByColumn,
              variantHasRuleByColumn,
              row.variantMappingPriceIsFoundByColumn[variantIdx] ?? [],
              U_START_EXCEL_COL,
              variantKey,
            )
            addRow({
              key: variantKey,
              rowType: 'variant',
              groupLabel: grp.label,
              product_code: row.product_code,
              variant_code: variant.variant_code,
              revenueDirectQty: variant.qty,
              revenueMappedTerms: variantMapped.terms,
              revenueMappedPriceWarnings: variantMapped.warnings,
            })
            sourceRowKeys.push(variantKey)
          })
        }
      })

      if (grp.label === '컵비즈') {
        cupbizRowKeys.push(...sourceRowKeys)
      }

      const subtotalSourceRows = grp.label === '1kg 총합계' && cupbizRowKeys.length > 0
        ? [...sourceRowKeys, ...cupbizRowKeys]
        : sourceRowKeys

      if (grp.withSubtotal !== false) {
        addRow({
          key: `subtotal:${grp.label}`,
          rowType: 'subtotal',
          groupLabel: grp.label,
          contributorRowKeys: subtotalSourceRows,
        })
      }
    })

    const grandSources: string[] = groupRows
      .filter((grp) => grp.withSubtotal !== false)
      .map((grp) => `subtotal:${grp.label}`)
      .filter((subtotalRowKey) => map.has(subtotalRowKey))
    addRow({
      key: 'total:grand',
      rowType: 'total',
      groupLabel: '합계',
      contributorRowKeys: grandSources,
    })

    return map
  }, [groupRows])

  const rowCoordinates = useMemo(() => {
    const map = new Map<string, number>()
    rowMetaByKey.forEach((meta, key) => {
      map.set(key, meta.screenRow)
    })
    return map
  }, [rowMetaByKey])

  const colCoordinates = useMemo(() => {
    const map = new Map<string, number>()
    colMetaByKey.forEach((meta, key) => {
      map.set(key, meta.screenCol)
    })
    return map
  }, [colMetaByKey])

  const rowFormulaByKey = useMemo(() => {
    const map = new Map<string, string>()
    rowMetaByKey.forEach((rowMeta, rowKey) => {
      colMetaByKey.forEach((colMeta) => {
        const formula = buildCellFormula(
          rowMeta,
          colMeta,
          rowMetaByKey,
          {
            directCol: DIRECT_EXCEL_COLUMN,
            totalCol: totalExcelColumn,
            revenueCol: revenueExcelColumn,
            priceCol: PRICE_EXCEL_COLUMN,
            uStartCol: U_START_EXCEL_COL,
            uEndCol: U_START_EXCEL_COL + U_COLUMNS.length - 1,
          },
        )
        if (formula) {
          map.set(`${rowKey}|${colMeta.key}`, formula)
        }
      })
    })
    return map
  }, [colMetaByKey, rowMetaByKey, totalExcelColumn, revenueExcelColumn])

  const selectedCoordinateText = useMemo(() => {
    if (!selectedCell) return null
    const rowMeta = rowMetaByKey.get(selectedCell.rowKey)
    const colMeta = colMetaByKey.get(selectedCell.colKey)
    if (!rowMeta || !colMeta) return null
    return `R${rowMeta.screenRow}/C${colMeta.screenCol}`
  }, [selectedCell, colMetaByKey, rowMetaByKey])

  const selectedFormulaText = useMemo(() => {
    if (!selectedCell) return null
    const warnings = selectedCell.formulaWarnings ?? []
    const formula = selectedCell.formula || ''
    if (!warnings.length) return formula
    return `${formula}\n${warnings.join(' / ')}`
  }, [selectedCell])

  const selectedFormulaParts = useMemo(() => {
    if (!selectedFormulaText) return []
    return splitFormulaForDisplay(selectedFormulaText)
  }, [selectedFormulaText])

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const cells = table.querySelectorAll('td[data-row-key][data-col-key]')
    cells.forEach((cell) => {
      const rowKey = cell.getAttribute('data-row-key') ?? ''
      const colKey = cell.getAttribute('data-col-key') ?? ''
      const formula = rowKey && colKey ? rowFormulaByKey.get(`${rowKey}|${colKey}`) : ''
      cell.setAttribute('data-row', rowKey)
      cell.setAttribute('data-col', colKey)
      cell.setAttribute('data-formula', formula ?? '')
      if (formula) {
        cell.classList.add('formula-cell')
        cell.setAttribute('title', `수식: ${formula}`)
      } else {
        cell.classList.remove('formula-cell')
        cell.setAttribute('title', '값 셀')
      }
    })
  }, [rowFormulaByKey, state.data])


  const currency = state.data?.grand.currency ?? 'KRW'
  const isRunning = state.status === 'running'
  const dataReady = !!state.data

  useEffect(() => {
    clearSelection()
  }, [state.data])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const copyTextToClipboard = async (text: string, message: string) => {
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      setCopyToast(message)
      if (copyTimerRef.current) {
        window.clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopyToast(null)
      }, 1000)
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('복사 실패', error)
    }
  }

  const handleCopySelection = () => {
    if (!selectedCoordinateText) return
    void copyTextToClipboard(selectedCoordinateText, '셀주소 복사됨')
  }

  const handleCopyProductCode = (productCode: string) => {
    if (!productCode.trim()) return
    void copyTextToClipboard(productCode, '상품코드 복사됨')
  }

  const updateTopScrollbarWidth = () => {
    const table = tableRef.current
    const wrap = tableWrapRef.current
    if (!table || !wrap) return
    const nextWidth = Math.max(table.scrollWidth, wrap.clientWidth)
    setTopScrollbarWidth((prev) => (prev === nextWidth ? prev : nextWidth))
  }

  const syncScrollLeftFromTop = (left: number) => {
    const bottom = tableWrapRef.current
    if (!bottom || bottomSyncRef.current || bottom.scrollLeft === left) return
    bottomSyncRef.current = true
    bottom.scrollLeft = left
    requestAnimationFrame(() => {
      bottomSyncRef.current = false
    })
  }

  const syncScrollLeftFromBottom = (left: number) => {
    const top = topScrollbarRef.current
    if (!top) return
    if (bottomSyncRef.current) return
    if (top.scrollLeft === left) return
    bottomSyncRef.current = true
    top.scrollLeft = left
    requestAnimationFrame(() => {
      bottomSyncRef.current = false
    })
  }

  function handleTopScroll(event: UIEvent<HTMLDivElement>) {
    syncScrollLeftFromTop(event.currentTarget.scrollLeft)
  }

  function handleBottomScroll(event: UIEvent<HTMLDivElement>) {
    syncScrollLeftFromBottom(event.currentTarget.scrollLeft)
  }

  useEffect(() => {
    updateTopScrollbarWidth()
    const wrap = tableWrapRef.current
    const table = tableRef.current
    if (!wrap || !table) return
    const observer = new ResizeObserver(() => {
      updateTopScrollbarWidth()
    })
    observer.observe(wrap)
    observer.observe(table)
    const onWindowResize = () => updateTopScrollbarWidth()
    window.addEventListener('resize', onWindowResize)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', onWindowResize)
    }
  }, [dataReady])

  return (
    <div className="excel-container">
      <div className="excel-sticky-top">
        <header className="excel-header">
          <a href="#" className="home-link">
            ← 홈
          </a>
          <h1>하드왁스</h1>
        </header>

        <div className="filters card">
          <div className="filter-row hardwax-filter-row">
            <DateFilter
              start={start}
              end={end}
              onStartChange={handleStartChange}
              onEndChange={setEnd}
              endMin={start}
            />
            {dataReady ? (
              <div className="hardwax-filter-status">
                <span className="excel-period">
                  {state.data!.start} ~ {state.data!.end}
                </span>
                <div className="excel-selection-indicator">
                  {selectedCell ? (
                    <span
                      className="selection-coordinates selection-copy-trigger"
                      role="button"
                      tabIndex={0}
                      title="셀주소 더블클릭 복사"
                      onDoubleClick={handleCopySelection}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          handleCopySelection()
                        }
                      }}
                    >
                      <span className="selection-pin">📍</span>
                      <span className="selection-item">
                        <span className="selection-dot selection-dot-row" aria-hidden="true" />
                        {`R${rowCoordinates.get(selectedCell.rowKey) ?? '-'}`}
                      </span>
                      <span className="selection-separator" aria-hidden="true">
                        |
                      </span>
                      <span className="selection-item">
                        <span className="selection-dot selection-dot-col" aria-hidden="true" />
                        {`C${colCoordinates.get(selectedCell.colKey) ?? '-'}`}
                      </span>
                    </span>
                  ) : (
                    <span className="selection-empty">
                      <span className="selection-pin">📍</span>
                      <span>선택 없음</span>
                    </span>
                  )}
                  {selectedCell ? (
                    selectedFormulaText ? (
                      <span className="selection-formula">
                        <span className="selection-item">수식:</span>
                        <span className="selection-formula-value">
                          {selectedFormulaParts.map((part, idx) => (
                            <span
                              key={`${part.kind}-${idx}`}
                              className={part.kind === 'price' ? 'selection-formula-price' : undefined}
                            >
                              {part.text}
                            </span>
                          ))}
                        </span>
                      </span>
                    ) : (
                      <span className="selection-cell-kind">값 셀</span>
                    )
                  ) : null}
                </div>
              </div>
            ) : null}
            <div className="filter-spacer" />
            {copyToast ? <div className="excel-copy-toast">{copyToast}</div> : null}
            <button
              type="button"
              className={`btn btn-primary ${isRunning ? 'btn-running' : ''}`}
              onClick={handleRun}
              disabled={isRunning}
              aria-busy={isRunning}
            >
              {isRunning ? (
                <>
                  <span className="btn-spinner" aria-hidden="true" />
                  <span>조회 중</span>
                </>
              ) : (
                '조회'
              )}
            </button>
          </div>
          {isRunning ? (
            <div className="query-running-banner" role="status" aria-live="polite">
              <span className="btn-spinner" aria-hidden="true" />
              <span>조회 중입니다. 데이터를 불러오는 동안 잠시 기다려주세요.</span>
            </div>
          ) : null}
        </div>
      </div>

      {state.status === 'error' && <div className="error-box">{state.error}</div>}

      {dataReady && (
        <div className="excel-section card">
          <div
            className="excel-horizontal-scrollbar-top"
            ref={topScrollbarRef}
            onScroll={handleTopScroll}
          >
            <div
              className="excel-horizontal-scrollbar-top-inner"
              style={{ width: `${topScrollbarWidth}px` }}
            />
          </div>
          <div
            className="excel-table-wrap"
            ref={tableWrapRef}
            onScroll={handleBottomScroll}
            onMouseMove={handleTableMouseMove}
            onMouseLeave={clearHoveredCell}
          >
            <table className="excel-table excel-matrix" ref={tableRef}>
              <thead>
                <tr>
                  <th rowSpan={2} className="sticky sticky-code">
                    상품코드
                  </th>
                  <th rowSpan={2} className="sticky sticky-name">
                    상품명
                  </th>
                  <th rowSpan={2} className="sticky sticky-option-code">
                    코드
                  </th>
                  <th rowSpan={2} className="sticky sticky-option-name">
                    옵션명
                  </th>
                  <th rowSpan={2} className="sticky sticky-price">
                    단가
                  </th>
                  <th rowSpan={2} className="sticky sticky-direct">
                    직접판매
                  </th>
                  {U_BLOCKS.map((block) => (
                    <th
                      key={block.productCode}
                      colSpan={block.variants.length}
                      className={`u-header copyable-header ${uBlockClass(block)}`}
                      title={`${block.productCode} ${block.productLabel} 더블클릭 복사`}
                      onDoubleClick={() => handleCopyProductCode(block.productCode)}
                    >
                      <div className="u-header-group">
                        {U_GROUP_LABEL_BY_GROUP[block.group]}
                      </div>
                      <div
                        className="u-header-code"
                        title={`${block.productCode} ${block.productLabel}`}
                      >
                        {block.productCode}
                      </div>
                      <div
                        className="u-header-name"
                        title={block.productLabel}
                      >
                        {block.productLabel}
                      </div>
                    </th>
                  ))}
                  <th rowSpan={2} className="sticky sticky-total">
                    총판매
                  </th>
                  <th rowSpan={2} className="sticky sticky-rev">
                    매출
                  </th>
                </tr>
                <tr>
                  {U_COLUMNS.map((col, idx) => {
                    const block = BLOCK_BY_CODE.get(col.uProduct) ?? ''
                    return (
                      <th
                        key={`${col.uProduct}${COLUMN_KEY_DELIM}${col.uVariant}`}
                        className={`matrix-variant ${uColumnClass(idx)}`}
                        title={`${col.uProduct} / ${col.uVariant}${block ? ` (${block})` : ''}`}
                      >
                        {col.uVariant}
                      </th>
                    )
                  })}
                </tr>
                <tr className="u-direct-row">
                  <td
                    className={`num sticky sticky-code u-direct-label ${getCellSelectionClass('hardwax-u-direct', 'A:상품코드')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:상품코드',
                        colLabel: '상품코드',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:상품코드"
                    data-row-label="U상품 판매수"
                    data-col-label="상품코드"
                  >
                    U상품 판매수
                  </td>
                  <td
                    className={`sticky sticky-name ${getCellSelectionClass('hardwax-u-direct', 'A:상품명')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:상품명',
                        colLabel: '상품명',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:상품명"
                    data-row-label="U상품 판매수"
                    data-col-label="상품명"
                  />
                  <td
                    className={`sticky sticky-option-code ${getCellSelectionClass('hardwax-u-direct', 'A:코드')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:코드',
                        colLabel: '코드',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:코드"
                    data-row-label="U상품 판매수"
                    data-col-label="코드"
                  />
                  <td
                    className={`sticky sticky-option-name ${getCellSelectionClass('hardwax-u-direct', 'A:옵션명')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:옵션명',
                        colLabel: '옵션명',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:옵션명"
                    data-row-label="U상품 판매수"
                    data-col-label="옵션명"
                  />
                  <td
                    className={`num sticky sticky-price ${getCellSelectionClass('hardwax-u-direct', 'A:단가')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:단가',
                        colLabel: '단가',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:단가"
                    data-row-label="U상품 판매수"
                    data-col-label="단가"
                  />
                  <td
                    className={`num sticky sticky-direct ${getCellSelectionClass('hardwax-u-direct', 'A:직접판매')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:직접판매',
                        colLabel: '직접판매',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="A:직접판매"
                    data-row-label="U상품 판매수"
                    data-col-label="직접판매"
                  />
                  {uDirectQtyByColumn.map((item, idx) => (
                    <td
                      key={`u-direct-${idx}`}
                      className={`num ${uColumnClass(idx)} ${getCellSelectionClass(
                        'hardwax-u-direct',
                        `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                      )}`}
                      onClick={() =>
                        handleCellSelect({
                          rowKey: 'hardwax-u-direct',
                          rowLabel: 'U상품 판매수',
                          colKey: `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                          colLabel: `U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim(),
                        })
                      }
                      data-row-key="hardwax-u-direct"
                      data-col-key={`B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`}
                      data-row-label="U상품 판매수"
                      data-col-label={`U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim()}
                    >
                      {item.excluded ? '' : fmtNumber(item.qty)}
                    </td>
                  ))}
                  <td
                    className={`num sticky sticky-total ${getCellSelectionClass('hardwax-u-direct', 'C:총판매')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'C:총판매',
                        colLabel: '총판매',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="C:총판매"
                    data-row-label="U상품 판매수"
                    data-col-label="총판매"
                  >
                    합계
                  </td>
                  <td
                    className={`num sticky sticky-rev ${getCellSelectionClass('hardwax-u-direct', 'C:매출')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'hardwax-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'C:매출',
                        colLabel: '매출',
                      })
                    }
                    data-row-key="hardwax-u-direct"
                    data-col-key="C:매출"
                    data-row-label="U상품 판매수"
                    data-col-label="매출"
                  >
                    {''}
                  </td>
                </tr>
              </thead>
              <tbody>
                {groupRows.map((grp) => (
                  <Fragment key={grp.label}>
                    {grp.rows.map((g, gi) => {
                      const gid = `${grp.label}-${g.product_code}-${gi}`
                         const hasVariantRows = g.variants.length > 0
                         const firstVariant = hasVariantRows ? g.variants[0] : null
                         const firstVariantSuffix = firstVariant
                           ? normalizeVariantSuffix(g.product_code, firstVariant.variant_code).toUpperCase()
                           : ''
                         const firstVariantOption = firstVariant ? firstVariant.option : '—'
                         const firstVariantDisplayPrice = hasVariantRows
                           ? fmtVariantPrice(firstVariant?.price ?? 0, g.price, currency)
                           : fmtParentPrice(g, currency)
                         const firstVariantDirectQty = hasVariantRows ? (firstVariant?.qty ?? 0) : g.directQty
                         const remainingVariants = hasVariantRows ? g.variants.slice(1) : []
                         const rowKey = `parent:${grp.label}:${g.product_code}`
                         const rowLabel = rowHeaderLabelByCode(g.product_code, g.product_name)
                         const parentHasLVariants = !!g.is_multi || g.variants.length > 1
                         const parentQtyByColumn = hasVariantRows
                           ? g.mappingQtyByColumn.map((q, idx) => {
                            const mappedFirstVariantQty = g.variantMappingQtyByColumn[0]?.[idx] ?? 0
                            return q + mappedFirstVariantQty
                          })
                        : g.mappingQtyByColumn
                         const parentStateByColumn = hasVariantRows
                           ? g.mappingStateByColumn.map((state, idx) => {
                            if (state === 'excluded' || state === 'mapped') {
                              return state
                            }
                            if (g.variantMappingHasRuleByColumn[0]?.[idx]) {
                              return 'mapped'
                            }
                            return state
                          })
                        : g.mappingStateByColumn
                        return (
                       <Fragment key={gid}>
                         <tr
                           className={`${g.missing ? 'row-missing' : ''} ${hasVariantRows ? 'row-parent product-merge-start' : 'row-single'}`.trim()}
                          >
                           <td
                             className={`code-cell sticky sticky-code product-merge-cell ${getCellSelectionClass(rowKey, 'A:상품코드')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:상품코드',
                                 colLabel: '상품코드',
                               })
                             }
                             onDoubleClick={() => handleCopyProductCode(g.product_code)}
                             title="상품코드 더블클릭 복사"
                             data-row-key={rowKey}
                             data-col-key="A:상품코드"
                             data-row-label={rowLabel}
                             data-col-label="상품코드"
                           >
                             {g.product_code}
                           </td>
                           <td
                             className={`name-cell sticky sticky-name product-merge-cell ${getCellSelectionClass(rowKey, 'A:상품명')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:상품명',
                                 colLabel: '상품명',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:상품명"
                             data-row-label={rowLabel}
                             data-col-label="상품명"
                           >
                             {g.product_name}
                           </td>
                           <td
                             className={`sticky sticky-option-code ${getCellSelectionClass(rowKey, 'A:코드')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:코드',
                                 colLabel: '코드',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:코드"
                             data-row-label={rowLabel}
                             data-col-label="코드"
                           >
                             {hasVariantRows ? firstVariantSuffix : ''}
                           </td>
                           <td
                             className={`sticky sticky-option-name ${getCellSelectionClass(rowKey, 'A:옵션명')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:옵션명',
                                 colLabel: '옵션명',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:옵션명"
                             data-row-label={rowLabel}
                             data-col-label="옵션명"
                           >
                             {hasVariantRows ? displayOptionName(firstVariantOption) : ''}
                           </td>
                           <td
                             className={`num sticky sticky-price ${getCellSelectionClass(rowKey, 'A:단가')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:단가',
                                 colLabel: '단가',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:단가"
                             data-row-label={rowLabel}
                             data-col-label="단가"
                           >
                             {g.missing ? '—' : firstVariantDisplayPrice}
                           </td>
                           <td
                             className={`num sticky sticky-direct ${getCellSelectionClass(rowKey, 'A:직접판매')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:직접판매',
                                 colLabel: '직접판매',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:직접판매"
                             data-row-label={rowLabel}
                             data-col-label="직접판매"
                           >
                             {g.missing ? '—' : fmtNumber(firstVariantDirectQty)}
                           </td>
                           {parentQtyByColumn.map((q, idx) => {
                               const state = parentStateByColumn[idx]
                               const colKey = `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`
                               const colLabel = `U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim()
                               const targetLVariant = parentHasLVariants && hasVariantRows ? firstVariantSuffix || null : null
                               return (
                                 <td
                                   key={`${g.product_code}-${idx}`}
                                  className={`num ${uColumnClass(idx)} ${columnCellClass(state)} ${getCellSelectionClass(rowKey, colKey)}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey,
                                      rowLabel,
                                      colKey,
                                       colLabel,
                                     })
                                   }
                                   onDoubleClick={() =>
                                     requestLuCellToggle(
                                       {
                                         uProduct: U_COLUMNS[idx]?.uProduct ?? '',
                                         uVariant: U_COLUMNS[idx]?.uVariant ?? '',
                                         lProduct: g.product_code,
                                         lVariant: targetLVariant,
                                         lVariantIndex: parentHasLVariants && hasVariantRows ? 0 : null,
                                         hasLVariants: parentHasLVariants,
                                       },
                                         {
                                           uLabel: `${U_COLUMNS[idx]?.uProduct ?? ''} / ${U_COLUMNS[idx]?.uVariant ?? ''}`,
                                           uProductName: U_COLUMNS[idx]?.blockLabel ?? '',
                                           lLabel: hasVariantRows
                                             ? `${g.product_code} / ${firstVariantSuffix || '-'}`
                                             : g.product_code,
                                           lProductName: g.product_name,
                                           lPriceLabel: firstVariantDisplayPrice,
                                           qty: q > 0 ? q : (uDirectQtyByColumn[idx]?.qty ?? 0),
                                           price: g.mappingPriceByColumn[idx] ?? 0,
                                         },
                                     )
                                   }
                                   data-row-key={rowKey}
                                   data-col-key={colKey}
                                   data-row-label={rowLabel}
                                  data-col-label={colLabel}
                                >
                                  {state !== 'excluded' &&
                                   !(state === 'unmapped' && q === 0)
                                  ? fmtNumber(q)
                                  : ''}
                              </td>
                            )
                            })}
                            <td
                              className={`num sticky sticky-total ${getCellSelectionClass(rowKey, 'C:총판매')}`}
                              onClick={() =>
                                handleCellSelect({
                                  rowKey,
                                  rowLabel,
                                  colKey: 'C:총판매',
                                  colLabel: '총판매',
                                })
                              }
                              data-row-key={rowKey}
                              data-col-key="C:총판매"
                              data-row-label={rowLabel}
                              data-col-label="총판매"
                            >
                              {fmtNumber(g.qty)}
                            </td>
                            <td
                              className={`num sticky sticky-rev ${getCellSelectionClass(rowKey, 'C:매출')}`}
                              onClick={() =>
                                handleCellSelect({
                                  rowKey,
                                  rowLabel,
                                  colKey: 'C:매출',
                                  colLabel: '매출',
                                })
                              }
                              data-row-key={rowKey}
                              data-col-key="C:매출"
                              data-row-label={rowLabel}
                              data-col-label="매출"
                            >
                              {fmtCurrency(g.rev, currency)}
                            </td>
                          </tr>
                          {hasVariantRows ? remainingVariants.map((v, vIdx) => {
                            const idx = vIdx + 1
                            const suffix = normalizeVariantSuffix(g.product_code, v.variant_code)
                            const variantMapQty = g.variantMappingQtyByColumn[idx] ?? []
                            const variantMapRev = g.variantMappingRevByColumn[idx] ?? []
                            const totalQty = v.qty + variantMapQty.reduce((s, q) => s + q, 0)
                            const directRev = (v.qty ?? 0) * (v.price || g.price || 0)
                            const totalRev = directRev + variantMapRev.reduce((s, q) => s + q, 0)
                            const variantRowKey = `variant:${g.product_code}:${v.variant_code}`
                            const variantRowLabel = `${rowHeaderLabelByCode(g.product_code, g.product_name)} / ${displayOptionName(v.option || v.variant_code)}`
                            return (
                              <tr
                                key={`${g.product_code}-${v.variant_code}`}
                                className="row-child variant-row product-merge-child"
                              >
                                <td
                                  className={`code-cell sticky sticky-code variant-code-cell product-merge-cell ${getCellSelectionClass(variantRowKey, 'A:상품코드')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:상품코드',
                                      colLabel: '상품코드',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:상품코드"
                                  data-row-label={variantRowLabel}
                                  data-col-label="상품코드"
                                >
                                  {' '}
                                </td>
                                <td
                                  className={`name-cell sticky sticky-name variant-name-cell product-merge-cell ${getCellSelectionClass(variantRowKey, 'A:상품명')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:상품명',
                                      colLabel: '상품명',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:상품명"
                                  data-row-label={variantRowLabel}
                                  data-col-label="상품명"
                                >
                                  {' '}
                                </td>
                                <td
                                  className={`sticky sticky-option-code ${getCellSelectionClass(variantRowKey, 'A:코드')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:코드',
                                      colLabel: '코드',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:코드"
                                  data-row-label={variantRowLabel}
                                  data-col-label="코드"
                                >
                                  {suffix || '—'}
                                </td>
                                <td
                                  className={`sticky sticky-option-name ${getCellSelectionClass(variantRowKey, 'A:옵션명')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:옵션명',
                                      colLabel: '옵션명',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:옵션명"
                                  data-row-label={variantRowLabel}
                                  data-col-label="옵션명"
                                >
                                  {displayOptionName(v.option || v.variant_code)}
                                </td>
                                <td
                                  className={`num sticky sticky-price ${getCellSelectionClass(variantRowKey, 'A:단가')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:단가',
                                      colLabel: '단가',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:단가"
                                  data-row-label={variantRowLabel}
                                  data-col-label="단가"
                                >
                                  {g.missing ? '—' : fmtVariantPrice(v.price, g.price, currency)}
                                </td>
                                <td
                                  className={`num sticky sticky-direct ${getCellSelectionClass(variantRowKey, 'A:직접판매')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'A:직접판매',
                                      colLabel: '직접판매',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="A:직접판매"
                                  data-row-label={variantRowLabel}
                                  data-col-label="직접판매"
                                >
                                  {g.missing ? '—' : fmtNumber(v.qty)}
                                </td>
                                {g.variantMappingQtyByColumn[idx].map((q, cellIdx) => {
                                  const state = g.variantMappingStateByColumn[idx]?.[cellIdx] ?? 'unmapped'
                                  const colKey = `B:${U_COLUMNS[cellIdx]?.uProduct ?? ''}-${U_COLUMNS[cellIdx]?.uVariant ?? cellIdx}`
                                  const colLabel = `U상품 ${U_COLUMNS[cellIdx]?.uProduct ?? ''} ${U_COLUMNS[cellIdx]?.uVariant ?? ''}`.trim()
                                  const targetLVariant = suffix || null
                                  return (
                                    <td
                                      key={`${g.product_code}-${v.variant_code}-map-${cellIdx}`}
                                      className={`num ${uColumnClass(cellIdx)} ${columnCellClass(state)} ${getCellSelectionClass(variantRowKey, colKey)}`}
                                      onClick={() =>
                                        handleCellSelect({
                                          rowKey: variantRowKey,
                                          rowLabel: variantRowLabel,
                                          colKey,
                                          colLabel,
                                        })
                                      }
                                      onDoubleClick={() =>
                                        requestLuCellToggle(
                                          {
                                            uProduct: U_COLUMNS[cellIdx]?.uProduct ?? '',
                                            uVariant: U_COLUMNS[cellIdx]?.uVariant ?? '',
                                            lProduct: g.product_code,
                                            lVariant: targetLVariant,
                                            lVariantIndex: idx,
                                            hasLVariants: !!g.is_multi || g.variants.length > 1,
                                          },
                                            {
                                              uLabel: `${U_COLUMNS[cellIdx]?.uProduct ?? ''} / ${U_COLUMNS[cellIdx]?.uVariant ?? ''}`,
                                              uProductName: U_COLUMNS[cellIdx]?.blockLabel ?? '',
                                              lLabel: `${g.product_code} / ${suffix || '-'}`,
                                              lProductName: g.product_name,
                                              lPriceLabel: fmtVariantPrice(v.price, g.price, currency),
                                              qty: q > 0 ? q : (uDirectQtyByColumn[cellIdx]?.qty ?? 0),
                                              price: g.variantMappingPriceByColumn[idx]?.[cellIdx] ?? 0,
                                            },
                                        )
                                      }
                                      data-row-key={variantRowKey}
                                      data-col-key={colKey}
                                      data-row-label={variantRowLabel}
                                      data-col-label={colLabel}
                                    >
                                      {state !== 'excluded' && !(state === 'unmapped' && q === 0)
                                        ? fmtNumber(q)
                                        : ''}
                                    </td>
                                  )
                                })}
                                <td
                                  className={`num sticky sticky-total ${getCellSelectionClass(variantRowKey, 'C:총판매')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'C:총판매',
                                      colLabel: '총판매',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="C:총판매"
                                  data-row-label={variantRowLabel}
                                  data-col-label="총판매"
                                >
                                  {g.missing ? '—' : fmtNumber(totalQty)}
                                </td>
                                <td
                                  className={`num sticky sticky-rev ${getCellSelectionClass(variantRowKey, 'C:매출')}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey: variantRowKey,
                                      rowLabel: variantRowLabel,
                                      colKey: 'C:매출',
                                      colLabel: '매출',
                                    })
                                  }
                                  data-row-key={variantRowKey}
                                  data-col-key="C:매출"
                                  data-row-label={variantRowLabel}
                                  data-col-label="매출"
                                >
                                  {g.missing ? '—' : fmtCurrency(totalRev, currency)}
                                </td>
                              </tr>
                            )
                          } ) : null}
                      </Fragment>
                    )
                    })}
                 {grp.withSubtotal === false ? null : (
                       <tr className="subtotal-row">
                        <td
                          className={`subtotal-label sticky sticky-code ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:상품코드')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:상품코드',
                              colLabel: '상품코드',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:상품코드"
                          data-row-label={grp.label}
                          data-col-label="상품코드"
                        >
                          {grp.label}
                        </td>
                        <td
                          className={`sticky sticky-name ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:상품명')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:상품명',
                              colLabel: '상품명',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:상품명"
                          data-row-label={grp.label}
                          data-col-label="상품명"
                        />
                        <td
                          className={`sticky sticky-option-code ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:코드')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:코드',
                              colLabel: '코드',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:코드"
                          data-row-label={grp.label}
                          data-col-label="코드"
                        />
                        <td
                          className={`sticky sticky-option-name ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:옵션명')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:옵션명',
                              colLabel: '옵션명',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:옵션명"
                          data-row-label={grp.label}
                          data-col-label="옵션명"
                        />
                        <td
                          className={`num sticky sticky-price ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:단가')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:단가',
                              colLabel: '단가',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:단가"
                          data-row-label={grp.label}
                          data-col-label="단가"
                        />
                        <td
                          className={`num sticky sticky-direct ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:직접판매')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'A:직접판매',
                              colLabel: '직접판매',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="A:직접판매"
                          data-row-label={grp.label}
                          data-col-label="직접판매"
                        >
                          {fmtNumber(grp.subtotalDirectQty)}
                        </td>
                        {grp.subtotalMappingQtyByColumn.map((q, idx) => (
                          <td
                            key={`subtotal-${grp.label}-${idx}`}
                            className={`num ${uColumnClass(idx)} ${getCellSelectionClass(`subtotal:${grp.label}`, `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
                            onClick={() =>
                              handleCellSelect({
                                rowKey: `subtotal:${grp.label}`,
                                rowLabel: grp.label,
                                colKey: `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                                colLabel: `U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim(),
                              })
                            }
                            data-row-key={`subtotal:${grp.label}`}
                            data-col-key={`B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`}
                            data-row-label={grp.label}
                            data-col-label={`U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim()}
                          >
                            {fmtNumber(q)}
                          </td>
                        ))}
                        <td
                          className={`num sticky sticky-total ${getCellSelectionClass(`subtotal:${grp.label}`, 'C:총판매')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'C:총판매',
                              colLabel: '총판매',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="C:총판매"
                          data-row-label={grp.label}
                          data-col-label="총판매"
                        >
                          {fmtNumber(grp.subtotalQty)}
                        </td>
                        <td
                          className={`num sticky sticky-rev ${getCellSelectionClass(`subtotal:${grp.label}`, 'C:매출')}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: `subtotal:${grp.label}`,
                              rowLabel: grp.label,
                              colKey: 'C:매출',
                              colLabel: '매출',
                            })
                          }
                          data-row-key={`subtotal:${grp.label}`}
                          data-col-key="C:매출"
                          data-row-label={grp.label}
                          data-col-label="매출"
                        >
                          {fmtCurrency(grp.subtotalRev, currency)}
                        </td>
                      </tr>
                    )}
                    {grp.label === '500g 총합계' || grp.label === '1kg 총합계' ? (
                      <tr className="section-separator-row">
                        <td colSpan={totalColumnCount} className="section-separator-cell" />
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                    <tr>
                      <td
                        className={`subtotal-label sticky sticky-code ${getCellSelectionClass('total:grand', 'A:상품코드')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:상품코드',
                            colLabel: '상품코드',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:상품코드"
                        data-row-label="합계"
                        data-col-label="상품코드"
                      >
                        합계
                      </td>
                      <td
                        className={`sticky sticky-name ${getCellSelectionClass('total:grand', 'A:상품명')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:상품명',
                            colLabel: '상품명',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:상품명"
                        data-row-label="합계"
                        data-col-label="상품명"
                      />
                      <td
                        className={`sticky sticky-option-code ${getCellSelectionClass('total:grand', 'A:코드')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:코드',
                            colLabel: '코드',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:코드"
                        data-row-label="합계"
                        data-col-label="코드"
                      />
                      <td
                        className={`sticky sticky-option-name ${getCellSelectionClass('total:grand', 'A:옵션명')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:옵션명',
                            colLabel: '옵션명',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:옵션명"
                        data-row-label="합계"
                        data-col-label="옵션명"
                      />
                      <td
                        className={`num sticky sticky-price ${getCellSelectionClass('total:grand', 'A:단가')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:단가',
                            colLabel: '단가',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:단가"
                        data-row-label="합계"
                        data-col-label="단가"
                      />
                      <td
                        className={`num sticky sticky-direct ${getCellSelectionClass('total:grand', 'A:직접판매')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'A:직접판매',
                            colLabel: '직접판매',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="A:직접판매"
                        data-row-label="합계"
                        data-col-label="직접판매"
                      >
                        {fmtNumber(totalDirectQty)}
                      </td>
                      {totalMappingQtyByColumn.map((q, idx) => (
                        <td
                          key={`total-${idx}`}
                          className={`num ${uColumnClass(idx)} ${getCellSelectionClass('total:grand', `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
                          onClick={() =>
                            handleCellSelect({
                              rowKey: 'total:grand',
                              rowLabel: '합계',
                              colKey: `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                              colLabel: `U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim(),
                            })
                          }
                          data-row-key="total:grand"
                          data-col-key={`B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`}
                          data-row-label="합계"
                          data-col-label={`U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim()}
                        >
                          {fmtNumber(q)}
                        </td>
                      ))}
                      <td
                        className={`num sticky sticky-total ${getCellSelectionClass('total:grand', 'C:총판매')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'C:총판매',
                            colLabel: '총판매',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="C:총판매"
                        data-row-label="합계"
                        data-col-label="총판매"
                      >
                        {fmtNumber(totalQty)}
                      </td>
                      <td
                        className={`num sticky sticky-rev ${getCellSelectionClass('total:grand', 'C:매출')}`}
                        onClick={() =>
                          handleCellSelect({
                            rowKey: 'total:grand',
                            rowLabel: '합계',
                            colKey: 'C:매출',
                            colLabel: '매출',
                          })
                        }
                        data-row-key="total:grand"
                        data-col-key="C:매출"
                        data-row-label="합계"
                        data-col-label="매출"
                      >
                        {fmtCurrency(totalRev, currency)}
                      </td>
                    </tr>
                  </tfoot>
            </table>
          </div>
        </div>
      )}

      {pendingLuAction ? (
        <div className="lu-confirm-backdrop" role="presentation">
          <div
            className="lu-confirm-dialog"
            style={{
              transform: luDialogPosition
                ? `translate(${luDialogPosition.x}px, ${luDialogPosition.y}px)`
                : undefined,
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="lu-confirm-title"
          >
            <div
              className="lu-confirm-drag-handle"
              onPointerDown={startLuDialogDrag}
              onPointerMove={moveLuDialog}
              onPointerUp={stopLuDialogDrag}
              onPointerCancel={stopLuDialogDrag}
            >
              <h2 id="lu-confirm-title">{pendingLuAction.title}</h2>
            </div>
            <p className="lu-confirm-desc">{pendingLuAction.description}</p>
            <dl className="lu-confirm-details">
              <div className="lu-confirm-product-block">
                <dt>U상품/옵션</dt>
                <dd>
                  <span className="lu-confirm-code">{pendingLuAction.uLabel}</span>
                  <span className="lu-confirm-name">{pendingLuAction.uProductName || '-'}</span>
                  <span className="lu-confirm-price">단가 {pendingLuAction.price > 0 ? fmtCurrency(pendingLuAction.price, currency) : '단가미확인'}</span>
                </dd>
              </div>
              <div className="lu-confirm-product-block">
                <dt>L상품/옵션</dt>
                <dd>
                  <span className="lu-confirm-code">{pendingLuAction.lLabel}</span>
                  <span className="lu-confirm-name">{pendingLuAction.lProductName || '-'}</span>
                  <span className="lu-confirm-price">단가 {pendingLuAction.lPriceLabel || '단가미확인'}</span>
                </dd>
              </div>
              <div>
                <dt>반영 수량</dt>
                <dd>{fmtNumber(pendingLuAction.qty)}</dd>
              </div>
              <div>
                <dt>예상 매출 반영</dt>
                <dd className="lu-confirm-formula">
                  {pendingLuAction.price > 0
                    ? `${fmtCurrency(pendingLuAction.revenueImpact, currency)} = U상품/옵션 단가 (${fmtCurrency(
                        pendingLuAction.price,
                        currency,
                      )}) x 반영수량(${fmtNumber(pendingLuAction.qty)})`
                    : '단가미확인'}
                </dd>
              </div>
            </dl>
            <div className="lu-confirm-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setPendingLuAction(null)}
              >
                취소
              </button>
              <button
                type="button"
                className={`btn ${pendingLuAction.actionTone === 'danger' ? 'btn-danger' : 'btn-primary'}`}
                onClick={confirmPendingLuAction}
              >
                {pendingLuAction.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <VersionFooter />
    </div>
  )
}
