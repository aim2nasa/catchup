"""순수 집계/정렬 로직. cafe24 의존 없음 — 단위 테스트 가능."""
from typing import Any


def aggregate(products: dict, orders: list) -> list:
    """상품별 그룹 리스트 반환. 각 그룹 = 한 product + 그 variants 합계.

    products: { product_no: {'code', 'name', 'price', 'variants': [{'vcode', 'opt'}, ...]} }
    orders: cafe24 orders API 응답 형태 (items 배열에 variant_code, quantity, product_price, claim_quantity)
    """
    accums: dict = {}
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


def _group_sort_key(g, sort_by):
    if sort_by == "code": return g["product_code"]
    if sort_by == "name": return g["product_name"]
    if sort_by == "price": return g["price"]
    if sort_by == "qty": return g["qty"]
    if sort_by == "rev": return g["rev"]
    return g["rev"]


def _variant_sort_key(v, parent_price, sort_by):
    if sort_by == "code": return v["variant_code"]
    if sort_by == "name": return v["option"] or v["variant_code"]
    if sort_by == "price": return parent_price
    if sort_by == "qty": return v["qty"]
    if sort_by == "rev": return v["rev"]
    return v["rev"]


def _cat_sort_key(r, sort_by):
    if sort_by == "rev": return r["rev"]
    if sort_by == "qty": return r["qty"]
    if sort_by in ("cat", "code"): return r["category_no"]
    if sort_by == "name": return r["category_name"]
    return r["rev"]


def sort_groups(groups, sort_by, sort_dir):
    return sorted(groups, key=lambda g: _group_sort_key(g, sort_by), reverse=(sort_dir == -1))


def sort_variants(variants, parent_price, sort_by, sort_dir):
    return sorted(variants, key=lambda v: _variant_sort_key(v, parent_price, sort_by), reverse=(sort_dir == -1))


def sort_categories(results, sort_by, sort_dir):
    return sorted(results, key=lambda r: _cat_sort_key(r, sort_by), reverse=(sort_dir == -1))
