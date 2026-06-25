import { Fragment, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type UIEvent, useEffect, useMemo, useRef, useState } from 'react'
import { DateFilter } from '@/features/sales-report/components/DateFilter'
import { VersionFooter } from '@/features/sales-report/components/VersionFooter'
import { useReport } from '@/features/sales-report/hooks/useReport'
import { useSettings } from '@/features/sales-report/hooks/useSettings'
import type { Variant } from '@/features/sales-report/types'
import { fmtCurrency, fmtNumber, fmtParentPrice, fmtVariantPrice } from '@/shared/lib/format'
import '@/features/sales-report/SalesReportView.css'
import './ProductCodesView.css'

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
  quantity: number
  unitPrice: number
  priceMissing?: boolean
  priceRef?: RevenueUnitPriceRef
}
type RevenueFormulaBuildResult = {
  terms: RevenueFormulaTerm[]
  warnings: string[]
}
type FormulaBuildResult = {
  display: string
  excel: string
  explanation: FormulaExplanation
}
type FormulaExplanationTerm = {
  kind: 'direct-sales' | 'conversion' | 'set-component' | 'sum' | 'total-quantity'
  label: string
  detail: string
  sourceEntity?: FormulaTermEntity
  targetEntity?: FormulaTermEntity
  refs?: string
  quantity?: number
  unitPrice?: number
  amount?: number
}
type FormulaTermEntity = {
  role: string
  productCode: string
  productName: string
  optionCode?: string
  optionName: string
}
type FormulaExplanation = {
  title: string
  summary: string
  terms: FormulaExplanationTerm[]
  sourceFormula: string
  targetEntity?: FormulaTermEntity
}
type RevenueUnitPriceRef = {
  kind: 'mapped' | 'set-component'
  refName: string
  displayToken: string
  title: string
  sourceProductCode: string
  sourceOptionCode: string
  sourceProductName: string
  sourceOptionName: string
  targetProductCode: string
  targetOptionCode: string
  targetProductName: string
  targetOptionName: string
  unitPrice: number
}
type SetComponentPriceRef = RevenueUnitPriceRef & {
  kind: 'set-component'
  setProductCode: string
  setOptionCode: string
  componentProductCode: string
  componentOptionCode: string
  componentQty: number
  componentSetPrice: number
}
type RevenueUnitPriceReferenceRow = {
  ref: RevenueUnitPriceRef
  sourceType: string
  quantity: number | null
  amount: number
}

type ReadStatus = 'loaded' | 'missing' | 'fallback' | 'partial' | 'calculated'
type ReadSource = 'cafe24' | 'set-design' | 'local-rule' | 'calculated'
type ProductCodesViewMode = 'detail' | 'wide' | 'focus'
type SetEditorLayout = {
  x: number
  y: number
  width: number
  height: number
}

type SetEditorDragState =
  | {
    mode: 'move'
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    width: number
    height: number
  }
  | {
    mode: 'resize'
    pointerId: number
    startX: number
    startY: number
    originX: number
    originY: number
    originWidth: number
    originHeight: number
  }

type ReadMeta = {
  status: ReadStatus
  source: ReadSource
  note?: string
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
  directQtyMissing: boolean
  directQtyMeta: ReadMeta
  revenueMissing: boolean
  revenueMeta: ReadMeta
  totalPartial: boolean
  totalMeta: ReadMeta
  variantDirectQtyMissing: boolean[]
  variantRevenueMissing: boolean[]
  variantTotalPartial: boolean[]
  variantDirectQtyMeta: ReadMeta[]
  variantRevenueMeta: ReadMeta[]
  variantTotalMeta: ReadMeta[]
  mappingQtyByColumn: number[]
  mappingRevByColumn: number[]
  mappingPriceByColumn: number[]
  mappingPriceRefByColumn: Array<RevenueUnitPriceRef | null>
  mappingPriceIsFoundByColumn: boolean[]
  mappingStateByColumn: CellState[]
  mappingHasRuleByColumn: boolean[]
  variantMappingQtyByColumn: number[][]
  variantMappingRevByColumn: number[][]
  variantMappingPriceByColumn: number[][]
  variantMappingPriceRefByColumn: Array<Array<RevenueUnitPriceRef | null>>
  variantMappingPriceIsFoundByColumn: boolean[][]
  variantMappingStateByColumn: CellState[][]
  variantMappingHasRuleByColumn: boolean[][]
  variants: Variant[]
}

interface GroupRows {
  category: string
  label: string
  withSubtotal: boolean
  rows: Row[]
  subtotalQty: number
  subtotalRev: number
  subtotalDirectQty: number
  subtotalHasMissing: boolean
  subtotalRevHasMissing: boolean
  subtotalMappingHasMissingByColumn: boolean[]
  subtotalMappingQtyByColumn: number[]
  subtotalMappingRevByColumn: number[]
}

type CellSelectionMeta = {
  rowKey: string
  rowLabel: string
  colKey: string
  colLabel: string
  formula?: string
  excelFormula?: string
  formulaWarnings?: string[]
  screenRow?: number
  screenCol?: number
  excelRow?: number
  excelCol?: number
}

type PinnedCross = {
  rowKey: string
  rowLabel: string
  colKey: string
  colLabel: string
  coordinate: string
  palette: number
}

type FormulaDisplayPart = {
  text: string
  kind: 'plain' | 'price' | 'set-price'
  title?: string
}

type RowType = 'uDirect' | 'category' | 'product' | 'variant' | 'subtotal' | 'total'
type RowFormulaMeta = {
  key: string
  rowType: RowType
  groupLabel: string
  product_code?: string
  product_name?: string
  variant_code?: string
  option_name?: string
  unit_price?: number
  screenRow: number
  excelRow: number
  revenueDirectQty?: number
  revenueMissing?: boolean
  revenueMappedTerms?: RevenueFormulaTerm[]
  revenueMappedPriceWarnings?: string[]
  totalPartial?: boolean
  contributorRowKeys?: string[]
}

type ColFormulaMeta = {
  key: string
  screenCol: number
  excelCol: number
}

const categoryRowKey = (category: string) => `category:${category}`

type LGroup = {
  category: string
  label: string
  codes: string[]
  withSubtotal?: boolean
}

type LVariantDisplaySpec = {
  code: string
  option: string
  price?: number
}

type LProductDisplaySpec = {
  name: string
  variants: LVariantDisplaySpec[]
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

type SetComponentScope = 'common' | 'option'

type SetProductComponent = {
  id: string
  scope: SetComponentScope
  productCode: string
  optionCode: string
  qty: number
  setPrice: number
}

type SetProductVariantConfig = {
  variantCode: string
  optionName: string
  components: SetProductComponent[]
}

type SetProductConfig = {
  productCode: string
  productName: string
  variants: SetProductVariantConfig[]
  commonComponents?: SetProductComponent[]
}

type SetProductComponentDraft = {
  id?: string
  scope?: SetComponentScope
  productCode: string
  optionCode: string
  qty: number
  setPrice: number
  deleted?: boolean
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
    category: '하드왁스',
    label: '500g',
    codes: [
      'P00000HT', 'P00000BV', 'P00000CB', 'P00000BX',
      'P00000XE', 'P0000BIF', 'P0000BLD', 'P0000BMJ', 'P0000BMI',
      'P00000ZB',
    ],
  },
  {
    category: '하드왁스',
    label: '1kg',
    codes: [
      'P00000UH', 'P00000TI', 'P00000BY', 'P00000BZ',
      'P00000CH', 'P00000CG', 'P00000CA', 'P00000BW', 'P00000CI',
      'P00000CE', 'P00000KH', 'P00000CD', 'P00000CF',
    ],
  },
  {
    category: '스트립왁스',
    label: '스트립왁스',
    codes: ['P00000CM'],
  },
  {
    category: '전후처리제',
    label: '전후처리제',
    codes: ['P00000BU'],
  },
  {
    category: '슈거스크럽',
    label: '슈거스크럽',
    codes: ['P00000OG'],
  },
  {
    category: '사후관리제품',
    label: '사후관리제품',
    codes: ['P00000BJ'],
  },
  {
    category: '제모미인제품',
    label: '제모미인제품',
    codes: ['P00000XU', 'P00000XW', 'P0000BJC', 'P00000ZA'],
  },
  {
    category: '파우치',
    label: '파우치',
    codes: ['P00000UK'],
  },
  {
    category: '워머기&컵',
    label: '워머기&컵',
    codes: ['P00000VK'],
  },
  {
    category: '소모품',
    label: '소모품',
    codes: ['P00000DD', 'P00000TX', 'P00000DG'],
  },
]

const L_DISPLAY_VARIANTS_BY_CODE: Record<string, LVariantDisplaySpec[]> = {
  P00000ZB: [
    { code: 'A', option: '컵왁스 선택 : 로제트 컵 왁스 비즈 110g', price: 6200 },
    { code: 'B', option: '컵왁스 선택 : 라벤더 컵 왁스 비즈 110g', price: 6200 },
    { code: 'C', option: '컵왁스 선택 : 하이브리드 컵 왁스 비즈 110g', price: 6200 },
    { code: 'D', option: '컵왁스 선택 : 핑키니 컵 왁스 비즈 110g', price: 6200 },
  ],
  P00000OG: [
    { code: 'H', option: '선택=석류스크럽100ml', price: 8400 },
    { code: 'I', option: '선택=자몽스크럽100ml', price: 8400 },
    { code: 'K', option: '선택=라벤더스크럽100ml', price: 8400 },
  ],
  P00000VK: [
    { code: 'C', option: '2구워머기(1000+1000)', price: 195000 },
    { code: 'D', option: '자디니 베이비 히터(220g)', price: 44000 },
    { code: 'M', option: '2구워머기(1000+1000)', price: 204000 },
    { code: 'N', option: '자디니베이비히터(220g)', price: 46200 },
  ],
  P00000TX: [
    { code: 'B', option: '선택=바디스파츌라(박스구매 100개)', price: 170000 },
    { code: 'C', option: '선택=패들팝스파츌라(박스구매 100개)', price: 170000 },
    { code: 'D', option: '선택=페이셜스파츌라(박스구매 100개)', price: 170000 },
    { code: 'F', option: '선택=바디 스파츌러(박스 구매 100개)', price: 170000 },
    { code: 'G', option: '선택=패들팝 스파츌러(박스 구매 100개)', price: 170000 },
    { code: 'H', option: '선택=페이셜 스파츌러(박스 구매 100개)', price: 170000 },
  ],
}

const L_PRODUCT_DISPLAY_BY_CODE: Record<string, LProductDisplaySpec> = {
  P00000ZB: {
    name: '라이콘 컵 왁스 비즈 110g 4종 (로제트 / 라벤더 / 하이브리드 / 핑키니)',
    variants: L_DISPLAY_VARIANTS_BY_CODE.P00000ZB,
  },
  P00000ZA: {
    name: '제모미인 페이스왁싱 스킨클렌져 & 왁싱 프리오일 100mL',
    variants: [
      { code: 'A', option: '선택=왁싱 스킨클렌져 100mL', price: 6600 },
      { code: 'B', option: '선택=왁싱 프리오일 100mL', price: 6600 },
    ],
  },
  P00000VK: {
    name: '라이콘워머기 2구 / 자디니 베이비 히터기 220g',
    variants: L_DISPLAY_VARIANTS_BY_CODE.P00000VK,
  },
  P00000HT: {
    name: '라이코젯아이브로우(Lycojet Eyebrow Hot Wax) 500g',
    variants: [{ code: 'A', option: '-', price: 26300 }],
  },
  P00000XU: {
    name: '자디니 리본 미스트 110ml (모공/인그로운 케어)',
    variants: [{ code: 'A', option: '-', price: 16000 }],
  },
  P00000XW: {
    name: '자디니 시카 마스크 (1박스 5매입 / 50매 번들)',
    variants: [
      { code: 'B', option: '선택=자디니 시카 마스크 1Box(5개입)', price: 10000 },
      { code: 'C', option: '선택=50개 묶음(단상자 미포함)', price: 90000 },
    ],
  },
  P00000TX: {
    name: '스파츌러 박스 구매시(바디, 패들팝, 페이셜) 할인',
    variants: L_DISPLAY_VARIANTS_BY_CODE.P00000TX,
  },
  P00000CH: {
    name: '로즈퓨어 핫왁스 (Rose Pure-Rosette  Hot Wax) 1Kg',
    variants: [{ code: 'A', option: '-', price: 37800 }],
  },
  P00000CM: {
    name: '라이코플렉스 바닐라 스트립(Lycoflex Vanilla Strip Wax) 800ml',
    variants: [{ code: 'A', option: '-', price: 34700 }],
  },
  P00000BU: {
    name: '미니전후처리제 5종세트125ml',
    variants: [{ code: 'A', option: '-', price: 47000 }],
  },
  P00000BJ: {
    name: '인그로운 X-IT 솔루션 125ml',
    variants: [{ code: 'A', option: '-', price: 14700 }],
  },
  P00000DD: {
    name: '라이콘 스트립 부직포 250매',
    variants: [{ code: 'A', option: '-', price: 18000 }],
  },
  P00000DG: {
    name: '라이콘 메탈 스파츌라 (바디용)',
    variants: [{ code: 'H', option: '선택=라이콘', price: 18900 }],
  },
  P00000OG: {
    name: '슈가스크럽 100ml 6종',
    variants: L_DISPLAY_VARIANTS_BY_CODE.P00000OG,
  },
  P0000BJC: {
    name: '자디니 포레스트 센트 바디 워시 200ml',
    variants: [{ code: 'A', option: '-', price: 12000 }],
  },
  P00000UK: {
    name: '화이트브라질리언마스크팩 1박스(10장)',
    variants: [{ code: 'A', option: '-', price: 17500 }],
  },
}

const L_PRODUCT_CHOICES = Object.entries(L_PRODUCT_DISPLAY_BY_CODE).map(([productCode, spec]) => ({
  productCode,
  productName: spec.name,
  variants: spec.variants,
}))

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

const SET_PRODUCT_CONFIGS: SetProductConfig[] = [
  {
    productCode: 'P00000YZ',
    productName: '라이콘 컵 왁스 비즈 110g 세트',
    commonComponents: [
      { id: 'P00000YZ-common-P00000ZA-A', scope: 'common', productCode: 'P00000ZA', optionCode: 'A', qty: 1, setPrice: 4620 },
      { id: 'P00000YZ-common-P00000ZA-B', scope: 'common', productCode: 'P00000ZA', optionCode: 'B', qty: 1, setPrice: 4620 },
      { id: 'P00000YZ-common-P00000VK-N', scope: 'common', productCode: 'P00000VK', optionCode: 'N', qty: 1, setPrice: 30800 },
    ],
    variants: [
      {
        variantCode: 'D',
        optionName: '컵왁스 선택 : 로제트 컵 왁스 비즈 세트 110g',
        components: [
          { id: 'P00000YZ-D-P00000ZB-A', scope: 'option', productCode: 'P00000ZB', optionCode: 'A', qty: 1, setPrice: 4340 },
        ],
      },
      {
        variantCode: 'E',
        optionName: '컵왁스 선택 : 라벤더 컵 왁스 비즈 세트 110g',
        components: [
          { id: 'P00000YZ-E-P00000ZB-B', scope: 'option', productCode: 'P00000ZB', optionCode: 'B', qty: 1, setPrice: 4340 },
        ],
      },
      {
        variantCode: 'H',
        optionName: '컵왁스 선택 : 하이브리드 컵 왁스 비즈 세트 110g',
        components: [
          { id: 'P00000YZ-H-P00000ZB-C', scope: 'option', productCode: 'P00000ZB', optionCode: 'C', qty: 1, setPrice: 5580 },
        ],
      },
      {
        variantCode: 'I',
        optionName: '컵왁스 선택 : 핑키니 컵 왁스 비즈 세트 110g',
        components: [
          { id: 'P00000YZ-I-P00000ZB-D', scope: 'option', productCode: 'P00000ZB', optionCode: 'D', qty: 1, setPrice: 5580 },
        ],
      },
    ],
  },
  {
    productCode: 'P00000YS',
    productName: '제모미인 스타터키트20%',
    variants: [
      {
        variantCode: 'A',
        optionName: '-',
        components: [
          { id: 'P00000YS-A-P00000HT-A', scope: 'option', productCode: 'P00000HT', optionCode: 'A', qty: 1, setPrice: 21040 },
          { id: 'P00000YS-A-P00000ZA-A', scope: 'option', productCode: 'P00000ZA', optionCode: 'A', qty: 1, setPrice: 5300 },
          { id: 'P00000YS-A-P00000ZA-B', scope: 'option', productCode: 'P00000ZA', optionCode: 'B', qty: 1, setPrice: 5300 },
          { id: 'P00000YS-A-P00000XU-A', scope: 'option', productCode: 'P00000XU', optionCode: 'A', qty: 1, setPrice: 12800 },
          { id: 'P00000YS-A-P00000XW-B', scope: 'option', productCode: 'P00000XW', optionCode: 'B', qty: 5, setPrice: 1600 },
          { id: 'P00000YS-A-P00000VK-N', scope: 'option', productCode: 'P00000VK', optionCode: 'N', qty: 1, setPrice: 36920 },
          { id: 'P00000YS-A-P00000TX-D', scope: 'option', productCode: 'P00000TX', optionCode: 'D', qty: 1, setPrice: 2000 },
        ],
      },
    ],
  },
  {
    productCode: 'P00000YU',
    productName: '라이콘 바디왁싱 스타터 키트20%할인',
    variants: [
      {
        variantCode: 'B',
        optionName: '선택 : 라이콘',
        components: [
          { id: 'P00000YU-B-P00000CH-A', scope: 'option', productCode: 'P00000CH', optionCode: 'A', qty: 1, setPrice: 30240 },
          { id: 'P00000YU-B-P00000CM-A', scope: 'option', productCode: 'P00000CM', optionCode: 'A', qty: 1, setPrice: 27760 },
          { id: 'P00000YU-B-P00000BU-A', scope: 'option', productCode: 'P00000BU', optionCode: 'A', qty: 1, setPrice: 37600 },
          { id: 'P00000YU-B-P00000BJ-A', scope: 'option', productCode: 'P00000BJ', optionCode: 'A', qty: 1, setPrice: 11760 },
          { id: 'P00000YU-B-P00000VK-M', scope: 'option', productCode: 'P00000VK', optionCode: 'M', qty: 1, setPrice: 163200 },
          { id: 'P00000YU-B-P00000DD-A', scope: 'option', productCode: 'P00000DD', optionCode: 'A', qty: 1, setPrice: 14400 },
          { id: 'P00000YU-B-P00000TX-H', scope: 'option', productCode: 'P00000TX', optionCode: 'H', qty: 1, setPrice: 2000 },
          { id: 'P00000YU-B-P00000TX-F', scope: 'option', productCode: 'P00000TX', optionCode: 'F', qty: 1, setPrice: 2000 },
          { id: 'P00000YU-B-P00000DG-H', scope: 'option', productCode: 'P00000DG', optionCode: 'H', qty: 1, setPrice: 15120 },
        ],
      },
    ],
  },
  {
    productCode: 'P00000VP',
    productName: '[도매묶음20%] 미니스크럽 10종 세트',
    variants: [
      {
        variantCode: 'B',
        optionName: '선택(향) : (10종)1박스',
        components: [
          { id: 'P00000VP-B-P00000OG-H', scope: 'option', productCode: 'P00000OG', optionCode: 'H', qty: 4, setPrice: 6720 },
          { id: 'P00000VP-B-P00000OG-K', scope: 'option', productCode: 'P00000OG', optionCode: 'K', qty: 4, setPrice: 6720 },
          { id: 'P00000VP-B-P00000OG-I', scope: 'option', productCode: 'P00000OG', optionCode: 'I', qty: 2, setPrice: 6720 },
        ],
      },
    ],
  },
  {
    productCode: 'P00000VA',
    productName: '화이트닝 키트 20% 할인',
    variants: [
      {
        variantCode: 'A',
        optionName: '-',
        components: [
          { id: 'P00000VA-A-P0000BJC-A', scope: 'option', productCode: 'P0000BJC', optionCode: 'A', qty: 10, setPrice: 9600 },
          { id: 'P00000VA-A-P00000UK-A', scope: 'option', productCode: 'P00000UK', optionCode: 'A', qty: 50, setPrice: 1400 },
        ],
      },
    ],
  },
]

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
const DIRECT_EXCEL_COLUMN = 6
const PRICE_EXCEL_COLUMN = 5
const MISSING_DISPLAY = '미'
const MISSING_NOTE = '상품/옵션 존재 기준을 확인할 수 없어 0으로 해석하지 않음.'
const PARTIAL_NOTE = '확인불가 항목 제외 합계'
const PRODUCT_CODES_VIEW_MODE_KEY = 'product-codes:view-mode'
const PRODUCT_CODES_VIEW_MODES: Array<{ value: ProductCodesViewMode; label: string; title: string }> = [
  { value: 'detail', label: '기본', title: '상품코드부터 직접판매까지 기본 폭으로 표시' },
  { value: 'wide', label: '넓게', title: '단가를 숨기고 상품명/옵션명을 줄여 오른쪽 숫자 영역을 넓게 표시' },
  { value: 'focus', label: '더 넓게', title: '상품코드, 코드, 직접판매만 남겨 오른쪽 숫자 영역을 더 넓게 표시' },
]
const SET_EDITOR_MIN_WIDTH = 760
const SET_EDITOR_MIN_HEIGHT = 420
const SET_EDITOR_MARGIN = 12
const SET_EDITOR_COMMON_SECTION_EXPAND_HEIGHT = 220

