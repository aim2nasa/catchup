import requests
import json
from cafe24_auth import get_access_token, MALL_ID

variant_code = input("조회할 품목코드 입력 (예: P00000ZB000A): ").strip()

# 품목코드 앞 8자리 = 상품코드
product_code = variant_code[:8]

headers = {
    "Authorization": f"Bearer {get_access_token()}",
    "Content-Type": "application/json",
}

# 1) 상품코드 → 상품번호 찾기
url1 = f"https://{MALL_ID}.cafe24api.com/api/v2/admin/products"
res1 = requests.get(url1, headers=headers, params={"product_code": product_code})
products = res1.json().get("products", [])

if not products:
    print(f"상품을 찾을 수 없음: {product_code}")
    exit()

product_no = products[0]["product_no"]

# 2) 해당 상품의 품목(variants) 목록 조회
url2 = f"https://{MALL_ID}.cafe24api.com/api/v2/admin/products/{product_no}/variants"
res2 = requests.get(url2, headers=headers)
variants = res2.json().get("variants", [])

# 3) 원하는 품목코드만 필터
target = [v for v in variants if v.get("variant_code") == variant_code]

print(res2.status_code)
print(json.dumps(target, indent=2, ensure_ascii=False))