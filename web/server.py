"""
캐치업코리아 cafe24 판매 집계 웹.

실행:
    py web/server.py
브라우저:
    http://127.0.0.1:8000
"""
import sys
import json
import io
import traceback
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "python" / "cafe24" / "tests"))

import requests
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.utils import get_column_letter

from cafe24_auth import get_access_token, MALL_ID

BASE = f"https://{MALL_ID}.cafe24api.com/api/v2/admin"
WEB_DIR = Path(__file__).resolve().parent
INVALID_SHEET = '\\/?*[]:'

app = FastAPI(title="catchup sales report")
app.mount("/static", StaticFiles(directory=WEB_DIR / "static"), name="static")


def auth_headers():
    return {"Authorization": f"Bearer {get_access_token()}"}


def fetch_categories():
    res = requests.get(f"{BASE}/categories", headers=auth_headers(), params={"limit": 100})
    res.raise_for_status()
    return res.json().get("categories", [])


def fetch_products_by_category(cat_no):
    products = {}
    offset = 0
    while True:
        res = requests.get(
            f"{BASE}/products", headers=auth_headers(),
            params={"category": cat_no, "limit": 100, "offset": offset, "embed": "variants"},
        )
        res.raise_for_status()
        items = res.json().get("products", [])
        if not items:
            break
        for p in items:
            vs = []
            for v in (p.get("variants") or []):
                opts = v.get("options") or []
                opt_str = ", ".join(
                    f"{o.get('name')}={o.get('value')}"
                    for o in opts if o.get("value")
                ) if opts else ""
                vs.append({"vcode": v.get("variant_code"), "opt": opt_str})
            products[p["product_no"]] = {
                "code": p["product_code"],
                "name": p["product_name"],
                "price": float(p.get("price") or 0),
                "variants": vs,
            }
        if len(items) < 100:
            break
        offset += 100
    return products


def fetch_orders(start, end):
    orders = []
    offset = 0
    while True:
        res = requests.get(
            f"{BASE}/orders", headers=auth_headers(),
            params={
                "start_date": start, "end_date": end,
                "embed": "items", "limit": 100, "offset": offset,
            },
        )
        res.raise_for_status()
        page = res.json().get("orders", [])
        if not page:
            break
        orders.extend(page)
        if len(page) < 100:
            break
        offset += 100
    return orders


def aggregate(products, orders):
    """상품별 그룹 리스트 반환. 각 그룹 = 한 product + 그 variants 합계."""
    accums = {}
    for o in orders:
        for it in (o.get("items") or []):
            vc = it.get("variant_code")
            if not vc:
                continue
            qty = (it.get("quantity") or 0) - (it.get("claim_quantity") or 0)
            price = float(it.get("product_price") or 0)
            a = accums.setdefault(vc, {"qty": 0, "rev": 0.0})
            a["qty"] += qty
            a["rev"] += qty * price

    groups = []
    for pn, info in products.items():
        multi = len(info["variants"]) > 1
        gqty = 0
        grev = 0.0
        variants = []
        for v in info["variants"]:
            vc = v["vcode"]
            a = accums.get(vc, {"qty": 0, "rev": 0.0})
            gqty += a["qty"]
            grev += a["rev"]
            variants.append({
                "variant_code": vc,
                "option": v.get("opt", ""),
                "qty": a["qty"],
                "rev": a["rev"],
            })
        groups.append({
            "is_multi": multi,
            "product_code": info["code"],
            "product_name": info["name"],
            "price": info["price"],
            "qty": gqty,
            "rev": grev,
            "variants": variants,
        })
    return groups


def sanitize_sheet_name(name, used):
    s = name
    for ch in INVALID_SHEET:
        s = s.replace(ch, "_")
    s = s.strip()[:31] or "sheet"
    base = s
    i = 2
    while s in used:
        suf = f"_{i}"
        s = base[: 31 - len(suf)] + suf
        i += 1
    used.add(s)
    return s


def size_cols(ws):
    for col_idx in range(1, ws.max_column + 1):
        col = get_column_letter(col_idx)
        max_len = max((len(str(c.value or "")) for c in ws[col]), default=10)
        ws.column_dimensions[col].width = min(max_len + 2, 60)


def parse_categories(s, all_cats):
    if s == "all":
        return [c for c in all_cats if c.get("category_depth") == 1]
    wanted = {int(x.strip()) for x in s.split(",") if x.strip()}
    return [c for c in all_cats if c.get("category_no") in wanted]


def detect_currency(orders):
    for o in orders:
        if o.get("currency"):
            return o["currency"]
    return "KRW"


def sse(data):
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def emit_group_rows(ws, group, prefix, parent_fill, bold):
    """그룹 1개를 rows로 추가. prefix가 [cat_label] 같은 리스트면 매 행 앞에 붙임."""
    pre = list(prefix) if prefix else []
    ws.append(pre + [group["product_code"], group["product_name"], group["price"], group["qty"], group["rev"]])
    if group["is_multi"]:
        for c in ws[ws.max_row]:
            c.font = bold
            c.fill = parent_fill
        sorted_vars = sorted(group["variants"], key=lambda v: -v["rev"])
        for v in sorted_vars:
            label = "  └ " + (v["option"] or v["variant_code"])
            ws.append(pre + [v["variant_code"], label, group["price"], v["qty"], v["rev"]])


@app.get("/")
def index():
    return FileResponse(WEB_DIR / "static" / "index.html")


