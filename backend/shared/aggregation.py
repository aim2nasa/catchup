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
            # cafe24 order_status: N=정상, C=취소(환불), R=반품, E=교환, F=실패
            # 어드민 "판매수량" 정의와 일치시키려면 취소/반품/실패 라인 제외.
            # 실데이터 검증: P00000HT 4월 환불 4건 = order_status="C40" 두 라인(qty 1+3).
            status = (it.get("order_status") or it.get("status_code") or "").upper()
            if status and status[0] in ("C", "R", "F"):
                continue
            qty = (it.get("quantity") or 0) - (it.get("claim_quantity") or 0)
            # 묶음할인/옵션상품은 product_price=0이고 단가가 option_price에 들어옴.
            # 둘을 합쳐야 cafe24 어드민의 실 매출과 일치 (P0000BIF 케이스 검증).
            price = float(it.get("product_price") or 0) + float(it.get("option_price") or 0)
            a = accums.setdefault(vc, {"qty": 0, "rev": 0.0, "unit_price": 0.0})
            a["qty"] += qty
            a["rev"] += qty * price
            # variant 단가는 첫 nonzero 값 채택 (라인별 가격이 흔들리면 대표 1개만)
            if price and not a["unit_price"]:
                a["unit_price"] = price

    groups = []
    for pn, info in products.items():
        multi = len(info["variants"]) > 1
        gqty = 0
        grev = 0.0
        variants = []
        variant_unit_prices = []
        variant_catalog_prices = {}
        for v in info["variants"]:
            vc = v["vcode"]
            variant_catalog_prices[vc] = float(v.get("price") or 0)
        for v in info["variants"]:
            vc = v["vcode"]
            a = accums.get(vc)
            if a is None:
                a = {
                    "qty": 0,
                    "rev": 0.0,
                    "unit_price": 0.0,
                    "catalog_price": variant_catalog_prices.get(vc, 0.0),
                }
            elif "catalog_price" not in a:
                a["catalog_price"] = variant_catalog_prices.get(vc, 0.0)
            gqty += a["qty"]
            grev += a["rev"]
            variant_unit_price = a["unit_price"] if a["unit_price"] else a["catalog_price"]
            if variant_unit_price:
                variant_unit_prices.append(variant_unit_price)
            variants.append({
                "variant_code": vc,
                "option": v.get("opt", ""),
                "qty": a["qty"],
                "rev": a["rev"],
                "price": variant_unit_price,
            })
        # parent 단가:
        #  - catalog 가격이 있으면 그대로 (single variant 또는 일관된 multi)
        #  - catalog 0인 multi라도 variant 단가가 모두 동일하면 그 값 채택
        #  - 다양하면 0으로 두고 frontend가 "—"로 표시
        effective_price = float(info["price"] or 0)
        if multi and not effective_price and variant_unit_prices:
            uniq = {round(p, 2) for p in variant_unit_prices}
            if len(uniq) == 1:
                effective_price = variant_unit_prices[0]
        groups.append({
            "is_multi": multi,
            "product_code": info["code"],
            "product_name": info["name"],
            "price": effective_price,
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
