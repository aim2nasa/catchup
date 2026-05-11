export function fmtCurrency(n: number, currency: string): string {
  const sign = currency === 'KRW' ? '₩' : ''
  return sign + Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
}

export function fmtNumber(n: number): string {
  return Number(n).toLocaleString('ko-KR', { maximumFractionDigits: 0 })
}

export function defaultPeriod(): { start: string; end: string } {
  const today = new Date()
  const lm = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lmEnd = new Date(today.getFullYear(), today.getMonth(), 0)
  const toIso = (d: Date) => d.toISOString().slice(0, 10)
  return { start: toIso(lm), end: toIso(lmEnd) }
}

/**
 * Group(상품) 단가 셀 포맷:
 * - multi-variant 인데 catalog price 가 0 이면 "옵션별" (variant 단가가 제각각)
 * - 그 외엔 일반 통화 포맷
 *
 * 배경: cafe24 묶음/옵션 상품은 catalog price=0 이고, 단가가 option_price 에
 * variant 별로 들어옴. parent 행에 ₩0 표시는 사용자에게 잘못된 인식을 줌.
 */
export function fmtParentPrice(
  group: { is_multi: boolean; price: number },
  currency: string,
): string {
  if (group.is_multi && !group.price) return '옵션별'
  return fmtCurrency(group.price, currency)
}

/**
 * Variant(옵션) 단가 셀 포맷:
 * - variant.price 가 있으면 그 값 (option_price 포함된 실 단가)
 * - 없으면 parent.price 폴백
 * - 둘 다 0/없음이면 "—"
 */
export function fmtVariantPrice(
  variantPrice: number,
  parentPrice: number,
  currency: string,
): string {
  const unit = variantPrice || parentPrice
  return unit ? fmtCurrency(unit, currency) : '—'
}
