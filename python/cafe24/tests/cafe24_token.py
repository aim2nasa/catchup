import sys
sys.stdout.reconfigure(encoding="utf-8")

import os
import requests
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

MALL_ID = os.environ["CAFE24_MALL_ID"]
CLIENT_ID = os.environ["CAFE24_CLIENT_ID"]
CLIENT_SECRET = os.environ["CAFE24_CLIENT_SECRET"]
REDIRECT_URI = os.environ["CAFE24_REDIRECT_URI"]

code = input("code 값을 붙여넣고 엔터: ").strip()

url = f"https://{MALL_ID}.cafe24api.com/api/v2/oauth/token"
res = requests.post(
    url,
    auth=(CLIENT_ID, CLIENT_SECRET),
    headers={"Content-Type": "application/x-www-form-urlencoded"},
    data={
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": REDIRECT_URI,
    },
)
print(res.status_code)
print(res.json())
