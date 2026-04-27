import { useMemo, useState } from 'react'
import { fmtCurrency, fmtNumber } from '@/shared/lib/format'
import type { Group, SortDir, SortKey, Variant } from '@/features/sales-report/types'

interface Props {
  groups: Group[]
  totals: { qty: number; rev: number }
  currency: string
  sortBy: SortKey
  sortDir: SortDir
  onSortChange: (by: SortKey, dir: SortDir) => void
}

function getGroupVal(g: Group, key: SortKey): string | number {
  if (key === 'code') return g.product_code
  if (key === 'name') return g.product_name
  if (key === 'price') return g.price
  if (key === 'qty') return g.qty
  return g.rev
}

function getVariantVal(
  v: Variant,
  parentPrice: number,
  key: SortKey,
): string | number {
  if (key === 'code') return v.variant_code
  if (key === 'name') return v.option || v.variant_code
  if (key === 'price') return parentPrice
  if (key === 'qty') return v.qty
  return v.rev
}

function cmp(a: string | number, b: string | number, dir: SortDir): number {
  if (typeof a === 'string' || typeof b === 'string') {
    return String(a).localeCompare(String(b), 'ko-KR') * dir
  }
  const an = a as number
  const bn = b as number
  return (an < bn ? -1 : an > bn ? 1 : 0) * dir
}

export function DetailTable({ groups, totals, currency, sortBy, sortDir, onSortChange }: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const sortedGroups = useMemo(() => {
    return [...groups].sort((a, b) =>
      cmp(getGroupVal(a, sortBy), getGroupVal(b, sortBy), sortDir),
    )
  }, [groups, sortBy, sortDir])

  function indicator(col: SortKey): string {
    if (col !== sortBy) return ''
    return sortDir === -1 ? '▼' : '▲'
  }

  function clickHeader(col: SortKey) {
    if (sortBy === col) onSortChange(col, (-sortDir) as SortDir)
    else onSortChange(col, -1)
  }

  function toggleGroup(gid: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(gid)) next.delete(gid)
      else next.add(gid)
      return next
    })
  }

  return (
    <table>
      <thead>
        <tr>
          <th onClick={() => clickHeader('code')}>
            코드<span className="sort-ind">{indicator('code')}</span>
          </th>
          <th onClick={() => clickHeader('name')}>
            상품명<span className="sort-ind">{indicator('name')}</span>
          </th>
          <th className="num" onClick={() => clickHeader('price')}>
            단가<span className="sort-ind">{indicator('price')}</span>
          </th>
          <th className="num" onClick={() => clickHeader('qty')}>
            판매수<span className="sort-ind">{indicator('qty')}</span>
          </th>
          <th className="num" onClick={() => clickHeader('rev')}>
            매출<span className="sort-ind">{indicator('rev')}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {sortedGroups.map((g, gi) => {
          const gid = `${g.product_code}-${gi}`
          const isCollapsed = collapsed.has(gid)
          const parentClass = g.is_multi ? 'row-parent' : 'row-single'
          const tag = g.is_multi ? (
            <span className="multi-tag">{g.variants.length}개 옵션</span>
          ) : null

          const parentRow = (
            <tr key={`p-${gid}`} className={parentClass}>
              <td className="code-cell">
                {g.is_multi && (
                  <button
                    type="button"
                    className="toggle-btn"
                    onClick={() => toggleGroup(gid)}
                  >
                    {isCollapsed ? '+' : '−'}
                  </button>
                )}
                {g.product_code}
              </td>
              <td className="name-cell">
                {g.product_name}
                {tag}
              </td>
              <td className="num">{fmtCurrency(g.price, currency)}</td>
              <td className="num">{fmtNumber(g.qty)}</td>
              <td className="num">{fmtCurrency(g.rev, currency)}</td>
            </tr>
          )

          if (!g.is_multi) return parentRow

          const sortedVariants = [...g.variants].sort((a, b) =>
            cmp(getVariantVal(a, g.price, sortBy), getVariantVal(b, g.price, sortBy), sortDir),
          )

          return [
            parentRow,
            ...sortedVariants.map((v) => {
              const suffix =
                v.variant_code && v.variant_code.startsWith(g.product_code)
                  ? v.variant_code.slice(g.product_code.length)
                  : v.variant_code || ''
              return (
                <tr
                  key={`c-${gid}-${v.variant_code}`}
                  className={`row-child${isCollapsed ? ' collapsed' : ''}`}
                >
                  <td className="code-cell">{suffix}</td>
                  <td className="name-cell">└ {v.option || v.variant_code}</td>
                  <td className="num">{fmtCurrency(g.price, currency)}</td>
                  <td className="num">{fmtNumber(v.qty)}</td>
                  <td className="num">{fmtCurrency(v.rev, currency)}</td>
                </tr>
              )
            }),
          ]
        })}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={3}>합계</td>
          <td className="num">{fmtNumber(totals.qty)}</td>
          <td className="num">{fmtCurrency(totals.rev, currency)}</td>
        </tr>
      </tfoot>
    </table>
  )
}
