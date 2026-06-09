import { Fragment, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DateFilter } from '@/features/sales-report/components/DateFilter'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { useReport } from '@/features/sales-report/hooks/useReport'
import { useSettings } from '@/features/sales-report/hooks/useSettings'
import type { Variant } from '@/features/sales-report/types'
import { fmtCurrency, fmtNumber, fmtParentPrice, fmtVariantPrice } from '@/shared/lib/format'
import '@/features/sales-report/SalesReportView.css'
import './ExcelOrderView.css'

type CellState = 'mapped' | 'unmapped' | 'excluded'

interface Row {
  product_code: string
  product_name: string
  price: number
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
  mappingStateByColumn: CellState[]
  variantMappingQtyByColumn: number[][]
  variantMappingRevByColumn: number[][]
  variantMappingStateByColumn: CellState[][]
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
}

interface MappingRule {
  uProduct: string
  uVariant: string
  lProduct: string
  lVariant?: string
  ratio: number
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
  ]),
]

const U_BLOCKS: UBlock[] = [
  {
    productCode: 'P00000QE',
    productLabel: '하드왁스500g 24개',
    variants: ['G', 'H', 'I', 'J', 'K'],
  },
  {
    productCode: 'P00000QD',
    productLabel: '하드왁스15개',
    variants: ['CI', 'CJ', 'CK', 'CL', 'CM', 'CN', 'CO', 'CP', 'CQ', 'CR', 'CS', 'CT', 'CU'],
  },
  {
    productCode: 'P0000BLR',
    productLabel: '비즈 왁스 4종',
    variants: ['Q', 'R', 'S', 'T', 'U', 'V', 'W'],
  },
  {
    productCode: 'P0000BLA',
    productLabel: '비즈 왁스 4종',
    variants: ['J', 'K', 'L', 'M', 'N', 'O', 'P'],
  },
  {
    productCode: 'P00000ZC',
    productLabel: '컵비즈 110g 5개 이상 10%',
    variants: ['A', 'B', 'C', 'D'],
  },
  {
    productCode: 'P00000YZ',
    productLabel: '컵비즈 비즈 세트',
    variants: ['D', 'E', 'H', 'I'],
  },
  {
    productCode: 'P00000VM',
    productLabel: '[묶음할인15%] 하드왁스1kg 5개이상',
    variants: ['CW', 'CX', 'CY', 'CZ', 'DA', 'DB', 'DC', 'DD', 'DE', 'DF', 'DG', 'DH'],
  },
  { productCode: 'P00000YS', productLabel: '제모미인 스타터키트20%', variants: ['A'] },
  {
    productCode: 'P00000YU',
    productLabel: '라이콘 바디왁싱 스타터 키트20%할인',
    variants: ['B'],
  },
]

