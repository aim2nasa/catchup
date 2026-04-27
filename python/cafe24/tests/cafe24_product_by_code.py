import sys
sys.stdout.reconfigure(encoding="utf-8")

import requests
import json
from cafe24_auth import get_access_token, MALL_ID

product_code = input("조회할 상품코드 입력 (P로 시작): ").strip()

url = f"https://{MALL_ID}.cafe24api.com/api/v2/admin/products"
headers = {
    "Authorization": f"Bearer {get_access_token()}",  # ← 자동 처리
    "Content-Type": "application/json",
}
params = {"product_code": product_code}

res = requests.get(url, headers=headers, params=params)
print(res.status_code)
print(json.dumps(res.json(), indent=2, ensure_ascii=False))