const loadedMeta: ReadMeta = { status: 'loaded', source: 'cafe24' }
const periodNoSalesMeta: ReadMeta = { status: 'loaded', source: 'set-design' }
const missingMeta: ReadMeta = { status: 'missing', source: 'cafe24', note: MISSING_NOTE }
const partialMeta: ReadMeta = { status: 'partial', source: 'calculated', note: PARTIAL_NOTE }

function isProductCodesViewMode(value: string | null): value is ProductCodesViewMode {
  return value === 'detail' || value === 'wide' || value === 'focus'
}

function readInitialProductCodesViewMode(): ProductCodesViewMode {
  if (typeof window === 'undefined') return 'detail'
  const saved = window.localStorage.getItem(PRODUCT_CODES_VIEW_MODE_KEY)
  return isProductCodesViewMode(saved) ? saved : 'detail'
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function leftColumnWidthsForViewMode(viewMode: ProductCodesViewMode, isCompact: boolean) {
  if (viewMode === 'focus') return [98, 0, 40, 0, 0, 64]
  if (viewMode === 'wide') return isCompact
    ? [98, 150, 40, 110, 0, 64]
    : [98, 220, 40, 160, 0, 64]
  return isCompact
    ? [98, 180, 40, 180, 68, 64]
    : [98, 360, 40, 260, 68, 64]
}

function readStatusClass(meta?: ReadMeta) {
  if (!meta) return ''
  if (meta.status === 'missing') return 'read-cell read-cell--missing'
  if (meta.status === 'partial') return 'read-cell read-cell--partial'
  if (meta.status === 'fallback') return 'read-cell read-cell--fallback'
  return ''
}

function readStatusAttrs(meta?: ReadMeta, exportValue?: string | number) {
  const attrs: Record<string, string | number> = {}
  if (meta?.status && meta.status !== 'loaded' && meta.status !== 'calculated') {
    attrs['data-read-status'] = meta.status
    attrs['data-read-source'] = meta.source
    attrs['data-read-note'] = meta.note ?? ''
    attrs.title = meta.note ?? ''
  }
  if (exportValue != null) {
    attrs['data-export-value'] = exportValue
  }
  return attrs
}

function formatReadNumber(value: number, meta?: ReadMeta) {
  if (meta?.status === 'missing') return MISSING_DISPLAY
  if (meta?.status === 'partial') return `${fmtNumber(value)}*`
  return fmtNumber(value)
}

function formatReadCurrency(value: number, currency: string, meta?: ReadMeta) {
  if (meta?.status === 'missing') return MISSING_DISPLAY
  if (meta?.status === 'partial') return `${fmtCurrency(value, currency)}*`
  return fmtCurrency(value, currency)
}

function parseCurrencyInput(value: string) {
  const digits = value.replace(/[^\d]/g, '')
  return digits ? Number(digits) : 0
}

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

function makeVariantCode(productCode: string, variantCode: string) {
  return `${normalizeProductCode(productCode)}000${normalizeVariantCode(variantCode)}`
}

function buildDisplayVariants(productCode: string, variants: Variant[], parentPrice: number): Variant[] {
  const normalizedProductCode = normalizeProductCode(productCode)
  const displaySpecs = L_PRODUCT_DISPLAY_BY_CODE[normalizedProductCode]?.variants
    ?? L_DISPLAY_VARIANTS_BY_CODE[normalizedProductCode]
  if (!displaySpecs) return variants

  const variantsBySuffix = new Map(
    variants.map((variant) => [
      normalizeVariantSuffix(productCode, variant.variant_code).toUpperCase(),
      variant,
    ]),
  )

  return displaySpecs.map((spec) => {
    const normalizedSpecCode = normalizeVariantCode(spec.code)
    const existing = variantsBySuffix.get(normalizedSpecCode)
    return {
      variant_code: existing?.variant_code ?? makeVariantCode(productCode, normalizedSpecCode),
      option: existing?.option || spec.option,
      qty: existing?.qty ?? 0,
      rev: existing?.rev ?? 0,
      price: existing?.price || spec.price || parentPrice || 0,
    }
  })
}

function buildFallbackGroup(productCode: string) {
  const normalizedProductCode = normalizeProductCode(productCode)
  const spec = L_PRODUCT_DISPLAY_BY_CODE[normalizedProductCode]
  if (!spec) return null
  const variants: Variant[] = spec.variants.map((variant) => ({
    variant_code: makeVariantCode(normalizedProductCode, variant.code),
    option: variant.option,
    qty: 0,
    rev: 0,
    price: variant.price ?? 0,
  }))
  return {
    product_code: normalizedProductCode,
    product_name: spec.name,
    price: variants.length === 1 ? variants[0]?.price ?? 0 : 0,
    is_multi: variants.length > 1,
    qty: 0,
    rev: 0,
    variants,
  }
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

function formatSelectionPrice(price: number | undefined, currency: string) {
  if (!Number.isFinite(price) || (price ?? 0) <= 0) return '-'
  return fmtCurrency(price ?? 0, currency)
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

function setComponentCellState(hasComponent: boolean, qty: number): CellState {
  if (hasComponent) return 'mapped'
  if (!Number.isFinite(qty) || qty <= 0) return 'unmapped'
  return 'mapped'
}

function columnCellClass(state: CellState) {
  if (state === 'mapped') return 'map-cell map-cell--mapped'
  if (state === 'unmapped') return 'map-cell map-cell--unmapped'
  return 'map-cell map-cell--excluded'
}

function displayOptionName(option?: string) {
  return option ? option.replaceAll('=', ' : ') : '-'
}

function getSetConfigByProductCode(productCode: string | null) {
  if (!productCode) return null
  const normalizedCode = normalizeProductCode(productCode)
  return SET_PRODUCT_CONFIGS.find((config) => normalizeProductCode(config.productCode) === normalizedCode) ?? null
}

function makeDefinedNamePart(value: string) {
  const normalized = value.trim().toUpperCase().replace(/[^A-Z0-9_]/g, '_')
  return normalized || 'NONE'
}

function makeSetComponentPriceRefName(
  setProductCode: string,
  setOptionCode: string,
  componentProductCode: string,
  componentOptionCode: string,
) {
  return [
    'SET',
    makeDefinedNamePart(setProductCode),
    makeDefinedNamePart(setOptionCode),
    makeDefinedNamePart(componentProductCode),
    makeDefinedNamePart(componentOptionCode),
    'PRICE',
  ].join('_')
}

function makeMappedUnitPriceRefName(
  sourceProductCode: string,
  sourceOptionCode: string,
  targetProductCode: string,
  targetOptionCode: string,
) {
  return [
    'CONVERSION',
    makeDefinedNamePart(sourceProductCode),
    makeDefinedNamePart(sourceOptionCode),
    makeDefinedNamePart(targetProductCode),
    makeDefinedNamePart(targetOptionCode),
    'PRICE',
  ].join('_')
}

function makeMappedUnitPriceRef(
  sourceProductCode: string,
  sourceOptionCode: string,
  sourceProductName: string,
  sourceOptionName: string | undefined,
  targetProductCode: string,
  targetOptionCode: string,
  unitPrice: number,
): RevenueUnitPriceRef {
  const normalizedSourceProductCode = normalizeProductCode(sourceProductCode)
  const normalizedSourceOptionCode = normalizeVariantCode(sourceOptionCode)
  const normalizedSourceOptionName = displayOptionName(sourceOptionName || normalizedSourceOptionCode)
  const normalizedTargetProductCode = normalizeProductCode(targetProductCode)
  const normalizedTargetOptionCode = normalizeVariantCode(targetOptionCode)
  const targetProductName = getLProductName(normalizedTargetProductCode)
  const targetOptionName = displayOptionName(
    getLVariantChoices(normalizedTargetProductCode).find(
      (variant) => normalizeVariantCode(variant.code) === normalizedTargetOptionCode,
    )?.option,
  )
  const refName = makeMappedUnitPriceRefName(
    normalizedSourceProductCode,
    normalizedSourceOptionCode,
    normalizedTargetProductCode,
    normalizedTargetOptionCode,
  )
  const displayToken =
    `전환 단가[${normalizedSourceProductCode}/${normalizedSourceOptionCode}->${normalizedTargetProductCode}/${normalizedTargetOptionCode}]`
  const title = [
    '전환 단가',
    `참조명: ${refName}`,
    `위쪽상품: ${normalizedSourceProductCode} / ${sourceProductName}`,
    `위쪽옵션: ${normalizedSourceOptionCode} / ${normalizedSourceOptionName}`,
    `왼쪽상품: ${normalizedTargetProductCode} / ${targetProductName}`,
    `왼쪽옵션: ${normalizedTargetOptionCode} / ${targetOptionName}`,
    `단가: ${fmtCurrency(unitPrice, 'KRW')}`,
    'Excel 다운로드에서는 매출단가참조 시트의 이 참조명을 사용합니다.',
  ].join('\n')

  return {
    kind: 'mapped',
    refName,
    displayToken,
    title,
    sourceProductCode: normalizedSourceProductCode,
    sourceOptionCode: normalizedSourceOptionCode,
    sourceProductName,
    sourceOptionName: normalizedSourceOptionName,
    targetProductCode: normalizedTargetProductCode,
    targetOptionCode: normalizedTargetOptionCode,
    targetProductName,
    targetOptionName,
    unitPrice,
  }
}

function makeSetComponentPriceRef(
  setConfig: SetProductConfig,
  setVariantCode: string,
  component: SetProductComponentDraft,
): SetComponentPriceRef {
  const setProductCode = normalizeProductCode(setConfig.productCode)
  const setOptionCode = normalizeVariantCode(setVariantCode)
  const componentProductCode = normalizeProductCode(component.productCode)
  const componentOptionCode = normalizeVariantCode(component.optionCode)
  const componentProductName = getLProductName(componentProductCode)
  const componentOptionName = displayOptionName(
    getLVariantChoices(componentProductCode).find(
      (variant) => normalizeVariantCode(variant.code) === componentOptionCode,
    )?.option,
  )
  const refName = makeSetComponentPriceRefName(
    setProductCode,
    setOptionCode,
    componentProductCode,
    componentOptionCode,
  )
  const displayToken = `세트 구성 단가[${setProductCode}/${setOptionCode}->${componentProductCode}/${componentOptionCode}]`
  const title = [
    '세트 구성 단가',
    `참조명: ${refName}`,
    `세트상품: ${setProductCode} / ${setOptionCode}`,
    `구성상품: ${componentProductCode} / ${componentProductName}`,
    `구성옵션: ${componentOptionCode} / ${componentOptionName}`,
    `구성수량: ${fmtNumber(component.qty)}`,
    `단가: ${fmtCurrency(component.setPrice, 'KRW')}`,
    `1세트 구성금액: ${fmtCurrency(getSetComponentDraftAmount(component), 'KRW')}`,
    'Excel 다운로드에서는 매출단가참조 시트의 이 참조명을 사용합니다.',
  ].join('\n')

  return {
    kind: 'set-component',
    refName,
    displayToken,
    title,
    sourceProductCode: setProductCode,
    sourceOptionCode: setOptionCode,
    sourceProductName: setConfig.productName,
    sourceOptionName: displayOptionName(setConfig.variants.find(
      (variant) => normalizeVariantCode(variant.variantCode) === setOptionCode,
    )?.optionName),
    targetProductCode: componentProductCode,
    targetOptionCode: componentOptionCode,
    targetProductName: componentProductName,
    targetOptionName: componentOptionName,
    unitPrice: component.setPrice,
    setProductCode,
    setOptionCode,
    componentProductCode,
    componentOptionCode,
    componentQty: component.qty,
    componentSetPrice: component.setPrice,
  }
}

function buildRevenueUnitPriceReferenceRows(rowMetaByKey: Map<string, RowFormulaMeta>): RevenueUnitPriceReferenceRow[] {
  const rowByRefName = new Map<string, RevenueUnitPriceReferenceRow>()

  rowMetaByKey.forEach((rowMeta) => {
    ;(rowMeta.revenueMappedTerms ?? []).forEach((term) => {
      if (!term.priceRef || rowByRefName.has(term.priceRef.refName)) return
      const quantity = term.priceRef.kind === 'set-component'
        ? (term.priceRef as SetComponentPriceRef).componentQty
        : null
      rowByRefName.set(term.priceRef.refName, {
        ref: term.priceRef,
        sourceType: term.priceRef.kind === 'set-component' ? '세트 구성 단가' : '전환 단가',
        quantity,
        amount: quantity ? quantity * term.priceRef.unitPrice : term.priceRef.unitPrice,
      })
    })
  })

  return Array.from(rowByRefName.values())
}

type ExcelColumnWidthRule = {
  min?: number
  max?: number
  includeMerged?: boolean
}

type ExcelAutoFitCell = {
  value: unknown
  isMerged?: boolean
}

type ExcelAutoFitColumn = {
  width?: number
}

type ExcelAutoFitRow = {
  getCell: (colNumber: number) => ExcelAutoFitCell
}

function excelCellWidthText(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    if ('richText' in value) {
      return ((value as { richText?: Array<{ text?: string }> }).richText ?? [])
        .map((part) => part.text ?? '')
        .join('')
    }
    if ('result' in value) return excelCellWidthText((value as { result?: unknown }).result)
    if ('formula' in value) return excelCellWidthText((value as { formula?: unknown }).formula)
  }
  return String(value)
}

function excelTextDisplayWidth(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    // Excel column width is closer to visual glyph width than JS string length.
    // Korean/CJK glyphs need roughly double the Latin width to avoid clipped exports.
    return sum + (/[\u1100-\u11FF\u3130-\u318F\uAC00-\uD7AF\u3000-\u9FFF\uFF01-\uFF60]/.test(char) ? 2 : 1)
  }, 0)
}

function autoFitWorksheetColumns(
  worksheet: {
    columns?: ExcelAutoFitColumn[]
    actualColumnCount?: number
    columnCount?: number
    eachRow?: (options: { includeEmpty: boolean }, cb: (row: ExcelAutoFitRow) => void) => void
    getColumn?: (colNumber: number) => ExcelAutoFitColumn
  },
  rules: Record<number, ExcelColumnWidthRule> = {},
) {
  const columnCount = Math.max(
    worksheet.columns?.length ?? 0,
    worksheet.actualColumnCount ?? 0,
    worksheet.columnCount ?? 0,
  )

  for (let colNumber = 1; colNumber <= columnCount; colNumber += 1) {
    const column = worksheet.getColumn?.(colNumber) ?? worksheet.columns?.[colNumber - 1]
    const rule = rules[colNumber] ?? {}
    let maxLength = rule.min ?? 8
    worksheet.eachRow?.({ includeEmpty: false }, (row) => {
      const cell = row.getCell(colNumber)
      if (cell.isMerged && !rule.includeMerged) return
      excelCellWidthText(cell.value).split(/\r?\n/).forEach((line) => {
        maxLength = Math.max(maxLength, excelTextDisplayWidth(line))
      })
    })
    const padded = maxLength + 2
    if (column) {
      column.width = Math.min(rule.max ?? 60, Math.max(rule.min ?? 8, padded))
    }
  }
}

function makeSetComponentScopeKey(productCode: string, scope: SetComponentScope, variantCode?: string) {
  return `${normalizeProductCode(productCode)}${COLUMN_KEY_DELIM}${scope}${COLUMN_KEY_DELIM}${
    scope === 'common' ? 'common' : normalizeVariantCode(variantCode ?? '')
  }`
}

function getSetComponentDraft(
  drafts: Record<string, SetProductComponentDraft>,
  component: SetProductComponent,
) {
  const draft = drafts[component.id]
  return draft ? {
    id: component.id,
    scope: component.scope,
    ...draft,
  } : {
    id: component.id,
    scope: component.scope,
    productCode: component.productCode,
    optionCode: component.optionCode,
    qty: component.qty,
    setPrice: component.setPrice,
  }
}

function hasSetComponentDraftChange(
  drafts: Record<string, SetProductComponentDraft>,
  component: SetProductComponent,
) {
  const draft = drafts[component.id]
  if (!draft) return false
  return draft.deleted === true
    || draft.productCode !== component.productCode
    || draft.optionCode !== component.optionCode
    || draft.qty !== component.qty
    || draft.setPrice !== component.setPrice
}

function isSetComponentDraftComplete(draft: SetProductComponentDraft) {
  return Boolean(normalizeProductCode(draft.productCode) && normalizeVariantCode(draft.optionCode))
}

function getEffectiveSetComponentsForVariant(
  config: SetProductConfig | null,
  variantCode: string,
  addedComponents: Record<string, SetProductComponent[]>,
  drafts: Record<string, SetProductComponentDraft>,
) {
  if (!config) return []
  const normalizedVariant = normalizeVariantCode(variantCode)
  const commonScopeKey = makeSetComponentScopeKey(config.productCode, 'common')
  const optionScopeKey = makeSetComponentScopeKey(config.productCode, 'option', normalizedVariant)
  const variantConfig = config.variants.find((variant) => normalizeVariantCode(variant.variantCode) === normalizedVariant)
  const components = [
    ...(config.commonComponents ?? []),
    ...(addedComponents[commonScopeKey] ?? []),
    ...(variantConfig?.components ?? []),
    ...(addedComponents[optionScopeKey] ?? []),
  ]

  return components
    .map((component) => getSetComponentDraft(drafts, component))
    .filter((draft) => !draft.deleted && isSetComponentDraftComplete(draft))
}