@app.get("/api/categories")
def api_categories():
    try:
        cats = fetch_categories()
        return [
            {
                "no": c["category_no"],
                "name": c["category_name"],
                "depth": c.get("category_depth", 1),
                "parent": c.get("parent_category_no"),
            }
            for c in cats
        ]
    except Exception as e:
        return JSONResponse(
            {"error": f"{type(e).__name__}: {e}", "trace": traceback.format_exc()},
            status_code=500,
        )


@app.get("/api/report")
def api_report(start: str, end: str, categories: str = "all"):
    """SSE: 진행상황 + 최종 데이터(상품 그룹 리스트)."""

    def gen():
        try:
            yield sse({"type": "progress", "msg": "[1/4] 카테고리 목록 조회"})
            cats = fetch_categories()
            yield sse({"type": "progress", "msg": f"  → {len(cats)}개"})
            target = parse_categories(categories, cats)
            yield sse({"type": "progress", "msg": f"  → 처리 대상: {len(target)}개"})

            yield sse({"type": "progress", "msg": f"[2/4] 주문 조회 ({start} ~ {end})"})
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
                yield sse({"type": "progress", "msg": f"    ... {len(orders)}건 누적"})
                if len(page) < 100:
                    break
                offset += 100
            currency = detect_currency(orders)
            yield sse({"type": "progress", "msg": f"  → 총 {len(orders)}건 / 통화 {currency}"})

            yield sse({"type": "progress", "msg": "[3/4] 카테고리별 상품 + 집계"})
            results = []
            grand_qty = 0
            grand_rev = 0.0
            for i, c in enumerate(target, 1):
                cn = c["category_no"]
                cname = c["category_name"]
                yield sse({"type": "progress", "msg": f"  ({i}/{len(target)}) [{cn}] {cname}"})
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
                yield sse({"type": "progress", "msg": f"    → 상품 {len(groups)} (옵션상품 {multi_count}) / 판매수 {cqty} / 매출 {crev:,.0f}"})

            yield sse({"type": "progress", "msg": "[4/4] 완료"})
            yield sse({
                "type": "data",
                "results": results,
                "grand": {"qty": grand_qty, "rev": grand_rev, "currency": currency, "order_count": len(orders)},
                "start": start,
                "end": end,
            })
            yield sse({"type": "done"})
        except Exception as e:
            yield sse({
                "type": "error",
                "msg": f"{type(e).__name__}: {e}",
                "trace": traceback.format_exc(),
            })

    return StreamingResponse(
        gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/api/excel")
def api_excel(start: str, end: str, categories: str = "all", mode: str = "single"):
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

        wb = openpyxl.Workbook()
        wb.remove(wb.active)
        bold = Font(bold=True)
        header_font = Font(bold=True, color="FFF8FAFC")
        header_fill = PatternFill(start_color="FF334155", end_color="FF334155", fill_type="solid")
        sum_fill = PatternFill(start_color="FFFEF3C7", end_color="FFFEF3C7", fill_type="solid")
        parent_fill = PatternFill(start_color="FFF1F5F9", end_color="FFF1F5F9", fill_type="solid")

        if mode == "tabs":
            used = set()
            for r in results:
                title = sanitize_sheet_name(f"{r['category_no']}_{r['category_name']}", used)
                ws = wb.create_sheet(title=title)
                ws.append([f"기간: {start} ~ {end} / 통화: {currency}"])
                ws.append(["코드", "상품명", "단가", "판매수", "매출"])
                for c in ws[2]:
                    c.font = header_font
                    c.fill = header_fill
                first_data_row = 3
                tq = tr = 0
                groups = sorted(r["groups"], key=lambda g: -g["rev"])
                for g in groups:
                    emit_group_rows(ws, g, prefix=None, parent_fill=parent_fill, bold=bold)
                    tq += g["qty"]
                    tr += g["rev"]
                last_data_row = ws.max_row
                ws.append(["합계", "", "", tq, tr])
                for c in ws[ws.max_row]:
                    c.font = bold
                    c.fill = sum_fill
                if last_data_row >= first_data_row:
                    ws.auto_filter.ref = f"A2:E{last_data_row}"
                size_cols(ws)
                ws.freeze_panes = "A3"
        else:
            ws = wb.create_sheet(title="합산")
            ws.append([f"기간: {start} ~ {end} / 통화: {currency}"])
            ws.append(["카테고리", "코드", "상품명", "단가", "판매수", "매출"])
            for c in ws[2]:
                c.font = header_font
                c.fill = header_fill
            first_data_row = 3
            tq = tr = 0
            sorted_results = sorted(results, key=lambda r: -r["rev"])
            for r in sorted_results:
                cat_label = f"[{r['category_no']}] {r['category_name']}"
                groups = sorted(r["groups"], key=lambda g: -g["rev"])
                for g in groups:
                    emit_group_rows(ws, g, prefix=[cat_label], parent_fill=parent_fill, bold=bold)
                    tq += g["qty"]
                    tr += g["rev"]
            last_data_row = ws.max_row
            ws.append(["합계", "", "", "", tq, tr])
            for c in ws[ws.max_row]:
                c.font = bold
                c.fill = sum_fill
            if last_data_row >= first_data_row:
                ws.auto_filter.ref = f"A2:F{last_data_row}"
            size_cols(ws)
            ws.freeze_panes = "A3"

        buf = io.BytesIO()
        wb.save(buf)
        buf.seek(0)
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
