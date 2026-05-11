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


def fetch_products_by_codes(codes):
    """카테고리 무관, product_code 리스트로 직접 조회.

    cafe24 /products?product_code=X 은 단건만 받으므로 code마다 1회 호출.
    누락 code(존재하지 않는 코드)는 응답 dict에 안 들어감 — 호출자가 그것까지
    placeholder로 처리하려면 별도 로직 필요.
    """
    products: dict = {}
    for code in codes:
        res = requests.get(
            f"{BASE}/products", headers=auth_headers(),
            params={"product_code": code, "embed": "variants"},
        )
        res.raise_for_status()
        items = res.json().get("products", [])
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