function getSetComponentMatch(
  components: SetProductComponentDraft[],
  productCode: string,
  optionCode: string | null,
  setConfig?: SetProductConfig | null,
  setVariantCode?: string,
) {
  const normalizedProductCode = normalizeProductCode(productCode)
  const normalizedOptionCode = normalizeVariantCode(optionCode ?? '')
  return components
    .filter((component) => {
      if (normalizeProductCode(component.productCode) !== normalizedProductCode) return false
      return normalizeVariantCode(component.optionCode) === normalizedOptionCode
    })
    .reduce(
      (acc, component) => {
        const componentQty = Number(component.qty) || 0
        const componentSetPrice = Number(component.setPrice) || 0
        return {
          hasComponent: true,
          qtyPerSet: acc.qtyPerSet + componentQty,
          revenuePerSet: acc.revenuePerSet + componentQty * componentSetPrice,
          priceRefs: setConfig && setVariantCode
            ? [...acc.priceRefs, makeSetComponentPriceRef(setConfig, setVariantCode, component)]
            : acc.priceRefs,
        }
      },
      {
        hasComponent: false,
        qtyPerSet: 0,
        revenuePerSet: 0,
        priceRefs: [] as SetComponentPriceRef[],
      },
    )
}

function getSetComponentUnitPrice(match: { qtyPerSet: number; revenuePerSet: number }) {
  if (!Number.isFinite(match.qtyPerSet) || match.qtyPerSet <= 0) return 0
  return match.revenuePerSet / match.qtyPerSet
}

function getSetComponentDraftAmount(draft: SetProductComponentDraft) {
  if (!isSetComponentDraftComplete(draft)) return 0
  return draft.qty * draft.setPrice
}

function getLProductName(productCode: string) {
  return L_PRODUCT_DISPLAY_BY_CODE[normalizeProductCode(productCode)]?.name ?? productCode
}

function getLVariantChoices(productCode: string) {
  return L_PRODUCT_DISPLAY_BY_CODE[normalizeProductCode(productCode)]?.variants ?? []
}

function getLVariantPrice(productCode: string, optionCode: string) {
  const spec = getLVariantChoices(productCode).find(
    (variant) => normalizeVariantCode(variant.code) === normalizeVariantCode(optionCode),
  )
  return spec?.price ?? 0
}

function productContextTitle(productName: string, optionName?: string, meta?: ReadMeta) {
  const normalizedOption = displayOptionName(optionName)
  const lines = [`상품명: ${productName}`, `옵션명: ${normalizedOption}`]
  if (meta?.note && meta.status !== 'loaded' && meta.status !== 'calculated') {
    lines.push(meta.note)
  }
  return lines.join('\n')
}

function displayOptionWithCode(productCode?: string, variantCode?: string, optionName?: string) {
  const optionLabel = displayOptionName(optionName)
  if (!productCode || !variantCode) return optionLabel
  const optionCode = normalizeVariantSuffix(productCode, variantCode).toUpperCase()
  return optionCode ? `${optionCode} · ${optionLabel}` : optionLabel
}

function formatFormulaPrice(value: number) {
  if (!Number.isFinite(value)) return '0'
  const normalized = Number.isInteger(value) ? value : value
  return String(normalized)
}

function splitFormulaForDisplay(text: string): FormulaDisplayPart[] {
  const parts: FormulaDisplayPart[] = []
  const formulaTokenPattern = /((?:세트 구성 단가|전환 단가)\[[^\]]+\])|\b[A-Z]{1,3}\d+\*(\d+(?:\.\d+)?)(?=$|[+\-*/)\s])/g
  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = formulaTokenPattern.exec(text)) !== null) {
    if (match[1]) {
      if (match.index > cursor) {
        parts.push({ text: text.slice(cursor, match.index), kind: 'plain' })
      }
      parts.push({
        text: match[1],
        kind: 'set-price',
        title: '매출단가참조 시트의 이름 정의를 참조하는 구성 단가입니다.',
      })
      cursor = match.index + match[1].length
      continue
    }

    const priceStart = match.index + match[0].lastIndexOf('*') + 1
    const priceEnd = priceStart + match[2].length
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
  priceRefByColumn: Array<RevenueUnitPriceRef | null> | undefined,
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
      warnings.push(`${rowKey}: 전환 단가 미확인 (${uProduct}-${uVariant}, 인덱스 ${idx + 1})`)
    }
    const uColOffset = uStartCol + idx
    terms.push({
      uColOffset,
      quantity: qty,
      unitPrice: price,
      priceMissing: !priceIsFoundByColumn?.[idx],
      priceRef: priceRefByColumn?.[idx] ?? undefined,
    })
  })
  return { terms, warnings }
}

function formulaResultLabel(value: number | undefined, currency = 'KRW') {
  if (!Number.isFinite(value)) return ''
  return fmtCurrency(value ?? 0, currency)
}

function quantityResultLabel(value: number | undefined) {
  if (!Number.isFinite(value)) return ''
  return fmtNumber(value ?? 0)
}

function rowFormulaTargetLabel(rowMeta: RowFormulaMeta) {
  if (rowMeta.rowType === 'subtotal') return `${rowMeta.groupLabel} 합계`
  if (rowMeta.rowType === 'total') return rowMeta.groupLabel
  const product = rowMeta.product_code && rowMeta.product_name
    ? `${rowMeta.product_code} / ${rowMeta.product_name}`
    : rowMeta.groupLabel
  const option = rowMeta.variant_code
    ? `${normalizeVariantSuffix(rowMeta.product_code ?? '', rowMeta.variant_code).toUpperCase()} · ${displayOptionName(rowMeta.option_name)}`
    : displayOptionName(rowMeta.option_name)
  return `${product} / ${option}`
}

function rowFormulaTargetEntity(rowMeta: RowFormulaMeta): FormulaTermEntity | undefined {
  if (rowMeta.rowType !== 'product' && rowMeta.rowType !== 'variant') return undefined
  if (!rowMeta.product_code || !rowMeta.product_name) return undefined
  const optionCode = rowMeta.variant_code
    ? normalizeVariantSuffix(rowMeta.product_code, rowMeta.variant_code).toUpperCase()
    : undefined
  return {
    role: '왼쪽상품',
    productCode: rowMeta.product_code,
    productName: rowMeta.product_name,
    optionCode,
    optionName: displayOptionName(rowMeta.option_name),
  }
}

function revenuePriceRefSourceEntity(priceRef: RevenueUnitPriceRef): FormulaTermEntity {
  return {
    role: priceRef.kind === 'set-component' ? '세트상품' : '전환상품',
    productCode: priceRef.sourceProductCode,
    productName: priceRef.sourceProductName,
    optionCode: priceRef.sourceOptionCode,
    optionName: priceRef.sourceOptionName,
  }
}

function formulaEntityText(entity: FormulaTermEntity) {
  const option = entity.optionCode
    ? `${entity.optionCode} · ${displayOptionName(entity.optionName)}`
    : displayOptionName(entity.optionName)
  return `${entity.productCode} / ${entity.productName} / ${option}`
}

function FormulaEntitySummary({ entity }: { entity: FormulaTermEntity }) {
  const product = `${entity.productCode} / ${entity.productName}`
  const option = entity.optionCode
    ? `${entity.optionCode} · ${displayOptionName(entity.optionName)}`
    : displayOptionName(entity.optionName)
  const roleClass = entity.role === '왼쪽상품'
    ? 'left'
    : entity.role === '세트상품'
      ? 'set'
      : entity.role === '전환상품'
        ? 'conversion'
        : 'default'

  return (
    <span className={`formula-entity-card formula-entity-card--${roleClass}`} title={formulaEntityText(entity)}>
      <span className={`formula-entity-role formula-entity-role--${roleClass}`}>{entity.role}</span>
      <span className="formula-entity-field formula-entity-field--product">
        <span className="formula-entity-label">상품</span>
        <span className="formula-entity-value" title={product}>{product}</span>
      </span>
      <span className="formula-entity-field formula-entity-field--option">
        <span className="formula-entity-label">옵션</span>
        <span className="formula-entity-value" title={option}>{option}</span>
      </span>
    </span>
  )
}

function FormulaExplanationTitleView({
  explanation,
  fallback,
}: {
  explanation?: FormulaExplanation | null
  fallback: string
}) {
  if (!explanation?.targetEntity) {
    return <span className="formula-explanation-title">{explanation?.title ?? fallback}</span>
  }

  return (
    <span className="formula-explanation-title formula-explanation-title--structured">
      <FormulaEntitySummary entity={explanation.targetEntity} />
      <span className="formula-title-suffix">매출 계산 내역</span>
    </span>
  )
}

function FormulaTermDetailView({ term }: { term: FormulaExplanationTerm }) {
  if (!term.sourceEntity && !term.targetEntity) {
    return <span className="formula-term-detail" title={term.detail}>{term.detail}</span>
  }

  return (
    <span className="formula-term-detail formula-term-detail--structured" title={term.detail}>
      {term.sourceEntity ? <FormulaEntitySummary entity={term.sourceEntity} /> : null}
      {term.sourceEntity && term.targetEntity ? <span className="formula-term-flow" aria-hidden="true">→</span> : null}
      {term.targetEntity ? <FormulaEntitySummary entity={term.targetEntity} /> : null}
    </span>
  )
}

function formulaColumnLabel(colMeta: ColFormulaMeta, fixed: { directCol: number; totalCol: number; revenueCol: number }) {
  if (colMeta.excelCol === fixed.directCol) return '직접판매'
  if (colMeta.excelCol === fixed.totalCol) return '총판매'
  if (colMeta.excelCol === fixed.revenueCol) return '매출'
  return `${toExcelCol(colMeta.excelCol)}열`
}

function makeFormulaResult(
  display: string,
  excel: string,
  explanation: Omit<FormulaExplanation, 'sourceFormula'>,
): FormulaBuildResult {
  return {
    display,
    excel,
    explanation: {
      ...explanation,
      sourceFormula: display,
    },
  }
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
): FormulaBuildResult | null {
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
  const targetLabel = rowFormulaTargetLabel(rowMeta)
  const targetEntity = rowFormulaTargetEntity(rowMeta)
  const columnLabel = formulaColumnLabel(colMeta, { directCol, totalCol, revenueCol })

  const makeSumExplanation = (formula: string, col: number, label = columnLabel) => makeFormulaResult(
    formula,
    formula,
    {
      title: `${targetLabel} ${label}`,
      summary: `하위 ${fmtNumber(rowNums.length)}개 행의 ${label}을 합산합니다.`,
      terms: [{
        kind: 'sum',
        label: `${label} 합계`,
        detail: rowNums.length === 1
          ? `${resolveColValue(col)}${rowNums[0]} 값을 그대로 사용합니다.`
          : `${rowNums.map((r) => `${resolveColValue(col)}${r}`).join(', ')} 값을 합산합니다.`,
        refs: rowNums.length === 1
          ? `${resolveColValue(col)}${rowNums[0]}`
          : rowNums.map((r) => `${resolveColValue(col)}${r}`).join(', '),
      }],
    },
  )

  const sumByRows = (col: number) => {
    if (rowNums.length === 0) return null
    if (rowNums.length === 1) {
      const formula = `=${resolveColValue(col)}${rowNums[0]}`
      return makeSumExplanation(formula, col)
    }
    const formula = `=SUM(${rowNums.map((r) => `${resolveColValue(col)}${r}`).join(',')})`
    return makeSumExplanation(formula, col)
  }

  const sumByRowsOrContiguousRange = (col: number) => {
    if (rowNums.length === 0) return null
    if (rowNums.length === 1) {
      const formula = `=${resolveColValue(col)}${rowNums[0]}`
      return makeSumExplanation(formula, col)
    }
    const isContiguous = rowNums.every((row, idx) => idx === 0 || row === rowNums[idx - 1] + 1)
    if (isContiguous) {
      const formula = sumFormula(rowNums[0], col, rowNums[rowNums.length - 1], col)
      return makeFormulaResult(formula, formula, {
        title: `${targetLabel} ${columnLabel}`,
        summary: `연속된 하위 ${fmtNumber(rowNums.length)}개 행의 ${columnLabel}을 합산합니다.`,
        terms: [{
          kind: 'sum',
          label: `${columnLabel} 합계`,
          detail: `${resolveColValue(col)}${rowNums[0]}:${resolveColValue(col)}${rowNums[rowNums.length - 1]} 범위를 합산합니다.`,
          refs: `${resolveColValue(col)}${rowNums[0]}:${resolveColValue(col)}${rowNums[rowNums.length - 1]}`,
        }],
      })
    }
    return sumByRows(col)
  }

  if (colMeta.excelCol === directCol) {
    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRowsOrContiguousRange(directCol)
    }
    return null
  }

  if (colMeta.excelCol >= uStartCol && colMeta.excelCol <= uEndCol) {
    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRowsOrContiguousRange(colMeta.excelCol)
    }
    return null
  }

  if (colMeta.excelCol === totalCol) {
    if (rowMeta.rowType === 'product' || rowMeta.rowType === 'variant') {
      const directPart = `=${resolveColValue(directCol)}${rowMeta.excelRow}`
      if (uStartCol <= uEndCol) {
        const formula = `${directPart}+SUM(${resolveColValue(uStartCol)}${rowMeta.excelRow}:${resolveColValue(uEndCol)}${rowMeta.excelRow})`
        const mappedQty = (rowMeta.revenueMappedTerms ?? []).reduce((sum, term) => sum + term.quantity, 0)
        const totalQty = (rowMeta.revenueDirectQty ?? 0) + mappedQty
        return makeFormulaResult(formula, formula, {
          title: `${targetLabel} 매출 계산 내역`,
          summary: `직접판매 ${quantityResultLabel(rowMeta.revenueDirectQty)} + 위쪽상품 환산 ${quantityResultLabel(mappedQty)} = ${quantityResultLabel(totalQty)}`,
          targetEntity,
          terms: [
            {
              kind: 'direct-sales',
              label: '직접판매',
              detail: `${resolveColValue(directCol)}${rowMeta.excelRow} 직접판매 수량`,
              refs: `${resolveColValue(directCol)}${rowMeta.excelRow}`,
              quantity: rowMeta.revenueDirectQty ?? 0,
            },
            {
              kind: 'total-quantity',
              label: '위쪽상품 환산 수량',
              detail: `${resolveColValue(uStartCol)}${rowMeta.excelRow}:${resolveColValue(uEndCol)}${rowMeta.excelRow} 교차셀 수량 합계`,
              refs: `${resolveColValue(uStartCol)}${rowMeta.excelRow}:${resolveColValue(uEndCol)}${rowMeta.excelRow}`,
              quantity: mappedQty,
            },
          ],
        })
      }
      return makeFormulaResult(directPart, directPart, {
        title: `${targetLabel} 매출 계산 내역`,
        summary: `직접판매 수량 ${quantityResultLabel(rowMeta.revenueDirectQty)}을 그대로 사용합니다.`,
        targetEntity,
        terms: [{
          kind: 'direct-sales',
          label: '직접판매',
          detail: `${resolveColValue(directCol)}${rowMeta.excelRow} 직접판매 수량`,
          refs: `${resolveColValue(directCol)}${rowMeta.excelRow}`,
          quantity: rowMeta.revenueDirectQty ?? 0,
        }],
      })
    }

    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRows(totalCol)
    }

    return null
  }

  if (colMeta.excelCol === revenueCol) {
    if (rowMeta.rowType === 'product' || rowMeta.rowType === 'variant') {
      const directQtyRef = `${resolveColValue(directCol)}${rowMeta.excelRow}`
      const directPriceRef = `${resolveColValue(priceCol)}${rowMeta.excelRow}`
      const mappedDisplayTerms = (rowMeta.revenueMappedTerms ?? []).map((term) => {
        const col = resolveColValue(term.uColOffset)
        if (term.priceMissing) {
          return `${col}${rowMeta.excelRow}*단가미확인`
        }
        if (term.priceRef) {
          return `${col}${rowMeta.excelRow}*${term.priceRef.displayToken}`
        }
        return `${col}${rowMeta.excelRow}*${formatFormulaPrice(term.unitPrice)}`
      })
      const mappedExcelTerms = (rowMeta.revenueMappedTerms ?? []).map((term) => {
        const col = resolveColValue(term.uColOffset)
        if (term.priceMissing) {
          return `${col}${rowMeta.excelRow}*단가미확인`
        }
        return `${col}${rowMeta.excelRow}*${term.priceRef?.refName ?? formatFormulaPrice(term.unitPrice)}`
      })
      const directPart = rowMeta.revenueMissing ? '' : `${directQtyRef}*${directPriceRef}`
      const displayTerms = [directPart, ...mappedDisplayTerms].filter(Boolean)
      const excelTerms = [directPart, ...mappedExcelTerms].filter(Boolean)
      if (displayTerms.length === 0 || excelTerms.length === 0) return null
      const explanationTerms: FormulaExplanationTerm[] = []
      let directAmount = 0
      if (!rowMeta.revenueMissing) {
        directAmount = (rowMeta.revenueDirectQty ?? 0) * (rowMeta.unit_price ?? 0)
        explanationTerms.push({
          kind: 'direct-sales',
          label: '직접판매 매출',
          detail: `직접판매 ${quantityResultLabel(rowMeta.revenueDirectQty)} × 단가 ${formulaResultLabel(rowMeta.unit_price)}`,
          refs: `${directQtyRef} × ${directPriceRef}`,
          quantity: rowMeta.revenueDirectQty ?? 0,
          unitPrice: rowMeta.unit_price ?? 0,
          amount: directAmount,
        })
      }
      let mappedAmount = 0
      ;(rowMeta.revenueMappedTerms ?? []).forEach((term) => {
        const col = resolveColValue(term.uColOffset)
        const amount = term.priceMissing ? 0 : term.quantity * term.unitPrice
        mappedAmount += amount
        const priceRef = term.priceRef
        const isSet = priceRef?.kind === 'set-component'
        const label = term.priceMissing
          ? '단가 확인불가'
          : isSet
            ? '세트 구성 매출'
            : '전환상품 매출'
        const source = priceRef
          ? `${priceRef.sourceProductCode} / ${priceRef.sourceProductName} / ${priceRef.sourceOptionCode} · ${priceRef.sourceOptionName}`
          : `${col}${rowMeta.excelRow}`
        explanationTerms.push({
          kind: isSet ? 'set-component' : 'conversion',
          label,
          detail: `${source} 판매 ${quantityResultLabel(term.quantity)} × ${isSet ? '세트 구성 단가' : '전환 단가'} ${term.priceMissing ? '확인불가' : formulaResultLabel(term.unitPrice)}`,
          sourceEntity: priceRef ? revenuePriceRefSourceEntity(priceRef) : undefined,
          refs: `${col}${rowMeta.excelRow}${priceRef ? ` × ${priceRef.refName}` : ''}`,
          quantity: term.quantity,
          unitPrice: term.priceMissing ? undefined : term.unitPrice,
          amount,
        })
      })
      const resultAmount = directAmount + mappedAmount
      return {
        ...makeFormulaResult(`=${displayTerms.join('+')}`, `=${excelTerms.join('+')}`, {
          title: `${targetLabel} 매출 계산 내역`,
          summary: formulaResultLabel(resultAmount),
          targetEntity,
          terms: explanationTerms,
        }),
      }
    }

    if (rowMeta.rowType === 'subtotal' || rowMeta.rowType === 'total') {
      return sumByRows(revenueCol)
    }
  }

  return null
}

