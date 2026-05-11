export interface Variant {
  variant_code: string
  option: string
  qty: number
  rev: number
  /** 옵션별 단가 (product_price + option_price). 데이터 없으면 0. */
  price: number
}

export interface Group {
  is_multi: boolean
  product_code: string
  product_name: string
  price: number
  qty: number
  rev: number
  variants: Variant[]
}

export interface CategoryResult {
  category_no: number
  category_name: string
  groups: Group[]
  qty: number
  rev: number
}

export interface GrandTotal {
  qty: number
  rev: number
  currency: string
  order_count: number
}

export interface ReportData {
  results: CategoryResult[]
  grand: GrandTotal
  start: string
  end: string
}

export type ViewMode = 'single' | 'tabs' | 'flat'
export type SortKey = 'code' | 'name' | 'price' | 'qty' | 'rev'
export type SortDir = 1 | -1
export type SummarySort = 'rev:-1' | 'rev:1' | 'qty:-1' | 'qty:1' | 'user'

export interface AppSettings {
  start: string
  end: string
  mode: ViewMode
  summarySort: SummarySort
  catOrder: number[]
  catChecked: Record<string, boolean>
}

export interface SSEEvent {
  type: 'progress' | 'data' | 'done' | 'error'
  msg?: string
  trace?: string
  results?: CategoryResult[]
  grand?: GrandTotal
  start?: string
  end?: string
}
