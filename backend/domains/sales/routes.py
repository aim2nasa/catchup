"""매출 집계 SSE 스트리밍 + Excel 다운로드 라우트."""
import json
import traceback

from fastapi import APIRouter
from fastapi.responses import JSONResponse, StreamingResponse

from backend.shared.aggregation import aggregate_from_salesvolume
from backend.shared.cafe24 import (
    detect_currency,
    fetch_categories,
    fetch_orders,
    fetch_products_by_category,
    fetch_salesvolume,
    parse_categories,
)
from backend.shared.excel_writer import build_workbook

router = APIRouter()


def _sse(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.get("/api/report")
def api_report(start: str, end: str, categories: str = "all"):
    """SSE: 진행상황 + 최종 데이터(상품 그룹 리스트)."""

    def gen():
        try:
            yield _sse({"type": "progress", "msg": "[1/4] 카테고리 목록 조회"})
            cats = fetch_categories()
            yield _sse({"type": "progress", "msg": f"  → {len(cats)}개"})
            target = parse_categories(categories, cats)
            yield _sse({"type": "progress", "msg": f"  → 처리 대상: {len(target)}개"})

            yield _sse({"type": "progress", "msg": f"[2/4] 주문 조회 ({start} ~ {end})"})
            orders = fetch_orders(start, end)
            currency = detect_currency(orders)
            yield _sse({"type": "progress", "msg": f"  → 총 {len(orders)}건 / 통화 {currency}"})

            yield _sse({"type": "progress", "msg": "[3/4] 카테고리별 상품 + 판매통계 + 집계"})
            results = []
            grand_qty = 0
            grand_rev = 0.0
            for i, c in enumerate(target, 1):
                cn = c["category_no"]
                cname = c["category_name"]
                yield _sse({"type": "progress", "msg": f"  ({i}/{len(target)}) [{cn}] {cname}"})
                products = fetch_products_by_category(cn)
                svol = {}
                for j, pn in enumerate(products.keys(), 1):
                    svol[pn] = fetch_salesvolume(pn, start, end)
                    if j % 10 == 0 or j == len(products):
                        yield _sse({"type": "progress", "msg": f"    ... 판매통계 {j}/{len(products)}"})
                groups = aggregate_from_salesvolume(products, svol)
                cqty = sum(g["qty"] for g in groups)
                crev = sum(g["rev"] for g in groups)
                grand_qty += cqty
                grand_rev += crev
                multi_count = sum(1 for g in groups if g["is_multi"])
                results.append({
                    "category_no": cn,
                    "category_name": cname,
                    "groups": groups,
                    "qty": cqty,
                    "rev": crev,
                })
                yield _sse({"type": "progress", "msg": f"    → 상품 {len(groups)} (옵션상품 {multi_count}) / 판매수 {cqty} / 매출 {crev:,.0f}"})

            yield _sse({"type": "progress", "msg": "[4/4] 완료"})
            yield _sse({
                "type": "data",
                "results": results,
                "grand": {"qty": grand_qty, "rev": grand_rev, "currency": currency, "order_count": len(orders)},
                "start": start,
                "end": end,
            })
            yield _sse({"type": "done"})
        except Exception as e:
            yield _sse({
                "type": "error",
                "msg": f"{type(e).__name__}: {e}",
                "trace": traceback.format_exc(),
            })

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/api/excel")
def api_excel(
    start: str,
    end: str,
    categories: str = "all",
    mode: str = "single",
    sort_by: str = "rev",
    sort_dir: int = -1,
):
    try:
        all_cats = fetch_categories()
        target = parse_categories(categories, all_cats)
        orders = fetch_orders(start, end)
        currency = detect_currency(orders)

        results = []
        for c in target:
            products = fetch_products_by_category(c["category_no"])
            svol = {pn: fetch_salesvolume(pn, start, end) for pn in products.keys()}
            groups = aggregate_from_salesvolume(products, svol)
            results.append({
                "category_no": c["category_no"],
                "category_name": c["category_name"],
                "groups": groups,
                "qty": sum(g["qty"] for g in groups),
                "rev": sum(g["rev"] for g in groups),
            })

        buf = build_workbook(results, mode, start, end, currency, sort_by, sort_dir)
        fn = f"sales_report_{start}_{end}.xlsx"
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{fn}"'},
        )
    except Exception as e:
        return JSONResponse(
            {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()},
            status_code=500,
        )
