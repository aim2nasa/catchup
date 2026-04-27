import sys
sys.stdout.reconfigure(encoding="utf-8")

import requests
from cafe24_auth import get_access_token, MALL_ID

product_no = input("조회할 상품번호 입력: ").strip()

url = f"https://{MALL_ID}.cafe24api.com/api/v2/admin/products/{product_no}"
headers = {
    "Authorization": f"Bearer {get_access_token()}",
    "Content-Type": "application/json",
}

res = requests.get(url, headers=headers)
print(res.status_code)
print(res.json())
