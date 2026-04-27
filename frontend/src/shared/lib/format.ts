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