export function ProductCodesView() {
  const { settings, setStart, setEnd } = useSettings()
  const { start, end } = settings
  const { state, run } = useReport()
  const tableWrapRef = useRef<HTMLDivElement>(null)
  const tableRef = useRef<HTMLTableElement>(null)
  const topScrollbarRef = useRef<HTMLDivElement>(null)
  const setEditorModalRef = useRef<HTMLDivElement>(null)
  const bottomSyncRef = useRef(false)
  const scrollContentWidthRef = useRef(0)
  const setEditorDragRef = useRef<SetEditorDragState | null>(null)
  const pinnedCrossPaletteRef = useRef(0)
  const [topScrollbarWidth, setTopScrollbarWidth] = useState(0)
  const [isLeftCompact, setIsLeftCompact] = useState(false)
  const [viewMode, setViewMode] = useState<ProductCodesViewMode>(readInitialProductCodesViewMode)
  const [editingSetProductCode, setEditingSetProductCode] = useState<string | null>(null)
  const [selectedSetVariantCode, setSelectedSetVariantCode] = useState('')
  const [setEditorLayout, setSetEditorLayout] = useState<SetEditorLayout | null>(null)
  const [setComponentDrafts, setSetComponentDrafts] = useState<Record<string, SetProductComponentDraft>>({})
  const [setAddedComponents, setSetAddedComponents] = useState<Record<string, SetProductComponent[]>>({})
  const [selectedCell, setSelectedCell] = useState<CellSelectionMeta | null>(null)
  const [formulaDetailsOpen, setFormulaDetailsOpen] = useState(false)
  const formulaSingleClickTimerRef = useRef<number | null>(null)
  const cellClickDetailRef = useRef<{
    rowKey: string
    colKey: string
    detail: number
    viewportTop: number
  } | null>(null)
  const [hoveredCell, setHoveredCell] = useState<Pick<CellSelectionMeta, 'rowKey' | 'colKey'> | null>(null)
  const [pinnedCrosses, setPinnedCrosses] = useState<PinnedCross[]>([])
  const [manualHighlightedRows, setManualHighlightedRows] = useState<Set<string>>(() => new Set())
  const [manualHighlightedCols, setManualHighlightedCols] = useState<Set<string>>(() => new Set())
  const [luOverrides, setLuOverrides] = useState<LuRuleOverride[]>([])
  const [pendingLuAction, setPendingLuAction] = useState<PendingLuAction | null>(null)
  const [luDialogPosition, setLuDialogPosition] = useState<{ x: number; y: number } | null>(null)
  const luDialogDragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null)
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const copyTimerRef = useRef<number | null>(null)
  const effectiveRuleMap = useMemo(() => makeEffectiveRuleMap(luOverrides), [luOverrides])

  const isPinnableCrossCell = (meta: Pick<CellSelectionMeta, 'rowKey' | 'colKey'>) =>
    meta.colKey.startsWith('B:') && meta.rowKey !== 'product-codes-u-direct'

  const clearPendingFormulaSingleClick = () => {
    if (formulaSingleClickTimerRef.current === null) return
    window.clearTimeout(formulaSingleClickTimerRef.current)
    formulaSingleClickTimerRef.current = null
  }

  const findTableCell = (rowKey: string, colKey: string) => {
    const cells = tableWrapRef.current?.querySelectorAll<HTMLElement>('td[data-row-key][data-col-key]')
    if (!cells) return null
    return Array.from(cells).find((cell) => cell.dataset.rowKey === rowKey && cell.dataset.colKey === colKey) ?? null
  }

  const handleCellSelect = (meta: CellSelectionMeta) => {
    const rowMeta = rowMetaByKey.get(meta.rowKey)
    const colMeta = colMetaByKey.get(meta.colKey)
    const formula = rowMeta && colMeta ? rowFormulaByKey.get(`${meta.rowKey}|${meta.colKey}`) : null
    const nativeClickDetail = cellClickDetailRef.current?.rowKey === meta.rowKey
      && cellClickDetailRef.current.colKey === meta.colKey
      ? cellClickDetailRef.current.detail
      : 0
    const clickedViewportTop = cellClickDetailRef.current?.rowKey === meta.rowKey
      && cellClickDetailRef.current.colKey === meta.colKey
      ? cellClickDetailRef.current.viewportTop
      : null
    const opensFormulaDetails = Boolean(formula && nativeClickDetail >= 2)

    const selectCellNow = (openFormulaDetails: boolean) => {
      setFormulaDetailsOpen(openFormulaDetails)
      setHoveredCell({ rowKey: meta.rowKey, colKey: meta.colKey })
      const existingPinnedCross = isPinnableCrossCell(meta)
        ? pinnedCrosses.find((pin) => pin.rowKey === meta.rowKey && pin.colKey === meta.colKey)
        : null

      if (existingPinnedCross) {
        setPinnedCrosses((prev) => prev.filter((pin) => pin !== existingPinnedCross))
        setHoveredCell(null)
        setSelectedCell((prev) => {
          if (prev?.rowKey === meta.rowKey && prev.colKey === meta.colKey) return null
          return prev
        })
        return
      }

      setSelectedCell(() => {
        const formulaWarnings = meta.colKey === REVENUE_SCREEN_KEY
          ? rowMeta?.revenueMappedPriceWarnings
          : undefined

        return {
          ...meta,
          formula: formula?.display ?? '',
          excelFormula: formula?.excel ?? '',
          formulaWarnings,
          screenRow: rowMeta?.screenRow ?? 0,
          screenCol: colMeta?.screenCol ?? 0,
          excelRow: rowMeta?.excelRow ?? 0,
          excelCol: colMeta?.excelCol ?? 0,
        }
      })

      if (isPinnableCrossCell(meta)) {
        const palette = pinnedCrossPaletteRef.current % 6
        pinnedCrossPaletteRef.current += 1
        setPinnedCrosses((prev) => {
          return [
            ...prev,
            {
              rowKey: meta.rowKey,
              rowLabel: meta.rowLabel,
              colKey: meta.colKey,
              colLabel: meta.colLabel,
              coordinate: rowMeta && colMeta ? a1(rowMeta.excelRow, colMeta.excelCol) : '',
              palette,
            },
          ]
        })
      }

      if (openFormulaDetails && clickedViewportTop !== null) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const cell = findTableCell(meta.rowKey, meta.colKey)
            if (!cell) return
            const nextTop = cell.getBoundingClientRect().top
            window.scrollBy(0, nextTop - clickedViewportTop)
          })
        })
      }
    }

    if (formula) {
      if (opensFormulaDetails) {
        clearPendingFormulaSingleClick()
        selectCellNow(true)
        return
      }

      clearPendingFormulaSingleClick()
      formulaSingleClickTimerRef.current = window.setTimeout(() => {
        selectCellNow(false)
        formulaSingleClickTimerRef.current = null
      }, 350)
      return
    }

    clearPendingFormulaSingleClick()
    selectCellNow(false)
  }

  const clearSelection = () => {
    clearPendingFormulaSingleClick()
    setFormulaDetailsOpen(false)
    setSelectedCell(null)
  }
  const clearInteractionForPinnedCrosses = (pins: PinnedCross[]) => {
    if (pins.length === 0) return
    const overlapsPinnedLine = (cell: Pick<CellSelectionMeta, 'rowKey' | 'colKey'> | null) =>
      !!cell && pins.some((pin) => pin.rowKey === cell.rowKey || pin.colKey === cell.colKey)

    setSelectedCell((prev) => (overlapsPinnedLine(prev) ? null : prev))
    setHoveredCell((prev) => (overlapsPinnedLine(prev) ? null : prev))
  }
  const clearPinnedCrosses = () => {
    clearInteractionForPinnedCrosses(pinnedCrosses)
    setPinnedCrosses([])
  }
  const removeLatestPinnedCross = () => {
    const latestPinnedCross = pinnedCrosses[pinnedCrosses.length - 1]
    if (!latestPinnedCross) return false
    clearInteractionForPinnedCrosses([latestPinnedCross])
    setPinnedCrosses((prev) => prev.slice(0, -1))
    return true
  }

  useEffect(() => {
    window.localStorage.setItem(PRODUCT_CODES_VIEW_MODE_KEY, viewMode)
  }, [viewMode])

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
    const targetUColumn = U_COLUMNS.find(
      (col) => col.uProduct === target.uProduct && col.uVariant === target.uVariant,
    )
    if (targetUColumn?.group !== 'conversion') return

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
      description = '기본 규칙을 삭제하지 않고 사용자 변경사항으로만 비활성화합니다. 해제하면 이 U상품 항목은 총판매/매출/수식에서 제외됩니다.'
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
    if (manualHighlightedRows.has(rowKey)) classes.push('pc-excel-manual-row')
    if (manualHighlightedCols.has(colKey)) classes.push('pc-excel-manual-col')
    if (manualHighlightedRows.has(rowKey) && manualHighlightedCols.has(colKey)) {
      classes.push('pc-excel-manual-cell')
    }
    if (selectedCell?.rowKey === rowKey) classes.push('pc-excel-row-selected')
    if (selectedCell?.colKey === colKey) classes.push('pc-excel-col-selected')
    if (selectedCell?.rowKey === rowKey && selectedCell.colKey === colKey) {
      classes.push('pc-excel-cell-selected')
    }
    const pinnedCell = pinnedCrosses.find((pin) => pin.rowKey === rowKey && pin.colKey === colKey)
    const pinnedRow = pinnedCell ?? pinnedCrosses.find((pin) => pin.rowKey === rowKey)
    const pinnedCol = pinnedCell ?? pinnedCrosses.find((pin) => pin.colKey === colKey)
    if (pinnedRow) classes.push('pc-excel-pinned-row', `pc-excel-pin-${pinnedRow.palette}`)
    if (pinnedCol) classes.push('pc-excel-pinned-col', `pc-excel-pin-${pinnedCol.palette}`)
    if (pinnedCell) classes.push('pc-excel-pinned-cell')
    if (hoveredCell?.rowKey === rowKey) classes.push('pc-excel-hover-row')
    if (hoveredCell?.colKey === colKey) classes.push('pc-excel-hover-col')
    if (hoveredCell?.rowKey === rowKey && hoveredCell.colKey === colKey) {
      classes.push('pc-excel-hover-cell')
    }
    return classes.join(' ')
  }

  const toggleManualRowHighlight = (rowKey: string) => {
    setManualHighlightedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowKey)) next.delete(rowKey)
      else next.add(rowKey)
      return next
    })
  }

  const toggleManualColHighlight = (colKey: string) => {
    setManualHighlightedCols((prev) => {
      const next = new Set(prev)
      if (next.has(colKey)) next.delete(colKey)
      else next.add(colKey)
      return next
    })
  }

  const getRowHeaderClass = (rowKey: string) => [
    'pc-excel-row-head',
    manualHighlightedRows.has(rowKey) ? 'pc-excel-row-head--manual' : '',
    selectedCell?.rowKey === rowKey ? 'pc-excel-row-head--selected' : '',
    hoveredCell?.rowKey === rowKey ? 'pc-excel-row-head--hovered' : '',
    pinnedCrosses.some((pin) => pin.rowKey === rowKey) ? 'pc-excel-row-head--pinned' : '',
  ].filter(Boolean).join(' ')

  const getColumnHeaderClass = (colKey: string, baseClassName: string) => [
    'pc-excel-column-letter',
    baseClassName,
    manualHighlightedCols.has(colKey) ? 'pc-excel-column-letter--manual' : '',
    selectedCell?.colKey === colKey ? 'pc-excel-column-letter--selected' : '',
    hoveredCell?.colKey === colKey ? 'pc-excel-column-letter--hovered' : '',
    pinnedCrosses.some((pin) => pin.colKey === colKey) ? 'pc-excel-column-letter--pinned' : '',
  ].filter(Boolean).join(' ')

  const renderRowHeader = (rowKey: string) => {
    const rowNumber = excelRowNumber(rowKey)
    return (
      <th
        className={getRowHeaderClass(rowKey)}
        data-row-key={rowKey}
        title={`${rowNumber}행 하이라이트`}
        role="button"
        tabIndex={0}
        aria-pressed={manualHighlightedRows.has(rowKey)}
        onClick={() => toggleManualRowHighlight(rowKey)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            toggleManualRowHighlight(rowKey)
          }
        }}
      >
        {rowNumber}
      </th>
    )
  }

  const handleTableMouseMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (selectedCell?.formula || selectedCell?.excelFormula) return
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

  const uColumnInfoByKey = useMemo(() => {
    const byCode = new Map(allGroups.map((g) => [normalizeProductCode(g.product_code), g]))
    const map = new Map<string, {
      productCode: string
      productLabel: string
      variantCode: string
      optionLabel: string
      price: number
      group: UBlock['group']
    }>()

    U_COLUMNS.forEach((col, idx) => {
      const uGroup = byCode.get(normalizeProductCode(col.uProduct))
      const variant = findUVariantData(uGroup, col.uProduct, col.uVariant)
      const optionLabel = displayOptionName(variant?.option || variant?.variant_code || col.uVariant)
      const price = variant?.price || uGroup?.price || 0
      map.set(`B:${col.uProduct}-${col.uVariant}`, {
        productCode: col.uProduct,
        productLabel: col.blockLabel,
        variantCode: col.uVariant,
        optionLabel,
        price,
        group: col.group,
      })
      map.set(`B:${col.uProduct}-${col.uVariant || idx}`, {
        productCode: col.uProduct,
        productLabel: col.blockLabel,
        variantCode: col.uVariant,
        optionLabel,
        price,
        group: col.group,
      })
    })

    return map
  }, [allGroups])

  const groupRows = useMemo<GroupRows[]>(() => {
    const byCode = new Map(allGroups.map((g) => [normalizeProductCode(g.product_code), g]))
    const buildRow = (code: string): Row => {
      const normalizedCode = normalizeProductCode(code)
      const cafeGroup = byCode.get(normalizedCode)
      const knownProductSpec = L_PRODUCT_DISPLAY_BY_CODE[normalizedCode]
      const knownVariantSuffixes = new Set(
        (knownProductSpec?.variants ?? []).map((variant) => normalizeVariantCode(variant.code)),
      )
      const g = cafeGroup ?? buildFallbackGroup(normalizedCode)
      const variants = buildDisplayVariants(normalizedCode, g?.variants ?? [], g?.price ?? 0)
      const hasLVariants = g ? !!g.is_multi || variants.length > 1 : variants.length > 1
      const hasVariantRows = variants.length > 0
      const firstVariant = hasVariantRows ? variants[0] : null
      const cafeVariantsBySuffix = new Set(
        (cafeGroup?.variants ?? []).map((variant) =>
          normalizeVariantSuffix(normalizedCode, variant.variant_code).toUpperCase(),
        ),
      )
      const variantDirectQtyMissing = variants.map((variant) => {
        const suffix = normalizeVariantSuffix(normalizedCode, variant.variant_code).toUpperCase()
        if (cafeVariantsBySuffix.has(suffix)) return false
        if (knownVariantSuffixes.has(suffix)) return false
        return true
      })
      const variantDirectQtyMeta = variants.map((variant, idx) => {
        if (variantDirectQtyMissing[idx]) return missingMeta
        const suffix = normalizeVariantSuffix(normalizedCode, variant.variant_code).toUpperCase()
        return cafeVariantsBySuffix.has(suffix) ? loadedMeta : periodNoSalesMeta
      })
      const directQtyMissing = hasVariantRows ? (variantDirectQtyMissing[0] ?? !knownProductSpec) : !knownProductSpec
      const directQty = hasVariantRows ? (firstVariant?.qty ?? 0) : g?.qty ?? 0
      const directUnitPrice = (hasVariantRows ? (firstVariant?.price ?? 0) : g?.price ?? 0) || 0
      const mappingQtyByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingHasRuleByColumn = Array(U_COLUMNS.length).fill(false)
      const mappingRevByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingPriceByColumn = Array(U_COLUMNS.length).fill(0)
      const mappingPriceRefByColumn: Array<RevenueUnitPriceRef | null> = Array(U_COLUMNS.length).fill(null)
      const mappingPriceIsFoundByColumn = Array(U_COLUMNS.length).fill(false)
      const mappingStateByColumn = Array(U_COLUMNS.length).fill('unmapped' as CellState)
      const variantMappingQtyByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingRevByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingPriceByColumn = variants.map(() => Array(U_COLUMNS.length).fill(0))
      const variantMappingPriceRefByColumn: Array<Array<RevenueUnitPriceRef | null>> = variants.map(() =>
        Array(U_COLUMNS.length).fill(null),
      )
      const variantMappingPriceIsFoundByColumn = variants.map(() => Array(U_COLUMNS.length).fill(false))
      const variantMappingStateByColumn = variants.map(() =>
        Array(U_COLUMNS.length).fill('unmapped' as CellState),
      )
      const variantMappingHasRuleByColumn = variants.map(() => Array(U_COLUMNS.length).fill(false))

      U_COLUMNS.forEach((col, idx) => {
        const key = makeUCellKey(col.uProduct, col.uVariant)
        const isSetColumn = col.group === 'set'
        const setConfig = isSetColumn ? getSetConfigByProductCode(col.uProduct) : null
        const setComponents = isSetColumn
          ? getEffectiveSetComponentsForVariant(setConfig, col.uVariant, setAddedComponents, setComponentDrafts)
          : []
        const rule = isSetColumn ? undefined : effectiveRuleMap.get(key)
        const ruleUVariantIndex = U_VARIANT_INDEX_BY_KEY.get(key) ?? null

        const uGroup = byCode.get(normalizeProductCode(col.uProduct))
        const targetVariant = findUVariantData(uGroup, col.uProduct, col.uVariant)
        let uQty = 0
        let uPrice = 0
        let uPriceFound = false
        if (uGroup && (isSetColumn || !EXCLUDED_U_PRODUCTS.has(col.uProduct))) {
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
        const sourceOptionName = targetVariant?.option || targetVariant?.variant_code || col.uVariant
        mappingPriceByColumn[idx] = uPrice
        mappingPriceIsFoundByColumn[idx] = uPriceFound

        // 세트상품 구성 환산은 옵션 단위 의미이므로 variantMapping 쪽에만 넣는다.
        // 부모행 렌더링은 대표 옵션 값을 합산해 보여주기 때문에 여기에도 넣으면 단일 옵션 행이 중복 계산된다.
        const parentSetMatch = { hasComponent: false, qtyPerSet: 0, revenuePerSet: 0 }

        mappingHasRuleByColumn[idx] = isSetColumn
          ? parentSetMatch.hasComponent
          : hasRuleMatch(
              rule,
              normalizedCode,
              null,
              null,
              ruleUVariantIndex,
              hasLVariants,
            )

        const { qty, rev } = isSetColumn
          ? {
              qty: parentSetMatch.qtyPerSet * uQty,
              rev: parentSetMatch.revenuePerSet * uQty,
            }
          : rule
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
        if (!isSetColumn && mappingHasRuleByColumn[idx] && uPriceFound) {
          const parentOptionCode = firstVariant
            ? normalizeVariantSuffix(normalizedCode, firstVariant.variant_code).toUpperCase()
            : ''
          mappingPriceRefByColumn[idx] = makeMappedUnitPriceRef(
            col.uProduct,
            col.uVariant,
            col.blockLabel,
            sourceOptionName,
            normalizedCode,
            parentOptionCode,
            uPrice,
          )
        }
        if (isSetColumn) {
          mappingPriceByColumn[idx] = getSetComponentUnitPrice(parentSetMatch)
          mappingPriceIsFoundByColumn[idx] = parentSetMatch.hasComponent
        }
        mappingStateByColumn[idx] = isSetColumn
          ? setComponentCellState(mappingHasRuleByColumn[idx] ?? false, qty)
          : columnCellState(
              col.uProduct,
              mappingHasRuleByColumn[idx] ?? false,
              qty,
            )

        variants.forEach((v, vIdx) => {
          const targetLVariant = normalizeVariantSuffix(normalizedCode, v.variant_code).toUpperCase()
          const targetLVariantIndex = vIdx
          const variantSetMatch = isSetColumn
            ? getSetComponentMatch(setComponents, normalizedCode, targetLVariant, setConfig, col.uVariant)
            : { hasComponent: false, qtyPerSet: 0, revenuePerSet: 0, priceRefs: [] as SetComponentPriceRef[] }
          variantMappingHasRuleByColumn[vIdx][idx] = isSetColumn
            ? variantSetMatch.hasComponent
            : hasRuleMatch(
                rule,
                normalizedCode,
                targetLVariant,
                targetLVariantIndex,
                ruleUVariantIndex,
                hasLVariants,
              )
          const { qty: variantQty, rev: variantRev } = isSetColumn
            ? {
                qty: variantSetMatch.qtyPerSet * uQty,
                rev: variantSetMatch.revenuePerSet * uQty,
              }
            : rule
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
          variantMappingPriceByColumn[vIdx][idx] = isSetColumn ? getSetComponentUnitPrice(variantSetMatch) : uPrice
          variantMappingPriceRefByColumn[vIdx][idx] = isSetColumn
            ? (variantSetMatch.priceRefs[0] ?? null)
            : variantMappingHasRuleByColumn[vIdx][idx] && uPriceFound
              ? makeMappedUnitPriceRef(
                  col.uProduct,
                  col.uVariant,
                  col.blockLabel,
                  sourceOptionName,
                  normalizedCode,
                  targetLVariant,
                  uPrice,
                )
              : null
          variantMappingPriceIsFoundByColumn[vIdx][idx] = isSetColumn
            ? variantSetMatch.hasComponent
            : mappingPriceIsFoundByColumn[idx]
          variantMappingStateByColumn[vIdx][idx] = isSetColumn
            ? setComponentCellState(variantMappingHasRuleByColumn[vIdx][idx] ?? false, variantQty)
            : columnCellState(
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
      const directQtyForSummary = variants.reduce(
        (sum, variant, idx) => sum + (variantDirectQtyMissing[idx] ? 0 : (variant.qty ?? 0)),
        0,
      )
      const directQtyFallback = g ? (hasVariantRows ? directQtyForSummary : (g.qty ?? 0)) : 0
      const firstVariantDirectMeta = directQtyMissing
        ? missingMeta
        : (variantDirectQtyMeta[0] ?? (cafeGroup ? loadedMeta : periodNoSalesMeta))
      const variantTotalPartial = variants.map((_, idx) => variantDirectQtyMissing[idx] ?? false)
      const variantTotalMeta = variantTotalPartial.map((partial) => (partial ? partialMeta : loadedMeta))
      // 부모행은 부모 직접판매 + 부모 매핑/대표옵션 매핑 값만 반영한다.
      const subtotalQty = directQty + mappingQtyByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedQty
      const subtotalRev =
        directQty * directUnitPrice + mappingRevByColumn.reduce((s, v) => s + v, 0) + firstVariantMappedRev
      const summaryQty = subtotalQty + remainingVariantQty
      const summaryRev = subtotalRev + remainingVariantRev
      const totalPartial = directQtyMissing
      const totalMeta = totalPartial ? partialMeta : loadedMeta
      const firstVariantRevenueMeta = directQtyMissing
        ? (subtotalRev > 0 ? partialMeta : missingMeta)
        : loadedMeta
      const variantRevenueMeta = variantDirectQtyMissing.map((missing, idx) => {
        if (!missing) return loadedMeta
        const mappedRev = variantMappingRevByColumn[idx]?.reduce((s, q) => s + q, 0) ?? 0
        return mappedRev > 0 ? partialMeta : missingMeta
      })

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
          directQtyMissing,
          directQtyMeta: firstVariantDirectMeta,
          revenueMissing: firstVariantRevenueMeta.status === 'missing',
          revenueMeta: firstVariantRevenueMeta,
          totalPartial,
          totalMeta,
          variantDirectQtyMissing,
          variantRevenueMissing: variantRevenueMeta.map((meta) => meta.status === 'missing'),
          variantTotalPartial,
          variantDirectQtyMeta,
          variantRevenueMeta,
          variantTotalMeta,
          directUnitPrice,
          mappingPriceByColumn,
          mappingPriceRefByColumn,
          mappingPriceIsFoundByColumn,
          mappingQtyByColumn,
          mappingHasRuleByColumn,
          mappingRevByColumn,
          mappingStateByColumn,
          variantMappingQtyByColumn,
          variantMappingPriceByColumn,
          variantMappingPriceRefByColumn,
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
        directQtyMissing: true,
        directQtyMeta: missingMeta,
        revenueMissing: true,
        revenueMeta: missingMeta,
        totalPartial: true,
        totalMeta: partialMeta,
        variantDirectQtyMissing: [],
        variantRevenueMissing: [],
        variantTotalPartial: [],
        variantDirectQtyMeta: [],
        variantRevenueMeta: [],
        variantTotalMeta: [],
        directUnitPrice,
        mappingPriceByColumn,
        mappingPriceRefByColumn,
        mappingPriceIsFoundByColumn,
        mappingQtyByColumn,
        mappingHasRuleByColumn,
        mappingRevByColumn,
        mappingStateByColumn,
        variantMappingQtyByColumn: [],
        variantMappingPriceByColumn: [],
        variantMappingPriceRefByColumn: [],
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
    return L_GROUPS.map((group) => {
      const rows: Row[] = group.codes.map((code) => lRowsByCode.get(code) ?? buildRow(code))
      const subtotalSourceRows = rows
      const subtotalHasMissing = subtotalSourceRows.some((row) =>
        row.directQtyMissing || row.variantDirectQtyMissing.some(Boolean),
      )

      return {
        label: group.label,
        category: group.category,
        withSubtotal: group.withSubtotal !== false,
        rows,
        subtotalQty: subtotalSourceRows.reduce((s, r) => s + r.subtotalQtyForSummary, 0),
        subtotalRev: subtotalSourceRows.reduce((s, r) => s + r.subtotalRevForSummary, 0),
        subtotalDirectQty: subtotalSourceRows.reduce((s, r) => s + r.directQtyForSummary, 0),
        subtotalHasMissing,
        subtotalRevHasMissing: subtotalHasMissing,
        subtotalMappingHasMissingByColumn: Array.from({ length: U_COLUMNS.length }, () => false),
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
  }, [allGroups, effectiveRuleMap, setAddedComponents, setComponentDrafts])

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
  const totalHasMissing = groupRows.some((g) => g.withSubtotal !== false && g.subtotalHasMissing)
  const totalRevHasMissing = groupRows.some((g) => g.withSubtotal !== false && g.subtotalRevHasMissing)
  const totalMappingHasMissingByColumn = Array.from({ length: U_COLUMNS.length }, (_, idx) =>
    groupRows.some((g) => g.withSubtotal !== false && (g.subtotalMappingHasMissingByColumn[idx] ?? false)),
  )
  const totalColumnCount = 1 + 6 + U_COLUMNS.length + 2
  const uColumnPixelWidths = useMemo(
    () => U_BLOCKS.flatMap((block) =>
      Array.from({ length: block.variants.length }, () =>
        Math.max(32, 96 / block.variants.length),
      ),
    ),
    [],
  )
  const leftColumnPixelWidths = useMemo(
    () => leftColumnWidthsForViewMode(viewMode, isLeftCompact),
    [viewMode, isLeftCompact],
  )
  const leftColumnLefts = useMemo(() => {
    let nextLeft = 42
    return leftColumnPixelWidths.map((width) => {
      const left = nextLeft
      nextLeft += width
      return left
    })
  }, [leftColumnPixelWidths])
  const tableWrapStyle = useMemo(() => ({
    '--pc-code-left': `${leftColumnLefts[0]}px`,
    '--pc-code-w': `${leftColumnPixelWidths[0]}px`,
    '--pc-name-left': `${leftColumnLefts[1]}px`,
    '--pc-name-w': `${leftColumnPixelWidths[1]}px`,
    '--pc-option-code-left': `${leftColumnLefts[2]}px`,
    '--pc-option-code-w': `${leftColumnPixelWidths[2]}px`,
    '--pc-option-name-left': `${leftColumnLefts[3]}px`,
    '--pc-option-name-w': `${leftColumnPixelWidths[3]}px`,
    '--pc-price-left': `${leftColumnLefts[4]}px`,
    '--pc-price-w': `${leftColumnPixelWidths[4]}px`,
    '--pc-direct-left': `${leftColumnLefts[5]}px`,
    '--pc-direct-w': `${leftColumnPixelWidths[5]}px`,
  }) as CSSProperties, [leftColumnLefts, leftColumnPixelWidths])
  const tableWrapClassName = [
    'pc-excel-table-wrap',
    isLeftCompact ? 'is-left-compact' : '',
    `view-mode-${viewMode}`,
    leftColumnPixelWidths[1] === 0 ? 'is-name-hidden' : '',
    leftColumnPixelWidths[3] === 0 ? 'is-option-name-hidden' : '',
    leftColumnPixelWidths[4] === 0 ? 'is-price-hidden' : '',
  ].filter(Boolean).join(' ')
  const tablePixelWidth =
    42 +
    leftColumnPixelWidths.reduce((sum, width) => sum + width, 0) +
    uColumnPixelWidths.reduce((sum, width) => sum + width, 0) +
    78 +
    142
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
      ['A:옵션명', 4],
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
      key: 'product-codes-u-direct',
      rowType: 'uDirect',
      groupLabel: 'U상품 판매수',
    })

    groupRows.forEach((grp) => {
      if (groupRows.findIndex((candidate) => candidate.category === grp.category) === groupRows.indexOf(grp)) {
        addRow({
          key: categoryRowKey(grp.category),
          rowType: 'category',
          groupLabel: grp.category,
        })
      }

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
        const parentTotalMappedPriceRef = row.mappingPriceRefByColumn.map((priceRef, idx) => {
          if (row.mappingHasRuleByColumn[idx]) return priceRef
          return row.variantMappingPriceRefByColumn[0]?.[idx] ?? null
        })
        const parentPriceFoundByColumn = row.mappingPriceIsFoundByColumn.map((priceIsFound, idx) => {
          if (priceIsFound) return true
          return row.variantMappingPriceIsFoundByColumn[0]?.[idx] ?? false
        })
        const parentMapped = buildRevenueMappedTerms(
          parentTotalMappedQty,
          parentTotalMappedPrice,
          parentTotalMappedPriceRef,
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
          product_name: row.product_name,
          variant_code: row.variants[0]?.variant_code,
          option_name: row.variants[0]?.option,
          unit_price: row.directUnitPrice,
          revenueDirectQty: row.directQty,
          revenueMissing: row.revenueMissing,
          revenueMappedTerms: parentMapped.terms,
          revenueMappedPriceWarnings: parentMapped.warnings,
          totalPartial: row.totalPartial,
        })
        sourceRowKeys.push(parentKey)

        if (row.variants.length > 1) {
          row.variants.slice(1).forEach((variant, idx) => {
            const variantKey = `variant:${row.product_code}:${variant.variant_code}`
            const variantIdx = idx + 1
            const variantQtyByColumn = row.variantMappingQtyByColumn[variantIdx] ?? []
            const variantPriceByColumn = row.variantMappingPriceByColumn[variantIdx] ?? []
            const variantPriceRefByColumn = row.variantMappingPriceRefByColumn[variantIdx] ?? []
            const variantHasRuleByColumn = row.variantMappingHasRuleByColumn[variantIdx] ?? []
            const variantMapped = buildRevenueMappedTerms(
              variantQtyByColumn,
              variantPriceByColumn,
              variantPriceRefByColumn,
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
              product_name: row.product_name,
              variant_code: variant.variant_code,
              option_name: variant.option || variant.variant_code,
              unit_price: variant.price || row.price || 0,
              revenueDirectQty: variant.qty,
              revenueMissing: row.variantRevenueMissing[variantIdx] ?? false,
              revenueMappedTerms: variantMapped.terms,
              revenueMappedPriceWarnings: variantMapped.warnings,
              totalPartial: row.variantTotalPartial[variantIdx] ?? false,
            })
            sourceRowKeys.push(variantKey)
          })
        }
      })

      const subtotalSourceRows = sourceRowKeys

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

  const excelColumnLabels = useMemo(() => {
    const fixed = [
      { key: 'A:상품코드', className: 'sticky sticky-code' },
      { key: 'A:상품명', className: 'sticky sticky-name' },
      { key: 'A:코드', className: 'sticky sticky-option-code' },
      { key: 'A:옵션명', className: 'sticky sticky-option-name' },
      { key: 'A:단가', className: 'sticky sticky-price' },
      { key: DIRECT_CELL_SCREEN_KEY, className: 'sticky sticky-direct' },
    ].map((item) => ({
      ...item,
      label: toExcelCol(colMetaByKey.get(item.key)?.excelCol ?? 0),
    }))
    const uColumns = U_COLUMNS.map((col, idx) => ({
      key: `B:${col.uProduct}-${col.uVariant}`,
      label: toExcelCol(U_START_EXCEL_COL + idx),
      className: `matrix-variant ${uColumnClass(idx)}`,
    }))
    return [
      ...fixed,
      ...uColumns,
      {
        key: TOTAL_SCREEN_KEY,
        label: toExcelCol(totalExcelColumn),
        className: 'sticky sticky-total',
      },
      {
        key: REVENUE_SCREEN_KEY,
        label: toExcelCol(revenueExcelColumn),
        className: 'sticky sticky-rev',
      },
    ]
  }, [colMetaByKey, totalExcelColumn, revenueExcelColumn])

  const rowFormulaByKey = useMemo(() => {
    const map = new Map<string, FormulaBuildResult>()
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
    return a1(rowMeta.excelRow, colMeta.excelCol)
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

  const selectedFormulaExplanation = useMemo(() => {
    if (!selectedCell) return null
    const formula = rowFormulaByKey.get(`${selectedCell.rowKey}|${selectedCell.colKey}`)
    return formula?.explanation ?? null
  }, [selectedCell, rowFormulaByKey])

  const currency = state.data?.grand.currency ?? 'KRW'
  const activeDetailCell = hoveredCell ?? selectedCell

  const activeRowContext = useMemo(() => {
    if (!activeDetailCell) return null
    const rowMeta = rowMetaByKey.get(activeDetailCell.rowKey)
    if (!rowMeta?.product_name) {
      return {
        product: selectedCell?.rowKey === activeDetailCell.rowKey ? selectedCell.rowLabel : rowMeta?.groupLabel ?? '-',
        option: '',
      }
    }
    return {
      product: rowMeta.product_code
        ? `${rowMeta.product_code} / ${rowMeta.product_name}`
        : rowMeta.product_name,
      option: displayOptionWithCode(rowMeta.product_code, rowMeta.variant_code, rowMeta.option_name),
      price: formatSelectionPrice(rowMeta.unit_price, currency),
    }
  }, [activeDetailCell, currency, rowMetaByKey, selectedCell])

  const hoveredUColumnInfo = useMemo(() => {
    if (!hoveredCell) return null
    return uColumnInfoByKey.get(hoveredCell.colKey) ?? null
  }, [hoveredCell, uColumnInfoByKey])

  const selectedUColumnInfo = useMemo(() => {
    if (!selectedCell) return null
    return uColumnInfoByKey.get(selectedCell.colKey) ?? null
  }, [selectedCell, uColumnInfoByKey])

  const activeUColumnInfo = hoveredUColumnInfo ?? selectedUColumnInfo

  const activeSetConfig = useMemo(() => getSetConfigByProductCode(editingSetProductCode), [editingSetProductCode])
  const activeSetVariant = activeSetConfig?.variants.find(
    (variant) => normalizeVariantCode(variant.variantCode) === normalizeVariantCode(selectedSetVariantCode),
  ) ?? activeSetConfig?.variants[0] ?? null
  const commonSetScopeKey = activeSetConfig
    ? makeSetComponentScopeKey(activeSetConfig.productCode, 'common')
    : ''
  const optionSetScopeKey = activeSetConfig && activeSetVariant
    ? makeSetComponentScopeKey(activeSetConfig.productCode, 'option', activeSetVariant.variantCode)
    : ''
  const activeSetCommonComponents = activeSetConfig
    ? [
      ...(activeSetConfig.commonComponents ?? []),
      ...(setAddedComponents[commonSetScopeKey] ?? []),
    ]
    : []
  const activeSetOptionComponents = activeSetVariant
    ? [
      ...activeSetVariant.components,
      ...(setAddedComponents[optionSetScopeKey] ?? []),
    ]
    : []
  const activeSetComponents = [...activeSetCommonComponents, ...activeSetOptionComponents]
  const visibleSetComponents = activeSetComponents.filter((component) => !getSetComponentDraft(setComponentDrafts, component).deleted)
  const activeSetHasIncomplete = visibleSetComponents.some((component) =>
    !isSetComponentDraftComplete(getSetComponentDraft(setComponentDrafts, component)),
  )
  const activeSetTotal = visibleSetComponents.reduce((sum, component) => {
    const draft = getSetComponentDraft(setComponentDrafts, component)
    return sum + getSetComponentDraftAmount(draft)
  }, 0)
  const activeSetDirty = activeSetComponents.some((component) =>
    hasSetComponentDraftChange(setComponentDrafts, component),
  ) || Boolean(activeSetConfig && (
    (setAddedComponents[commonSetScopeKey]?.length ?? 0) > 0
    || (setAddedComponents[optionSetScopeKey]?.length ?? 0) > 0
  ))
  const showSetCommonCard = activeSetCommonComponents.length > 0
  const setEditorLayoutStyle: CSSProperties | undefined = setEditorLayout
    ? {
      left: `${setEditorLayout.x}px`,
      top: `${setEditorLayout.y}px`,
      width: `${setEditorLayout.width}px`,
      height: `${setEditorLayout.height}px`,
    }
    : undefined

  const constrainSetEditorLayout = (layout: SetEditorLayout): SetEditorLayout => {
    if (typeof window === 'undefined') return layout
    const maxWidth = Math.max(SET_EDITOR_MIN_WIDTH, window.innerWidth - SET_EDITOR_MARGIN * 2)
    const maxHeight = Math.max(SET_EDITOR_MIN_HEIGHT, window.innerHeight - SET_EDITOR_MARGIN * 2)
    const width = clampNumber(layout.width, SET_EDITOR_MIN_WIDTH, maxWidth)
    const height = clampNumber(layout.height, SET_EDITOR_MIN_HEIGHT, maxHeight)
    const maxX = Math.max(SET_EDITOR_MARGIN, window.innerWidth - width - SET_EDITOR_MARGIN)
    const maxY = Math.max(SET_EDITOR_MARGIN, window.innerHeight - height - SET_EDITOR_MARGIN)
    return {
      x: clampNumber(layout.x, SET_EDITOR_MARGIN, maxX),
      y: clampNumber(layout.y, SET_EDITOR_MARGIN, maxY),
      width,
      height,
    }
  }

  const readCurrentSetEditorLayout = (): SetEditorLayout | null => {
    const modal = setEditorModalRef.current
    if (!modal) return null
    const rect = modal.getBoundingClientRect()
    return constrainSetEditorLayout({
      x: rect.left,
      y: rect.top,
      width: rect.width,
      height: rect.height,
    })
  }

  const expandSetEditorForCommonSection = () => {
    const layout = readCurrentSetEditorLayout()
    if (!layout) return
    setSetEditorLayout(constrainSetEditorLayout({
      ...layout,
      height: layout.height + SET_EDITOR_COMMON_SECTION_EXPAND_HEIGHT,
    }))
  }

  const startSetEditorMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const layout = readCurrentSetEditorLayout()
    if (!layout) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setEditorDragRef.current = {
      mode: 'move',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.x,
      originY: layout.y,
      width: layout.width,
      height: layout.height,
    }
    setSetEditorLayout(layout)
  }

  const startSetEditorResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    const layout = readCurrentSetEditorLayout()
    if (!layout) return
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setEditorDragRef.current = {
      mode: 'resize',
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: layout.x,
      originY: layout.y,
      originWidth: layout.width,
      originHeight: layout.height,
    }
    setSetEditorLayout(layout)
  }

  const moveSetEditorLayout = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = setEditorDragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    event.preventDefault()
    if (state.mode === 'move') {
      setSetEditorLayout(constrainSetEditorLayout({
        x: state.originX + event.clientX - state.startX,
        y: state.originY + event.clientY - state.startY,
        width: state.width,
        height: state.height,
      }))
      return
    }
    setSetEditorLayout(constrainSetEditorLayout({
      x: state.originX,
      y: state.originY,
      width: state.originWidth + event.clientX - state.startX,
      height: state.originHeight + event.clientY - state.startY,
    }))
  }

  const stopSetEditorLayoutChange = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = setEditorDragRef.current
    if (!state || state.pointerId !== event.pointerId) return
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setEditorDragRef.current = null
  }

  const getSetScopeKeysForConfig = (config: SetProductConfig) => [
    makeSetComponentScopeKey(config.productCode, 'common'),
    ...config.variants.map((variant) =>
      makeSetComponentScopeKey(config.productCode, 'option', variant.variantCode)
    ),
  ]

  const getSetComponentsForConfig = (config: SetProductConfig) => [
    ...(config.commonComponents ?? []),
    ...(setAddedComponents[makeSetComponentScopeKey(config.productCode, 'common')] ?? []),
    ...config.variants.flatMap((variant) => [
      ...variant.components,
      ...(setAddedComponents[makeSetComponentScopeKey(config.productCode, 'option', variant.variantCode)] ?? []),
    ]),
  ]

  const clearSetDraftForConfig = (config: SetProductConfig) => {
    const componentIds = new Set(getSetComponentsForConfig(config).map((component) => component.id))
    const scopeKeys = getSetScopeKeysForConfig(config)

    setSetComponentDrafts((prev) => {
      const next = { ...prev }
      componentIds.forEach((componentId) => {
        delete next[componentId]
      })
      return next
    })
    setSetAddedComponents((prev) => {
      const next = { ...prev }
      scopeKeys.forEach((scopeKey) => {
        delete next[scopeKey]
      })
      return next
    })
  }

  const openSetConfigModal = (productCode: string, variantCode?: string) => {
    const config = getSetConfigByProductCode(productCode)
    if (!config) return
    setEditingSetProductCode(config.productCode)
    setSelectedSetVariantCode(variantCode && config.variants.some((variant) => normalizeVariantCode(variant.variantCode) === normalizeVariantCode(variantCode))
      ? normalizeVariantCode(variantCode)
      : config.variants[0]?.variantCode ?? '')
  }

  const updateSetComponentDraft = (
    component: SetProductComponent,
    patch: Partial<SetProductComponentDraft>,
  ) => {
    setSetComponentDrafts((prev) => {
      const current = getSetComponentDraft(prev, component)
      const next = {
        ...current,
        ...patch,
      }
      const normalizedNext = {
        ...next,
        productCode: normalizeProductCode(next.productCode),
        optionCode: normalizeVariantCode(next.optionCode),
        qty: Number.isFinite(next.qty) ? next.qty : 0,
        setPrice: Number.isFinite(next.setPrice) ? next.setPrice : 0,
      }
      const resetToBase = !normalizedNext.deleted
        && normalizedNext.productCode === component.productCode
        && normalizedNext.optionCode === component.optionCode
        && normalizedNext.qty === component.qty
        && normalizedNext.setPrice === component.setPrice
      if (resetToBase) {
        const rest = { ...prev }
        delete rest[component.id]
        return rest
      }
      return { ...prev, [component.id]: normalizedNext }
    })
  }

  const updateSetComponentProduct = (component: SetProductComponent, productCode: string) => {
    const normalizedProductCode = normalizeProductCode(productCode)
    const firstVariant = getLVariantChoices(normalizedProductCode)[0]
    updateSetComponentDraft(component, {
      productCode: normalizedProductCode,
      optionCode: firstVariant?.code ?? '',
      setPrice: firstVariant?.price ?? 0,
    })
  }

  const updateSetComponentOption = (component: SetProductComponent, optionCode: string) => {
    const current = getSetComponentDraft(setComponentDrafts, component)
    const normalizedOptionCode = normalizeVariantCode(optionCode)
    updateSetComponentDraft(component, {
      optionCode: normalizedOptionCode,
      setPrice: getLVariantPrice(current.productCode, normalizedOptionCode) || current.setPrice,
    })
  }

  const addSetComponent = (scope: SetComponentScope) => {
    if (!activeSetConfig || !activeSetVariant) return
    const scopeKey = scope === 'common'
      ? commonSetScopeKey
      : optionSetScopeKey
    const shouldExpandForCommon = scope === 'common' && activeSetCommonComponents.length === 0
    const targetComponents = scope === 'common' ? activeSetCommonComponents : activeSetOptionComponents
    const hasIncompleteDraft = targetComponents.some((component) => {
      const draft = getSetComponentDraft(setComponentDrafts, component)
      return !draft.deleted && !isSetComponentDraftComplete(draft)
    })
    if (hasIncompleteDraft) {
      if (shouldExpandForCommon) expandSetEditorForCommonSection()
      return
    }
    const component: SetProductComponent = {
      id: `draft-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      scope,
      productCode: '',
      optionCode: '',
      qty: 1,
      setPrice: 0,
    }
    setSetAddedComponents((prev) => ({
      ...prev,
      [scopeKey]: [...(prev[scopeKey] ?? []), component],
    }))
    if (shouldExpandForCommon) {
      expandSetEditorForCommonSection()
    }
  }

  const deleteSetComponent = (component: SetProductComponent) => {
    if (component.id.startsWith('draft-')) {
      setSetAddedComponents((prev) => {
        const next = { ...prev }
        for (const [scopeKey, components] of Object.entries(next)) {
          next[scopeKey] = components.filter((candidate) => candidate.id !== component.id)
        }
        return next
      })
      return
    }
    updateSetComponentDraft(component, { deleted: true })
  }

  const resetActiveSetDraft = () => {
    if (!activeSetConfig) return
    clearSetDraftForConfig(activeSetConfig)
  }

  const cancelActiveSetDraft = () => {
    if (activeSetConfig) clearSetDraftForConfig(activeSetConfig)
    setEditingSetProductCode(null)
  }

  const excelRowNumber = (rowKey: string) => rowMetaByKey.get(rowKey)?.excelRow ?? ''

  useEffect(() => {
    const table = tableRef.current
    if (!table) return
    const cells = table.querySelectorAll('td[data-row-key][data-col-key]')
    cells.forEach((cell) => {
      const rowKey = cell.getAttribute('data-row-key') ?? ''
      const colKey = cell.getAttribute('data-col-key') ?? ''
      const explicitTitle = cell.getAttribute('title')?.trim()
      const formula = rowKey && colKey ? rowFormulaByKey.get(`${rowKey}|${colKey}`) : null
      const rowMeta = rowMetaByKey.get(rowKey)
      const colMeta = colMetaByKey.get(colKey)
      cell.setAttribute('data-row', rowKey)
      cell.setAttribute('data-col', colKey)
      cell.setAttribute('data-a1', rowMeta && colMeta ? a1(rowMeta.excelRow, colMeta.excelCol) : '')
      cell.setAttribute('data-formula', formula?.display ?? '')
      cell.setAttribute('data-excel-formula', formula?.excel ?? '')
      if (formula) {
        cell.classList.add('formula-cell')
        cell.setAttribute('title', `수식: ${formula.display}`)
      } else {
        const fullText = cell.getAttribute('data-full-text')?.trim()
        cell.classList.remove('formula-cell')
        cell.setAttribute('title', explicitTitle || fullText || '선택한 셀')
      }
    })
  }, [colMetaByKey, rowFormulaByKey, rowMetaByKey, state.data])


  const isRunning = state.status === 'running'
  const dataReady = !!state.data

  useEffect(() => {
    clearSelection()
    clearPinnedCrosses()
  }, [state.data])

  useEffect(() => {
    const wrap = tableWrapRef.current
    if (!wrap) return
    const handleClick = (event: globalThis.MouseEvent) => {
      const target = event.target as HTMLElement | null
      const cell = target?.closest<HTMLTableCellElement>('td[data-row-key][data-col-key]')
      if (!cell || !wrap.contains(cell)) return
      const rowKey = cell.dataset.rowKey
      const colKey = cell.dataset.colKey
      if (!rowKey || !colKey) return
      cellClickDetailRef.current = {
        rowKey,
        colKey,
        detail: event.detail,
        viewportTop: cell.getBoundingClientRect().top,
      }
    }
    wrap.addEventListener('click', handleClick, true)
    return () => {
      wrap.removeEventListener('click', handleClick, true)
    }
  }, [state.data])

  useEffect(() => {
    return () => clearPendingFormulaSingleClick()
  }, [])

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return

      const target = event.target
      const editableTarget = target instanceof HTMLElement
        && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
      if (editableTarget || editingSetProductCode || pendingLuAction) return

      if (removeLatestPinnedCross()) {
        event.preventDefault()
        return
      }

      if (selectedCell) {
        event.preventDefault()
        clearSelection()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editingSetProductCode, pendingLuAction, pinnedCrosses, selectedCell])

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

  const parseExportValue = (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || trimmed === '—' || trimmed === MISSING_DISPLAY) return ''
    const numeric = trimmed.replace(/[₩,\s*]/g, '')
    if (/^-?\d+(?:\.\d+)?$/.test(numeric)) return Number(numeric)
    return trimmed
  }

  const handleExportExcel = async () => {
    if (!state.data || !tableRef.current) return
    const ExcelJS = await import('exceljs')
    const workbook = new ExcelJS.Workbook()
    workbook.creator = 'catchup'
    workbook.created = new Date()
    Object.assign(workbook.calcProperties, {
      calcMode: 'auto',
      calcOnSave: true,
      forceFullCalc: true,
      fullCalcOnLoad: true,
      fullPrecision: true,
    })
    const worksheet = workbook.addWorksheet('상품코드', {
      views: [{ state: 'frozen', xSplit: 6, ySplit: 9 }],
    })

    const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF334155' } }
    const setHeaderFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF14532D' } }
    const headerFont = { bold: true, color: { argb: 'FFF8FAFC' }, size: 9 }
    const sumFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF1F5F9' } }
    const bodyFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } }
    const conversionMappedFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDBEAFE' } }
    const setMappedFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFDCFCE7' } }
    const border = { style: 'thin' as const, color: { argb: 'FF94A3B8' } }
    const summaryBorder = { style: 'medium' as const, color: { argb: 'FF94A3B8' } }
    const applyBorder = (cell: { border: unknown; alignment: unknown }) => {
      cell.border = { top: border, right: border, bottom: border, left: border }
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    }
    const styleRange = (
      startRow: number,
      startCol: number,
      endRow: number,
      endCol: number,
      style: { fill?: unknown; font?: unknown; alignment?: unknown; border?: unknown },
    ) => {
      for (let row = startRow; row <= endRow; row += 1) {
        for (let col = startCol; col <= endCol; col += 1) {
          const cell = worksheet.getCell(row, col) as {
            fill: unknown
            font: unknown
            alignment: unknown
            border: unknown
          }
          if (style.fill) cell.fill = style.fill
          if (style.font) cell.font = style.font
          if (style.alignment) cell.alignment = style.alignment
          cell.border = style.border ?? { top: border, right: border, bottom: border, left: border }
        }
      }
    }

    const priceReferenceRows = buildRevenueUnitPriceReferenceRows(rowMetaByKey)
    const priceReferenceSheet = workbook.addWorksheet('매출단가참조')
    priceReferenceSheet.columns = [
      { header: '참조명', key: 'refName', width: 44 },
      { header: '참조유형', key: 'sourceType', width: 16 },
      { header: '위쪽상품코드', key: 'sourceProductCode', width: 14 },
      { header: '위쪽상품명', key: 'sourceProductName', width: 38 },
      { header: '위쪽옵션', key: 'sourceOptionCode', width: 10 },
      { header: '위쪽옵션명', key: 'sourceOptionName', width: 34 },
      { header: '왼쪽상품코드', key: 'targetProductCode', width: 14 },
      { header: '왼쪽상품명', key: 'targetProductName', width: 42 },
      { header: '왼쪽옵션', key: 'targetOptionCode', width: 10 },
      { header: '왼쪽옵션명', key: 'targetOptionName', width: 36 },
      { header: '수량', key: 'componentQty', width: 8 },
      { header: '구성 단가', key: 'unitPrice', width: 14 },
      { header: '1세트 구성금액', key: 'amount', width: 16 },
    ]
    priceReferenceSheet.getRow(1).font = { bold: true, color: { argb: 'FF064E3B' } }
    priceReferenceSheet.getRow(1).fill = {
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: 'FFD1FAE5' },
    }
    priceReferenceRows.forEach((row) => {
      const nextRow = priceReferenceSheet.addRow({
        refName: row.ref.refName,
        sourceType: row.sourceType,
        sourceProductCode: row.ref.sourceProductCode,
        sourceProductName: row.ref.sourceProductName,
        sourceOptionCode: row.ref.sourceOptionCode,
        sourceOptionName: row.ref.sourceOptionName,
        targetProductCode: row.ref.targetProductCode,
        targetProductName: row.ref.targetProductName,
        targetOptionCode: row.ref.targetOptionCode,
        targetOptionName: row.ref.targetOptionName,
        componentQty: row.quantity ?? '',
        unitPrice: row.ref.unitPrice,
        amount: row.ref.kind === 'set-component' ? row.amount : null,
      })
      const priceCell = nextRow.getCell(12)
      priceCell.numFmt = '"₩"#,##0'
      const amountCell = nextRow.getCell(13)
      if (row.ref.kind === 'set-component') {
        amountCell.value = {
          formula: `K${nextRow.number}*L${nextRow.number}`,
          result: row.amount,
        }
      }
      amountCell.numFmt = '"₩"#,##0'
      workbook.definedNames.add(`'매출단가참조'!$L$${nextRow.number}`, row.ref.refName)
    })
    priceReferenceSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = { top: border, right: border, bottom: border, left: border }
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      })
    })
    autoFitWorksheetColumns(priceReferenceSheet, {
      1: { min: 44, max: 64 },
      2: { min: 14, max: 18 },
      3: { min: 14, max: 18 },
      4: { min: 28, max: 60 },
      5: { min: 10, max: 14 },
      6: { min: 24, max: 60 },
      7: { min: 14, max: 18 },
      8: { min: 28, max: 64 },
      9: { min: 10, max: 14 },
      10: { min: 24, max: 60 },
      11: { min: 8, max: 10 },
      12: { min: 14, max: 16 },
      13: { min: 16, max: 20 },
    })

    const fixedHeaders: Array<[number, string]> = [
      [1, '상품코드'],
      [2, '상품명'],
      [3, '코드'],
      [4, '옵션명'],
      [5, '단가'],
      [6, '직접판매'],
    ]
    fixedHeaders.forEach(([col, label]) => {
      worksheet.mergeCells(6, col, 8, col)
      const cell = worksheet.getCell(6, col)
      cell.value = label
      styleRange(6, col, 8, col, {
        fill: headerFill,
        font: headerFont,
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      })
    })

    let uCol = U_START_EXCEL_COL
    U_BLOCKS.forEach((block) => {
      const startCol = uCol
      const endCol = uCol + block.variants.length - 1
      worksheet.mergeCells(6, startCol, 7, endCol)
      const header = worksheet.getCell(6, startCol)
      header.value = `${U_GROUP_LABEL_BY_GROUP[block.group]}\n${block.productCode}\n${block.productLabel}`
      styleRange(6, startCol, 7, endCol, {
        fill: block.group === 'set' ? setHeaderFill : headerFill,
        font: headerFont,
        alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
      })
      block.variants.forEach((variant, idx) => {
        const cell = worksheet.getCell(8, startCol + idx)
        cell.value = variant
        cell.fill = headerFill
        cell.font = headerFont
        applyBorder(cell)
      })
      uCol = endCol + 1
    })

    worksheet.mergeCells(6, totalExcelColumn, 8, totalExcelColumn)
    const totalHeader = worksheet.getCell(6, totalExcelColumn)
    totalHeader.value = '총판매'
    styleRange(6, totalExcelColumn, 8, totalExcelColumn, {
      fill: sumFill,
      font: { bold: true, color: { argb: 'FF1F2937' } },
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    })
    worksheet.mergeCells(6, revenueExcelColumn, 8, revenueExcelColumn)
    const revenueHeader = worksheet.getCell(6, revenueExcelColumn)
    revenueHeader.value = '매출'
    styleRange(6, revenueExcelColumn, 8, revenueExcelColumn, {
      fill: sumFill,
      font: { bold: true, color: { argb: 'FF1F2937' } },
      alignment: { vertical: 'middle', horizontal: 'center', wrapText: true },
    })

    tableRef.current.querySelectorAll<HTMLTableCellElement>('td[data-a1][data-col-key]').forEach((domCell) => {
      const address = domCell.dataset.a1
      if (!address) return
      const cell = worksheet.getCell(address)
      const formula = domCell.dataset.excelFormula || domCell.dataset.formula
      const readStatus = domCell.dataset.readStatus
      const readNote = domCell.dataset.readNote
      const value = parseExportValue(domCell.dataset.exportValue ?? domCell.textContent ?? '')
      if (formula?.startsWith('=') && !formula.includes('단가미확인')) {
        cell.value = { formula: formula.slice(1), result: typeof value === 'number' ? value : undefined }
      } else {
        cell.value = value
      }
      cell.fill = bodyFill
      if (domCell.classList.contains('sticky-rev') || domCell.classList.contains('sticky-price')) {
        cell.numFmt = '"₩"#,##0'
      } else if (typeof value === 'number') {
        cell.numFmt = '#,##0'
      }
      if (domCell.classList.contains('sticky-total') || domCell.classList.contains('sticky-rev')) {
        cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFF8FAFC' } }
      }
      if (domCell.classList.contains('map-cell--mapped')) {
        cell.fill = domCell.classList.contains('u-col-set') ? setMappedFill : conversionMappedFill
        cell.font = { ...(cell.font as object), bold: true }
      }
      if (domCell.closest('.subtotal-row') || domCell.closest('tfoot')) {
        cell.fill = sumFill
        cell.font = { bold: true }
      }
      if (readStatus === 'missing') {
        cell.value = null
        cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFEF3C7' } }
        cell.font = { bold: true, color: { argb: 'FF92400E' } }
      } else if (readStatus === 'partial') {
        cell.fill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FFFFFBEB' } }
        cell.font = { ...(cell.font as object), bold: true, color: { argb: 'FF92400E' } }
      }
      if (readNote) {
        ;(cell as { note?: string }).note = readNote
      }
      applyBorder(cell)
      if (domCell.classList.contains('u-group-start')) {
        cell.border = { ...cell.border, left: { style: 'medium' as const, color: { argb: 'FF15803D' } } }
      }
      if (domCell.classList.contains('sticky-total') || domCell.classList.contains('sticky-rev')) {
        cell.border = { ...cell.border, left: summaryBorder }
      }
      if (domCell.classList.contains('sticky-name') || domCell.classList.contains('sticky-option-name')) {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true }
      }
    })

    const legendStartRow = worksheet.rowCount + 2
    worksheet.getCell(legendStartRow, 1).value = '조회값 상태 범례'
    worksheet.getCell(legendStartRow, 1).font = { bold: true }
    worksheet.getCell(legendStartRow + 1, 1).value = '0'
    worksheet.getCell(legendStartRow + 1, 2).value = 'Cafe24 조회값 0 또는 존재 확인된 상품/옵션의 기간 판매 없음'
    worksheet.getCell(legendStartRow + 2, 1).value = MISSING_DISPLAY
    worksheet.getCell(legendStartRow + 2, 2).value = '상품/옵션 존재 기준 확인불가. 화면 표기이며 엑셀 숫자 셀은 빈값'
    worksheet.getCell(legendStartRow + 3, 1).value = '*'
    worksheet.getCell(legendStartRow + 3, 2).value = '확인불가 항목 제외 합계'

    worksheet.getRow(5).height = 14
    worksheet.getRow(6).height = 38
    worksheet.getRow(7).height = 38
    worksheet.getRow(8).height = 18
    for (let row = 9; row <= worksheet.rowCount; row += 1) {
      worksheet.getRow(row).height = 18
    }

    worksheet.columns = [
      { width: 14 },
      { width: 52 },
      { width: 6 },
      { width: 37 },
      { width: 10 },
      { width: 9 },
      ...Array.from({ length: U_COLUMNS.length }, () => ({ width: 4.6 })),
      { width: 11 },
      { width: 20 },
    ]
    const productSheetWidthRules: Record<number, ExcelColumnWidthRule> = {
      1: { min: 14, max: 18 },
      2: { min: 52, max: 110 },
      3: { min: 6, max: 8 },
      4: { min: 42, max: 110 },
      5: { min: 10, max: 14 },
      6: { min: 9, max: 12 },
      [totalExcelColumn]: { min: 11, max: 13 },
      [revenueExcelColumn]: { min: 16, max: 20 },
    }
    U_COLUMNS.forEach((_, idx) => {
      const column = U_COLUMNS[idx]
      productSheetWidthRules[U_START_EXCEL_COL + idx] = column.group === 'set'
        ? { min: 12, max: 18 }
        : { min: 5.2, max: 9.5 }
    })
    autoFitWorksheetColumns(worksheet, productSheetWidthRules)

    worksheet.views = [{ state: 'frozen', xSplit: 6, ySplit: 8 }]

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `product-codes_${state.data.start}_${state.data.end}.xlsx`
    link.click()
    URL.revokeObjectURL(url)
  }

  const updateTopScrollbarWidth = () => {
    const table = tableRef.current
    const wrap = tableWrapRef.current
    if (!wrap) return
    const measuredWidth = Math.max(
      table?.scrollWidth ?? 0,
      wrap.scrollWidth,
      wrap.clientWidth,
    )
    const nextWidth = Math.max(scrollContentWidthRef.current, measuredWidth)
    scrollContentWidthRef.current = nextWidth
    setTopScrollbarWidth((prev) => (prev === nextWidth ? prev : nextWidth))
  }

  const clampScrollLeft = (el: HTMLElement, left: number) => {
    const maxLeft = Math.max(0, el.scrollWidth - el.clientWidth)
    return Math.min(Math.max(0, left), maxLeft)
  }

  const syncScrollLeftFromTop = (left: number) => {
    setIsLeftCompact(left > 24)
    const bottom = tableWrapRef.current
    if (!bottom || bottomSyncRef.current) return
    const nextLeft = clampScrollLeft(bottom, left)
    if (bottom.scrollLeft === nextLeft) return
    bottomSyncRef.current = true
    bottom.scrollLeft = nextLeft
    requestAnimationFrame(() => {
      bottomSyncRef.current = false
    })
  }

  const syncScrollLeftFromBottom = (left: number) => {
    setIsLeftCompact(left > 24)
    const top = topScrollbarRef.current
    if (!top) return
    if (bottomSyncRef.current) return
    const nextLeft = clampScrollLeft(top, left)
    if (top.scrollLeft === nextLeft) return
    bottomSyncRef.current = true
    top.scrollLeft = nextLeft
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
    scrollContentWidthRef.current = 0
    setTopScrollbarWidth(0)
  }, [state.data])

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

  const renderSetComponentRows = (components: SetProductComponent[]) => (
    components.map((component) => {
      const draft = getSetComponentDraft(setComponentDrafts, component)
      const isChanged = hasSetComponentDraftChange(setComponentDrafts, component)
      const variantChoices = getLVariantChoices(draft.productCode)
      const isIncomplete = !isSetComponentDraftComplete(draft)
      const amount = getSetComponentDraftAmount(draft)
      return (
        <tr
          key={component.id}
          className={`${isChanged ? 'is-changed' : ''}${draft.deleted ? ' is-deleted' : ''}${isIncomplete ? ' is-incomplete' : ''}`}
        >
          <td>
            <span className={`set-editor-scope is-${component.scope}`}>
              {component.scope === 'common' ? '공통' : '옵션'}
            </span>
          </td>
          <td>
            <select
              value={draft.productCode}
              title={draft.productCode ? `${draft.productCode} · ${getLProductName(draft.productCode)}` : '왼쪽상품을 선택하세요'}
              aria-label={`${component.id} 왼쪽상품`}
              onChange={(event) => updateSetComponentProduct(component, event.target.value)}
              disabled={draft.deleted}
            >
              <option value="">왼쪽상품 선택</option>
              {L_PRODUCT_CHOICES.map((choice) => (
                <option key={choice.productCode} value={choice.productCode}>
                  {choice.productCode} · {choice.productName}
                </option>
              ))}
            </select>
          </td>
          <td>
            <select
              value={draft.optionCode}
              title={draft.optionCode
                ? `${draft.optionCode} · ${displayOptionName(getLVariantChoices(draft.productCode).find((variant) => variant.code === draft.optionCode)?.option)}`
                : '왼쪽상품을 먼저 선택하세요'}
              aria-label={`${component.id} 왼쪽상품 옵션`}
              onChange={(event) => updateSetComponentOption(component, event.target.value)}
              disabled={draft.deleted || !draft.productCode}
            >
              <option value="">옵션 선택</option>
              {variantChoices.map((variant) => (
                <option key={variant.code} value={variant.code}>
                  {variant.code} · {displayOptionName(variant.option)}
                </option>
              ))}
            </select>
          </td>
          <td>
            <input
              type="number"
              min="0"
              step="1"
              value={draft.qty}
              aria-label={`${component.id} 수량`}
              onChange={(event) => updateSetComponentDraft(component, { qty: Number(event.target.value) })}
              disabled={draft.deleted}
            />
          </td>
          <td>
            <label className="set-editor-price-input" title={fmtCurrency(draft.setPrice, currency)}>
              <input
                type="text"
                inputMode="numeric"
                value={fmtCurrency(draft.setPrice, currency)}
                aria-label={`${component.id} 세트가`}
                onChange={(event) => updateSetComponentDraft(component, { setPrice: parseCurrencyInput(event.target.value) })}
                onFocus={(event) => event.currentTarget.select()}
                disabled={draft.deleted}
              />
            </label>
          </td>
          <td className="num set-editor-amount">{draft.deleted || isIncomplete ? '-' : fmtCurrency(amount, currency)}</td>
          <td>
            {draft.deleted ? (
              <button
                type="button"
                className="btn btn-secondary set-editor-row-action"
                onClick={() => updateSetComponentDraft(component, { deleted: false })}
              >
                복구
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary set-editor-row-action"
                onClick={() => deleteSetComponent(component)}
              >
                삭제
              </button>
            )}
          </td>
        </tr>
      )
    })
  )

  return (
    <div className="pc-excel-container">
      <div className="pc-excel-sticky-top">
        <header className="pc-excel-header">
          <a href="#" className="home-link">
            ← 홈
          </a>
          <h1>상품코드</h1>
        </header>

        <div className="filters card">
          <div className="filter-row product-codes-filter-row">
            <DateFilter
              start={start}
              end={end}
              onStartChange={handleStartChange}
              onEndChange={setEnd}
              endMin={start}
            />
            <button type="button" className="btn" onClick={handleExportExcel} disabled={!dataReady}>
              Excel 다운로드
            </button>
            <div className="product-codes-view-mode" aria-label="상품코드 보기 모드">
              <span className="view-mode-label">보기</span>
              {PRODUCT_CODES_VIEW_MODES.map((mode) => (
                <button
                  key={mode.value}
                  type="button"
                  className={`view-mode-button${viewMode === mode.value ? ' is-active' : ''}`}
                  aria-pressed={viewMode === mode.value}
                  title={mode.title}
                  onClick={() => setViewMode(mode.value)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            {dataReady ? (
              <div className="product-codes-filter-status">
                <div className={`pc-excel-selection-indicator${selectedCell ? ' is-selected' : ' is-empty'}`}>
                  <div className="selection-summary-row">
                    <span className="selection-period">
                      기간 {state.data!.start} ~ {state.data!.end}
                    </span>
                    {selectedCell ? (
                      <>
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
                          <span className="selection-label">선택</span>
                          <span className="selection-item">{selectedCoordinateText ?? '-'}</span>
                        </span>
                      </>
                    ) : (
                      <span className="selection-empty">
                        <span className="selection-label">선택</span>
                        <span>선택 없음</span>
                      </span>
                    )}
                    {pinnedCrosses.length > 0 ? (
                      <button
                        type="button"
                        className="selection-pinned-clear"
                        onClick={clearPinnedCrosses}
                        title="클릭해서 남긴 교차 하이라이트선을 모두 삭제"
                      >
                        고정선 {pinnedCrosses.length}개 지우기
                      </button>
                    ) : null}
                  </div>

                  <div className="selection-detail-grid" aria-label="선택 상세">
                    <section className="selection-product-panel selection-product-panel-left" aria-label="L상품(왼쪽 상품)">
                      <div className="selection-panel-title">L상품(왼쪽 상품)</div>
                      <div className="selection-detail-field">
                        <span className="selection-label">상품</span>
                        <span className="selection-detail-value">{activeRowContext?.product ?? '-'}</span>
                      </div>
                      <div className="selection-detail-field">
                        <span className="selection-label">옵션</span>
                        <span className="selection-detail-value">{activeRowContext?.option || '-'}</span>
                      </div>
                      <div className="selection-detail-field">
                        <span className="selection-label">가격</span>
                        <span className="selection-detail-value selection-price-value">
                          {activeRowContext?.price ?? '-'}
                        </span>
                      </div>
                    </section>
                    <section
                      className={`selection-product-panel selection-product-panel-top ${
                        activeUColumnInfo
                          ? activeUColumnInfo.group === 'set'
                            ? 'is-set'
                            : 'is-conversion'
                          : 'is-empty'
                      }`}
                      aria-label="U상품(위쪽 상품)"
                    >
                      <div className="selection-panel-title">
                        <span>U상품(위쪽 상품)</span>
                        {activeUColumnInfo ? (
                          <span className="selection-panel-type">
                            {U_GROUP_LABEL_BY_GROUP[activeUColumnInfo.group]}
                          </span>
                        ) : null}
                      </div>
                      <div className="selection-detail-field">
                        <span className="selection-label">상품</span>
                        <span className="selection-detail-value">
                          {activeUColumnInfo
                            ? `${activeUColumnInfo.productCode} · ${activeUColumnInfo.productLabel}`
                            : '-'}
                        </span>
                      </div>
                      <div className="selection-detail-field">
                        <span className="selection-label">옵션</span>
                        <span className="selection-detail-value">
                          {activeUColumnInfo
                            ? `${activeUColumnInfo.variantCode} · ${activeUColumnInfo.optionLabel}`
                            : '-'}
                        </span>
                      </div>
                      <div className="selection-detail-field">
                        <span className="selection-label">가격</span>
                        <span className="selection-detail-value selection-price-value">
                          {activeUColumnInfo
                            ? formatSelectionPrice(activeUColumnInfo.price, currency)
                            : '-'}
                        </span>
                      </div>
                    </section>
                    {selectedFormulaText ? (
                      <section className="formula-explanation" aria-label="수식 정보">
                        <div className="formula-explanation-header">
                          <FormulaExplanationTitleView
                            explanation={selectedFormulaExplanation}
                            fallback={`${selectedCoordinateText ?? ''} 수식`}
                          />
                          <div className="formula-explanation-actions" aria-label="계산 내역 표시 방식">
                            {formulaDetailsOpen && selectedFormulaExplanation ? (
                              <button
                                type="button"
                                className="formula-explanation-toggle"
                                onClick={() => setFormulaDetailsOpen(false)}
                              >
                                간략히
                              </button>
                            ) : selectedFormulaExplanation ? (
                              <button
                                type="button"
                                className="formula-explanation-toggle"
                                onClick={() => setFormulaDetailsOpen(true)}
                              >
                                자세히
                              </button>
                            ) : null}
                          </div>
                        </div>
                        {formulaDetailsOpen && selectedFormulaExplanation ? (
                          <div className="formula-explanation-terms">
                            {selectedFormulaExplanation.terms.map((term, idx) => (
                              <div className="formula-explanation-term" key={`${term.kind}-${idx}`}>
                                <span className="formula-term-index" aria-label={`내역 ${idx + 1}`}>
                                  {idx + 1}
                                </span>
                                <span className={`formula-term-kind formula-term-kind--${term.kind}`}>
                                  {term.label}
                                </span>
                                <FormulaTermDetailView term={term} />
                                {term.quantity != null ? (
                                  <span className="formula-term-number" title="수량">
                                    {quantityResultLabel(term.quantity)}
                                  </span>
                                ) : null}
                                {term.unitPrice != null ? (
                                  <span className="formula-term-number" title="단가">
                                    {formulaResultLabel(term.unitPrice)}
                                  </span>
                                ) : null}
                                {term.amount != null ? (
                                  <span className="formula-term-amount" title="금액">
                                    {formulaResultLabel(term.amount)}
                                  </span>
                                ) : null}
                              </div>
                            ))}
                            <div className="formula-explanation-total">
                              <span className="formula-total-label">합계</span>
                              <span className="formula-total-value">{selectedFormulaExplanation.summary}</span>
                            </div>
                          </div>
                        ) : null}
                        <div className="formula-source">
                          <div className="formula-source-label">원문 수식</div>
                          <span className="selection-formula-value">
                            {selectedFormulaParts.map((part, idx) => (
                              <span
                                key={`${part.kind}-${idx}`}
                                className={
                                  part.kind === 'price'
                                    ? 'selection-formula-price'
                                    : part.kind === 'set-price'
                                      ? 'selection-formula-set-price'
                                      : undefined
                                }
                                title={part.title}
                              >
                                {part.text}
                              </span>
                            ))}
                          </span>
                        </div>
                      </section>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}
            <div className="filter-spacer" />
            {copyToast ? <div className="pc-excel-copy-toast">{copyToast}</div> : null}
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
        <div className="pc-excel-section card">
          <div
            className="pc-excel-horizontal-scrollbar-top"
            ref={topScrollbarRef}
            onScroll={handleTopScroll}
          >
            <div
              className="pc-excel-horizontal-scrollbar-top-inner"
              style={{ width: `${topScrollbarWidth}px` }}
            />
          </div>
          <div
            className={tableWrapClassName}
            style={tableWrapStyle}
            ref={tableWrapRef}
            onScroll={handleBottomScroll}
            onMouseMove={handleTableMouseMove}
            onMouseLeave={clearHoveredCell}
          >
            <table
              className="pc-excel-table pc-excel-matrix"
              ref={tableRef}
              style={{ width: `${tablePixelWidth}px`, minWidth: `${tablePixelWidth}px` }}
            >
              <colgroup>
                <col style={{ width: '42px' }} />
                {leftColumnPixelWidths.map((width, idx) => (
                  <col key={`fixed-col-${idx}`} style={{ width: `${width}px` }} />
                ))}
                {uColumnPixelWidths.map((width, idx) => (
                  <col key={`u-col-${idx}`} style={{ width: `${width}px` }} />
                ))}
                <col style={{ width: '78px' }} />
                <col style={{ width: '142px' }} />
              </colgroup>
              <thead>
                <tr className="pc-excel-column-letter-row">
                  <th className="pc-excel-corner-cell" aria-label="Excel 좌표 기준" />
                  {excelColumnLabels.map((col) => (
                    <th
                      key={`pc-excel-col-${col.key}`}
                      className={getColumnHeaderClass(col.key, col.className)}
                      data-col-key={col.key}
                      title={`${col.label}열`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={manualHighlightedCols.has(col.key)}
                      onClick={() => toggleManualColHighlight(col.key)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          toggleManualColHighlight(col.key)
                        }
                      }}
                    >
                      {col.label}
                    </th>
                  ))}
                </tr>
                <tr>
                  <th rowSpan={2} className="pc-excel-row-head pc-excel-header-row-head" />
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
                      className={`u-header copyable-header ${uBlockClass(block)}${block.group === 'set' ? ' is-set-editable' : ''}`}
                      style={{ minWidth: `${Math.max(block.variants.length * 32, 96)}px` }}
                      title={block.group === 'set'
                        ? `${block.productCode} ${block.productLabel} 구성 편집`
                        : `${block.productCode} ${block.productLabel} 더블클릭 복사`}
                      tabIndex={block.group === 'set' ? 0 : undefined}
                      role={block.group === 'set' ? 'button' : undefined}
                      aria-label={block.group === 'set' ? `${block.productCode} 세트상품 구성 편집` : undefined}
                      onClick={() => {
                        if (block.group === 'set') openSetConfigModal(block.productCode)
                      }}
                      onKeyDown={(event) => {
                        if (block.group !== 'set') return
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          openSetConfigModal(block.productCode)
                        }
                      }}
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
                  {renderRowHeader('product-codes-u-direct')}
                  <td
                    className={`num sticky sticky-code u-direct-label ${getCellSelectionClass('product-codes-u-direct', 'A:상품코드')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:상품코드',
                        colLabel: '상품코드',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:상품코드"
                    data-row-label="U상품 판매수"
                    data-col-label="상품코드"
                  >
                    U상품 판매수
                  </td>
                  <td
                    className={`sticky sticky-name ${getCellSelectionClass('product-codes-u-direct', 'A:상품명')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:상품명',
                        colLabel: '상품명',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:상품명"
                    data-row-label="U상품 판매수"
                    data-col-label="상품명"
                  />
                  <td
                    className={`sticky sticky-option-code ${getCellSelectionClass('product-codes-u-direct', 'A:코드')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:코드',
                        colLabel: '코드',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:코드"
                    data-row-label="U상품 판매수"
                    data-col-label="코드"
                  />
                  <td
                    className={`sticky sticky-option-name ${getCellSelectionClass('product-codes-u-direct', 'A:옵션명')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:옵션명',
                        colLabel: '옵션명',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:옵션명"
                    data-row-label="U상품 판매수"
                    data-col-label="옵션명"
                  />
                  <td
                    className={`num sticky sticky-price ${getCellSelectionClass('product-codes-u-direct', 'A:단가')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:단가',
                        colLabel: '단가',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:단가"
                    data-row-label="U상품 판매수"
                    data-col-label="단가"
                  />
                  <td
                    className={`num sticky sticky-direct ${getCellSelectionClass('product-codes-u-direct', 'A:직접판매')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'A:직접판매',
                        colLabel: '직접판매',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="A:직접판매"
                    data-row-label="U상품 판매수"
                    data-col-label="직접판매"
                  />
                  {uDirectQtyByColumn.map((item, idx) => (
                    <td
                      key={`u-direct-${idx}`}
                      className={`num ${uColumnClass(idx)} ${getCellSelectionClass(
                        'product-codes-u-direct',
                        `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                      )}`}
                      onClick={() =>
                        handleCellSelect({
                          rowKey: 'product-codes-u-direct',
                          rowLabel: 'U상품 판매수',
                          colKey: `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`,
                          colLabel: `U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim(),
                        })
                      }
                      data-row-key="product-codes-u-direct"
                      data-col-key={`B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`}
                      data-row-label="U상품 판매수"
                      data-col-label={`U상품 ${U_COLUMNS[idx]?.uProduct ?? ''} ${U_COLUMNS[idx]?.uVariant ?? ''}`.trim()}
                    >
                      {item.excluded ? '' : fmtNumber(item.qty)}
                    </td>
                  ))}
                  <td
                    className={`num sticky sticky-total ${getCellSelectionClass('product-codes-u-direct', 'C:총판매')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'C:총판매',
                        colLabel: '총판매',
                      })
                    }
                    data-row-key="product-codes-u-direct"
                    data-col-key="C:총판매"
                    data-row-label="U상품 판매수"
                    data-col-label="총판매"
                  >
                    합계
                  </td>
                  <td
                    className={`num sticky sticky-rev ${getCellSelectionClass('product-codes-u-direct', 'C:매출')}`}
                    onClick={() =>
                      handleCellSelect({
                        rowKey: 'product-codes-u-direct',
                        rowLabel: 'U상품 판매수',
                        colKey: 'C:매출',
                        colLabel: '매출',
                      })
                    }
                    data-row-key="product-codes-u-direct"
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
                    {groupRows.findIndex((candidate) => candidate.category === grp.category) === groupRows.indexOf(grp) ? (
                      <tr className="product-category-row">
                        {renderRowHeader(categoryRowKey(grp.category))}
                        <td
                          className="product-group-band-cell product-group-band-sticky"
                          colSpan={6}
                          data-row-key={categoryRowKey(grp.category)}
                          data-col-key="A:상품코드"
                          data-row-label={grp.category}
                          data-col-label="상품코드"
                          data-export-value={`카테고리 ${grp.category}`}
                        >
                          <span className="product-category-badge">카테고리</span>
                          <span className="product-group-band-value">{grp.category}</span>
                        </td>
                        <td
                          className="product-group-band-fill"
                          colSpan={totalColumnCount - 7}
                          aria-hidden="true"
                        >
                          {''}
                        </td>
                      </tr>
                    ) : null}
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
                         const parentContextTitle = productContextTitle(
                           g.product_name,
                           hasVariantRows ? firstVariantOption : undefined,
                         )
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
                            className={`${g.missing ? 'row-missing' : ''} ${hasVariantRows ? 'row-parent product-merge-start' : 'row-single'} category-scope-row ${gi === 0 ? 'group-start-row' : ''}`.trim()}
                           >
                           {renderRowHeader(rowKey)}
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
                             title={`${parentContextTitle}\n상품코드 더블클릭 복사`}
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
                             data-full-text={g.product_name}
                             title={g.product_name}
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
                             title={parentContextTitle}
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
                             data-full-text={hasVariantRows ? displayOptionName(firstVariantOption) : undefined}
                             title={parentContextTitle}
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
                             className={`num sticky sticky-direct ${readStatusClass(g.directQtyMeta)} ${getCellSelectionClass(rowKey, 'A:직접판매')}`}
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
                             {...readStatusAttrs(g.directQtyMeta, g.directQtyMissing ? '' : firstVariantDirectQty)}
                             title={productContextTitle(
                               g.product_name,
                               hasVariantRows ? firstVariantOption : undefined,
                               g.directQtyMeta,
                             )}
                           >
                             {g.missing ? '—' : formatReadNumber(firstVariantDirectQty, g.directQtyMeta)}
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
                                  title={parentContextTitle}
                                >
                                  {state !== 'excluded' &&
                                   !(state === 'unmapped' && q === 0)
                                  ? fmtNumber(q)
                                  : ''}
                              </td>
                            )
                            })}
                            <td
                              className={`num sticky sticky-total ${readStatusClass(g.totalMeta)} ${getCellSelectionClass(rowKey, 'C:총판매')}`}
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
                              {...readStatusAttrs(g.totalMeta, g.qty)}
                            >
                              {formatReadNumber(g.qty, g.totalMeta)}
                            </td>
                            <td
                              className={`num sticky sticky-rev ${readStatusClass(g.revenueMeta)} ${getCellSelectionClass(rowKey, 'C:매출')}`}
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
                              {...readStatusAttrs(g.revenueMeta, g.revenueMissing ? '' : g.rev)}
                            >
                              {formatReadCurrency(g.rev, currency, g.revenueMeta)}
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
                            const variantDirectMeta = g.variantDirectQtyMeta[idx] ?? loadedMeta
                            const variantTotalMeta = g.variantTotalMeta[idx] ?? loadedMeta
                            const variantRevenueMeta = g.variantRevenueMeta[idx] ?? loadedMeta
                            const variantRowKey = `variant:${g.product_code}:${v.variant_code}`
                            const variantRowLabel = `${rowHeaderLabelByCode(g.product_code, g.product_name)} / ${displayOptionName(v.option || v.variant_code)}`
                            const variantContextTitle = productContextTitle(g.product_name, v.option || v.variant_code)
                            return (
                              <tr
                                key={`${g.product_code}-${v.variant_code}`}
                                className="row-child variant-row product-merge-child category-scope-row"
                              >
                                {renderRowHeader(variantRowKey)}
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
                                  title={variantContextTitle}
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
                                  title={variantContextTitle}
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
                                  data-full-text={displayOptionName(v.option || v.variant_code)}
                                  title={variantContextTitle}
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
                                  className={`num sticky sticky-direct ${readStatusClass(variantDirectMeta)} ${getCellSelectionClass(variantRowKey, 'A:직접판매')}`}
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
                                  {...readStatusAttrs(variantDirectMeta, g.variantDirectQtyMissing[idx] ? '' : v.qty)}
                                  title={productContextTitle(g.product_name, v.option || v.variant_code, variantDirectMeta)}
                                >
                                  {g.missing ? '—' : formatReadNumber(v.qty, variantDirectMeta)}
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
                                      title={variantContextTitle}
                                    >
                                      {state !== 'excluded' && !(state === 'unmapped' && q === 0)
                                        ? fmtNumber(q)
                                        : ''}
                                    </td>
                                  )
                                })}
                                <td
                                  className={`num sticky sticky-total ${readStatusClass(variantTotalMeta)} ${getCellSelectionClass(variantRowKey, 'C:총판매')}`}
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
                                  {...readStatusAttrs(variantTotalMeta, totalQty)}
                                >
                                  {g.missing ? '—' : formatReadNumber(totalQty, variantTotalMeta)}
                                </td>
                                <td
                                  className={`num sticky sticky-rev ${readStatusClass(variantRevenueMeta)} ${getCellSelectionClass(variantRowKey, 'C:매출')}`}
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
                                  {...readStatusAttrs(variantRevenueMeta, g.variantRevenueMissing[idx] ? '' : totalRev)}
                                >
                                  {g.missing ? '—' : formatReadCurrency(totalRev, currency, variantRevenueMeta)}
                                </td>
                              </tr>
                            )
                          } ) : null}
                      </Fragment>
                    )
                    })}
                 {grp.withSubtotal === false ? null : (
                       <tr className={`subtotal-row category-scope-row ${groupRows[groupRows.indexOf(grp) + 1]?.category !== grp.category ? 'category-end-row' : ''}`.trim()}>
                        {renderRowHeader(`subtotal:${grp.label}`)}
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
                          {grp.label} 합계
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
                          className={`num sticky sticky-direct ${readStatusClass(grp.subtotalHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass(`subtotal:${grp.label}`, 'A:직접판매')}`}
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
                          {...readStatusAttrs(grp.subtotalHasMissing ? partialMeta : loadedMeta, grp.subtotalDirectQty)}
                        >
                          {formatReadNumber(grp.subtotalDirectQty, grp.subtotalHasMissing ? partialMeta : loadedMeta)}
                        </td>
                        {grp.subtotalMappingQtyByColumn.map((q, idx) => (
                          <td
                            key={`subtotal-${grp.label}-${idx}`}
                            className={`num ${uColumnClass(idx)} ${readStatusClass(grp.subtotalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta)} ${getCellSelectionClass(`subtotal:${grp.label}`, `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
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
                            {...readStatusAttrs(grp.subtotalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta, q)}
                          >
                            {formatReadNumber(q, grp.subtotalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta)}
                          </td>
                        ))}
                        <td
                          className={`num sticky sticky-total ${readStatusClass(grp.subtotalHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass(`subtotal:${grp.label}`, 'C:총판매')}`}
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
                          {...readStatusAttrs(grp.subtotalHasMissing ? partialMeta : loadedMeta, grp.subtotalQty)}
                        >
                          {formatReadNumber(grp.subtotalQty, grp.subtotalHasMissing ? partialMeta : loadedMeta)}
                        </td>
                        <td
                          className={`num sticky sticky-rev ${readStatusClass(grp.subtotalRevHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass(`subtotal:${grp.label}`, 'C:매출')}`}
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
                          {...readStatusAttrs(grp.subtotalRevHasMissing ? partialMeta : loadedMeta, grp.subtotalRev)}
                        >
                          {formatReadCurrency(grp.subtotalRev, currency, grp.subtotalRevHasMissing ? partialMeta : loadedMeta)}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              <tfoot>
                    <tr>
                      {renderRowHeader('total:grand')}
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
                        className={`num sticky sticky-direct ${readStatusClass(totalHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass('total:grand', 'A:직접판매')}`}
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
                        {...readStatusAttrs(totalHasMissing ? partialMeta : loadedMeta, totalDirectQty)}
                      >
                        {formatReadNumber(totalDirectQty, totalHasMissing ? partialMeta : loadedMeta)}
                      </td>
                      {totalMappingQtyByColumn.map((q, idx) => (
                        <td
                          key={`total-${idx}`}
                          className={`num ${uColumnClass(idx)} ${readStatusClass(totalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta)} ${getCellSelectionClass('total:grand', `B:${U_COLUMNS[idx]?.uProduct ?? ''}-${U_COLUMNS[idx]?.uVariant ?? idx}`)}`}
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
                          {...readStatusAttrs(totalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta, q)}
                        >
                          {formatReadNumber(q, totalMappingHasMissingByColumn[idx] ? partialMeta : loadedMeta)}
                        </td>
                      ))}
                      <td
                        className={`num sticky sticky-total ${readStatusClass(totalHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass('total:grand', 'C:총판매')}`}
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
                        {...readStatusAttrs(totalHasMissing ? partialMeta : loadedMeta, totalQty)}
                      >
                        {formatReadNumber(totalQty, totalHasMissing ? partialMeta : loadedMeta)}
                      </td>
                      <td
                        className={`num sticky sticky-rev ${readStatusClass(totalRevHasMissing ? partialMeta : loadedMeta)} ${getCellSelectionClass('total:grand', 'C:매출')}`}
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
                        {...readStatusAttrs(totalRevHasMissing ? partialMeta : loadedMeta, totalRev)}
                      >
                        {formatReadCurrency(totalRev, currency, totalRevHasMissing ? partialMeta : loadedMeta)}
                      </td>
                    </tr>
                  </tfoot>
            </table>
          </div>
        </div>
      )}

      {activeSetConfig && editingSetProductCode ? (
        <div className="set-editor-backdrop" role="presentation">
          <div
            ref={setEditorModalRef}
            className={`set-editor-modal${setEditorLayout ? ' is-positioned' : ''}`}
            style={setEditorLayoutStyle}
            role="dialog"
            aria-modal="true"
            aria-labelledby="set-editor-title"
          >
            <header className="set-editor-header">
              <div
                className="set-editor-drag-handle"
                title="드래그해서 모달 이동"
                onPointerDown={startSetEditorMove}
                onPointerMove={moveSetEditorLayout}
                onPointerUp={stopSetEditorLayoutChange}
                onPointerCancel={stopSetEditorLayoutChange}
              >
                <span className="set-editor-eyebrow">세트상품 구성 편집</span>
                <h2 id="set-editor-title">{activeSetConfig.productName}</h2>
                <p>
                  <span className="set-editor-code">{activeSetConfig.productCode}</span>
                  <span>옵션 {activeSetConfig.variants.length}개</span>
                  {activeSetDirty ? <span className="set-editor-dirty">화면 초안</span> : null}
                </p>
              </div>
              <div className="set-editor-header-actions">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={resetActiveSetDraft}
                  disabled={!activeSetDirty}
                >
                  초기값
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={cancelActiveSetDraft}
                >
                  취소
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={activeSetHasIncomplete}
                  title={activeSetHasIncomplete ? '왼쪽상품과 옵션을 선택해야 적용할 수 있습니다.' : undefined}
                  onClick={() => setEditingSetProductCode(null)}
                >
                  적용
                </button>
              </div>
            </header>

            <div className="set-editor-body">
              <aside className="set-editor-options" aria-label="세트상품 옵션">
                <div className="set-editor-section-title">
                  <strong>옵션</strong>
                  <span>옵션별 구성을 선택</span>
                </div>
                <div className="set-editor-option-list">
                  {activeSetConfig.variants.map((variant) => {
                    const isSelected = activeSetVariant?.variantCode === variant.variantCode
                    const optionComponents = [
                      ...variant.components,
                      ...(setAddedComponents[makeSetComponentScopeKey(activeSetConfig.productCode, 'option', variant.variantCode)] ?? []),
                    ]
                    const optionTotal = [
                      ...(activeSetConfig.commonComponents ?? []),
                      ...(setAddedComponents[commonSetScopeKey] ?? []),
                      ...optionComponents,
                    ].reduce((sum, component) => {
                      const draft = getSetComponentDraft(setComponentDrafts, component)
                      return draft.deleted ? sum : sum + getSetComponentDraftAmount(draft)
                    }, 0)
                    return (
                      <button
                        type="button"
                        key={variant.variantCode}
                        className={`set-editor-option${isSelected ? ' is-selected' : ''}`}
                        onClick={() => setSelectedSetVariantCode(variant.variantCode)}
                        title={`${variant.variantCode} · ${displayOptionName(variant.optionName)}\n구성 ${optionComponents.length}개 · ${fmtCurrency(optionTotal, currency)}`}
                      >
                        <span className="set-editor-option-code">{variant.variantCode}</span>
                        <span className="set-editor-option-name">{displayOptionName(variant.optionName)}</span>
                        <span className="set-editor-option-meta">
                          구성 {optionComponents.length}개 · {fmtCurrency(optionTotal, currency)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </aside>

              <main className={`set-editor-main${showSetCommonCard ? '' : ' is-option-only'}`}>
                {showSetCommonCard ? (
                  <section className="set-editor-card" data-set-editor-section="common">
                    <div className="set-editor-card-head">
                      <div>
                        <strong>공통 구성</strong>
                        <span>모든 옵션에 공통으로 포함</span>
                      </div>
                      <button type="button" className="btn btn-secondary" onClick={() => addSetComponent('common')}>
                        왼쪽상품 추가
                      </button>
                    </div>
                    <div className="set-editor-table-wrap">
                      <table className="set-editor-table">
                        <thead>
                          <tr>
                            <th>구분</th>
                            <th>왼쪽상품 선택</th>
                            <th>옵션 선택</th>
                            <th>수량</th>
                            <th>세트가</th>
                            <th>금액</th>
                            <th>작업</th>
                          </tr>
                        </thead>
                        <tbody>
                          {renderSetComponentRows(activeSetCommonComponents)}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ) : null}

                <section className="set-editor-card" data-set-editor-section="option">
                  <div className="set-editor-card-head">
                    <div>
                      <strong>선택 옵션 구성</strong>
                      <span>
                        {activeSetVariant
                          ? `${activeSetVariant.variantCode} · ${displayOptionName(activeSetVariant.optionName)}`
                          : '옵션을 선택하세요'}
                      </span>
                    </div>
                    <div className="set-editor-card-actions">
                      <span className="set-editor-total">구성 합계 {fmtCurrency(activeSetTotal, currency)}</span>
                      {!showSetCommonCard ? (
                        <button type="button" className="btn btn-secondary" onClick={() => addSetComponent('common')}>
                          공통구성 추가
                        </button>
                      ) : null}
                      <button type="button" className="btn btn-secondary" onClick={() => addSetComponent('option')}>
                        왼쪽상품 추가
                      </button>
                    </div>
                  </div>
                  <div className="set-editor-table-wrap">
                    <table className="set-editor-table">
                      <thead>
                        <tr>
                          <th>구분</th>
                          <th>왼쪽상품 선택</th>
                          <th>옵션 선택</th>
                          <th>수량</th>
                          <th>세트가</th>
                          <th>금액</th>
                          <th>작업</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeSetOptionComponents.length > 0 ? renderSetComponentRows(activeSetOptionComponents) : (
                          <tr>
                            <td colSpan={7} className="set-editor-empty">선택 옵션에만 적용되는 구성 상품이 없습니다.</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </main>
            </div>
            <div
              className="set-editor-resize-handle"
              aria-label="세트상품 구성 편집 모달 크기 조절"
              role="separator"
              title="드래그해서 모달 크기 조절"
              onPointerDown={startSetEditorResize}
              onPointerMove={moveSetEditorLayout}
              onPointerUp={stopSetEditorLayoutChange}
              onPointerCancel={stopSetEditorLayoutChange}
            />
          </div>
        </div>
      ) : null}

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
