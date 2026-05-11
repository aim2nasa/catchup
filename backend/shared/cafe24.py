"""cafe24 OpenAPI 클라이언트. 인증 + 카테고리/상품/주문 fetch + 헬퍼."""
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
# cafe24_auth는 python/cafe24/tests/cafe24_auth.py에 있음
sys.path.insert(0, str(ROOT / "python" / "cafe24" / "tests"))

import requests
from cafe24_auth import get_access_token, MALL_ID  # type: ignore

BASE = f"https://{MALL_ID}.cafe24api.com/api/v2/admin"


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


def fetch_salesvolume(product_no, start, end):
    """cafe24 /reports/salesvolume — product_no별 시간 슬롯 판매 통계.

    각 row 필드: settle_count(결제), cancel_product_count(취소), return_product_count(반품),
    exchane_product_count(교환), total_sales(=settle-cancel-return, cafe24가 직접 계산한 판매수량),
    product_price, product_option_price, variants_code, collection_date, collection_hour.
    """
    rows = []
    offset = 0
    while True:
        res = requests.get(
            f"{BASE}/reports/salesvolume", headers=auth_headers(),
            params={
                "start_date": start, "end_date": end,
                "product_no": product_no,
                "limit": 100, "offset": offset,
            },
        )
        res.raise_for_status()
        page = res.json().get("salesvolume", [])
        if not page:
            break
        rows.extend(page)
        if len(page) < 100:
            break
        offset += 100
    return rows


def parse_categories(s, all_cats):
    """사용자 입력 순서를 보존."""
    if s == "all":
        return [c for c in all_cats if c.get("category_depth") == 1]
    wanted = [int(x.strip()) for x in s.split(",") if x.strip()]
    by_no = {c["category_no"]: c for c in all_cats}
    return [by_no[n] for n in wanted if n in by_no]


def detect_currency(orders):
    for o in orders:
        if o.get("currency"):
            return o["currency"]
    return "KRW"
