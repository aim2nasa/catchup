"""매출 집계 SSE 스트리밍 + Excel 다운로드 라우트."""
import json
import time
import traceback
from threading import Lock
from uuid import uuid4

import requests
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from backend.shared.aggregation import aggregate
from backend.shared.cafe24 import (
    BASE,
    auth_headers,
    detect_currency,
    fetch_categories,
    fetch_orders,
    fetch_products_by_category,
    fetch_products_by_codes,
    parse_categories,
)
from backend.shared.excel_writer import build_workbook

router = APIRouter()

_PRODUCT_REPORT_REQUEST_TTL_SECONDS = 10 * 60
_product_report_requests: dict[str, dict[str, object]] = {}
_product_report_requests_lock = Lock()


class ProductReportRequest(BaseModel):
    start: str
    end: str
    codes: list[str] = Field(default_factory=list)


def _sse(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _normalize_codes(codes):
    seen = set()
    normalized = []
    for code in codes:
        value = str(code).strip()
        if not value or value in seen:
            continue
        seen.add(value)
        normalized.append(value)
    return normalized


def _cleanup_product_report_requests(now=None):
    now = now or time.time()
    expired = [
        request_id
        for request_id, item in _product_report_requests.items()
        if float(item.get("expires_at", 0)) <= now
    ]
    for request_id in expired:
        _product_report_requests.pop(request_id, None)


def _products_report_events(start: str, end: str, code_list: list[str]):
    try:
        yield _sse({"type": "progress", "msg": f"[1/3] 상품 조회 ({len(code_list)}개 코드)"})
        products = fetch_products_by_codes(code_list)
        yield _sse({"type": "progress", "msg": f"  → {len(products)}개 매칭 (없는 코드는 placeholder 처리)"})

        yield _sse({"type": "progress", "msg": f"[2/3] 주문 조회 ({start} ~ {end})"})
        orders = []
        offset = 0
        while True:
            res = requests.get(f"{BASE}/orders", headers=auth_headers(), params={
                "start_date": start, "end_date": end,
                "embed": "items", "limit": 100, "offset": offset,
            })
            res.raise_for_status()
            page = res.json().get("orders", [])
            if not page:
                break
            orders.extend(page)
            yield _sse({"type": "progress", "msg": f"    ... {len(orders)}건 누적"})
            if len(page) < 100:
                break
            offset += 100
        currency = detect_currency(orders)
        yield _sse({"type": "progress", "msg": f"  → 총 {len(orders)}건 / 통화 {currency}"})

        yield _sse({"type": "progress", "msg": "[3/3] 집계"})
        groups = aggregate(products, orders)
        cqty = sum(g["qty"] for g in groups)
        crev = sum(g["rev"] for g in groups)
        yield _sse({
            "type": "data",
            "results": [{
                "category_no": 0,
                "category_name": "",
                "groups": groups,
                "qty": cqty,
                "rev": crev,
            }],
            "grand": {"qty": cqty, "rev": crev, "currency": currency, "order_count": len(orders)},
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


def _products_report_response(start: str, end: str, code_list: list[str]):
    return StreamingResponse(
        _products_report_events(start, end, code_list),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
            orders = []
            offset = 0
            while True:
                res = requests.get(f"{BASE}/orders", headers=auth_headers(), params={
                    "start_date": start, "end_date": end,
                    "embed": "items", "limit": 100, "offset": offset,
                })
                res.raise_for_status()
                page = res.json().get("orders", [])
                if not page:
                    break
                orders.extend(page)
                yield _sse({"type": "progress", "msg": f"    ... {len(orders)}건 누적"})
                if len(page) < 100:
                    break
                offset += 100
            currency = detect_currency(orders)
            yield _sse({"type": "progress", "msg": f"  → 총 {len(orders)}건 / 통화 {currency}"})

            yield _sse({"type": "progress", "msg": "[3/4] 카테고리별 상품 + 집계"})
            results = []
            grand_qty = 0
            grand_rev = 0.0
            for i, c in enumerate(target, 1):
                cn = c["category_no"]
                cname = c["category_name"]
                yield _sse({"type": "progress", "msg": f"  ({i}/{len(target)}) [{cn}] {cname}"})
                products = fetch_products_by_category(cn)
                groups = aggregate(products, orders)
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


@router.get("/api/products-report")
def api_products_report(start: str, end: str, codes: str):
    """product_code 리스트로 직접 판매 집계 SSE (카테고리 무관).

    /api/report는 카테고리 단위 조회라 사용자가 명시한 코드가 그 카테고리에
    없으면 누락됨. 이 endpoint는 코드 리스트로 cafe24에서 직접 product를
    찾아오므로 모든 카테고리의 상품을 정확히 잡음.

    응답은 /api/report 와 동일한 SSE shape (results/grand/start/end) — 다만
    results 는 하나의 가상 그룹(category_no=0, name="")으로만 묶음.
    """

    code_list = _normalize_codes(codes.split(","))
    return _products_report_response(start, end, code_list)


@router.post("/api/products-report-requests")
def api_create_products_report_request(payload: ProductReportRequest):
    """긴 상품코드 목록을 URL에 싣지 않기 위한 SSE 요청 등록 endpoint."""
    start = payload.start.strip()
    end = payload.end.strip()
    code_list = _normalize_codes(payload.codes)
    if not start or not end:
        raise HTTPException(status_code=400, detail="start/end 값이 필요합니다.")
    if not code_list:
        raise HTTPException(status_code=400, detail="codes 값이 필요합니다.")

    request_id = uuid4().hex
    now = time.time()
    with _product_report_requests_lock:
        _cleanup_product_report_requests(now)
        _product_report_requests[request_id] = {
            "start": start,
            "end": end,
            "codes": code_list,
            "expires_at": now + _PRODUCT_REPORT_REQUEST_TTL_SECONDS,
        }
    return {
        "request_id": request_id,
        "expires_in_seconds": _PRODUCT_REPORT_REQUEST_TTL_SECONDS,
    }


@router.get("/api/products-report-stream/{request_id}")
def api_products_report_stream(request_id: str):
    with _product_report_requests_lock:
        _cleanup_product_report_requests()
        item = _product_report_requests.get(request_id)
    if not item:
        raise HTTPException(status_code=404, detail="상품코드 조회 요청을 찾을 수 없습니다.")

    return _products_report_response(
        str(item["start"]),
        str(item["end"]),
        list(item["codes"]),
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
            groups = aggregate(products, orders)
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