const U_COLUMNS = U_BLOCKS.flatMap((block) =>
  block.variants.map((variant) => ({
    uProduct: block.productCode,
    uVariant: variant,
    blockLabel: block.productLabel,
    blockCode: block.productCode,
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
  const key = `${rule.uProduct}${COLUMN_KEY_DELIM}${rule.uVariant}`
  const existing = RULE_BY_KEY.get(key)
  if (existing) {
    existing.push(rule)
    continue
  }
  RULE_BY_KEY.set(key, [rule])
}
for (const col of U_COLUMNS) {
  const key = `${col.uProduct}${COLUMN_KEY_DELIM}${col.uVariant}`
  const nextIndex = (uVariantIndexes.get(col.uProduct) ?? 0) + 1
  U_VARIANT_INDEX_BY_KEY.set(key, nextIndex - 1)
  uVariantIndexes.set(col.uProduct, nextIndex)
}
const BLOCK_BY_CODE = new Map(U_BLOCKS.map((b) => [b.productCode, b.productLabel]))

function normalizeVariantSuffix(productCode: string, variantCode: string) {
  if (!variantCode) return ''
  const raw = variantCode.startsWith(productCode)
    ? variantCode.slice(productCode.length)
    : variantCode
  return raw.replace(/^0+/, '') || raw
}

function columnCellState(uProduct: string, qty: number): CellState {
  if (EXCLUDED_U_PRODUCTS.has(uProduct)) return 'excluded'
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
    if (hasLVariants && targetLVariantIndex >= 0 && ruleUVariantIndex === targetLVariantIndex) {
      totalQty += qty * rule.ratio
      totalRev += qty * price * rule.ratio
    }
  })

  return { qty: totalQty, rev: totalRev }
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
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)

  const handleCellSelect = (meta: CellSelectionMeta) => {
    setSelectedCell((prev) =>
      prev && prev.rowKey === meta.rowKey && prev.colKey === meta.colKey ? null : meta,
    )
  }

  const clearSelection = () => setSelectedCell(null)

  const getCellSelectionClass = (rowKey: string, colKey: string) => {
    if (!selectedCell) return ''
    if (selectedCell.rowKey === rowKey && selectedCell.colKey === colKey) return 'excel-cell-selected'
    if (selectedCell.rowKey === rowKey) return 'excel-row-selected'
    if (selectedCell.colKey === colKey) return 'excel-col-selected'
    return ''
  }

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
    const byCode = new Map(allGroups.map((g) => [g.product_code, g]))

    return U_COLUMNS.map((col) => {
      const uGroup = byCode.get(col.uProduct)
      if (!uGroup) return { qty: 0, excluded: false }

      const variant = uGroup.variants.find((v: Variant) => {
        const suffix = normalizeVariantSuffix(col.uProduct, v.variant_code).toUpperCase()
        return suffix === col.uVariant
      })

      return { qty: variant?.qty ?? 0, excluded: false }
    })
  }, [allGroups])

  const groupRows = useMemo<GroupRows[]>(() => {
    const byCode = new Map(allGroups.map((g) => [g.product_code, g]))
    const buildRow = (code: string): Row => {
      const g = byCode.get(code)
      const variants = g?.variants ?? []
      const hasLVariants = g ? !!g.is_multi || variants.length > 1 : variants.length > 1
      const hasVariantRows = variants.length > 0
      const directQty = hasVariantRows ? (variants[0]?.qty ?? 0) : g?.qty ?? 0
      const directRev = hasVariantRows ? (variants[0]?.rev ?? 0) : g?.rev ?? 0
      const mappingQtyByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingRevByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingStateByColumn = Array(U_COLUMNS.length).fill('unmapped' as CellState)
      const variantMappingQtyByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingRevByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingStateByColumn = variants.map(() =>
        Array(U_COLUMNS.length).fill('unmapped' as CellState),
      )

      U_COLUMNS.forEach((col, idx) => {
        const key = `${col.uProduct}${COLUMN_KEY_DELIM}${col.uVariant}`
        const rule = RULE_BY_KEY.get(key)
        const ruleUVariantIndex = U_VARIANT_INDEX_BY_KEY.get(key) ?? null

        const uGroup = byCode.get(col.uProduct)
        let uQty = 0
        let uPrice = 0
        if (uGroup && !EXCLUDED_U_PRODUCTS.has(col.uProduct)) {
          const targetVariant = uGroup.variants.find((v: Variant) => {
            const suffix = normalizeVariantSuffix(col.uProduct, v.variant_code).toUpperCase()
            return suffix === col.uVariant
          })
          uQty = targetVariant?.qty ?? 0
          uPrice = targetVariant?.price ?? 0
        }

        const { qty, rev } = rule
          ? getRuleMatchQty(
              rule,
              code,
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
        mappingStateByColumn[idx] = columnCellState(col.uProduct, qty)

        variants.forEach((v, vIdx) => {
          const targetLVariant = normalizeVariantSuffix(code, v.variant_code).toUpperCase()
          const targetLVariantIndex = vIdx
          const { qty: variantQty, rev: variantRev } = rule
            ? getRuleMatchQty(
                rule,
                code,
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
          variantMappingStateByColumn[vIdx][idx] = columnCellState(
            col.uProduct,
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
        const directRev = variant.rev ?? 0
        const mappedRev = variantMappingRevByColumn[variantIdx]?.reduce((s, q) => s + q, 0) ?? 0
        return variantSum + directRev + mappedRev
      }, 0)
      const directQtyForSummary = variants.reduce((sum, variant) => sum + (variant.qty ?? 0), 0)
      const directQtyFallback = g ? (hasVariantRows ? directQtyForSummary : (g.qty ?? 0)) : 0
      // 부모행은 부모 직접판매 + 부모 매핑/대표옵션 매핑 값만 반영한다.
      const subtotalQty = directQty + mappingQtyByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedQty
      const subtotalRev = directRev + mappingRevByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedRev
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
          mappingQtyByColumn,
          mappingRevByColumn,
          mappingStateByColumn,
          variantMappingQtyByColumn,
          variantMappingRevByColumn,
          variantMappingStateByColumn,
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
        mappingQtyByColumn,
        mappingRevByColumn,
        mappingStateByColumn,
        variantMappingQtyByColumn: [],
        variantMappingRevByColumn: [],
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
  }, [allGroups])

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
  const totalMappingQtyByColumn = Array.from({ length: U_COLUMNS.length }, (_, idx) =>
    groupRows.reduce(
      (s, g) => s + (g.withSubtotal === false ? 0 : (g.subtotalMappingQtyByColumn[idx] ?? 0)),
      0,
    ),
  )

  const rowCoordinates = useMemo(() => {
    const map = new Map<string, number>()
    let rowIndex = 1

    map.set('hardwax-u-direct', rowIndex++)

    groupRows.forEach((grp) => {
      grp.rows.forEach((row) => {
        const parentKey = `parent:${grp.label}:${row.product_code}`
        map.set(parentKey, rowIndex++)
        if (row.variants.length > 1) {
          row.variants.slice(1).forEach((variant) => {
            const variantKey = `variant:${row.product_code}:${variant.variant_code}`
            map.set(variantKey, rowIndex++)
          })
        }
      })
      if (grp.withSubtotal !== false) {
        map.set(`subtotal:${grp.label}`, rowIndex++)
      }
    })

    map.set('total:grand', rowIndex++)

    return map
  }, [groupRows])

  const colCoordinates = useMemo(() => {
    const map = new Map<string, number>()
    let colIndex = 1
    const aKeys: string[] = ['A:상품코드', 'A:상품명', 'A:코드', 'A:옵션명', 'A:단가', 'A:직접판매']
    const cKeys: string[] = ['C:총판매', 'C:매출']

    aKeys.forEach((key) => map.set(key, colIndex++))
    U_COLUMNS.forEach((col) => map.set(`B:${col.uProduct}-${col.uVariant}`, colIndex++))
    cKeys.forEach((key) => map.set(key, colIndex++))

    return map
  }, [])

  const selectedCoordinateText = useMemo(() => {
    if (!selectedCell) return null
    const rowNo = rowCoordinates.get(selectedCell.rowKey)
    const colNo = colCoordinates.get(selectedCell.colKey)
    if (rowNo == null || colNo == null) return null
    return `R${rowNo}/C${colNo}`
  }, [selectedCell, colCoordinates, rowCoordinates])

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

  const handleCopySelection = async () => {
    if (!selectedCoordinateText) return
    try {
      await navigator.clipboard.writeText(selectedCoordinateText)
      setCopyToast('복사됨')
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
      <header className="excel-header">
        <a href="#" className="home-link">
          ← 홈
        </a>
        <h1>하드왁스</h1>
      </header>

      <div className="filters card">
        <div className="filter-row">
          <DateFilter
            start={start}
            end={end}
            onStartChange={handleStartChange}
            onEndChange={setEnd}
            endMin={start}
          />
          <div className="filter-spacer" />
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleRun}
            disabled={isRunning}
          >
            {isRunning ? '조회 중…' : '조회'}
          </button>
        </div>
      </div>

      {state.status === 'error' && <div className="error-box">{state.error}</div>}

      {dataReady && (
        <div className="excel-section card">
          <div className="excel-cat-label">
            <span className="excel-period">
              {state.data!.start} ~ {state.data!.end}
            </span>
            <span className="lu-legend">
              <span className="lu-pill lu-pill--confirmed">매핑(확정)</span>
              <span className="lu-pill lu-pill--unmapped">매핑(미정의)</span>
              <span className="lu-pill lu-pill--excluded">매핑(예외)</span>
            </span>
          </div>
          <div className="excel-selection-indicator">
            {selectedCell ? (
              <span
                className="selection-coordinates selection-copy-trigger"
                role="button"
                tabIndex={0}
                title="좌표 복사"
                onClick={handleCopySelection}
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
                {copyToast ? <span className="selection-copy-toast">{copyToast}</span> : null}
              </span>
            ) : (
              <span className="selection-empty">
                <span className="selection-pin">📍</span>
                <span>선택 없음</span>
              </span>
            )}
          </div>
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
          <div className="excel-table-wrap" ref={tableWrapRef} onScroll={handleBottomScroll}>
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
                    <th key={block.productCode} colSpan={block.variants.length} className="u-header">
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
                  {U_COLUMNS.map((col) => {
                    const block = BLOCK_BY_CODE.get(col.uProduct) ?? ''
                    return (
                      <th
                        key={`${col.uProduct}${COLUMN_KEY_DELIM}${col.uVariant}`}
                        className="matrix-variant"
                        title={`${col.uProduct} / ${col.uVariant}${block ? ` (${block})` : ''}`}
                      >
                        {col.uVariant}
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
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
                      className={`num ${getCellSelectionClass(
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
                            return (g.variantMappingQtyByColumn[0]?.[idx] ?? 0) > 0 ? 'mapped' : state
                          })
                        : g.mappingStateByColumn
                        return (
                       <Fragment key={gid}>
                         <tr
                           className={`${g.missing ? 'row-missing' : ''} ${hasVariantRows ? 'row-parent' : 'row-single'}`.trim()}
                          >
                           <td
                             className={`code-cell sticky sticky-code ${getCellSelectionClass(rowKey, 'A:상품코드')}`}
                             onClick={() =>
                               handleCellSelect({
                                 rowKey,
                                 rowLabel,
                                 colKey: 'A:상품코드',
                                 colLabel: '상품코드',
                               })
                             }
                             data-row-key={rowKey}
                             data-col-key="A:상품코드"
                             data-row-label={rowLabel}
                             data-col-label="상품코드"
                           >
                             {g.product_code}
                           </td>
                           <td
                             className={`name-cell sticky sticky-name ${getCellSelectionClass(rowKey, 'A:상품명')}`}
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
                              return (
                                <td
                                  key={`${g.product_code}-${idx}`}
                                  className={`${columnCellClass(state)} ${getCellSelectionClass(rowKey, colKey)}`}
                                  onClick={() =>
                                    handleCellSelect({
                                      rowKey,
                                      rowLabel,
                                      colKey,
                                      colLabel,
                                    })
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
                            const totalRev = (v.rev ?? 0) + variantMapRev.reduce((s, r) => s + r, 0)
                            const variantRowKey = `variant:${g.product_code}:${v.variant_code}`
                            const variantRowLabel = `${rowHeaderLabelByCode(g.product_code, g.product_name)} / ${displayOptionName(v.option || v.variant_code)}`
                            return (
                              <tr
                                key={`${g.product_code}-${v.variant_code}`}
                                className="row-child variant-row"
                              >
                                <td
                                  className={`code-cell sticky sticky-code variant-code-cell ${getCellSelectionClass(variantRowKey, 'A:상품코드')}`}
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
                                  className={`name-cell sticky sticky-name variant-name-cell ${getCellSelectionClass(variantRowKey, 'A:상품명')}`}
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
                                  return (
                                    <td
                                      key={`${g.product_code}-${v.variant_code}-map-${cellIdx}`}
                                      className={`${columnCellClass(state)} ${getCellSelectionClass(variantRowKey, colKey)}`}
                                      onClick={() =>
                                        handleCellSelect({
                                          rowKey: variantRowKey,
                                          rowLabel: variantRowLabel,
                                          colKey,
                                          colLabel,
                                        })
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
                            className={`num ${getCellSelectionClass(`subtotal:${grp.label}`, `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
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
                          className={`num ${getCellSelectionClass('total:grand', `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
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

      <VersionFooter />
    </div>
  )
}
